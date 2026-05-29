// ============================================================================
// AI orchestration engine.
//
// Flow:
//   1. Build messages (system persona + context + history + new turn).
//   2. Run a tool-calling loop against the LLM (multi-step reasoning).
//   3. Run a cheap analysis pass to classify intent/sentiment/confidence.
//   4. Return the assistant reply + structured metadata + any escalation.
//
// Provider: OpenAI by default (matches existing /api/generate). Falls back to
// a deterministic rule-based responder when OPENAI_API_KEY is missing so the
// portal still demos end-to-end.
// ============================================================================

import { SUPPORT_SYSTEM_PROMPT, contextBlock, ANALYSIS_PROMPT } from './prompts'
import { TOOLS, TOOL_SCHEMAS, ToolContext } from './tools'
import type { ChatMessage, Intent, Sentiment } from '../types'

const OPENAI_KEY = process.env.OPENAI_API_KEY
const MODEL = process.env.AI_MODEL || 'gpt-4o-mini'
const MAX_TOOL_HOPS = 4

export interface EngineResult {
  reply: string
  intent: Intent
  sentiment: Sentiment
  confidence: number
  escalate: boolean
  summary: string
  toolCalls: { name: string; args: any; result: any }[]
}

interface EngineInput {
  history: ChatMessage[]
  userMessage: string
  customerEmail: string | null
  customerName: string | null
  knownOrders?: string[]
}

export async function runSupportEngine(input: EngineInput): Promise<EngineResult> {
  if (!OPENAI_KEY) return ruleBasedFallback(input)

  const ctx: ToolContext = { customerEmail: input.customerEmail }
  const toolCalls: EngineResult['toolCalls'] = []

  const messages: any[] = [
    { role: 'system', content: SUPPORT_SYSTEM_PROMPT },
    {
      role: 'system',
      content: contextBlock({
        customerName: input.customerName,
        customerEmail: input.customerEmail,
        knownOrders: input.knownOrders,
      }),
    },
    ...input.history.slice(-12).map((m) => ({
      role: m.role === 'customer' ? 'user' : m.role === 'agent' ? 'assistant' : m.role,
      content: m.content,
    })),
    { role: 'user', content: input.userMessage },
  ]

  let reply = ''
  let escalatedByTool = false
  let escalateReason = ''

  for (let hop = 0; hop < MAX_TOOL_HOPS; hop++) {
    const data = await chat(messages, TOOL_SCHEMAS)
    const choice = data.choices?.[0]?.message
    if (!choice) break
    messages.push(choice)

    const calls = choice.tool_calls || []
    if (!calls.length) {
      reply = choice.content || ''
      break
    }

    // Execute every requested tool, append results, loop again.
    for (const call of calls) {
      const name = call.function?.name
      let args: any = {}
      try { args = JSON.parse(call.function?.arguments || '{}') } catch {}
      const tool = TOOLS[name]
      let result: any
      try {
        result = tool ? await tool.run(args, ctx) : { error: `Unknown tool ${name}` }
      } catch (e: any) {
        result = { error: e?.message || 'tool execution failed' }
      }
      if (name === 'escalate_to_human' && result?.escalated) {
        escalatedByTool = true
        escalateReason = result.reason || ''
      }
      toolCalls.push({ name, args, result })
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(result),
      })
    }
  }

  if (!reply) {
    // Force a final natural-language turn if the loop ended on tool calls.
    const data = await chat(messages, undefined)
    reply = data.choices?.[0]?.message?.content || "I'm connecting you with a teammate who can help."
  }

  const analysis = await analyze(input.userMessage, reply)
  return {
    reply,
    intent: analysis.intent,
    sentiment: analysis.sentiment,
    confidence: analysis.confidence,
    escalate: analysis.escalate || escalatedByTool,
    summary: escalatedByTool && escalateReason ? escalateReason : analysis.summary,
    toolCalls,
  }
}

// ---------------------------------------------------------------------------
// LLM transport
// ---------------------------------------------------------------------------

