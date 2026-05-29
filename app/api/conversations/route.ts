import { NextRequest, NextResponse } from 'next/server'
import { listConversations } from '@/lib/store'

export const dynamic = 'force-dynamic'

// GET /api/conversations  — admin inbox feed (polled for near-realtime).
export async function GET(_req: NextRequest) {
  try {
    const conversations = await listConversations()
    return NextResponse.json({ conversations })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 })
  }
}
