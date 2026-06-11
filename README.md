# Aria — AI-Powered Shopify Support Portal

A production-grade, AI-first customer support platform for Shopify brands.
Think Shopify + Zendesk + Intercom + ChatGPT — fast, minimalist, ecommerce-native.

It ships with two surfaces:

- **`/support`** — customer portal: chat with the AI assistant ("Aria"), look up
  orders, track shipments, request refunds, report issues, get recommendations,
  and escalate to a human.
- **`/admin`** — operations dashboard: live inbox, AI conversation monitoring,
  sentiment & confidence scoring, manual takeover/reply, status workflows, and
  analytics.

The original **`/crm`** (Pivo Web) is untouched.

## Runs with zero config

Every external dependency degrades gracefully, so you can run the whole thing
end-to-end before wiring anything up:

| Service  | Configured                          | Not configured                          |
| -------- | ----------------------------------- | --------------------------------------- |
| OpenAI   | Real GPT tool-calling agent         | Deterministic rule-based assistant      |
| Shopify  | Live Admin GraphQL API              | Realistic mock orders/products/customer |
| Supabase | Persistent conversations + realtime | In-memory store (per process)           |

## Quickstart

```bash
npm install
cp .env.example .env.local   # optional — add keys for live mode
npm run dev
```

- Landing: `http://localhost:3000`
- Customer portal: `/support` (sign in with any email in demo mode)
- Admin dashboard: `/admin`

Try in the portal: _"Where is my order #1001?"_, _"I'd like a refund for #1004"_,
_"I'm looking for a warm winter jacket"_, _"I want to talk to a human."_ Then
watch them appear live in `/admin`.

## Live mode

1. **OpenAI**: set `OPENAI_API_KEY`.
2. **Shopify**: create a custom app in your store admin, grant
   `read_orders`, `read_customers`, `read_products` (and `write_refunds` if you
   automate refunds), then set `SHOPIFY_STORE_DOMAIN` + `SHOPIFY_ADMIN_TOKEN`.
3. **Supabase**: run `db/schema.sql`, then set the Supabase env vars.
4. **Webhooks**: point Shopify webhooks (`orders/fulfilled`, `refunds/create`,
   `fulfillments/create`) at `/api/webhooks/shopify` and set
   `SHOPIFY_WEBHOOK_SECRET`.

## Architecture

See **[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)** for the full system design:
data model, AI workflow, prompt system, API surface, realtime logic, security,
deployment, roadmap, and monetization.

## Tech stack

Next.js 14 (App Router) · TypeScript · Supabase (Postgres + Realtime) ·
OpenAI (tool-calling) · Shopify Admin GraphQL API · Vercel.
