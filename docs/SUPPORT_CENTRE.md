# Support centre

One place for every customer request and complaint: emails to the
workshop's support addresses, hand-overs from Enyo in the customer portal
chat, requests and complaints customers raise in the customer portal, and
calls or walk-ins Front Desk logs. Staff work it at **Customers → Support
centre** (`/crm/support`); the Owner sets it up at **Settings → Support
centre** (`/settings/support`).

## How a request flows

```
email to support@ ──┐                       ┌─ acknowledgement (reference, team, promised time)
chat hand-over ─────┼─► ticket SUP-2026-…  ─┤
portal complaint ───┤   team · priority ·   ├─ Enyo reads it (topic, urgency, mood, summary)
logged call ────────┘   targets · owner     │    ├─ team allows it + general question + sure → Enyo answers
                                            │    │    (labelled AI; "Yes, solved" / "I still need a person")
                                            │    └─ otherwise → a draft for a colleague + why a person is needed
                                            ├─ colleague replies (same email thread, the team's address),
                                            │    notes, priority, team, on hold, resolved
                                            ├─ waiting on the customer → reminders (48 h, 96 h) → resolved (7 days)
                                            └─ resolved → "How did we do?" (4 h) → closed (4 days)
```

## Teams and addresses

- Each team has a kind (general, technical, customer care, parts and
  others), targets per priority, a signature, whether to send an
  acknowledgement, and Enyo's part:
  - **People only**: Enyo stays out.
  - **Enyo drafts, people send**: the default.
  - **Enyo answers general questions**: Enyo replies by itself only when
    every rule below allows it.
- Each address is a shared mailbox connected with an app password, stored
  encrypted with `MAILBOX_ENCRYPTION_KEY`. It is read **read-only** every
  few minutes; replies are sent from it, so customers' answers come back to
  it.
- Colleagues on a team share new requests: the least busy person who is not
  away and under their limit gets the next one.
- Opening hours and Nigerian public holidays (worked out each year, and
  changeable) decide when targets count.

## Who picks requests up

- **Front Desk / Customer Care** and the **Owner** work the Support centre;
  only the Owner sees its set-up.
- **Customers**: email, the customer-portal chat (Enyo hands over with their
  consent), or *Help & support → Ask a question or make a complaint* in the
  customer portal. A complaint goes to the customer care team.
- **Colleagues**: *Get help* in the staff portal. Their requests stay
  private to the person, the team and the Owner.

## Rules that keep it safe

- **Mail loops:** bounces and the workshop's own addresses are dropped;
  auto-replies, mailing lists and robot senders are kept but never answered
  automatically; a sender writing more than 20 times an hour gets no
  automatic replies; at most 3 acknowledgements per sender per day. Every
  automatic email carries `Auto-Submitted: auto-replied`.
- **Threading:** `[#SUP-…]` in the subject, or the messages it answers, and
  only when the sender is that ticket's customer, so a copied reference can
  never put one customer's mail on another's ticket. A reply to a closed
  ticket opens a follow-up.
- **Exactly once:** each email has an intake key; a mailbox is read by one
  run at a time.
- **Enyo answers by itself only when:** the team allows it, the sender's
  address is proven (DMARC, or SPF and DKIM), the question is general
  (needs nobody's records), nothing sensitive is said (law, money disputes,
  safety, complaints, "a person please"), the mood is not negative, an
  approved source was found, it is at least as sure as the workshop set
  (default 75%), and the customer has not already come back. A reply that
  names a link, phone number or email that is not in the workshop's own
  details is never sent by itself.
- **Identity:** "verified" only when the customer is signed in, a colleague
  picked their file, or their email passed DMARC and matches their file.
- **The customer never sees** internal notes, Enyo's drafts or staff names
  (only the signature the team chooses).
- **Prompt injection:** every email is treated as untrusted data; Enyo never
  decides what is sent, code does, from the rules above.

## Numbers (`/crm/support/analytics`)

First answer (median and 90th percentile), resolution time, first-answer
target met, share resolved by Enyo, why people were needed, reopen rate,
satisfaction (4–5 out of 5), backlog by age, channels, topics and teams.

## Learning

When a colleague resolves a general question, the question and their answer
(names, phones, emails, plates and links removed) become a candidate for
Enyo; the Owner approves it on the Enyo learning page before Enyo uses it.
Answers about one customer's records are never learned.

## Running it

- The Supabase scheduler calls `/api/cron/support` every 3 minutes (mail
  in, targets, reminders, closing, surveys) and `/api/cron/support?step=enyo`
  every 2 minutes (Enyo reads new requests). Set-up: [SETUP.md](SETUP.md) §6.
- `MAILBOX_ENCRYPTION_KEY` must be set to connect addresses (chat
  hand-overs and logged calls work without it).
- Enyo's part needs `ENYO_LLM_*` and "Customer assistant" switched on in
  **Settings → Enyo**.
