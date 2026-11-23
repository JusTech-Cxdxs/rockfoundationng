'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@ejo/database';
import { allows, seeJobCard, NOT_AVAILABLE } from '@/lib/authz/server';
import { requireUser } from './workshop';
import { writeAuditLog } from '@/lib/workshop-core';
import { isPhotoStage, MAX_PHOTO_BYTES, MAX_PHOTOS_PER_JOB, sniffImage } from '@/lib/workshop/photo-rules';

/**
 * Photos on a Job Card: front desk at check-in and collection, the
 * supervisor and technician during the work and the quality check. Anyone who
 * may open the Job Card sees them; the bytes are checked to be a real image.
 */

class PhotoError extends Error {}

/** Who may add photos: front desk, or whoever inspects or works on the Job Card. */
const ADD_PHOTOS = ['workshop.job_card.create', 'workshop.inspection.perform', 'workshop.job.work'] as const;

/** The Job Card as a record for the permission check (branch, assignees, creator). */
async function photoRecord(jobCardId: string) {
  const j = await prisma.jobCard.findUnique({ where: { id: jobCardId }, select: { branchId: true, supervisorId: true, assignedTechnicianId: true, createdById: true } });
  return j ? { branchId: j.branchId, assigneeIds: [j.supervisorId, j.assignedTechnicianId], ownerIds: [j.createdById] } : null;
}

export type JobCardPhotoRow = { id: string; stage: string; caption: string | null; createdAt: Date; takenBy: string | null; takenById: string | null; width: number | null; height: number | null };

export async function listJobCardPhotos(jobCardId: string): Promise<{ photos: JobCardPhotoRow[]; canAdd: boolean }> {
  await requireUser();
  await seeJobCard(jobCardId, 'listJobCardPhotos');
  const [rows, canAdd] = await Promise.all([
    prisma.jobCardPhoto.findMany({ where: { jobCardId }, orderBy: { createdAt: 'asc' }, select: { id: true, stage: true, caption: true, createdAt: true, takenById: true, width: true, height: true } }),
    photoRecord(jobCardId).then(async (rec) => Boolean(rec) && (await Promise.all(ADD_PHOTOS.map((k) => allows(k, rec!)))).some(Boolean)),
  ]);
  const ids = [...new Set(rows.map((r) => r.takenById).filter((x): x is string => Boolean(x)))];
  const people = ids.length ? new Map((await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } })).map((u) => [u.id, u.fullName])) : new Map<string, string>();
  return { canAdd, photos: rows.map((r) => ({ id: r.id, stage: r.stage, caption: r.caption, createdAt: r.createdAt, takenBy: r.takenById ? people.get(r.takenById) ?? null : null, takenById: r.takenById, width: r.width, height: r.height })) };
}

/** One photo, already resized in the browser. FormData: jobCardId, stage, photo (a file), width, height, caption. */
export async function uploadJobCardPhoto(f: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const user = await requireUser();
    const jobCardId = String(f.get('jobCardId') ?? '');
    await seeJobCard(jobCardId, 'uploadJobCardPhoto');
    const rec = await photoRecord(jobCardId);
    const may = rec ? (await Promise.all(ADD_PHOTOS.map((k) => allows(k, rec)))).some(Boolean) : false;
    if (!may) throw new PhotoError('You can look at these photos, but adding them is for front desk and the people working on this job.');
    const stage = String(f.get('stage') ?? 'CHECK_IN');
    if (!isPhotoStage(stage)) throw new PhotoError('Choose when the photo was taken.');
    const file = f.get('photo');
    if (!(file instanceof Blob) || file.size === 0) throw new PhotoError('Choose a photo.');
    if (file.size > MAX_PHOTO_BYTES) throw new PhotoError('That photo is too large. Take it again, or choose a smaller one.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = sniffImage(bytes);
    if (!type) throw new PhotoError('That file is not a photo (JPEG, PNG or WebP).');
    const count = await prisma.jobCardPhoto.count({ where: { jobCardId } });
    if (count >= MAX_PHOTOS_PER_JOB) throw new PhotoError(`A Job Card holds up to ${MAX_PHOTOS_PER_JOB} photos.`);
    const dim = (k: string) => { const n = Number(f.get(k)); return Number.isInteger(n) && n > 0 && n < 20_000 ? n : null; };
    const caption = String(f.get('caption') ?? '').replace(/\s+/g, ' ').trim().slice(0, 200) || null;
    const row = await prisma.jobCardPhoto.create({ data: { jobCardId, stage, contentType: type, bytes: Buffer.from(bytes), sizeBytes: bytes.length, width: dim('width'), height: dim('height'), caption, takenById: user.id }, select: { id: true } });
    await writeAuditLog({ userId: user.id, action: 'job_card.photo_added', entityType: 'JobCard', entityId: jobCardId, metadata: { photoId: row.id, stage, sizeBytes: bytes.length } });
    revalidatePath(`/workshop/job-cards/${jobCardId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof PhotoError ? err.message : err instanceof Error && err.message === NOT_AVAILABLE ? NOT_AVAILABLE : 'The photo could not be saved. Try again.' };
  }
}

/** Removes a photo taken by mistake: the person who took it, or the Owner. */
export async function deleteJobCardPhoto(photoId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const user = await requireUser();
    const photo = typeof photoId === 'string' && /^[a-z0-9]{20,40}$/.test(photoId) ? await prisma.jobCardPhoto.findUnique({ where: { id: photoId }, select: { id: true, jobCardId: true, takenById: true, stage: true } }) : null;
    if (!photo) throw new PhotoError(NOT_AVAILABLE);
    await seeJobCard(photo.jobCardId, 'deleteJobCardPhoto');
    if (photo.takenById !== user.id && !(await allows('workshop.close.approve'))) throw new PhotoError('Only the person who took the photo, or the Owner, can remove it.');
    await prisma.jobCardPhoto.delete({ where: { id: photo.id } });
    await writeAuditLog({ userId: user.id, action: 'job_card.photo_removed', entityType: 'JobCard', entityId: photo.jobCardId, metadata: { photoId: photo.id, stage: photo.stage } });
    revalidatePath(`/workshop/job-cards/${photo.jobCardId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof PhotoError ? err.message : 'The photo could not be removed.' };
  }
}
