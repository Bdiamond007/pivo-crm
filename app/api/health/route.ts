import { NextResponse } from 'next/server'
import { storeHealth } from '@/lib/store'
import { shopifyLive } from '@/lib/shopify'

export const dynamic = 'force-dynamic'

// GET /api/health
// One-glance view of which backends the app is wired to. Use it to confirm the
// flip from in-memory demo mode to durable persistence after setting env vars:
//   store === 'supabase' && storeReachable === true  →  durable + schema applied.
export async function GET() {
  const store = await storeHealth()

  return NextResponse.json({
    status: store.reachable ? 'ok' : 'degraded',
    store: store.backend, // 'supabase' | 'memory'
    storeReachable: store.reachable, // false => creds set but table unreachable
    conversationCount: store.count,
    shopify: shopifyLive ? 'live' : 'demo',
    ai: process.env.OPENAI_API_KEY ? 'openai' : 'fallback',
    aiModel: process.env.AI_MODEL || 'gpt-4o-mini',
    shopifyApiVersion: process.env.SHOPIFY_API_VERSION || '2024-10',
    timestamp: new Date().toISOString(),
  })
}
