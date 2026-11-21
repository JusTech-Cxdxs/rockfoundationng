import { humanizeAction } from '@/lib/humanize-action';

/** Readable audit wording for gate, reminder, broadcast, support and sign-in actions. */
export const SECURITY_ACTION_LABEL: Record<string, string> = {
  'security.follow_up': 'Follow-up',
  'security.email_sent': 'Email sent',
  'security.email_failed': 'Email could not be sent',
  'vehicle.gate_exit': 'Vehicle left through the gate',
  'reminder.created': 'Reminder set',
  'reminder.changed': 'Reminder changed',
  'reminder.snoozed': 'Reminder snoozed',
  'reminder.done': 'Reminder marked done',
  'reminder.cancelled': 'Reminder cancelled',
  'reminder.sent': 'Reminder delivered',
  'reminder.delegate_granted': 'Allowed a colleague to set reminders',
  'reminder.delegate_withdrawn': 'Withdrew a colleague\'s permission to set reminders',
  'broadcast.created': 'Broadcast published',
  'broadcast.stopped': 'Broadcast stopped',
  'broadcast.reactivated': 'Broadcast reactivated',
  'broadcast.deleted': 'Broadcast deleted',
  'broadcast.emailed': 'Broadcast emailed',
  // Support centre
  'support.ticket_opened': 'New support request',
  'support.customer_replied': 'Customer replied on a support request',
  'support.replied': 'Support reply sent',
  'support.note_added': 'Note added on a support request',
  'support.assigned': 'Support request assigned',
  'support.status_changed': 'Support request status changed',
  'support.priority_changed': 'Support request priority changed',
  'support.queue_changed': 'Support request moved to another team',
  'support.ai_answered': 'Enyo answered a support request',
  'support.sla_warning': 'Support request: first answer due soon',
  'support.sla_breached': 'Support request: first answer is late',
  'support.urgent': 'Urgent support request (safety)',
  'support.auto_resolved': 'Support request resolved (no reply from the customer)',
  'support.customer_confirmed': 'Customer said the answer solved it',
  'support.customer_asked_person': 'Customer asked for a person',
  'support.customer_rated': 'Customer rated the support',
  'support.help_requested': 'A colleague asked for help',
  'support.reopened': 'Support request reopened',
  'support.ai_reviewed': 'Enyo’s support reply checked',
  'user.signed_in': 'Signed in',
  'user.sign_in_failed': 'Failed sign-in',
  'customer.sign_in_failed': 'Customer failed to sign in',
  'integrity.alert_raised': 'Integrity alert raised',
  'integrity.alert_reviewed': 'Integrity alert reviewed',
  'integrity.scan': 'Integrity checks run',
  'branch.type_changed': 'Branch kind changed',
  // Data Exchange exports.
  'data_exchange.export_created': 'List exported',
  'data_exchange.exported': 'Export downloaded',
};

export function securityActionLabel(action: string): string {
  return SECURITY_ACTION_LABEL[action] ?? humanizeAction(action);
}

/** One readable line of detail for an entry, or null. */
export function securityActionDetail(action: string, meta: Record<string, unknown> | null): string | null {
  if (!meta) return null;
  const s = (k: string) => (typeof meta[k] === 'string' ? (meta[k] as string) : null);
  switch (action) {
    case 'support.ticket_opened':
    case 'support.sla_warning':
    case 'support.sla_breached':
    case 'support.urgent':
    case 'support.ai_answered':
    case 'support.customer_confirmed':
    case 'support.customer_asked_person':
      return [s('queue'), s('priority') && s('priority') !== 'NORMAL' ? `${s('priority')!.charAt(0)}${s('priority')!.slice(1).toLowerCase()} priority` : null].filter(Boolean).join(' · ') || null;
    case 'support.customer_rated':
      return typeof meta.score === 'number' ? `${meta.score} out of 5` : null;
    case 'security.email_sent':
    case 'security.email_failed':
      return `To ${s('to') ?? 'recipient'} — ${s('subject') ?? ''}${s('error') ? ` (${s('error')})` : ''}`;
    case 'broadcast.created':
      return [s('title'), s('duration'), meta.email ? 'emailed' : null].filter(Boolean).join(' · ') || null;
    case 'broadcast.reactivated':
      return [s('duration'), meta.email ? 'emailed again' : null].filter(Boolean).join(' · ') || null;
    case 'broadcast.emailed':
      return typeof meta.sent === 'number' ? `${meta.sent} ${meta.sent === 1 ? 'email' : 'emails'} sent${typeof meta.failed === 'number' && meta.failed ? `, ${meta.failed} failed` : ''}` : null;
    case 'branch.type_changed':
      return [s('branch'), s('from') && s('to') ? `${s('from')} → ${s('to')}` : null].filter(Boolean).join(' · ') || null;
    case 'vehicle.gate_exit':
      return [s('exitNumber'), s('number'), s('collectedBy') ?? s('driver') ? `collected by ${s('collectedBy') ?? s('driver')}` : null].filter(Boolean).join(' · ') || null;
    default:
      return null;
  }
}
