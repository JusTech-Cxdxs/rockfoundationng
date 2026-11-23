# WhatsApp templates (Rock Foundation Automobile)

<!-- Made from packages/utils/src/whatsapp-templates.ts by `npm run whatsapp:templates-doc`. Do not edit by hand: change the catalogue and run it again. -->

Every automatic WhatsApp message the portal and the customer portal send. WhatsApp only lets a business start a conversation with a **template Meta has approved**, so each one below must be created in **WhatsApp Manager → Message templates → Create template**, exactly as written: the name, the category, the language, the header, the body (copy it as it is, line breaks included), the footer and a sample for each `{{n}}`. Until a template is approved, its messages are refused by Meta and recorded as failed in **Settings → WhatsApp**; the email still goes.

Customer messages end with the workshop’s number (0803 304 9194); the other line is +234 802 389 1766. Money is written ₦12,345.00 and dates DD/MM/YYYY, in Lagos time.

- **Language:** English (`en`), unless `WHATSAPP_TEMPLATE_LANGUAGE` says otherwise — create every template in that same language.
- **Header “Document”:** choose *Media → Document* and upload any sample PDF. When the message is sent, the real PDF (the estimate, invoice or receipt) goes in its place, named after its number (for example `INV-2026-000012.pdf`).
- **Samples:** Meta asks for an example of each `{{n}}`; use the ones given. They are made up.
- **Category:** UTILITY for messages about the customer’s own vehicle, job, money or request; MARKETING for announcements (Meta’s rule). Meta may change a category when it reviews a template; that is fine.
- **Replies:** the portal does not read WhatsApp replies; the footer asks people to call. If the business number is also on the WhatsApp Business app (coexistence), replies arrive there.

## The 28 templates

| Name in Meta | Category | Header | For | When it is sent |
| --- | --- | --- | --- | --- |
| `rf_job_checked_in` | UTILITY | None | Customers | The vehicle is checked in: a new Job Card, for any kind of visit (service, repair, diagnostics, spraying or a car wash). |
| `rf_job_work_started` | UTILITY | None | Customers | Work starts on the vehicle (the Job Card moves to In progress). |
| `rf_job_work_update` | UTILITY | None | Customers | Work resumes after waiting for parts, or the vehicle goes back for more work after its final checks. |
| `rf_job_quality_check` | UTILITY | None | Customers | The work is done and the vehicle is in final quality checks. |
| `rf_job_completed` | UTILITY | None | Customers | The vehicle passes its final quality inspection (Completed). |
| `rf_ready_for_collection` | UTILITY | None | Customers | The vehicle is ready for collection; also the collection reminder from Vehicles in custody. |
| `rf_cancelled_vehicle_waiting` | UTILITY | None | Customers | A cancelled Job Card whose vehicle is still at the workshop: the collection notice. |
| `rf_vehicle_collected` | UTILITY | None | Customers | The vehicle is checked out (collected). |
| `rf_rating_request` | UTILITY | None | Customers | After the vehicle is collected: "How did we do?", with the link to rate the visit from 1 to 5. |
| `rf_booking_confirmed` | UTILITY | None | Customers | Front desk confirms a workshop booking, or moves it to another day or time. |
| `rf_booking_reminder` | UTILITY | None | Customers | The day before a confirmed workshop booking. |
| `rf_job_cancelled` | UTILITY | None | Customers | A Job Card is cancelled. |
| `rf_job_closed` | UTILITY | None | Customers | A Job Card is closed: the work and payment are settled. |
| `rf_estimate_ready` | UTILITY | Document (PDF) | Customers | The approved estimate is sent to the customer (with the estimate PDF); also "Send now on WhatsApp" for the estimate. |
| `rf_estimate_approval_link` | UTILITY | None | Customers | Staff send the customer a secure link to approve or decline the estimate. |
| `rf_estimate_reminder` | UTILITY | None | Customers | The estimate is still waiting for the customer’s answer (the approval reminder, by hand or by the daily check). |
| `rf_invoice` | UTILITY | Document (PDF) | Customers | An invoice is issued and sent (on completion, or "Email invoice"); also "Send now on WhatsApp" for the invoice. |
| `rf_payment_receipt` | UTILITY | Document (PDF) | Customers | A payment is recorded on a Job Card (with the receipt PDF); also "Send now on WhatsApp" for a receipt. |
| `rf_refund` | UTILITY | None | Customers | A refund is recorded (the refund receipt email; there is no refund PDF). |
| `rf_service_reminder` | UTILITY | None | Customers | A vehicle is due or past due for its service (Service Tracker reminders, by hand or automatic). |
| `rf_welcome` | UTILITY | None | Customers | A new customer is registered and their customer portal account is opened (the welcome email). The set-password link itself stays in the email. |
| `rf_support_received` | UTILITY | None | Customers | A customer’s support request or complaint is received (by email, the customer portal or Enyo’s hand-over). |
| `rf_support_reply` | UTILITY | None | Customers | Our team (or Enyo, when allowed) replies on a customer’s support request or complaint. |
| `rf_customer_announcement` | MARKETING | None | Customers | A broadcast to customers (Notifications → Broadcasts), to customers who chose announcements. |
| `rf_staff_approval` | UTILITY | None | Staff | Something waits for the colleague’s approval or check: an estimate to validate or approve, a cancellation or close request. |
| `rf_staff_assigned` | UTILITY | None | Staff | A Job Card or a support request is assigned to the colleague. |
| `rf_staff_announcement` | UTILITY | None | Staff | A broadcast to staff (Notifications → Broadcasts). |
| `rf_staff_update` | UTILITY | None | Staff | A work notice for the colleague: a vehicle ready for quality check or sent back, the customer answered the estimate, a deposit met, a vehicle released at the gate, an inspection done, a support request waiting, a reminder, a decision on their request. |

