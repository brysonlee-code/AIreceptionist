# Pink Print Voice CRM

An AI receptionist platform for The Pink Print Firm — a results-driven grant writing agency ($23M+ raised for entrepreneurs). Penny, the inbound voice agent, answers calls, records full transcripts, quotes the firm's service menu (Get Grant Ready, Write My Grant, Business Plans, Certification, Strategy Sessions), texts secure checkout links mid-conversation, and logs every payment — all in a Pink Print-branded dashboard.

**Stack:** Node.js + Express · Twilio Voice/SMS · Stripe Checkout · Anthropic Claude (agent brain) · JSON persistence · vanilla JS SPA.

**Everything degrades gracefully.** With zero API keys, the whole system runs in demo mode: a built-in rules agent, a local demo checkout page, and a call simulator in the dashboard. Add keys to go live piece by piece.

---

## Quick start

```bash
npm install
npm start
```

Open **http://localhost:3000** → go to **Test the agent** → click *Simulate incoming call*. Ask "How much is Write My Grant?" then "Sign me up, I want to pay now" — you'll watch Penny quote from the service menu, fire a checkout link, and log the payment.

---

## Modes (sidebar indicators)

| System | Demo (no keys) | Live (with keys) |
|--------|----------------|------------------|
| **Agent** | Deterministic rules engine — quotes fees, handles payment intent | Claude via `ANTHROPIC_API_KEY` — natural conversation, same fee-schedule grounding |
| **Phone** | In-dashboard call simulator | Real inbound calls via Twilio Voice webhooks, neural TTS, speech transcription |
| **Payments** | Local demo checkout page | Stripe Checkout sessions + webhook reconciliation |
| **SMS** | Links logged to console | Links texted to the caller's phone via Twilio |

---

## Going live

### 1. AI agent (Claude)
```
ANTHROPIC_API_KEY=sk-ant-...
```
The agent's system prompt injects your live fee schedule on every call, and instructs the model to emit a `[SEND_PAYMENT:CODE]` token when the caller wants to pay — the server intercepts it and fires the checkout flow.

### 2. Real phone calls (Twilio)
1. Buy a number at console.twilio.com.
2. Deploy this server to a public HTTPS URL and set `PUBLIC_URL`.
3. On your Twilio number, set:
   - **Voice webhook:** `POST {PUBLIC_URL}/voice/incoming`
   - **Status callback:** `POST {PUBLIC_URL}/voice/status`
4. Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` in `.env`.

Call flow: Twilio answers → greets with Polly neural voice → `<Gather input="speech">` transcribes the caller → the server generates the AI reply → repeat. Every turn is appended to the transcript in real time. Known patient numbers are auto-linked to their record.

### 3. Payments (Stripe)
1. Get keys at dashboard.stripe.com/apikeys → set `STRIPE_SECRET_KEY`.
2. Add a webhook endpoint `{PUBLIC_URL}/webhooks/stripe` listening to `checkout.session.completed` → set `STRIPE_WEBHOOK_SECRET`.

When a caller wants to pay, the server creates a Checkout Session for the quoted service, texts the link via Twilio SMS, and the webhook flips the payment to **paid** in the log — tied to the exact call and transcript. Refunds are one click in the Payments tab (wire `stripe.refunds.create` in `payments.js` for live refunds).

---

## Dashboard tour

- **Dashboard** — call volume, live-call indicator, average duration, revenue collected, collection rate.
- **Calls** — every call with caller, intent, duration; click for the full turn-by-turn transcript, AI summary, sentiment, audio recording (when Twilio recording is enabled), and payments made on that call.
- **Payments** — full log with statuses (pending / paid / refunded), session IDs, one-click refunds, and manual "send checkout link" for dashboard-initiated billing.
- **Clients** — records with phone-number matching so inbound callers are recognized automatically ("Welcome back, Tanya").
- **Service menu** — the source of truth Penny quotes from: Get Grant Ready $1,497, Write My Grant $2,497, Business Plan $997, Certified Grant Writer $1,997, Strategy Session $297. She never invents prices; edits apply on the next call.
- **Test the agent** — full call simulator running the identical pipeline as real calls.

---

## Project structure

```
pinkprint-voice-crm/
├── server.js       Express app: Twilio webhooks, simulator, REST API, Stripe webhook
├── agent.js        The receptionist brain (Claude or rules fallback) + fee grounding
├── payments.js     Stripe Checkout + Twilio SMS + refund logic
├── store.js        JSON persistence + seed data
├── .env.example
└── public/         Clinical dashboard SPA
```

Data lives in `pinkprint.json`. Delete it to reset to seed state.

## Notes for production

- Put this behind HTTPS (Twilio and Stripe both require it for webhooks).
- Enable Twilio call recording by adding `record="record-from-answer"` to the `<Dial>`/call setup if you want audio files; the dashboard already renders a player when `recording_url` is present.
- Penny is instructed never to guarantee grant awards — keep it that way for FTC compliance; refund questions route to the human team per the firm's refund policy.
- Swap the JSON store for Postgres at scale — the collection API in `store.js` maps 1:1 onto SQL.