async function chat(messages: any[], tools?: any[]) {
  const body: any = { model: MODEL, messages, temperature: 0.3 }
  if (tools) { body.tools = tools; body.tool_choice = 'auto' }
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${await res.text()}`)
  return res.json()
}

async function analyze(userMessage: string, reply: string): Promise<{
  intent: Intent; sentiment: Sentiment; confidence: number; escalate: boolean; summary: string
}> {
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: ANALYSIS_PROMPT },
          { role: 'user', content: `CUSTOMER: ${userMessage}\n\nASSISTANT: ${reply}` },
        ],
      }),
    })
    const data = await res.json()
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}')
    return {
      intent: parsed.intent || 'unknown',
      sentiment: parsed.sentiment || 'neutral',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.6,
      escalate: Boolean(parsed.escalate),
      summary: parsed.summary || 'Customer support request',
    }
  } catch {
    return { intent: 'unknown', sentiment: 'neutral', confidence: 0.5, escalate: false, summary: 'Customer support request' }
  }
}

// ---------------------------------------------------------------------------
// Rule-based fallback (no API key). Keeps the product demoable + testable.
// ---------------------------------------------------------------------------

async function ruleBasedFallback(input: EngineInput): Promise<EngineResult> {
  const ctx: ToolContext = { customerEmail: input.customerEmail }
  const text = input.userMessage.toLowerCase()
  const orderMatch = input.userMessage.match(/#?\s?(\d{3,6})/)
  const toolCalls: EngineResult['toolCalls'] = []
  let reply = ''
  let intent: Intent = 'general_question'
  let sentiment: Sentiment = 'neutral'
  let escalate = false

  const angry = /(angry|furious|terrible|worst|ridiculous|unacceptable|scam|never again)/.test(text)
  const frustrated = /(still|again|late|where is|wtf|annoyed|frustrat|disappointed)/.test(text)
  if (angry) sentiment = 'angry'
  else if (frustrated) sentiment = 'frustrated'

  if (/track|where.*order|shipped|delivery|arrive/.test(text)) {
    intent = 'track_shipment'
    if (orderMatch) {
      const r = await TOOLS.track_shipment.run({ orderNumber: orderMatch[1] }, ctx)
      toolCalls.push({ name: 'track_shipment', args: { orderNumber: orderMatch[1] }, result: r })
      const f = r.fulfillments?.[0]
      reply = f
        ? `Order #${orderMatch[1]} is ${r.fulfillmentStatus}. It shipped via ${f.trackingCompany} (tracking ${f.trackingNumber}). Estimated delivery ${f.estimatedDelivery?.slice(0, 10)}. You can track it here: ${f.trackingUrl}`
        : `Order #${orderMatch[1]} hasn't shipped yet — it's still being prepared. I'll keep you posted.`
    } else {
      reply = `Happy to track that for you! What's your order number? (It looks like #1001.)`
    }
  } else if (/refund|return|money back|cancel/.test(text)) {
    intent = 'refund_return'
    if (orderMatch) {
      const r = await TOOLS.check_refund_eligibility.run({ orderNumber: orderMatch[1] }, ctx)
      toolCalls.push({ name: 'check_refund_eligibility', args: { orderNumber: orderMatch[1] }, result: r })
      reply = r.eligible
        ? `Order #${orderMatch[1]} is eligible for a refund (${r.reason}). I've queued a refund request for our team to approve — you'll get an email shortly.`
        : `Order #${orderMatch[1]} falls outside our standard refund window, so I'm passing this to a teammate to review personally.`
      if (!r.eligible) escalate = true
    } else {
      reply = `I can help with a refund. What's the order number?`
    }
  } else if (/status|order/.test(text)) {
    intent = 'order_status'
    if (orderMatch) {
      const r = await TOOLS.lookup_order.run({ orderNumber: orderMatch[1] }, ctx)
      toolCalls.push({ name: 'lookup_order', args: { orderNumber: orderMatch[1] }, result: r })
      reply = r.found
        ? `Order #${orderMatch[1]}: ${r.order.financialStatus}, ${r.order.fulfillmentStatus}. Total ${r.order.currency} ${r.order.totalPrice}. Items: ${r.order.lineItems.map((l: any) => l.title).join(', ')}.`
        : `I couldn't find order #${orderMatch[1]} on this account. Want me to look it up another way?`
    } else {
      reply = `Sure — what's the order number you'd like to check?`
    }
  } else if (/recommend|looking for|suggest|need a|want a/.test(text)) {
    intent = 'product_recommendation'
    const r = await TOOLS.recommend_products.run({ query: input.userMessage }, ctx)
    toolCalls.push({ name: 'recommend_products', args: { query: input.userMessage }, result: r })
    reply = `Based on what you're after, you might like: ${r.products.slice(0, 3).map((p: any) => `${p.title} ($${p.price})`).join(', ')}.`
  } else if (/human|agent|person|representative|speak to someone/.test(text)) {
    intent = 'human_request'
    escalate = true
    reply = `Of course — I'm connecting you with a human teammate now. They'll have full context of our chat.`
  } else {
    reply = `Hi! I'm Aria, your support assistant. I can check order status, track shipments, help with refunds & returns, or recommend products. What do you need?`
  }

  if (sentiment === 'angry') escalate = true

  return {
    reply,
    intent,
    sentiment,
    confidence: escalate ? 0.4 : 0.8,
    escalate,
    summary: `${intent.replace('_', ' ')}${orderMatch ? ` for #${orderMatch[1]}` : ''}`,
    toolCalls,
  }
}
