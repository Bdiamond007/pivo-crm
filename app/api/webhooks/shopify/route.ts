import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createConversation, newId } from '@/lib/store'
import type { ChatMessage } from '@/lib/types'

export const dynamic = 'force-dynamic'

// Shopify webhook receiver.
// Verifies the HMAC signature, then routes the topic to an internal action.
// Register topics like: orders/fulfilled, refunds/create, fulfillments/update.
//
// Env: SHOPIFY_WEBHOOK_SECRET  (the app's webhook signing secret)
export async function POST(req: NextRequest) {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET
  const hmac = req.headers.get('x-shopify-hmac-sha256') || ''
  const topic = req.headers.get('x-shopify-topic') || 'unknown'

  // Read the RAW body for HMAC verification.
  const raw = await req.text()

  if (secret) {
    const digest = crypto.createHmac('sha256', secret).update(raw, 'utf8').digest('base64')
    const valid =
      hmac.length === digest.length &&
      crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(digest))
    if (!valid) {
      return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
    }
  }
  // If no secret is configured we accept (demo mode) but still process.

  let payload: any = {}
  try { payload = JSON.parse(raw || '{}') } catch {}

  // Route by topic. Each branch can trigger a proactive customer update,
  // an internal alert, or an automated workflow.
  switch (topic) {
    case 'fulfillments/create':
    case 'orders/fulfilled': {
      // Proactive "your order shipped" workflow: open a conversation thread
      // the customer can pick up, and (in production) push a notification.
      const orderName = payload?.name || payload?.order_id || 'order'
      const email = payload?.email || payload?.order?.email || null
      const msg: ChatMessage = {
        id: newId('msg'),
        role: 'assistant',
        content: `Good news — your order ${orderName} just shipped! Reply here anytime if you'd like tracking details.`,
        createdAt: new Date().toISOString(),
        intent: 'track_shipment',
      }
      await createConversation({
        customerEmail: email,
        summary: `Proactive shipment update for ${orderName}`,
        intent: 'track_shipment',
        status: 'pending',
        messages: [msg],
        tags: ['proactive', 'shipment'],
      })
      break
    }
    case 'refunds/create': {
      await createConversation({
        customerEmail: payload?.order?.email || null,
        summary: `Refund processed for order ${payload?.order_id || ''}`,
        intent: 'refund_return',
        status: 'resolved',
        tags: ['refund', 'webhook'],
      })
      break
    }
    default:
      // Acknowledge unhandled topics so Shopify doesn't retry.
      break
  }

  return NextResponse.json({ ok: true, topic })
}
