# Aria — System Architecture & Build Guide

The complete design for an AI-powered Shopify support portal. This document is
the deliverable spec; the repository is its working implementation.

> **Implementation status.** Everything in §1–§12 is implemented in this repo and
> runs in demo mode with no credentials. §13–§20 are the productionization path,
> with the hooks already in place (graceful live-mode switches, schema, RLS stubs).

---

## 1. System architecture

```
                          ┌──────────────────────────────────────────────┐
                          │                  Customers                    │
                          └───────────────┬──────────────────────────────┘
                                          │  HTTPS
                ┌─────────────────────────▼─────────────────────────┐
                │            Next.js App (Vercel edge/serverless)    │
                │                                                    │
   /support ────┤  Customer Portal (React)   Admin Dashboard ────────┤──── /admin
                │        │                          ▲                │
                │        │ POST /api/chat           │ poll/realtime  │
                │        ▼                          │                │
                │  ┌───────────────┐        ┌───────────────────┐    │
                │  │  AI Engine    │        │  Conversation     │    │
                │  │  (orchestr.)  │◄──────►│  Store            │    │
                │  └──────┬────────┘        └─────────┬─────────┘    │
                │         │ tool calls                │             │
                │  ┌──────▼────────┐                  │             │
                │  │  Tool layer   │                  │             │
                │  └──────┬────────┘                  │             │
                └─────────┼──────────────────────────┼─────────────┘
                          │                            │
              ┌───────────▼───────────┐     ┌──────────▼──────────┐
              │  Shopify Admin API     │     │  Supabase Postgres   │
              │  (orders/customers/    │     │  + Realtime          │
              │   products/refunds)    │     └─────────────────────┘
              └───────────▲───────────┘
                          │ webhooks (HMAC verified)
              ┌───────────┴───────────┐
              │  /api/webhooks/shopify │  → proactive updates, alerts, workflows
              └───────────────────────┘

   LLM provider: OpenAI (tool-calling). Swappable for Claude (see §8).
```

**Layered responsibilities**

| Layer        | Module                       | Responsibility                                      |
| ------------ | ---------------------------- | --------------------------------------------------- |
| Presentation | `app/support`, `app/admin`   | Chat UI, inbox, dashboards                           |
| API          | `app/api/*`                  | Chat, conversations, Shopify proxy, webhooks        |
| AI           | `lib/ai/{engine,tools,prompts}` | Orchestration, tool-calling, prompting, guardrails |
| Integration  | `lib/shopify.ts`             | Admin GraphQL client + demo data + refund policy    |
| Data         | `lib/store.ts`, `db/schema.sql` | Conversation persistence, realtime source          |
| Domain       | `lib/types.ts`               | Shared TypeScript contracts                         |

---

## 2. UX/UI design structure

Two distinct, intentional aesthetics:

- **Customer portal** — premium, calm, _conversation-first_. White canvas, one
  black brand mark, a single indigo "AI moment" accent, generous spacing, a chat
  column with quick-action chips and a collapsible order panel. Mobile-first; the
  side panel collapses under 760px.
- **Admin dashboard** — dense, operational, _enterprise SaaS_. Black/white,
  three-pane layout (inbox · conversation · context), metric cards, sentiment
  bar, intent distribution. Collapses to single column under 980px.

Design tokens live in `lib/ui.ts`. Type: Inter (UI) + JetBrains Mono (tool tags).

---

## 3. User flow diagrams

**Customer**

```
Land on /support
   └─► Verify email (demo: any email · prod: Shopify OTP/customer account)
        └─► Aria greets + loads recent orders
             └─► Customer asks (free text or quick-action chip)
                  └─► AI classifies intent → calls tools → grounded answer
                       ├─► Resolved → status: pending/resolved
                       └─► Needs human → escalate → status: escalated → agent joins
```

**Admin**

```
Open /admin
   └─► Metrics + live inbox (poll 4s)
        └─► Select conversation
             ├─► Read AI assessment (intent/sentiment/confidence/tools)
             ├─► Take over  → AI silenced, agent replies
             ├─► Reply      → message delivered, takeover implied
             └─► Set status → open/pending/escalated/resolved/closed
```

---

## 4. Customer workflow maps

