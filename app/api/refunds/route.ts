import { NextRequest, NextResponse } from 'next/server'
import { listRefundRequests, countPendingRefunds } from '@/lib/refunds'
import type { RefundStatus } from '@/lib/types'

export const dynamic = 'force-dynamic'

// GET /api/refunds?status=pending  — admin refund queue (polled).
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status') as RefundStatus | null
    const refunds = await listRefundRequests(status || undefined)
    const pending = await countPendingRefunds()
    return NextResponse.json({ refunds, pending })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 })
  }
}
