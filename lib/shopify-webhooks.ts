// ============================================================================
// Shopify webhook verification + topic routing.
//
// Extracted from the route handler so the logic is unit-testable and the route
// stays thin. Each topic maps to an internal workflow (proactive customer
// update, internal alert, automated status change).
// ============================================================================

import crypto from 'crypto'
import { createConversation, newId } from './store'
import type { ChatMessage } from './types'

export interface WebhookResult {
  topic: string
  handled: boolean
  action?: string
  conversationId?: string
}

// Constant-time HMAC-SHA256 verification over the RAW request body.
// Returns true only when the signature matches the configured secret.
export function verifyShopifyHmac(rawBody: string, hmacHeader: string, secret: string): boolean {
  if (!hmacHeader || !secret) return false
  const digest = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64')
  const a = Buffer.from(hmacHeader)
  const b = Buffer.from(digest)
  // Length check first — timingSafeEqual throws on length mismatch.
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

// Route a verified webhook to its workflow. Pure-ish: only side effect is
// persisting a conversation via the store.
export async function handleShopifyWebhook(topic: string, payload: any): Promise<WebhookResult> {
  switch (topic) {
    case 'fulfillments/create':
    case 'orders/fulfilled': {
      const orderName = payload?.name || payload?.order_id || 'your order'
      const email = payload?.email || payload?.order?.email || null
      const msg: ChatMessage = {
        id: newId('msg'),
        role: 'assistant',
        content: `Good news — your order ${orderName} just shipped! Reply here anytime if you'd like tracking details.`,
        createdAt: new Date().toISOString(),
        intent: 'track_shipment',
      }
      const conv = await createConversation({
        customerEmail: email,
        summary: `Proactive shipment update for ${orderName}`,
        intent: 'track_shipment',
        status: 'pending',
        messages: [msg],
        tags: ['proactive', 'shipment'],
      })
      return { topic, handled: true, action: 'proactive_shipment_update', conversationId: conv.id }
    }

    case 'refunds/create': {
      const conv = await createConversation({
        customerEmail: payload?.order?.email || null,
        summary: `Refund processed for order ${payload?.order_id || ''}`,
        intent: 'refund_return',
        status: 'resolved',
        tags: ['refund', 'webhook'],
      })
      return { topic, handled: true, action: 'refund_logged', conversationId: conv.id }
    }

    default:
      // Acknowledge unhandled topics so Shopify doesn't retry.
      return { topic, handled: false }
  }
}

// The topics this app expects to be registered.
export const REQUIRED_WEBHOOK_TOPICS = [
  'orders/fulfilled',
  'fulfillments/create',
  'refunds/create',
] as const