| Workflow          | Trigger phrase            | Tools invoked                                   | Outcome                                   |
| ----------------- | ------------------------- | ----------------------------------------------- | ----------------------------------------- |
| Order status      | "status of #1001"         | `lookup_order`                                  | Financial + fulfillment summary           |
| Track shipment    | "where is my order"       | `track_shipment` (`list_orders` if unknown)     | Carrier, tracking #, ETA, link            |
| Refund/return     | "refund #1004"            | `check_refund_eligibility` → `request_refund`   | Eligibility + queued approval task        |
| Report issue      | "arrived damaged"         | `lookup_order` → `escalate_to_human`            | High-priority human handoff               |
| Recommendation    | "warm winter jacket"      | `recommend_products`                            | Ranked live catalog suggestions           |
| Talk to a human   | "speak to someone"        | `escalate_to_human`                             | Escalated; agent notified                 |

Each maps to an `Intent` in `lib/types.ts` and is detected by the analysis pass.

---

## 5. Admin workflow maps

- **Triage**: inbox sorted by `updated_at`; color-coded status, sentiment dot,
  confidence %, human/AI badge.
- **Monitor**: open a conversation to see every AI message with its confidence
  and the exact tools it called (`⚙ lookup_order`).
- **Intervene**: *Take over* flips `human_takeover=true` → the chat endpoint stops
  generating AI replies and only records customer messages; agent replies stream in.
- **Resolve**: status dropdown drives the lifecycle. *Return to AI* re-enables Aria.
- **Refunds**: requests land in `refund_requests` (status `pending`) for explicit
  approval — money never moves autonomously.

---

## 6. Database schema

See [`db/schema.sql`](../db/schema.sql). Core tables:

- **`conversations`** — the ticket. Messages stored as `jsonb` for fast thread
  reads; columns for `status`, `priority`, `intent`, `sentiment`, `confidence`,
  `human_takeover`, `assigned_agent`, `tags`. Indexed on status/updated/email/sentiment.
- **`refund_requests`** — human-in-the-loop approval queue.
- **`agents`** — operators (agent/admin roles).
- **`kv_store`** — retained for the legacy CRM.

Realtime is enabled by adding `conversations` to the `supabase_realtime`
publication (one commented line). RLS policy stubs scope rows to the
authenticated customer's email.

---

## 7. Shopify integration plan

- **Client**: `lib/shopify.ts` talks to the Admin **GraphQL** API
  (`/admin/api/<version>/graphql.json`) with `X-Shopify-Access-Token`.
- **Scopes**: `read_orders`, `read_customers`, `read_products`; add
  `write_refunds` only if you later automate refund execution.
- **Capabilities**: `getOrderByName`, `getOrdersByEmail`, `getCustomerByEmail`,
  `searchProducts`, `requestRefund`, plus `isRefundable` policy (paid + ≤30 days).
- **Security**: order lookups are **email-scoped** — an order is only returned if
  it belongs to the authenticated customer, preventing order-number enumeration.
- **Webhooks**: `/api/webhooks/shopify` verifies the HMAC SHA-256 signature
  (`timingSafeEqual`) and routes topics (`orders/fulfilled`, `refunds/create`,
  `fulfillments/create`) into proactive customer updates and internal workflows.
- **Demo fallback**: with no credentials, deterministic mock orders/products are
  served so the whole flow is testable.

---

## 8. AI workflow architecture

`lib/ai/engine.ts` runs a bounded **tool-calling loop**:

```
build messages: [system persona, live context, last 12 turns, new user msg]
loop (≤ 4 hops):
    response = LLM(messages, tools)
    if no tool_calls: reply = content; break
    for each tool_call: execute → append tool result to messages
final natural-language turn if loop ended on tools
analysis pass (separate call): {intent, sentiment, confidence, escalate, summary}
return reply + structured metadata
```

- **Multi-step reasoning**: the model can chain tools (e.g. `list_orders` →
  `check_refund_eligibility` → `request_refund`).
- **Retrieval-augmented**: tools are the retrieval layer — every fact is grounded
  in live Shopify data, never invented.
- **Confidence scoring**: a deterministic, low-temperature JSON analysis pass
  scores how well the reply resolved the request → drives admin triage + auto-escalation.
- **Escalation logic**: triggered by the `escalate_to_human` tool, explicit human
  requests, angry sentiment, or low confidence.
- **Provider-swap**: the transport in `chat()` is the only OpenAI-specific code.
  Claude (`claude-sonnet-4-6` / `claude-opus-4-8`) plugs in via the Messages API
  with `tools` in Anthropic format — same loop, same tool executors.
- **Fallback**: `ruleBasedFallback` reproduces the same behaviors without an LLM.

---

## 9. Prompt engineering system

`lib/ai/prompts.ts`:

