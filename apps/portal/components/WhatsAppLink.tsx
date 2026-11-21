/**
 * "Send on WhatsApp": opens WhatsApp with the message written, for the
 * colleague to send from their own phone or computer (the server sends
 * nothing). Shown only when the customer has a phone WhatsApp can take
 * (lib/whatsapp-messages customerWhatsAppUrl gives null otherwise).
 */
export function WhatsAppLink({ href, label = 'Send on WhatsApp', testId = 'send-on-whatsapp', className }: { href: string | null; label?: string; testId?: string; className?: string }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-testid={testId}
      className={className ?? 'inline-flex items-center rounded-[var(--ejo-radius-md)] bg-[var(--ejo-success)] px-3 py-1 text-xs font-medium text-white hover:opacity-90'}
    >
      {label}
    </a>
  );
}
