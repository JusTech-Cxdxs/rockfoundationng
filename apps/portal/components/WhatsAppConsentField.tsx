'use client';

import { useEffect, useId, useRef, useState } from 'react';

/**
 * The registration tick box for WhatsApp updates (Customers → Register, the
 * front desk). Ticked by default once a phone number is typed in the same
 * form, and left as the colleague sets it after they touch it. Sent as
 * whatsappOptIn=yes; the server records who ticked it and when. Business
 * messages on WhatsApp need the customer's agreement (Meta's policy and the
 * Nigeria Data Protection Act), so the colleague asks before leaving it on.
 */
export function WhatsAppConsentField({ phoneField = 'phone', initial, className }: { phoneField?: string; initial?: boolean; className?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const boxId = useId();
  const hintId = useId();
  const touched = useRef(initial !== undefined);
  const [checked, setChecked] = useState(initial ?? false);

  useEffect(() => {
    const form = ref.current?.form;
    const phone = form?.elements.namedItem(phoneField);
    if (!(phone instanceof HTMLInputElement)) return;
    const follow = () => { if (!touched.current) setChecked(phone.value.trim().length > 0); };
    follow();
    phone.addEventListener('input', follow);
    return () => phone.removeEventListener('input', follow);
  }, [phoneField]);

  // The explanation is a description, not part of the box's name, so the
  // label stays short ("agrees to receive updates on WhatsApp").
  return (
    <div className={className ?? 'flex items-start gap-2 text-sm text-[var(--ejo-text)]'}>
      <input
        ref={ref}
        id={boxId}
        type="checkbox"
        name="whatsappOptIn"
        value="yes"
        checked={checked}
        onChange={(e) => { touched.current = true; setChecked(e.target.checked); }}
        aria-describedby={hintId}
        data-testid="whatsapp-consent"
        className="mt-0.5 h-4 w-4"
      />
      <div>
        <label htmlFor={boxId}>The customer agrees to receive updates on WhatsApp</label>
        <p id={hintId} className="text-xs text-[var(--ejo-text-muted)]">Ask them first. Their estimates, invoices, receipts and vehicle updates then go to their WhatsApp as well as by email. They can switch it off in their customer portal.</p>
      </div>
    </div>
  );
}