### `rf_job_checked_in`

- **Category:** UTILITY
- **Language:** English (`en`)
- **Header:** None
- **Sent:** The vehicle is checked in: a new Job Card, for any kind of visit (service, repair, diagnostics, spraying or a car wash).

**Body**

```text
Hello {{1}}, thank you for bringing your {{2}} to {{3}} for {{4}}. We have checked it in under {{5}}, and we will keep you updated at each step.

Follow each step in your customer portal: {{6}}

Thank you.
```

**Footer:** Automatic message. Call us on 0803 304 9194.

| Variable | What it is | Sample |
| --- | --- | --- |
| `{{1}}` | Greeting name (a person’s first name, or the organisation’s name) | Tunde |
| `{{2}}` | vehicle | Toyota Corolla (KJA 901 XY) |
| `{{3}}` | Your organisation’s name | Rock Foundation Automobile |
| `{{4}}` | visit | a service and repair |
| `{{5}}` | record | Job Card JC-2026-000123 |
| `{{6}}` | link | https://www.example.com/customer-portal/dashboard/services/jc/abc123 |

### `rf_job_work_started`

- **Category:** UTILITY
- **Language:** English (`en`)
- **Header:** None
- **Sent:** Work starts on the vehicle (the Job Card moves to In progress).

**Body**

```text
Hello {{1}}, our technicians have started work on your {{2}} under {{3}}. There is nothing you need to do for now.

Follow each step in your customer portal: {{4}}

Thank you.
```

**Footer:** Automatic message. Call us on 0803 304 9194.

| Variable | What it is | Sample |
| --- | --- | --- |
| `{{1}}` | Greeting name (a person’s first name, or the organisation’s name) | Tunde |
| `{{2}}` | vehicle | Toyota Corolla (KJA 901 XY) |
| `{{3}}` | record | Job Card JC-2026-000123 |
| `{{4}}` | link | https://www.example.com/customer-portal/dashboard/services/jc/abc123 |

### `rf_job_work_update`

- **Category:** UTILITY
- **Language:** English (`en`)
- **Header:** None
- **Sent:** Work resumes after waiting for parts, or the vehicle goes back for more work after its final checks.

**Body**

```text
Hello {{1}}, here is an update on your {{2}} under {{3}}.

What is happening: {{4}}

There is nothing you need to do. Follow each step in your customer portal: {{5}}

Thank you for your patience.
```

**Footer:** Automatic message. Call us on 0803 304 9194.

| Variable | What it is | Sample |
| --- | --- | --- |
| `{{1}}` | Greeting name (a person’s first name, or the organisation’s name) | Tunde |
| `{{2}}` | vehicle | Toyota Corolla (KJA 901 XY) |
| `{{3}}` | record | Job Card JC-2026-000123 |
| `{{4}}` | update | the parts we were waiting for have arrived, and work has started again. |
| `{{5}}` | link | https://www.example.com/customer-portal/dashboard/services/jc/abc123 |

### `rf_job_quality_check`

- **Category:** UTILITY
- **Language:** English (`en`)
- **Header:** None
- **Sent:** The work is done and the vehicle is in final quality checks.

**Body**

```text
Hello {{1}}, the work on your {{2}} under {{3}} is finished. We are now carrying out final checks, including a road test where needed.

Follow each step in your customer portal: {{4}}

We will let you know when it is ready.
```

**Footer:** Automatic message. Call us on 0803 304 9194.

| Variable | What it is | Sample |
| --- | --- | --- |
| `{{1}}` | Greeting name (a person’s first name, or the organisation’s name) | Tunde |
| `{{2}}` | vehicle | Toyota Corolla (KJA 901 XY) |
| `{{3}}` | record | Job Card JC-2026-000123 |
| `{{4}}` | link | https://www.example.com/customer-portal/dashboard/services/jc/abc123 |

