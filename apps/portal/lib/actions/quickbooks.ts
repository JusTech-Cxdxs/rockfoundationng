'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma, Prisma } from '@ejo/database';
import { allows, authorize, myOrganisationId, reachWhere } from '@/lib/authz/server';
import { STORE_COST_PERMISSIONS } from '@/lib/authz/catalogue';
import { requireUser } from './workshop';
import { writeAuditLog } from '@/lib/workshop-core';
import { lagosYear } from '@/lib/utils/format-date';
import { highestSequence } from '@/lib/recycle-bin/numbers';
import { retryOnNumberClash } from '@/lib/integrity-core';
import { lagosToday } from '@/lib/data-exchange/dates';
import { quickBooksSettings, parseQuickBooksForm, type QuickBooksSettings } from '@/lib/quickbooks/settings';
import { EXPORT_KINDS, isExportKind, parseRange, type ExportKind } from '@/lib/quickbooks/assemble';
import { collectExport, type Collected } from '@/lib/quickbooks/collect-server';
import { exportFiles, storedFiles, UnbalancedExportError, type ExportFormat } from '@/lib/quickbooks/files';
import { qboConfig } from '@/lib/quickbooks/qbo';
import { disconnect, pushToQbo, QboError } from '@/lib/quickbooks/qbo-server';

/**
 * Money → QuickBooks (the Owner and Accounts): what goes to QuickBooks for a
 * range of days, the files for QuickBooks Desktop (IIF) or Excel (CSV), the
 * history of exports, Settings → QuickBooks (account and item names), and the
 * optional QuickBooks Online connection (the Owner connects it). Everything is
 * fenced to the person's organisation and the branches the permission
 * reaches; every export, download, settings change, connection and send is
 * in the audit log.
 */

const KEY = 'money.quickbooks.export' as const;

type Scope = { userId: string; organisationId: string; branchWhere: { branchId?: string | { in: string[] } }; seesCosts: boolean };

async function qbScope(where: string): Promise<Scope> {
  await authorize(KEY, undefined, where, 'Only the Owner and Accounts work with QuickBooks.');
  const user = await requireUser();
  const organisationId = await myOrganisationId();
  if (!organisationId) throw new Error('No organisation');
  // The books are the whole organisation's: never narrowed to the branch being looked at.
  const branchWhere = await reachWhere(KEY, { lens: false });
  const seesCosts = (await Promise.all(STORE_COST_PERMISSIONS.map((k) => allows(k)))).some(Boolean);
  return { userId: user.id, organisationId, branchWhere, seesCosts };
}

async function settingsOf(organisationId: string): Promise<QuickBooksSettings> {
  const o = await prisma.organisation.findUnique({ where: { id: organisationId }, select: { quickbooksSettings: true } });
  return quickBooksSettings(o?.quickbooksSettings);
}

/** This month so far, in Lagos. */
function defaultRange(): { fromDay: string; toDay: string } {
  const today = lagosToday();
  return { fromDay: `${today.slice(0, 8)}01`, toDay: today };
}

export type ExportRequest = { fromDay: string; toDay: string; kinds: ExportKind[]; format: ExportFormat; includeExported: boolean };

/** The export form's choices, checked. */
function readRequest(get: (k: string) => unknown, getAll: (k: string) => unknown[]): ExportRequest | string {
  const range = parseRange(get('from'), get('to'));
  if (typeof range === 'string') return range;
  const kinds = getAll('kind').filter(isExportKind);
  if (!kinds.length) return 'Tick at least one thing to export.';
  const format = get('format') === 'CSV' ? 'CSV' : 'IIF';
  return { ...range, kinds: EXPORT_KINDS.filter((k) => kinds.includes(k)), format, includeExported: get('includeExported') === 'on' || get('includeExported') === '1' };
}

export type QuickBooksPage = {
  range: { fromDay: string; toDay: string };
  preview: { counts: Collected['counts']; totals: Collected['totals']; alreadyExported: Collected['alreadyExported']; problems: string[] } | null;
  request: ExportRequest | null;
  error: string | null;
  seesCosts: boolean;
  canSettings: boolean;
  history: { id: string; number: string; fromDay: string; toDay: string; format: string; kinds: string[]; counts: Record<string, number>; createdAt: Date; createdBy: string }[];
  qbo: { serverReady: boolean; connected: boolean; environment: string | null; lastUsedAt: Date | null; lastError: string | null };
};

