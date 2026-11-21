'use client';

/** Opens the browser's print dialog, where "Save as PDF" downloads the page. */
export function PrintButton({ label = 'Print or save as PDF' }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="inline-flex min-h-11 items-center rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
      {label}
    </button>
  );
}
