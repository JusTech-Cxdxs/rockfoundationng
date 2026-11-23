import { EjoMarkSpinner } from './EjoMarkSpinner';

/**
 * Loading state inside the content area during navigation. EjoLoader is the
 * full-screen first-load version; this one leaves the sidebar and top bar
 * visible.
 */
export function PageLoading() {
  return (
    // A page heading while the real one loads, announced politely.
    <div role="status" className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
      <EjoMarkSpinner size={64} />
      <h1 className="text-sm font-normal text-[var(--ejo-text-muted)]">Loading…</h1>
    </div>
  );
}
