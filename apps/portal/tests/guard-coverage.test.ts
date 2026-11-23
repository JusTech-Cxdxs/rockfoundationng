/**
 * Every server action that CHANGES data must pass a permission check —
 * the catalogue (authorize / authorizeOn… / allows) or a workflow helper
 * that checks assignment and records refusals (refuse / require…). This
 * reads the source, so a new unguarded action fails CI before it ships.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(__dirname, '..', '..', 'lib', 'actions');
const GUARDS = [
  'authorize', 'authorizeOn', 'allows(', 'refuse(', 'branchWithinReach', 'requireStoreStaff', 'requireEligible', 'requireJobCardApprover',
  'requireAssignedTechnician', 'requireEstimateContributor', 'requireJobCardCreatorOrSupervisor', 'requireGate', 'requireBroadcaster', 'canDecide',
  'currentUserIsMasterAdmin', 'isSuperAdmin', 'getSecurityRoles',
  // Support centre set-up (lib/actions/support-admin.ts): authorize('support.manage') + the person's own organisation.
  'supportOrg(',
  // Integrity watch (lib/actions/integrity.ts): authorize('integrity.review') + the reviewer's own organisation, never alerts about themselves.
  'integrityReviewer(',
  // Customer documents in bulk (lib/actions/documents.ts): authorize('dataexchange.export.sensitive'), then allows('dataexchange.export.run') at the branch.
  'documentsDesk(',
  // Scheduled exports (lib/actions/export-schedules.ts): authorize('dataexchange.export.run'); a schedule is its owner's alone.
  'exportScheduler(',
];
/** Acting only on the person's OWN data (their read marks, their reminders) — checked inside by user id. */
const SELF_SCOPED = new Set(['markNotificationsRead', 'markNotificationsUnread', 'markAllRead', 'setNotificationsMuted', 'getJobCardSourcingNeeds',
  // Enyo: the person's own conversations, ratings and remembered facts (by user id and organisation).
  'renameEnyoConversation', 'deleteEnyoConversation', 'rateEnyoMessage', 'deleteEnyoMemory',
  // Reminders (lib/actions/reminders.ts): the owner's own reminders (ownReminder: owner + organisation), and
  // for a colleague only with that colleague's own grant (mayCreateFor); delegates are the owner's own list.
  'createReminder', 'updateReminder', 'completeReminder', 'cancelReminder', 'snoozeReminder', 'grantReminderDelegate', 'withdrawReminderDelegate',
  // Get help (lib/actions/help.ts): the signed-in person's own requests only (requesterUserId + organisation).
  'openHelpRequest', 'replyToMyHelpRequest', 'answerMyHelpRequest',
]);
const WRITE = /\b(?:prisma|tx)\.\w+\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/;

test('every data-changing server action is guarded', () => {
  const missing: string[] = [];
  for (const f of readdirSync(DIR).filter((n) => n.endsWith('.ts') && !n.includes('form-handlers'))) {
    const src = readFileSync(join(DIR, f), 'utf8');
    if (!src.slice(0, 300).includes("'use server'")) continue;
    for (const part of src.split('\nexport async function ').slice(1)) {
      const name = part.slice(0, part.indexOf('('));
      const end = part.indexOf('\nexport ');
      const body = end === -1 ? part : part.slice(0, end);
      if (!WRITE.test(body) || SELF_SCOPED.has(name)) continue;
      if (!GUARDS.some((g) => body.includes(g))) missing.push(`${f}: ${name}`);
    }
  }
  assert.deepEqual(missing, [], `Unguarded actions:\n${missing.join('\n')}`);
});

/** Reads of organisation-owned data must be fenced to the organisation. */
test('organisation-owned lists and lookups carry the organisation fence', () => {
  const must: Record<string, string[]> = {
    'workshop.ts': ['listCustomers', 'searchCustomers', 'listRecentCustomers', 'listVehiclesForCustomer', 'listAllVehicles', 'getVehicle', 'listTechnicianCandidates'],
    'audit-logs.ts': ['getAuditLogPage', 'listAuditUsers'],
    'security.ts': ['searchStaffOptions'],
    'crm.ts': ['getCrmHub', 'searchCrmCustomers', 'getCustomerNames', 'getCustomer360'],
    'error-log.ts': ['getErrorLogPage'],
  };
  const missing: string[] = [];
  for (const [f, fns] of Object.entries(must)) {
    const src = readFileSync(join(DIR, f), 'utf8');
    for (const fn of fns) {
      const i = src.indexOf(`export async function ${fn}(`);
      if (i === -1) { missing.push(`${f}: ${fn} (not found)`); continue; }
      const end = src.indexOf('\nexport ', i + 10);
      const body = src.slice(i, end === -1 ? undefined : end);
      if (!/orgWhere\(|orgOwned\(/.test(body)) missing.push(`${f}: ${fn}`);
    }
  }
  assert.deepEqual(missing, [], `Not fenced to the organisation:\n${missing.join('\n')}`);
});
