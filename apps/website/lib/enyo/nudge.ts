/**
 * The question Enyo offers a visitor who has spent a while on a page without
 * asking anything (pure, tested): one gentle line and the question it sends
 * if they say yes. Once per visit, never on the customer portal, never while
 * the chat is open.
 */
export const NUDGE_AFTER_MS = 40_000;

const PAGES: { test: RegExp; line: string; ask: string }[] = [
  { test: /^\/support/, line: 'Need help with something? I can answer now or pass you to the team.', ask: 'I need help with something' },
];

export function nudgeFor(path: string | null | undefined): { line: string; ask: string } | null {
  if (!path || /^\/(customer-portal|privacy|terms|api|estimate)(\/|$)/.test(path)) return null;
  const hit = PAGES.find((p) => p.test.test(path));
  return hit ? { line: hit.line, ask: hit.ask } : { line: 'Can I help you find something on this page?', ask: 'Can you help me find what I am looking for?' };
}
