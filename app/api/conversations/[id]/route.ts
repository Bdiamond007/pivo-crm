import { NextRequest, NextResponse } from 'next/server'
import { getConversation, updateConversation, appendMessage, newId } from '@/lib/store'
import type { ChatMessage } from '@/lib/types'

export const dynamic = 'force-dynamic'

// GET /api/conversations/:id — full conversation (admin + customer polling).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const conv = await getConversation(params.id)
  if (!conv) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ conversation: conv })
}

// PATCH /api/conversations/:id — admin actions:
//   { action: 'takeover' | 'release' | 'assign' | 'status' | 'reply', ... }
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json()
    const conv = await getConversation(params.id)
    if (!conv) return NextResponse.json({ error: 'not found' }, { status: 404 })

    switch (body.action) {
      case 'takeover':
        await updateConversation(params.id, {
          humanTakeover: true,
          assignedAgent: body.agent || 'Agent',
          status: 'open',
        })
        break
      case 'release':
        await updateConversation(params.id, { humanTakeover: false })
        break
      case 'assign':
        await updateConversation(params.id, { assignedAgent: body.agent || null })
        break
      case 'status':
        await updateConversation(params.id, { status: body.status })
        break
      case 'reply': {
        if (!body.content) return NextResponse.json({ error: 'content required' }, { status: 400 })
        const msg: ChatMessage = {
          id: newId('msg'),
          role: 'agent',
          content: body.content,
          createdAt: new Date().toISOString(),
        }
        await appendMessage(params.id, msg)
        // Sending an agent reply implies takeover.
        await updateConversation(params.id, {
          humanTakeover: true,
          assignedAgent: body.agent || conv.assignedAgent || 'Agent',
        })
        break
      }
      default:
        return NextResponse.json({ error: 'unknown action' }, { status: 400 })
    }

    const updated = await getConversation(params.id)
    return NextResponse.json({ conversation: updated })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 })
  }
}
