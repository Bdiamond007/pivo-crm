# Pivo CRM

A lightweight CRM for Pivo Web (local-SEO / Google Maps agency). Track prospects
through a sales pipeline, manage paying clients, generate AI outreach scripts, and
send SMS via Twilio. Built with Next.js 14 (App Router) and Supabase.

Visiting `/` redirects to the app at `/crm`.

## Features

- **Dashboard** — pipeline breakdown, hot leads, client count, and MRR
- **Prospects** — leads with stages (New Lead → Closed/Won), search, and filters
- **Clients** — paying customers with monthly value and next actions
- **Outreach** — AI-generated outreach scripts, click-to-text, Twilio auto-SMS, and a contact log

## Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project
- An [OpenAI](https://platform.openai.com) API key (used for the "AI Script" feature)
- (Optional) A [Twilio](https://twilio.com) account to send SMS

## Environment variables

Create a `.env.local` file in the project root:

```bash
# Supabase (required — all data is stored here)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# OpenAI (required for AI Script generation)
OPENAI_API_KEY=sk-...

# Twilio (optional — can also be entered in the in-app Twilio settings modal)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_FROM_NUMBER=+13854620082
```

Twilio credentials saved in the in-app settings modal take precedence; the
`TWILIO_*` env vars are used as a fallback.

## Supabase setup

All app data lives in a single key/value table. Run this in the Supabase SQL editor:

```sql
create table if not exists kv_store (
  id text primary key,
  value text,
  updated_at timestamptz default now()
);
```

> Note: the app currently uses the public anon key with no authentication, so
> anyone with the URL can read and write this table. Keep the deployment URL
> private, or add Supabase Auth + Row Level Security before exposing it publicly.

## Local development

```bash
npm install
npm run dev
```

Open http://localhost:3000 — you'll be redirected to `/crm`.

## Build & deploy

```bash
npm run build
npm run start
```

Deploys cleanly to Vercel. Set the environment variables above in your host's
project settings.

## Sending SMS

1. Open the **⚙ Twilio** settings modal and enter your Account SID, Auth Token, and From number (or set the `TWILIO_*` env vars).
2. On a prospect with a phone number, generate an **AI Script**, then click **⚡ Auto-SMS**.

Phone numbers are normalized to E.164 automatically. Two account-level requirements
Twilio enforces: trial accounts can only text verified numbers, and US sending
requires A2P 10DLC registration of your number.