### `rf_job_completed`

- **Category:** UTILITY
- **Language:** English (`en`)
- **Header:** None
- **Sent:** The vehicle passes its final quality inspection (Completed).

**Body**

```text
Hello {{1}}, the work on your {{2}} under {{3}} is complete and has passed our final checks. We are preparing it for collection and will send you the collection details shortly.

See it in your customer portal: {{4}}

Thank you.
```

**Footer:** Automatic message. Call us on 0803 304 9194.

| Variable | What it is | Sample |
| --- | --- | --- |
| `{{1}}` | Greeting name (a person’s first name, or the organisation’s name) | Tunde |
| `{{2}}` | vehicle | Toyota Corolla (KJA 901 XY) |
| `{{3}}` | record | Job Card JC-2026-000123 |
| `{{4}}` | link | https://www.example.com/customer-portal/dashboard/services/jc/abc123 |

### `rf_ready_for_collection`

- **Category:** UTILITY
- **Language:** English (`en`)
- **Header:** None
- **Sent:** The vehicle is ready for collection; also the collection reminder from Vehicles in custody.

**Body**

```text
Hello {{1}}, your {{2}} is ready for collection at {{3}}. Your reference is {{4}}. Please collect it by {{5}}; storage charges may apply after that date.

Please make sure any balance is paid before collection, and bring a form of identification. If someone else is collecting for you, let us know beforehand.

Thank you.
```

**Footer:** Automatic message. Call us on 0803 304 9194.

| Variable | What it is | Sample |
| --- | --- | --- |
| `{{1}}` | Greeting name (a person’s first name, or the organisation’s name) | Tunde |
| `{{2}}` | vehicle | Toyota Corolla (KJA 901 XY) |
| `{{3}}` | branch | Ota Workshop |
| `{{4}}` | record | Job Card JC-2026-000123 |
| `{{5}}` | collectBy | Friday, 04/12/2026 |

### `rf_cancelled_vehicle_waiting`

- **Category:** UTILITY
- **Language:** English (`en`)
- **Header:** None
- **Sent:** A cancelled Job Card whose vehicle is still at the workshop: the collection notice.

**Body**

```text
Hello {{1}}, your {{2}} is still with us at {{3}}, after {{4}} was cancelled. Please arrange to collect it as soon as you can.

If you need a different arrangement, please call us and we will work it out with you.
```

**Footer:** Automatic message. Call us on 0803 304 9194.

| Variable | What it is | Sample |
| --- | --- | --- |
| `{{1}}` | Greeting name (a person’s first name, or the organisation’s name) | Tunde |
| `{{2}}` | vehicle | Toyota Corolla (KJA 901 XY) |
| `{{3}}` | branch | Ota Workshop |
| `{{4}}` | record | Job Card JC-2026-000123 |

### `rf_vehicle_collected`

- **Category:** UTILITY
- **Language:** English (`en`)
- **Header:** None
- **Sent:** The vehicle is checked out (collected).

**Body**

```text
Hello {{1}}, this confirms that your {{2}} has been collected under {{3}}, by {{4}}.

Next service: {{5}}

If you did not collect it yourself or authorise this person, call us straight away.

Thank you for choosing {{6}}. We look forward to seeing you again.
```

**Footer:** Automatic message. Call us on 0803 304 9194.

| Variable | What it is | Sample |
| --- | --- | --- |
| `{{1}}` | Greeting name (a person’s first name, or the organisation’s name) | Tunde |
| `{{2}}` | vehicle | Toyota Corolla (KJA 901 XY) |
| `{{3}}` | record | Job Card JC-2026-000123 |
| `{{4}}` | collectedBy | Tunde Bakare |
| `{{5}}` | nextService | due at 66,250 km or by 20/05/2027, whichever comes first. |
| `{{6}}` | Your organisation’s name | Rock Foundation Automobile |

### `rf_rating_request`

- **Category:** UTILITY
- **Language:** English (`en`)
- **Header:** None
- **Sent:** After the vehicle is collected: "How did we do?", with the link to rate the visit from 1 to 5.

**Body**

```text
Hello {{1}}, thank you for choosing {{2}}. How did we do with your {{3}} under {{4}}?

It takes a few seconds to rate us from 1 to 5: {{5}}

If anything was not right, tell us there and we will call you.
```

**Footer:** Automatic message. Call us on 0803 304 9194.

