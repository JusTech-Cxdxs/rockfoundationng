import { NextResponse } from 'next/server';
import { prisma } from '@ejo/database';
import { seeJobCard } from '@/lib/authz/server';
import { requireUser } from '@/lib/actions/workshop';

/**
 * One Job Card photo, for staff who may open that Job Card (the same check as
 * the Job Card page). Never cached by shared caches; the type is the one the
 * server confirmed from the bytes at upload.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; photoId: string }> }) {
  const { id, photoId } = await params;
  try {
    await requireUser();
    await seeJobCard(id, 'jobCardPhoto');
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
  const photo = /^[a-z0-9]{20,40}$/.test(photoId) ? await prisma.jobCardPhoto.findFirst({ where: { id: photoId, jobCardId: id }, select: { bytes: true, contentType: true } }) : null;
  if (!photo) return new NextResponse('Not found', { status: 404 });
  return new NextResponse(Buffer.from(photo.bytes), {
    headers: {
      'Content-Type': photo.contentType,
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline',
    },
  });
}
