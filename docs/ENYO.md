# Enyo, the assistant

Enyo is the assistant built into EJO by JusTech. It answers questions from
the workshop's own records, summarises a vehicle's history, drafts messages
and prepares work for people to confirm, and hands customers over to a
person when it should. Its model provider is **Anthropic Claude**
(`claude-opus-5-5`, with `claude-haiku-5-5` for short answers), configured in
the hosting settings.

Enyo runs **as the person using it**. Every look-up goes through the same
permission checks as the portal's pages, so Enyo never shows anyone more than
their role already allows. It never saves, sends, approves or pays anything
itself.

## Where it appears

| Place | Who | What Enyo can do |
|---|---|---|
| Staff portal | Every member of staff | "How do I…?" with steps and links; what is waiting for the person; Job Cards, customers and fleets, vehicle histories in a few sentences; parts, prices and stock; payments and balances; reminders; drafts of customer messages that open the normal page already filled in |
| Customer portal | Signed-in customers | Their own vehicles, jobs and status, estimates, invoices, payments and balance, how to pay; a hand-over to a person (a Support centre request) |
| Support page | Visitors to the customer site | The workshop's published facts (address, phones, services); a hand-over for a call-back |
| Support centre | Front Desk, the Owner | Reads new requests (topic, urgency, mood, summary), drafts replies, and answers general questions by itself only where a team allows it ([SUPPORT_CENTRE.md](SUPPORT_CENTRE.md)) |

## Safety

- **Permissions:** each of Enyo's tools runs the module's own authorised
  code as the signed-in person. A technician asking for takings gets a
  polite refusal; the Owner gets the figures. Cost prices and profit only
  reach the Owner.
- **No made-up figures:** money figures come only from tool results. A
  check flags any amount in an answer that no record contains.
- **Untrusted text:** email, web and customer text is treated as data,
  never instructions.
- **Drafts never write:** a draft opens the normal page already filled in;
  the person checks it and presses the normal button.
- **Customer isolation:** customers see only their own records. Another
  customer's reference looks exactly like one that does not exist.
- **What Enyo may read** is declared per table in the data inventory
  (`apps/portal/lib/governance/data-inventory.ts`): sessions, passwords,
  tokens, the error log and the recycle bin are never available to it.
- **Limits:** questions per person per minute (`ENYO_REQUESTS_PER_MINUTE`),
  per customer and per address on the customer portal (`ENYO_*` limits),
  a cap on message size and a time limit on each answer.
- **Retention:** chats are kept 12 months; chat history keeps what tools
  were used, never their results.
- **Switches:** **Settings → Enyo** has a master switch and one per place
  (staff portal, signed-in customers, the customer site's support page). With Enyo off, or no key set,
  everything else works exactly as before.

## Learning

Enyo learns only from answers people approve. A general question a colleague
resolved in the Support centre, or a helpful answer in a chat, becomes a
candidate with names, phones, emails, plates and links removed; the Owner
approves or rejects it on the **Enyo learning** page (`/enyo/learning`).
Nothing about one customer's records is ever learned. `learnFrom` in
Settings → Enyo can be set to the go-live date so records typed while trying
the system out are never learned from.

## Switching it on

1. Create an API key at console.anthropic.com (billing on, a monthly spend
   limit set).
2. In **both** Vercel projects set `ENYO_LLM_PROVIDER="anthropic"` and
   `ENYO_LLM_API_KEY`. Optional: `ENYO_LLM_MODEL`, `ENYO_LLM_FAST_MODEL`,
   `ENYO_LLM_PROVIDER_LABEL`, `ENYO_LLM_EFFORT`.
3. Customer portal: set `WEBSITE_ORGANISATION_SLUG="rock-foundation"` and
   `ENYO_IP_HASH_KEY` (a long random secret).
4. In the staff portal, open **Settings → Enyo** and press **Test
   connection**.

The full list of settings is in [OPERATIONS_CHECKLIST.md](OPERATIONS_CHECKLIST.md)
§1 and [.env.example](../.env.example).

## Tests

`npm run test --workspace=packages/enyo` covers the model client, the agent
loop, strict tool arguments, the money check, the streaming protocol and the
time limit; the portal and customer-portal unit tests cover the tools and
customer isolation; the browser tests run Enyo against a stand-in model
server.