| Variable | What it is | Sample |
| --- | --- | --- |
| `{{1}}` | Greeting name (a person’s first name, or the organisation’s name) | Tunde |
| `{{2}}` | Your organisation’s name | Rock Foundation Automobile |
| `{{3}}` | vehicle | Toyota Corolla (KJA 901 XY) |
| `{{4}}` | record | Job Card JC-2026-000123 |
| `{{5}}` | link | https://www.example.com/rate/abc123.signature |

### `rf_booking_confirmed`

- **Category:** UTILITY
- **Language:** English (`en`)
- **Header:** None
- **Sent:** Front desk confirms a workshop booking, or moves it to another day or time.

**Body**

```text
Hello {{1}}, your booking {{2}} at {{3}} is confirmed: {{4}} for {{5}}.

Please come a few minutes early with your vehicle. To change the booking, call us.
```

**Footer:** Automatic message. Call us on 0803 304 9194.

| Variable | What it is | Sample |
| --- | --- | --- |
| `{{1}}` | Greeting name (a person’s first name, or the organisation’s name) | Tunde |
| `{{2}}` | number | APT-2026-000012 |
| `{{3}}` | Your organisation’s name | Rock Foundation Automobile |
| `{{4}}` | visit | a service |
| `{{5}}` | when | Tuesday 24/11/2026, 10:00 |

### `rf_booking_reminder`

- **Category:** UTILITY
- **Language:** English (`en`)
- **Header:** None
- **Sent:** The day before a confirmed workshop booking.

**Body**

```text
Hello {{1}}, a reminder of your booking {{2}} at {{3}} tomorrow: {{4}} for {{5}}.

We look forward to seeing you. To change the booking, call us.
```

**Footer:** Automatic message. Call us on 0803 304 9194.

| Variable | What it is | Sample |
| --- | --- | --- |
| `{{1}}` | Greeting name (a person’s first name, or the organisation’s name) | Tunde |
| `{{2}}` | number | APT-2026-000012 |
| `{{3}}` | Your organisation’s name | Rock Foundation Automobile |
| `{{4}}` | visit | a service |
| `{{5}}` | when | Tuesday 24/11/2026, 10:00 |

### `rf_job_cancelled`

- **Category:** UTILITY
- **Language:** English (`en`)
- **Header:** None
- **Sent:** A Job Card is cancelled.

**Body**

```text
Hello {{1}}, as requested, we have cancelled {{2}} for your {{3}}. No further work will be carried out under it.

If your vehicle is still with us, please arrange to collect it. If you paid anything towards this job, we will contact you about it.

Thank you.
```

**Footer:** Automatic message. Call us on 0803 304 9194.

| Variable | What it is | Sample |
| --- | --- | --- |
| `{{1}}` | Greeting name (a person’s first name, or the organisation’s name) | Tunde |
| `{{2}}` | record | Job Card JC-2026-000123 |
| `{{3}}` | vehicle | Toyota Corolla (KJA 901 XY) |

### `rf_job_closed`

- **Category:** UTILITY
- **Language:** English (`en`)
- **Header:** None
- **Sent:** A Job Card is closed: the work and payment are settled.

**Body**

```text
Hello {{1}}, the job on your {{2}} under {{3}} is now closed. The work and payment are settled, and the full record stays in your customer portal: {{4}}

Thank you for choosing {{5}}. We hope to see you again.
```

**Footer:** Automatic message. Call us on 0803 304 9194.

| Variable | What it is | Sample |
| --- | --- | --- |
| `{{1}}` | Greeting name (a person’s first name, or the organisation’s name) | Tunde |
| `{{2}}` | vehicle | Toyota Corolla (KJA 901 XY) |
| `{{3}}` | record | Job Card JC-2026-000123 |
| `{{4}}` | link | https://www.example.com/customer-portal/dashboard |
| `{{5}}` | Your organisation’s name | Rock Foundation Automobile |

### `rf_estimate_ready`

- **Category:** UTILITY
- **Language:** English (`en`)
- **Header:** Media → Document (upload any sample PDF)
- **Sent:** The approved estimate is sent to the customer (with the estimate PDF); also "Send now on WhatsApp" for the estimate.

**Body**

```text
Hello {{1}}, the estimate for your {{2}} under {{3}} is ready, with a total of {{4}}.

To start the work: {{5}}

The estimate is attached. Approve or decline it here: {{6}}

You can also answer in your customer portal or call us. Thank you.
```

**Footer:** Automatic message. Call us on 0803 304 9194.

| Variable | What it is | Sample |
| --- | --- | --- |
| `{{1}}` | Greeting name (a person’s first name, or the organisation’s name) | Tunde |
| `{{2}}` | vehicle | Toyota Corolla (KJA 901 XY) |
| `{{3}}` | record | Job Card JC-2026-000123 |
| `{{4}}` | total | ₦116,000.00 |
| `{{5}}` | deposit | a deposit of ₦81,200.00 is needed once you approve, then we begin. |
| `{{6}}` | link | https://www.example.com/approve/AbCdEf123 |

