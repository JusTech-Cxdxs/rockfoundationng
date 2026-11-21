import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Font } from '@react-pdf/renderer';

/**
 * The typeface of every PDF the portal makes (estimates, inspection reports,
 * invoices). The PDF standard fonts (Helvetica) have no ₦, so the documents
 * embed Noto Sans: a small subset (Latin, punctuation, ₦, € …) kept in
 * lib/pdf/fonts with its licence (OFL.txt). Read from disk, never fetched,
 * so a document never depends on another site being up.
 *
 * The files are found from the working directory: the portal's own folder
 * when it runs (next dev / next start, the tests, a Vercel function, where
 * next.config.ts traces them in), or the repository root for scripts.
 */
export const PDF_FONT = 'NotoSans';

export function pdfFontDir(cwd: string = process.cwd()): string {
  const candidates = [join(cwd, 'lib', 'pdf', 'fonts'), join(cwd, 'apps', 'portal', 'lib', 'pdf', 'fonts')];
  return candidates.find((dir) => existsSync(join(dir, 'NotoSans-Regular.ttf'))) ?? candidates[0]!;
}

let registered = false;

/** Registers the family once per process; every PDF document calls it before drawing. */
export function registerPdfFonts(): void {
  if (registered) return;
  const dir = pdfFontDir();
  Font.register({
    family: PDF_FONT,
    fonts: [
      { src: join(dir, 'NotoSans-Regular.ttf'), fontWeight: 'normal' },
      { src: join(dir, 'NotoSans-Bold.ttf'), fontWeight: 'bold' },
    ],
  });
  registered = true;
}
