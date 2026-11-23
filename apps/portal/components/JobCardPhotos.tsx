'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteJobCardPhoto, uploadJobCardPhoto, type JobCardPhotoRow } from '@/lib/actions/job-card-photos';
import { PHOTO_STAGES, photoStageLabel, RESIZE_TO, type PhotoStage } from '@/lib/workshop/photo-rules';
import { Icon } from '@/components/ui';

/** Shrinks a photo in the browser (longest side RESIZE_TO, JPEG) so it uploads fast on a phone network. */
async function shrink(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, RESIZE_TO / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('resize'))), 'image/jpeg', 0.78));
  return { blob, width, height };
}

/**
 * Photos on a Job Card, by stage (check-in, work, quality check,
 * collection): taken with the phone's camera or chosen from the gallery,
 * shrunk before upload, shown as thumbnails anyone on the job can open.
 */
export function JobCardPhotos({ jobCardId, photos, canAdd, myUserId }: { jobCardId: string; photos: JobCardPhotoRow[]; canAdd: boolean; myUserId: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<PhotoStage>(photos.length ? 'WORK' : 'CHECK_IN');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    let done = 0;
    for (const file of Array.from(files)) {
      setBusy(`Saving photo ${done + 1} of ${files.length}…`);
      try {
        const { blob, width, height } = await shrink(file);
        const f = new FormData();
        f.set('jobCardId', jobCardId);
        f.set('stage', stage);
        f.set('photo', blob, 'photo.jpg');
        f.set('width', String(width));
        f.set('height', String(height));
        const r = await uploadJobCardPhoto(f);
        if (!r.ok) { setError(r.error); break; }
        done++;
      } catch {
        setError('That photo could not be read. Try taking it again.');
        break;
      }
    }
    setBusy(null);
    if (input.current) input.current.value = '';
    startTransition(() => router.refresh());
  }

  async function remove(id: string) {
    if (!window.confirm('Remove this photo? It is kept in the audit trail that it was removed.')) return;
    const r = await deleteJobCardPhoto(id);
    if (!r.ok) setError(r.error);
    startTransition(() => router.refresh());
  }

  return (
    <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5 print:hidden" data-testid="job-card-photos">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--ejo-text)]"><Icon name="eye" size={16} /> Photos <span className="font-normal text-[var(--ejo-text-muted)]">({photos.length})</span></h2>
        {canAdd ? (
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor={`photo-stage-${jobCardId}`}>When was it taken</label>
            <select id={`photo-stage-${jobCardId}`} value={stage} onChange={(e) => setStage(e.target.value as PhotoStage)} className="min-h-10 rounded-full border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 text-sm">
              {PHOTO_STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <button type="button" disabled={Boolean(busy)} onClick={() => input.current?.click()} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[var(--ejo-primary)] px-4 text-sm font-semibold text-white disabled:opacity-60">
              <Icon name="plus" size={16} /> {busy ?? 'Add photos'}
            </button>
            <input ref={input} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => void upload(e.target.files)} data-testid="job-card-photo-input" />
          </div>
        ) : null}
      </div>
      {error ? <p role="alert" className="mt-2 text-sm text-[var(--ejo-error)]">{error}</p> : null}
      {photos.length ? (
        <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.map((p) => (
            <li key={p.id} className="group relative overflow-hidden rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)]">
              <a href={`/api/job-cards/${jobCardId}/photos/${p.id}`} target="_blank" rel="noopener noreferrer" title={`${photoStageLabel(p.stage)}${p.takenBy ? ` · ${p.takenBy}` : ''}`}>
                {/* eslint-disable-next-line @next/next/no-img-element -- served by the portal's own access-checked route */}
                <img src={`/api/job-cards/${jobCardId}/photos/${p.id}`} alt={`${photoStageLabel(p.stage)} photo`} loading="lazy" className="aspect-square w-full object-cover" />
              </a>
              <span className="absolute left-1 top-1 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white">{photoStageLabel(p.stage)}</span>
              {canAdd && p.takenById === myUserId ? (
                <button type="button" onClick={() => void remove(p.id)} aria-label="Remove photo" className="absolute right-1 top-1 hidden h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white group-hover:flex"><Icon name="close" size={14} /></button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-[var(--ejo-text-muted)]">{canAdd ? 'Take photos of the vehicle at check-in (all four sides, the dashboard, any damage), so its condition is agreed with the customer.' : 'No photos yet.'}</p>
      )}
    </div>
  );
}