### `rf_estimate_approval_link`

- **Category:** UTILITY
- **Language:** English (`en`)
- **Header:** None
- **Sent:** Staff send the customer a secure link to approve or decline the estimate.

**Body**

```text
Hello {{1}}, here is a secure link to approve the estimate for your {{2}} under {{3}}, or to tell us you do not want the work: {{4}}

Estimate total: {{5}}. The link works once and stops working on {{6}}. Any earlier link no longer works.

Thank you.
```

**Footer:** Automatic message. Call us on 0803 304 9194.

| Variable | What it is | Sample |
| --- | --- | --- |
| `{{1}}` | Greeting name (a person’s first name, or the organisation’s name) | Tunde |
| `{{2}}` | vehicle | Toyota Corolla (KJA 901 XY) |
| `{{3}}` | record | Job Card JC-2026-000123 |
| `{{4}}` | link | https://www.example.com/approve/AbCdEf123 |
| `{{5}}` | total | ₦116,000.00 |
| `{{6}}` | expiresOn | Saturday, 28/11/2026 |

### `rf_estimate_reminder`

- **Category:** UTILITY
- **Language:** English (`en`)
- **Header:** None
- **Sent:** The estimate is still waiting for the customer’s answer (the approval reminder, by hand or by the daily check).

**Body**

```text
Hello {{1}}, the estimate for your {{2}} under {{3}} is still waiting for your go-ahead. {{4}} Please answer by {{5}}.

Approve or decline it here: {{6}}

If something is holding you up, call us and we will work it out with you.
```

**Footer:** Automatic message. Call us on 0803 304 9194.

| Variable | What it is | Sample |
| --- | --- | --- |
| `{{1}}` | Greeting name (a person’s first name, or the organisation’s name) | Tunde |
| `{{2}}` | vehicle | Toyota Corolla (KJA 901 XY) |
| `{{3}}` | record | Job Card JC-2026-000123 |
| `{{4}}` | start | Work starts as soon as you approve it. |
| `{{5}}` | answerBy | Friday, 27/11/2026 |
| `{{6}}` | link | https://www.example.com/customer-portal/dashboard/services/jc/abc123 |

### `rf_invoice`

- **Category:** UTILITY
- **Language:** English (`en`)
- **Header:** Media → Document (upload any sample PDF)
- **Sent:** An invoice is issued and sent (on completion, or "Email invoice"); also "Send now on WhatsApp" for the invoice.

**Body**

```text
Hello {{1}}, your invoice {{2}} for {{3}} comes to {{4}}.

Balance: {{5}}

The invoice is attached. See it in your customer portal: {{6}}

Thank you for choosing {{7}}. We appreciate your business.
```

**Footer:** Automatic message. Call us on 0803 304 9194.

| Variable | What it is | Sample |
| --- | --- | --- |
| `{{1}}` | Greeting name (a person’s first name, or the organisation’s name) | Tunde |
| `{{2}}` | invoiceNumber | INV-2026-000012 |
| `{{3}}` | record | Job Card JC-2026-000123 |
| `{{4}}` | total | ₦403,125.00 |
| `{{5}}` | balance | ₦403,125.00 still to pay, by 20/12/2026. |
| `{{6}}` | link | https://www.example.com/customer-portal/dashboard/services/jc/abc123/invoice |
| `{{7}}` | Your organisation’s name | Rock Foundation Automobile |

### `rf_payment_receipt`

- **Category:** UTILITY
- **Language:** English (`en`)
- **Header:** Media → Document (upload any sample PDF)
- **Sent:** A payment is recorded on a Job Card (with the receipt PDF); also "Send now on WhatsApp" for a receipt.

**Body**

```text
Hello {{1}}, we have received {{2}} on {{3}} for {{4}}. Your receipt number is {{5}}.

Balance: {{6}}

Your receipt is attached; please keep it for your records. Thank you.
```

**Footer:** Automatic message. Call us on 0803 304 9194.

| Variable | What it is | Sample |
| --- | --- | --- |
| `{{1}}` | Greeting name (a person’s first name, or the organisation’s name) | Tunde |
| `{{2}}` | amount | ₦50,000.00 |
| `{{3}}` | paidOn | 20/11/2026 |
| `{{4}}` | record | Job Card JC-2026-000123 |
| `{{5}}` | receiptNumber | RCT-2026-000077 |
| `{{6}}` | balance | ₦66,000.00 still to pay. |

### `rf_refund`

- **Category:** UTILITY
- **Language:** English (`en`)
- **Header:** None
- **Sent:** A refund is recorded (the refund receipt email; there is no refund PDF).

**Body**

