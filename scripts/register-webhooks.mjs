#!/usr/bin/env node
// ============================================================================
// Register Aria's Shopify webhooks against a store.
//
//   node scripts/register-webhooks.mjs
//
// Reads from the environment (and .env.local if present):
//   SHOPIFY_STORE_DOMAIN     my-store.myshopify.com
//   SHOPIFY_ADMIN_TOKEN      shpat_...
//   SHOPIFY_API_VERSION      2024-10 (optional)
//   WEBHOOK_CALLBACK_URL     https://your-deploy.vercel.app/api/webhooks/shopify
//
// Idempotent: Shopify ignores duplicate (topic, callbackUrl) registrations.
// Keep TOPICS in sync with REQUIRED_WEBHOOK_TOPICS in lib/shopify-webhooks.ts.
// ============================================================================

import fs from 'node:fs'
import path from 'node:path'

// --- minimal .env.local loader (no dependency) ---
function loadEnv() {
  const file = path.join(process.cwd(), '.env.local')
  if (!fs.existsSync(file)) return
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
loadEnv()

const DOMAIN = process.env.SHOPIFY_STORE_DOMAIN
const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN
const VERSION = process.env.SHOPIFY_API_VERSION || '2024-10'
const CALLBACK = process.env.WEBHOOK_CALLBACK_URL

const TOPICS = ['orders/fulfilled', 'fulfillments/create', 'refunds/create']

function fail(msg) { console.error(`\n✗ ${msg}\n`); process.exit(1) }

if (!DOMAIN || !TOKEN) fail('Set SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_TOKEN.')
if (!CALLBACK) fail('Set WEBHOOK_CALLBACK_URL to your deployed /api/webhooks/shopify URL.')

const endpoint = `https://${DOMAIN}/admin/api/${VERSION}/graphql.json`

const MUTATION = `
mutation register($topic: WebhookSubscriptionTopic!, $sub: WebhookSubscriptionInput!) {
  webhookSubscriptionCreate(topic: $topic, webhookSubscription: $sub) {
    webhookSubscription { id }
    userErrors { field message }
  }
}`

async function register(topic) {
  // GraphQL topic enums are SCREAMING_SNAKE_CASE: orders/fulfilled -> ORDERS_FULFILLED
  const topicEnum = topic.toUpperCase().replace(/\//g, '_')
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
    body: JSON.stringify({
      query: MUTATION,
      variables: { topic: topicEnum, sub: { callbackUrl: CALLBACK, format: 'JSON' } },
    }),
  })
  const json = await res.json()
  const errs = json?.errors || json?.data?.webhookSubscriptionCreate?.userErrors
  if (errs && errs.length) {
    console.log(`  ✗ ${topic.padEnd(22)} ${JSON.stringify(errs)}`)
    return false
  }
  const id = json?.data?.webhookSubscriptionCreate?.webhookSubscription?.id
  console.log(`  ✓ ${topic.padEnd(22)} ${id || 'registered'}`)
  return true
}

console.log(`\nRegistering webhooks on ${DOMAIN} → ${CALLBACK}\n`)
let ok = 0
for (const t of TOPICS) if (await register(t)) ok++
console.log(`\nDone. ${ok}/${TOPICS.length} topics registered.`)
console.log('Reminder: also set SHOPIFY_WEBHOOK_SECRET so the receiver verifies signatures.\n')
