import { test, expect, request as playwrightRequest } from '@playwright/test';
import { CUSTOMER, SUPERMANAGER } from './people';
import { as, open } from './helpers';
import { db, freshVehicle } from './db';
import { jobCardInProgress, nextStep } from './workflows';

/**
 * D'Phoenix phase 6A — documents on WhatsApp. Finance presses "Send on
 * WhatsApp" on a Job Card's invoice and gets a wa.me address whose message
 * carries a secure /d/ link; that link opens the invoice PDF without
 * signing in, and an altered link gets the plain refusal page.
 */
test.describe('Documents on WhatsApp', () => {
  test.describe.configure({ mode: 'serial' });
  const S = { url: '', id: '', link: '' };

  test('an invoiced Job Card', async ({ page }) => {
    // A Nigerian mobile WhatsApp can take, so the button shows.
    await db().customer.update({ where: { email: CUSTOMER.email }, data: { phone: '0803 123 4567' } });
    const v = await freshVehicle('WAD');
    const jc = await jobCardInProgress(page, { plate: v.plate, complaint: 'Service', lines: [{ type: 'LABOUR', description: 'Service labour', price: 12500 }] });
    Object.assign(S, jc);
    await as(page, 'technician');
    await open(page, S.url);
    await nextStep(page, 'Work done — send to quality check', 'Quality Check');
    await as(page, SUPERMANAGER);
    await open(page, S.url);
    await nextStep(page, 'Passed quality check — mark Completed', 'Completed');
    expect(await db().invoice.count({ where: { jobCardId: S.id } })).toBe(1);
  });

  test('Finance presses "Send on WhatsApp" on the invoice: a wa.me message with a /d/ link', async ({ page }) => {
    test.skip(!S.id, 'needs the Job Card from the previous step');
    await as(page, 'finance-officer');
    await open(page, S.url);
    await page.getByTestId('invoice-whatsapp').click();
    const openLink = page.getByTestId('invoice-whatsapp-open');
    await expect(openLink).toBeVisible();
    const href = (await openLink.getAttribute('href')) ?? '';
    expect(href).toMatch(/^https:\/\/wa\.me\/2348031234567\?text=/);
    const text = decodeURIComponent(href.split('?text=')[1] ?? '');
    const invoice = await db().invoice.findUniqueOrThrow({ where: { jobCardId: S.id }, select: { invoiceNumber: true } });
    expect(text).toContain(invoice.invoiceNumber);
    expect(text).toMatch(/₦[\d,]+\.\d{2}/);
    const link = text.match(/https?:\/\/\S+\/d\/[A-Za-z0-9_-]{43}/)?.[0];
    expect(link, 'the message carries the document link').toBeTruthy();
    S.link = link!;
    // Recorded, without the link.
    const audit = await db().auditLog.findFirstOrThrow({ where: { entityId: S.id, action: 'whatsapp.prepared' }, orderBy: { createdAt: 'desc' } });
    expect(JSON.stringify(audit.metadata)).not.toContain(S.link.split('/d/')[1]!);
  });

  test('the link opens the PDF without signing in; an altered link gets the refusal page', async ({ baseURL }) => {
    test.skip(!S.link, 'needs the link from the previous step');
    const anon = await playwrightRequest.newContext({ baseURL });
    try {
      // Opened on this server, whatever address the message names.
      const path = new URL(S.link).pathname;
      const res = await anon.get(path, { maxRedirects: 0 });
      expect(res.status()).toBe(200);
      expect(res.headers()['content-type']).toContain('application/pdf');
      expect(res.headers()['content-disposition']).toMatch(/^inline; filename="INV-\d{4}-\d{6}\.pdf"$/);
      expect(res.headers()['cache-control']).toContain('no-store');
      expect((await res.body()).subarray(0, 5).toString('latin1')).toBe('%PDF-');
      const token = path.split('/d/')[1]!;
      const altered = `/d/${token.slice(0, 42)}${token.endsWith('A') ? 'B' : 'A'}`;
      const refused = await anon.get(altered, { maxRedirects: 0 });
      expect(refused.status()).toBe(404);
      expect(refused.headers()['content-type']).toContain('text/html');
      expect(await refused.text()).toContain('This link does not open');
      const opened = await db().documentLink.findFirstOrThrow({ where: { recordId: { not: '' }, kind: 'INVOICE' }, orderBy: { createdAt: 'desc' }, select: { openCount: true } });
      expect(opened.openCount).toBeGreaterThanOrEqual(1);
    } finally {
      await anon.dispose();
    }
  });
});