/** The export page: the range chosen (this month by default), what it would carry, and the history. */
export async function getQuickBooksPage(params: Record<string, string | string[] | undefined>): Promise<QuickBooksPage> {
  const scope = await qbScope('getQuickBooksPage');
  const one = (k: string) => { const v = params[k]; return Array.isArray(v) ? v[0] : v; };
  const all = (k: string) => { const v = params[k]; return v === undefined ? [] : Array.isArray(v) ? v : [v]; };
  const asked = one('from') !== undefined;
  const parsed = asked ? readRequest(one, all) : { ...defaultRange(), kinds: EXPORT_KINDS.filter((k) => k !== 'stockMovements' || scope.seesCosts), format: 'IIF' as const, includeExported: false };
  const request = typeof parsed === 'string' ? null : parsed;
  const settings = await settingsOf(scope.organisationId);
  const preview = request ? await collectExport(scope, request, request.kinds, request.includeExported, settings) : null;
  const [rows, conn] = await Promise.all([
    prisma.quickBooksExport.findMany({ where: { organisationId: scope.organisationId }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, number: true, fromDay: true, toDay: true, format: true, kinds: true, counts: true, createdAt: true, createdById: true } }),
    prisma.quickBooksConnection.findUnique({ where: { organisationId: scope.organisationId }, select: { environment: true, lastUsedAt: true, lastError: true } }),
  ]);
  const people = new Map((await prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.createdById))] } }, select: { id: true, fullName: true } })).map((u) => [u.id, u.fullName]));
  return {
    range: request ? { fromDay: request.fromDay, toDay: request.toDay } : defaultRange(),
    request, error: typeof parsed === 'string' ? parsed : null, seesCosts: scope.seesCosts, canSettings: true,
    preview: preview ? { counts: preview.counts, totals: preview.totals, alreadyExported: preview.alreadyExported, problems: preview.problems } : null,
    history: rows.map((r) => ({ id: r.id, number: r.number, fromDay: r.fromDay, toDay: r.toDay, format: r.format, kinds: r.kinds, counts: (r.counts ?? {}) as Record<string, number>, createdAt: r.createdAt, createdBy: people.get(r.createdById) ?? '—' })),
    qbo: { serverReady: 'config' in qboConfig(), connected: Boolean(conn), environment: conn?.environment ?? null, lastUsedAt: conn?.lastUsedAt ?? null, lastError: conn?.lastError ?? null },
  };
}

/** QBX-2026-000001 */
async function nextExportNumber(): Promise<string> {
  const prefix = `QBX-${lagosYear()}-`;
  const latest = await prisma.quickBooksExport.findFirst({ where: { number: { startsWith: prefix } }, orderBy: { number: 'desc' }, select: { number: true } });
  return `${prefix}${String(highestSequence(prefix, [latest?.number]) + 1).padStart(6, '0')}`;
}

const backTo = (q: string) => `/money/quickbooks?${q}`;

/** "Create the export": the files are made, checked to balance, kept, and the records they carry remembered. */
export async function createQuickBooksExportForm(f: FormData): Promise<void> {
  const scope = await qbScope('createQuickBooksExport');
  const req = readRequest((k) => f.get(k), (k) => f.getAll(k));
  if (typeof req === 'string') redirect(backTo('error=' + encodeURIComponent(req)));
  // A customer list carries names, phones and emails: the sensitive-export permission too.
  if (req.kinds.includes('customers')) await authorize('dataexchange.export.sensitive', undefined, 'createQuickBooksExport', 'The customer list holds customers’ contact details: it needs the permission to export them.');
  const settings = await settingsOf(scope.organisationId);
  const docs = await collectExport(scope, req, req.kinds, req.includeExported, settings);
  const total = Object.values(docs.counts).reduce((s, n) => s + n, 0);
  if (!total) redirect(backTo('error=' + encodeURIComponent('Nothing to export for these days and choices.')));
  let made: { id: string; number: string };
  try {
    made = await retryOnNumberClash('number', async () => {
      const number = await nextExportNumber();
      const files = exportFiles(number, req.format, docs, settings);
      return prisma.$transaction(async (tx) => {
        const row = await tx.quickBooksExport.create({
          data: {
            organisationId: scope.organisationId, number, fromDay: req.fromDay, toDay: req.toDay, format: req.format, kinds: req.kinds, includeExported: req.includeExported,
            counts: docs.counts as Prisma.InputJsonValue, totals: docs.totals as Prisma.InputJsonValue, files: files as unknown as Prisma.InputJsonValue,
            sensitive: req.kinds.includes('customers'), createdById: scope.userId,
          },
          select: { id: true, number: true },
        });
        const records = (Object.entries(docs.ids) as [ExportKind, string[]][]).flatMap(([kind, ids]) => ids.map((recordId) => ({ exportId: row.id, organisationId: scope.organisationId, kind, recordId })));
        for (let i = 0; i < records.length; i += 1000) await tx.quickBooksExportRecord.createMany({ data: records.slice(i, i + 1000), skipDuplicates: true });
        return row;
      });
    });
  } catch (err) {
    if (err instanceof UnbalancedExportError) redirect(backTo('error=' + encodeURIComponent(err.message)));
    throw err;
  }
  await writeAuditLog({ userId: scope.userId, action: 'quickbooks.export_created', entityType: 'QuickBooksExport', entityId: made.id, organisationId: scope.organisationId, metadata: { number: made.number, from: req.fromDay, to: req.toDay, format: req.format, kinds: req.kinds, counts: docs.counts, totals: docs.totals, includeExported: req.includeExported, leftOut: docs.problems.length } });
  revalidatePath('/money/quickbooks');
  redirect(`/money/quickbooks/exports/${made.id}?status=created`);
}