```text
Hello {{1}}, we have refunded {{2}} to you on {{3}} by {{4}}, for {{5}}. Your refund receipt number is {{6}}.

Still to be refunded: {{7}}

Please keep this message as your receipt. Thank you.
```

**Footer:** Automatic message. Call us on 0803 304 9194.

| Variable | What it is | Sample |
| --- | --- | --- |
| `{{1}}` | Greeting name (a person’s first name, or the organisation’s name) | Tunde |
| `{{2}}` | amount | ₦25,000.00 |
| `{{3}}` | refundedOn | 21/11/2026 |
| `{{4}}` | method | bank transfer |
| `{{5}}` | record | Job Card JC-2026-000123 |
| `{{6}}` | referenceNumber | RFD-2026-000004 |
| `{{7}}` | remaining | nothing, your refund is complete. |

### `rf_service_reminder`

- **Category:** UTILITY
- **Language:** English (`en`)
- **Header:** None
- **Sent:** A vehicle is due or past due for its service (Service Tracker reminders, by hand or automatic).

**Body**

```text
Hello {{1}}, your {{2}} is {{3}}.

Call us, or see it in your customer portal, to book a convenient day: {{4}}

Thank you for choosing {{5}}. We look forward to seeing you.
```

**Footer:** Automatic message. Call us on 0803 304 9194.

| Variable | What it is | Sample |
| --- | --- | --- |
| `{{1}}` | Greeting name (a person’s first name, or the organisation’s name) | Tunde |
| `{{2}}` | vehicle | Toyota Corolla (KJA 901 XY) |
| `{{3}}` | due | due for its service at 66,250 km or 04/12/2026, whichever comes first |
| `{{4}}` | link | https://www.example.com/customer-portal/dashboard |
| `{{5}}` | Your organisation’s name | Rock Foundation Automobile |

### `rf_welcome`

- **Category:** UTILITY
- **Language:** English (`en`)
- **Header:** None
- **Sent:** A new customer is registered and their customer portal account is opened (the welcome email). The set-password link itself stays in the email.

**Body**

```text
Hello {{1}}, welcome to {{2}}. Your customer portal account is ready, so you can follow your vehicles, Job Cards, estimates and payments online.

We have emailed {{3}} a link to set your password. Then sign in at {{4}}

Thank you for choosing us.
```

**Footer:** Automatic message. Call us on 0803 304 9194.

| Variable | What it is | Sample |
| --- | --- | --- |
| `{{1}}` | Greeting name (a person’s first name, or the organisation’s name) | Tunde |
| `{{2}}` | Your organisation’s name | Rock Foundation Automobile |
| `{{3}}` | email | tunde@example.com |
| `{{4}}` | link | https://www.example.com/customer-portal/sign-in |

### `rf_support_received`

- **Category:** UTILITY
- **Language:** English (`en`)
- **Header:** None
- **Sent:** A customer’s support request or complaint is received (by email, the customer portal or Enyo’s hand-over).

**Body**

```text
Hello {{1}}, thank you for contacting {{2}}. We have your request {{3}} about {{4}}, and our team will reply by email and in your customer portal: {{5}}

If your vehicle is unsafe to drive or you are stranded, please call us now.
```

**Footer:** Automatic message. Call us on 0803 304 9194.

| Variable | What it is | Sample |
| --- | --- | --- |
| `{{1}}` | Greeting name (a person’s first name, or the organisation’s name) | Tunde |
| `{{2}}` | Your organisation’s name | Rock Foundation Automobile |
| `{{3}}` | ticketNumber | SUP-2026-000031 |
| `{{4}}` | subject | noise from the front wheel |
| `{{5}}` | link | https://www.example.com/customer-portal/dashboard/support |

### `rf_support_reply`

- **Category:** UTILITY
- **Language:** English (`en`)
- **Header:** None
- **Sent:** Our team (or Enyo, when allowed) replies on a customer’s support request or complaint.

**Body**

```text
Hello {{1}}, we have replied to your request {{2}} about {{3}}.

Our reply: {{4}}

The full reply is in your email. You can answer in your customer portal: {{5}}

Thank you.
```

**Footer:** Automatic message. Call us on 0803 304 9194.

| Variable | What it is | Sample |
| --- | --- | --- |
| `{{1}}` | Greeting name (a person’s first name, or the organisation’s name) | Tunde |
| `{{2}}` | ticketNumber | SUP-2026-000031 |
| `{{3}}` | subject | noise from the front wheel |
| `{{4}}` | reply | We have booked your vehicle in for Monday at 10am. Please bring the spare key. |
| `{{5}}` | link | https://www.example.com/customer-portal/dashboard/support |

### `rf_customer_announcement`

