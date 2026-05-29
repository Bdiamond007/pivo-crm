import { NextRequest, NextResponse } from 'next/server'
import { verifyShopifyHmac, handleShopifyWebhook } from '@/lib/shopify-webhooks'

export const dynamic = 'force-dynamic'

// Shopify webhook receiver.
//   1. Read the RAW body (required for an exact HMAC match).
//   2. Verify the X-Shopify-Hmac-Sha256 signature.
//   3. Route the X-Shopify-Topic to its workflow.
//
// Env: SHOPIFY_WEBHOOK_SECRET (the app's webhook signing secret)
export async function POST(req: NextRequest) {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET
  const hmac = req.headers.get('x-shopify-hmac-sha256') || ''
  const topic = req.headers.get('x-shopify-topic') || 'unknown'
  const isProd = process.env.NODE_ENV === 'production'

  // Read the RAW body BEFORE any parsing so the signature can be verified.
  const raw = await req.text()

  if (secret) {
    // Secret configured → signature is mandatory.
    if (!verifyShopifyHmac(raw, hmac, secret)) {
      return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
    }
  } else if (isProd) {
    // No secret in production → refuse to process unauthenticated webhooks.
    return NextResponse.json({ error: 'webhook secret not configured' }, { status: 401 })
  }
  // (Non-production with no secret → allowed, for local/demo testing.)

  let payload: any = {}
  try { payload = JSON.parse(raw || '{}') } catch {}

  const result = await handleShopifyWebhook(topic, payload)
  return NextResponse.json({ ok: true, ...result })
}