export type QuickBooksExportDetail = {
  id: string; number: string; fromDay: string; toDay: string; format: string; kinds: string[]; includeExported: boolean; sensitive: boolean;
  counts: Record<string, number>; totals: Record<string, number>; files: { name: string; kind: string; bytes: number }[];
  createdAt: Date; createdBy: string; downloads: number;
};

/** One export: what it carried and its files (names and sizes; the text only through the download route). */
export async function getQuickBooksExport(id: string): Promise<QuickBooksExportDetail | null> {
  const scope = await qbScope('getQuickBooksExport');
  if (typeof id !== 'string' || !/^[a-z0-9]{20,40}$/.test(id)) return null;
  const row = await prisma.quickBooksExport.findFirst({ where: { id, organisationId: scope.organisationId } });
  if (!row) return null;
  const [by, downloads] = await Promise.all([
    prisma.user.findUnique({ where: { id: row.createdById }, select: { fullName: true } }),
    prisma.auditLog.count({ where: { entityType: 'QuickBooksExport', entityId: row.id, action: 'quickbooks.export_downloaded' } }),
  ]);
  return {
    id: row.id, number: row.number, fromDay: row.fromDay, toDay: row.toDay, format: row.format, kinds: row.kinds, includeExported: row.includeExported, sensitive: row.sensitive,
    counts: (row.counts ?? {}) as Record<string, number>, totals: (row.totals ?? {}) as Record<string, number>,
    files: storedFiles(row.files).map((x) => ({ name: x.name, kind: String(x.kind), bytes: Buffer.byteLength(x.text, 'utf8') })),
    createdAt: row.createdAt, createdBy: by?.fullName ?? '—', downloads,
  };
}

/** The text of one file of an export, for the download route; recorded in the audit log. */
export async function readQuickBooksExportFile(id: string, name: string): Promise<{ name: string; text: string } | null> {
  const scope = await qbScope('readQuickBooksExportFile');
  if (typeof id !== 'string' || !/^[a-z0-9]{20,40}$/.test(id)) return null;
  const row = await prisma.quickBooksExport.findFirst({ where: { id, organisationId: scope.organisationId }, select: { id: true, number: true, files: true, sensitive: true } });
  if (!row) return null;
  if (row.sensitive) await authorize('dataexchange.export.sensitive', undefined, 'readQuickBooksExportFile', 'This export holds customers’ contact details: it needs the permission to export them.');
  const file = storedFiles(row.files).find((x) => x.name === name);
  if (!file) return null;
  await writeAuditLog({ userId: scope.userId, action: 'quickbooks.export_downloaded', entityType: 'QuickBooksExport', entityId: row.id, organisationId: scope.organisationId, metadata: { number: row.number, file: file.name } });
  return { name: file.name, text: file.text };
}

// ─────────────────────────────────────────────────── Settings → QuickBooks

export type QuickBooksSettingsPage = { settings: QuickBooksSettings; isOwner: boolean; qbo: QuickBooksPage['qbo'] & { missing: string[]; realmConnectedAt: Date | null } };