- **Category:** MARKETING
- **Language:** English (`en`)
- **Header:** None
- **Sent:** A broadcast to customers (Notifications → Broadcasts), to customers who chose announcements.

**Body**

```text
Hello {{1}}, here is a message from {{2}}, titled “{{3}}”.

In short: {{4}}

Read it in your customer portal: {{5}}

You can switch WhatsApp messages off in your customer portal profile.
```

**Footer:** Automatic message. Call us on 0803 304 9194.

| Variable | What it is | Sample |
| --- | --- | --- |
| `{{1}}` | Greeting name (a person’s first name, or the organisation’s name) | Tunde |
| `{{2}}` | Your organisation’s name | Rock Foundation Automobile |
| `{{3}}` | title | Closed on Monday for the public holiday |
| `{{4}}` | message | The workshop is closed on Monday. Vehicles due for collection that day can be collected on Tuesday. |
| `{{5}}` | link | https://www.example.com/customer-portal/dashboard |

### `rf_staff_approval`

- **Category:** UTILITY
- **Language:** English (`en`)
- **Header:** None
- **Sent:** Something waits for the colleague’s approval or check: an estimate to validate or approve, a cancellation or close request.

**Body**

```text
Hello {{1}}, something is waiting for your approval at {{2}}. What: {{3}}

Details: {{4}}

Open it in the staff portal: {{5}}

Thank you.
```

**Footer:** Automatic notice from the staff portal.

| Variable | What it is | Sample |
| --- | --- | --- |
| `{{1}}` | Greeting name (a person’s first name, or the organisation’s name) | Tunde |
| `{{2}}` | Your organisation’s name | Rock Foundation Automobile |
| `{{3}}` | what | the estimate on Job Card JC-2026-000123 |
| `{{4}}` | details | Customer: Tunde Bakare. Vehicle: Toyota Corolla. |
| `{{5}}` | link | https://staff.example.com/workshop/job-cards/abc123 |

### `rf_staff_assigned`

- **Category:** UTILITY
- **Language:** English (`en`)
- **Header:** None
- **Sent:** A Job Card or a support request is assigned to the colleague.

**Body**

```text
Hello {{1}}, you have a new assignment at {{2}}. What: {{3}}

Details: {{4}}

Open it in the staff portal: {{5}}

Thank you.
```

**Footer:** Automatic notice from the staff portal.

| Variable | What it is | Sample |
| --- | --- | --- |
| `{{1}}` | Greeting name (a person’s first name, or the organisation’s name) | Tunde |
| `{{2}}` | Your organisation’s name | Rock Foundation Automobile |
| `{{3}}` | what | Job Card JC-2026-000123 |
| `{{4}}` | details | Customer: Tunde Bakare. Vehicle: Toyota Corolla. |
| `{{5}}` | link | https://staff.example.com/workshop/job-cards/abc123 |

### `rf_staff_announcement`

- **Category:** UTILITY
- **Language:** English (`en`)
- **Header:** None
- **Sent:** A broadcast to staff (Notifications → Broadcasts).

**Body**

```text
Hello {{1}}, there is a new notice from {{2}}, titled “{{3}}”.

In short: {{4}}

Read it in the staff portal: {{5}}

Thank you.
```

**Footer:** Automatic notice from the staff portal.

| Variable | What it is | Sample |
| --- | --- | --- |
| `{{1}}` | Greeting name (a person’s first name, or the organisation’s name) | Tunde |
| `{{2}}` | Your organisation’s name | Rock Foundation Automobile |
| `{{3}}` | title | Stock count on Saturday |
| `{{4}}` | message | Everyone in the Store is needed from 8am. |
| `{{5}}` | link | https://staff.example.com/notifications?tab=broadcasts |

### `rf_staff_update`

- **Category:** UTILITY
- **Language:** English (`en`)
- **Header:** None
- **Sent:** A work notice for the colleague: a vehicle ready for quality check or sent back, the customer answered the estimate, a deposit met, a vehicle released at the gate, an inspection done, a support request waiting, a reminder, a decision on their request.

**Body**

```text
Hello {{1}}, there is an update for you at {{2}}. What: {{3}}

Details: {{4}}

Open it in the staff portal: {{5}}

Thank you.
```

**Footer:** Automatic notice from the staff portal.

| Variable | What it is | Sample |
| --- | --- | --- |
| `{{1}}` | Greeting name (a person’s first name, or the organisation’s name) | Tunde |
| `{{2}}` | Your organisation’s name | Rock Foundation Automobile |
| `{{3}}` | what | Ready for quality check: Job Card JC-2026-000123 |
| `{{4}}` | details | Customer: Tunde Bakare. Vehicle: Toyota Corolla. |
| `{{5}}` | link | https://staff.example.com/workshop/job-cards/abc123 |

