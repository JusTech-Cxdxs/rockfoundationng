/**
 * The letterhead's registration line: "P.O. Box 257, Ota, Ogun State · RC
 * Number: 1772429". The business details may already be stored with their
 * prefix ("P.O. Box 257 …", "RC 1772429"); it is never printed twice.
 */
export function registrationLine(o: { poBox?: string | null; rcNumber?: string | null }): string {
  const box = o.poBox?.trim().replace(/^p\.?\s*o\.?\s*box\s*/i, '');
  const rc = o.rcNumber?.trim().replace(/^rc\s*(number|no\.?)?\s*:?\s*/i, '');
  return [box ? `P.O. Box ${box}` : null, rc ? `RC Number: ${rc}` : null].filter(Boolean).join('   ·   ');
}