export async function getQuickBooksSettingsPage(): Promise<QuickBooksSettingsPage> {
  const scope = await qbScope('getQuickBooksSettingsPage');
  const [settings, conn, isOwner] = await Promise.all([
    settingsOf(scope.organisationId),
    prisma.quickBooksConnection.findUnique({ where: { organisationId: scope.organisationId }, select: { environment: true, lastUsedAt: true, lastError: true, connectedAt: true } }),
    allows('admin.organisation.manage'),
  ]);
  const cfg = qboConfig();
  return {
    settings, isOwner,
    qbo: { serverReady: 'config' in cfg, missing: 'missing' in cfg ? cfg.missing : [], connected: Boolean(conn), environment: conn?.environment ?? null, lastUsedAt: conn?.lastUsedAt ?? null, lastError: conn?.lastError ?? null, realmConnectedAt: conn?.connectedAt ?? null },
  };
}

/** The account and item names, the date order and the walk-in customer. Audited with before and after. */
export async function saveQuickBooksSettingsForm(f: FormData): Promise<void> {
  await authorize(KEY, undefined, 'saveQuickBooksSettings', 'Only the Owner and Accounts set the QuickBooks names.');
  const scope = await qbScope('saveQuickBooksSettings');
  const parsed = parseQuickBooksForm((k) => f.get(k));
  if (typeof parsed === 'string') redirect('/settings/quickbooks?error=' + encodeURIComponent(parsed));
  const before = await settingsOf(scope.organisationId);
  await prisma.organisation.update({ where: { id: scope.organisationId }, data: { quickbooksSettings: parsed as unknown as Prisma.InputJsonValue } });
  await writeAuditLog({ userId: scope.userId, action: 'organisation.quickbooks_settings_updated', entityType: 'Organisation', entityId: scope.organisationId, organisationId: scope.organisationId, metadata: { from: before, to: parsed } });
  revalidatePath('/settings/quickbooks');
  redirect('/settings/quickbooks?status=saved');
}

/** The Owner ends the QuickBooks Online connection. */
export async function disconnectQuickBooksOnlineForm(): Promise<void> {
  const scope = await qbScope('disconnectQuickBooksOnline');
  await authorize('admin.organisation.manage', undefined, 'disconnectQuickBooksOnline', 'Only the Owner connects or disconnects QuickBooks Online.');
  const ended = await disconnect(scope.organisationId);
  if (ended) await writeAuditLog({ userId: scope.userId, action: 'quickbooks.online_disconnected', entityType: 'Organisation', entityId: scope.organisationId, organisationId: scope.organisationId, metadata: {} });
  revalidatePath('/settings/quickbooks');
  redirect('/settings/quickbooks?status=disconnected');
}

/** "Send to QuickBooks Online": the range's invoices, counter sales, payments and credit notes not sent yet. */
export async function sendToQuickBooksOnlineForm(f: FormData): Promise<void> {
  const scope = await qbScope('sendToQuickBooksOnline');
  const range = parseRange(f.get('from'), f.get('to'));
  if (typeof range === 'string') redirect(backTo('error=' + encodeURIComponent(range)));
  const settings = await settingsOf(scope.organisationId);
  // Sending is separate from the Desktop files: what a file carried may still need sending.
  const docs = await collectExport(scope, range, ['invoices', 'counterSales', 'payments', 'creditNotes'], true, settings);
  let message: string;
  try {
    const r = await pushToQbo(scope.organisationId, scope.userId, docs, settings);
    const sent = Object.values(r.sent).reduce((s, n) => s + n, 0);
    const skipped = Object.values(r.skipped).reduce((s, n) => s + n, 0);
    await writeAuditLog({ userId: scope.userId, action: 'quickbooks.online_sent', entityType: 'Organisation', entityId: scope.organisationId, organisationId: scope.organisationId, metadata: { from: range.fromDay, to: range.toDay, sent: r.sent, skipped: r.skipped, errors: r.errors.length } });
    message = r.errors.length ? `error=${encodeURIComponent(`${sent} sent, ${skipped} already there. Not sent: ${r.errors.join(' · ')}`)}` : `status=${encodeURIComponent(`sent:${sent}:${skipped}`)}`;
  } catch (err) {
    if (!(err instanceof QboError)) throw err;
    message = `error=${encodeURIComponent(err.message)}`;
  }
  revalidatePath('/money/quickbooks');
  redirect(backTo(`from=${range.fromDay}&to=${range.toDay}&${message}`));
}