## Emails that stay email-only

| Email | Why |
| --- | --- |
| `website:customer-password-reset` | Password and sign-in links stay email-only: a set-password or reset link is a key to the account, and a phone number can be shared, recycled or read by someone else, while the account belongs to the email address. (WhatsApp authentication templates are a separate Meta category for one-time codes, which the portal does not use.) |
| `portal:job-card-cancelled-staff` | A record of something already done; nothing waits on the colleague, so the email and the portal’s notifications carry it and a phone is not buzzed for it. |
| `portal:job-card-closed-staff` | A record of something already done; nothing waits on the colleague, so the email and the portal’s notifications carry it and a phone is not buzzed for it. |
| `portal:vehicle-checked-out-staff` | A record of something already done; nothing waits on the colleague, so the email and the portal’s notifications carry it and a phone is not buzzed for it. |
| `portal:payment-recorded-update` | A record of something already done; nothing waits on the colleague, so the email and the portal’s notifications carry it and a phone is not buzzed for it. |
| `portal:payment-completed-in-full` | A record of something already done; nothing waits on the colleague, so the email and the portal’s notifications carry it and a phone is not buzzed for it. |
| `portal:password-reset` | Password and sign-in links stay email-only: a set-password or reset link is a key to the account, and a phone number can be shared, recycled or read by someone else, while the account belongs to the email address. (WhatsApp authentication templates are a separate Meta category for one-time codes, which the portal does not use.) |
| `portal:staff-access` | Password and sign-in links stay email-only: a set-password or reset link is a key to the account, and a phone number can be shared, recycled or read by someone else, while the account belongs to the email address. (WhatsApp authentication templates are a separate Meta category for one-time codes, which the portal does not use.) |
| `portal:layout` | Not a message: the shared email layout. |
| `website:layout` | Not a message: the shared email layout. |
| `portal:pricing-alerts-digest` | A Parts store notice, read at the store desk: the email and the portal’s notifications carry it. (A later upgrade can give it a template if the Store Keeper wants it on the phone.) |
| `portal:pricing-alert-raised` | A Parts store notice, read at the store desk: the email and the portal’s notifications carry it. (A later upgrade can give it a template if the Store Keeper wants it on the phone.) |
| `portal:part-selling-price-set` | A Parts store notice, read at the store desk: the email and the portal’s notifications carry it. (A later upgrade can give it a template if the Store Keeper wants it on the phone.) |
| `portal:part-target-margin-set` | A Parts store notice, read at the store desk: the email and the portal’s notifications carry it. (A later upgrade can give it a template if the Store Keeper wants it on the phone.) |
| `portal:goods-receipt-edited` | A Parts store notice, read at the store desk: the email and the portal’s notifications carry it. (A later upgrade can give it a template if the Store Keeper wants it on the phone.) |
| `portal:staff-goods-receipt-recorded` | A Parts store notice, read at the store desk: the email and the portal’s notifications carry it. (A later upgrade can give it a template if the Store Keeper wants it on the phone.) |
| `portal:store-matching-status` | A Parts store notice, read at the store desk: the email and the portal’s notifications carry it. (A later upgrade can give it a template if the Store Keeper wants it on the phone.) |
| `portal:part-request-status` | A Parts store notice, read at the store desk: the email and the portal’s notifications carry it. (A later upgrade can give it a template if the Store Keeper wants it on the phone.) |

## Notes on some emails

- `portal:customer-welcome` (`rf_welcome`): The welcome goes on WhatsApp without the set-password link, which stays in the email (see password-reset). Sending the link again ("Send set-password link") is email-only for the same reason; staff can still share it by hand with "Send on WhatsApp".
- `portal:support-centre` (`rf_support_received`, `rf_support_reply`): The acknowledgement and the replies go on WhatsApp. The follow-up nudge ("we are waiting for your reply") and the satisfaction question stay email-only: they ask for an answer by email.
- `portal:customer-broadcast` (`rf_customer_announcement`): A MARKETING template (Meta’s rule for announcements): only to customers who chose announcements and agreed to WhatsApp.
- `website:support` (`rf_support_received`, `rf_staff_update`): The customer’s acknowledgement, and the colleague handling the request when the customer replies. A new request goes to the business’s shared inbox, which has no phone.
- `portal:workflow-notice` (`rf_staff_update`): The workflow notices that ask a colleague to act (ready for quality check, rework, the customer approved, and the other steps handed on) go on WhatsApp; an outcome they only need to know stays email-only. Its account notices stay email-only: they are about the account, which belongs to the email address.
- `portal:staff-notice` (`rf_staff_update`, `rf_staff_announcement`): The staff notice used at the gate (a vehicle released to leave), for reminders, inspections, staff broadcasts and branch notices (a bank account changed).
