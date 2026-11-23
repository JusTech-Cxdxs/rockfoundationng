/**
 * What the browser tests need to know about the edition, read by the specs.
 *
 * The demo people and records (lib/demo, docs/DEMO.md) live in their own
 * organisation, rock-foundation-demo, made only when the platform owner asks
 * (DEMO_STAFF_PASSWORD, `npm run demo:reset`). The demo specs need it loaded
 * first, so they only run with E2E_DEMO=1.
 */
export const DEMO_ENABLED = process.env.E2E_DEMO === '1';
export const DEMO_OFF = 'The demo organisation (rock-foundation-demo) is loaded only on request: run npm run demo:reset and set E2E_DEMO=1';
