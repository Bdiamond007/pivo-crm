import { NextRequest, NextResponse } from 'next/server'
import { runSupportEngine } from '@/lib/ai/engine'
import {
  createConversation,
  getConversation,
  appendMessage,
  updateConversation,
  newId,
} from '@/lib/store'
import { getOrdersByEmail } from '@/lib/shopify'
import type { ChatMessage, TicketPriority } from '@/lib/types'

export const dynamic = 'force-dynamic'

// POST /api/chat
// Body: { conversationId?, message, customerEmail?, customerName? }
export async function POST(req: NextRequest) {
  try {
    const { conversationId, message, customerEmail, customerName } = await req.json()
    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'message is required' }, { status: 400 })
    }

    // Load or create the conversation.
    let conv = conversationId ? await getConversation(conversationId) : null
    if (!conv) {
      conv = await createConversation({
        customerEmail: customerEmail || null,
        customerName: customerName || null,
        summary: 'New conversation',
      })
    }

    // If a human has taken over, the AI stays silent — just record the message.
    const userMsg: ChatMessage = {
      id: newId('msg'),
      role: 'customer',
      content: message,
      createdAt: new Date().toISOString(),
    }
    await appendMessage(conv.id, userMsg)

    if (conv.humanTakeover) {
      return NextResponse.json({
        conversationId: conv.id,
        handledBy: 'human',
        message: null,
      })
    }

    // Give the engine the customer's recent order numbers for grounding.
    let knownOrders: string[] = []
    if (customerEmail || conv.customerEmail) {
      try {
        const orders = await getOrdersByEmail((customerEmail || conv.customerEmail) as string, 5)
        knownOrders = orders.map((o) => o.name)
      } catch {}
    }

    const result = await runSupportEngine({
      history: conv.messages,
      userMessage: message,
      customerEmail: customerEmail || conv.customerEmail,
      customerName: customerName || conv.customerName,
      conversationId: conv.id,
      knownOrders,
    })

    const assistantMsg: ChatMessage = {
      id: newId('msg'),
      role: 'assistant',
      content: result.reply,
      createdAt: new Date().toISOString(),
      toolCalls: result.toolCalls,
      confidence: result.confidence,
      sentiment: result.sentiment,
      intent: result.intent,
      escalate: result.escalate,
    }
    await appendMessage(conv.id, assistantMsg)

    const priority: TicketPriority =
      result.sentiment === 'angry' ? 'urgent' : result.escalate ? 'high' : 'normal'

    await updateConversation(conv.id, {
      customerEmail: customerEmail || conv.customerEmail,
      customerName: customerName || conv.customerName,
      intent: result.intent,
      sentiment: result.sentiment,
      confidence: result.confidence,
      summary: result.summary,
      priority,
      status: result.escalate ? 'escalated' : conv.status === 'open' ? 'pending' : conv.status,
    })

    return NextResponse.json({
      conversationId: conv.id,
      handledBy: 'ai',
      message: assistantMsg,
      escalate: result.escalate,
      confidence: result.confidence,
      sentiment: result.sentiment,
      intent: result.intent,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'chat failed' }, { status: 500 })
  }
}