- **`SUPPORT_SYSTEM_PROMPT`** — persona ("Aria"), voice, working method
  ("call a tool, never invent"), refund handling, escalation triggers, and **hard
  guardrails** (no fabrication, no unverifiable promises, no cross-customer data,
  no system-prompt leakage, no legal/medical/financial advice).
- **`contextBlock()`** — injects live context (name, email, recent orders, date)
  as a separate system message so the persona stays stable.
- **`ANALYSIS_PROMPT`** — strict-JSON classifier (intent/sentiment/confidence/
  escalate/summary), run at `temperature 0` with `response_format: json_object`.

**Hallucination prevention**: facts only come from tool results; "no data → no
claim" is a hard rule; the email-scoped tools make fabricated order numbers
return `found:false`.

---

## 10. Dashboard wireframes

```
┌───────────────────────────────────────────────────────────────┐
│ A  Aria · Operations                         ● Live · every 4s │
├───────────────────────────────────────────────────────────────┤
│ [Open 6] [Escalated 2] [Resolved 14] [Avg conf 82%] [Sentiment▆]│
├──────────────┬───────────────────────────────┬─────────────────┤
│ search…      │  Jordan Avery     [escalated] │ AI ASSESSMENT   │
│ all|open|... │  refund for #1004             │ Intent  refund  │
│ ───────────  │  ───────────────────────────  │ Sentiment angry │
│ ▸ Jordan ●   │  customer: my order is wrong  │ Confidence 41%  │
│   refund...  │  ✦ Aria: I've queued… ⚙tool   │ Priority urgent │
│ ▸ Sam    ●   │  ───────────────────────────  │ ─────────────── │
│   tracking   │  [Take over][status ▾]        │ CUSTOMER        │
│              │  > reply…              [Send]  │ email · opened  │
└──────────────┴───────────────────────────────┴─────────────────┘
```

When no conversation is selected, the right pane shows **intent distribution**.

---

## 11. API structure

| Route                          | Method | Purpose                                              |
| ------------------------------ | ------ | ---------------------------------------------------- |
| `/api/chat`                    | POST   | Drive the AI engine; create/continue a conversation  |
| `/api/conversations`           | GET    | Admin inbox feed (polled)                            |
| `/api/conversations/:id`       | GET    | Full conversation                                    |
| `/api/conversations/:id`       | PATCH  | `takeover` · `release` · `assign` · `status` · `reply` |
| `/api/shopify/orders`          | GET    | Email-scoped order lookup (portal order panel)       |
| `/api/webhooks/shopify`        | POST   | HMAC-verified webhook receiver                       |
| `/api/generate`, `/api/send-sms` | POST | Existing CRM endpoints (unchanged)                   |

Request/response contracts follow `lib/types.ts`.

---

## 12. Realtime workflow logic

- **Now**: the admin dashboard polls `/api/conversations` every 4s — robust on
  serverless, zero infra. The portal optimistically renders and shows a typing
  indicator while awaiting the AI turn.
- **Upgrade path**: subscribe the admin client to a Supabase Realtime channel on
  the `conversations` table (one line in `db/schema.sql`) and replace the poll
  with a live subscription — no API changes needed.
- **Event-driven workflows**: Shopify webhooks fan out to (a) proactive customer
  threads ("your order shipped"), (b) internal alerts, (c) auto-status updates
  (refund processed → resolved).

---

## 13. Deployment strategy

- **Host**: Vercel (Next.js App Router, serverless/edge functions).
- **Data**: Supabase (managed Postgres + Realtime + Auth).
- **Secrets**: Vercel env vars; never expose `SUPABASE_SERVICE_ROLE_KEY` or
  `SHOPIFY_ADMIN_TOKEN` to the client.
- **Pipeline**: push → Vercel preview deploy → promote to production. Run
  `db/schema.sql` once per environment.
- **Webhooks**: register against the production domain; rotate
  `SHOPIFY_WEBHOOK_SECRET`.
- **Observability**: Vercel Analytics + log drains; add Sentry for error tracking.

---

## 14. Security architecture

- **Authn**: demo email gate → production Shopify customer-account login or email
  OTP; admin behind SSO (Supabase Auth / Clerk) with `agents.role`.
- **Authz**: order/customer tools are email-scoped server-side; RLS scopes rows
  to the authenticated customer. Service-role key stays server-only.
- **Webhook integrity**: HMAC SHA-256 with constant-time comparison.
- **Secrets**: server-only env vars; LLM/Shopify keys never reach the browser.
- **AI safety**: guardrailed system prompt; tools are the only side-effect path;
  refunds require human approval; prompt-injection containment (tool results are
  data, not instructions; no system-prompt disclosure).
