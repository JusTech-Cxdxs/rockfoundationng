'use server';

import { redirect } from 'next/navigation';
import { answerRating } from '@/lib/job-rating';

/** The customer's answer from the rating page: saved once, then back to the page to say thank you. */
export async function submitRating(f: FormData): Promise<void> {
  const token = String(f.get('token') ?? '');
  const result = await answerRating(token, f.get('score'), f.get('comment'));
  const safe = /^[A-Za-z0-9._-]{1,80}$/.test(token) ? token : 'x';
  redirect(`/rate/${safe}${result === 'saved' ? '?thanks=1' : result === 'bad-score' ? '?pick=1' : ''}`);
}
