import { NextRequest, NextResponse } from 'next/server'
import { getRefundRequest, updateRefundRequest } from '@/lib/refunds'
import { executeRefund } from '@/lib/shopify'
import { appendMessage, newId } from '@/lib/store'
import type { ChatMessage } from '@/lib/types'

export const dynamic = 'force-dynamic'

// PATCH /api/refunds/:id  — admin decision.
//   { action: 'approve' | 'deny', agent?, amount? }
// Approving executes the refund (real in live mode, simulated in demo) and
// posts a confirmation back into the originating conversation.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json()
    const rr = await getRefundRequest(params.id)
    if (!rr) return NextResponse.json({ error: 'not found' }, { status: 404 })
    if (rr.status !== 'pending') {
      return NextResponse.json({ error: `already ${rr.status}` }, { status: 409 })
    }

    const now = new Date().toISOString()
    const agent = body.agent || 'Admin'

    if (body.action === 'deny') {
      const updated = await updateRefundRequest(params.id, {
        status: 'denied',
        decidedBy: agent,
        decidedAt: now,
        note: body.note || 'Denied by admin.',
      })
      await notifyConversation(rr.conversationId, `We've reviewed your refund request for ${rr.orderName}. Unfortunately we're unable to approve it. A teammate will follow up with details.`)
      return NextResponse.json({ refund: updated })
    }

    if (body.action === 'approve') {
      // Allow the admin to override the amount (e.g. partial refund).
      const amount = typeof body.amount === 'number' ? body.amount : rr.amount
      if (amount == null) {
        return NextResponse.json({ error: 'no amount to refund' }, { status: 400 })
      }
      const exec = await executeRefund(rr.orderName, amount, rr.currency)
      const updated = await updateRefundRequest(params.id, {
        status: exec.ok ? 'processed' : 'failed',
        decidedBy: agent,
        decidedAt: now,
        amount,
        note: exec.note,
      })
      if (exec.ok) {
        await notifyConversation(rr.conversationId, `Good news — your refund of ${rr.currency} ${amount} for ${rr.orderName} has been approved and processed. It should appear on your statement in 5–10 business days.`)
      }
      return NextResponse.json({ refund: updated, execution: exec })
    }

    return NextResponse.json({ error: 'unknown action' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 })
  }
}

async function notifyConversation(conversationId: string | null, content: string) {
  if (!conversationId) return
  const msg: ChatMessage = {
    id: newId('msg'),
    role: 'assistant',
    content,
    createdAt: new Date().toISOString(),
    intent: 'refund_return',
  }
  try { await appendMessage(conversationId, msg) } catch {}
}