- **PII**: minimize stored PII; conversations keyed by email; add retention/erase
  jobs for GDPR/CCPA.
- **Rate limiting**: add per-IP/per-email limits on `/api/chat` (e.g. Upstash).

---

## 15. Scalable SaaS recommendations

- **Multi-tenancy**: add a `stores` table + `store_id` FK on every row; scope all
  queries and Shopify credentials per tenant (one app, many brands).
- **Cost control**: route simple intents to a small model, escalate to a frontier
  model only when confidence is low; cache product/order reads.
- **Throughput**: move long AI runs to a queue/worker for high volume; keep the
  request path thin.
- **Knowledge base**: add a `kb_articles` table + pgvector embeddings for true RAG
  over policies/FAQs.
- **Analytics warehouse**: stream conversation events to a warehouse for cohort,
  CSAT, and deflection-rate reporting.

---

## 16. Folder / project structure

```
app/
  page.tsx                 Landing (links to all surfaces)
  layout.tsx               Theme-neutral root
  support/page.tsx         Customer portal (chat + orders + escalation)
  admin/page.tsx           Operations dashboard (inbox + monitor + analytics)
  crm/page.tsx             Legacy Pivo CRM (unchanged)
  api/
    chat/route.ts          AI engine entrypoint
    conversations/route.ts            Inbox feed
    conversations/[id]/route.ts       Get + admin actions
    shopify/orders/route.ts           Email-scoped order lookup
    webhooks/shopify/route.ts         HMAC-verified webhooks
    generate/route.ts, send-sms/route.ts   (legacy CRM)
lib/
  types.ts                 Domain contracts
  ui.ts                    Design tokens
  shopify.ts               Admin API client + demo data + refund policy
  store.ts                 Conversation persistence (Supabase | memory)
  supabase.ts              Supabase client + KV helpers (legacy)
  ai/
    engine.ts              Orchestration + tool-calling loop + fallback
    tools.ts               Tool schemas + executors
    prompts.ts             Persona, guardrails, analysis prompt
db/schema.sql              Postgres schema (conversations, refunds, agents)
docs/ARCHITECTURE.md       This document
```

---

## 17. Production roadmap

- **Phase 0 — Demo (done)**: full flow on mocks, zero config.
- **Phase 1 — Live core**: OpenAI + Shopify + Supabase keys; run schema; deploy.
- **Phase 2 — Auth & realtime**: Shopify customer login, admin SSO, Supabase
  Realtime, refund approval UI, rate limiting.
- **Phase 3 — Intelligence**: RAG knowledge base (pgvector), CSAT, deflection
  analytics, model routing.
- **Phase 4 — SaaS**: multi-tenant, billing, onboarding, self-serve install,
  Shopify App Store listing.

---

## 18. Step-by-step implementation guide

1. `npm install && npm run dev` → open `/support`, run the demo conversations.
2. Set `OPENAI_API_KEY` → confirm tool-calling replies and tool tags in `/admin`.
3. Create a Shopify custom app, grant read scopes, set domain + token → real orders.
4. Create a Supabase project, run `db/schema.sql`, set env vars → persistence.
5. Register webhooks → set `SHOPIFY_WEBHOOK_SECRET` → test proactive updates.
6. Add Shopify customer login + admin SSO; enable RLS + Realtime.
7. Add refund-approval UI over `refund_requests`; add rate limiting.
8. Deploy to Vercel; promote; register production webhooks.

---

## 19. Suggested monetization model

- **SaaS subscription** (per store): Starter / Growth / Scale by monthly
  AI-resolved conversation volume and seats.
- **Usage/overage**: metered AI conversations beyond plan.
- **Outcome-based**: price on *deflection* (tickets resolved without a human) —
  the metric the dashboard already tracks.
- **Add-ons**: extra seats, advanced analytics, custom model routing, white-label.
- **Distribution**: Shopify App Store listing with a free demo tier (this build).

---

## 20. Future AI expansion opportunities

- **Voice support** (speech-to-text + TTS) and multilingual auto-detect.
- **Proactive AI**: detect at-risk shipments and reach out before the customer asks.
- **Agent copilot**: draft replies + suggested actions for human agents.
- **Vision**: customers upload photos of damaged items for automated triage.
- **Predictive**: churn/refund-risk scoring; next-best-action recommendations.
- **Autonomous workflows**: returns labels, address changes, subscription edits —
  with policy guardrails and human approval thresholds.
- **Cross-channel**: same engine over email, SMS (reuse `/api/send-sms`), WhatsApp,
  and Instagram DMs.
