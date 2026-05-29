'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { subscribeToTables, realtimeEnabled } from '@/lib/realtime'

// Local design tokens (premium / minimalist / white).
const T = {
  bg: '#FFFFFF', subtle: '#FAFAFA', ink: '#0A0A0A', muted: '#6B7280',
  faint: '#9CA3AF', border: '#E5E7EB', brand: '#5B5BD6', success: '#059669',
  warning: '#D97706', danger: '#DC2626',
}
const SANS = "'Inter', -apple-system, BlinkMacSystemFont, sans-serif"

interface Msg { id: string; role: string; content: string; createdAt: string }
interface Order {
  name: string; financialStatus: string; fulfillmentStatus: string
  totalPrice: string; currency: string
  lineItems: { title: string; quantity: number; price: string }[]
  fulfillments: { trackingCompany?: string; trackingNumber?: string; trackingUrl?: string; estimatedDelivery?: string }[]
  daysSincePurchase: number; refundable: boolean
}

const QUICK = [
  { label: 'Track my order', text: 'Where is my order #1001?' },
  { label: 'Request a refund', text: "I'd like a refund for order #1001" },
  { label: 'Report an issue', text: 'My item arrived damaged' },
  { label: 'Recommend something', text: "I'm looking for a warm winter jacket" },
]

export default function SupportPortal() {
  const [authed, setAuthed] = useState(false)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [convId, setConvId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [escalated, setEscalated] = useState(false)
  const [orders, setOrders] = useState<Order[]>([])
  const [showOrders, setShowOrders] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  const scrollToEnd = () => endRef.current?.scrollIntoView({ behavior: 'smooth' })
  useEffect(scrollToEnd, [messages, sending])

  const signIn = (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setAuthed(true)
    setMessages([{
      id: 'welcome',
      role: 'assistant',
      content: `Hi ${name || 'there'}! I'm Aria, your support assistant. I can check orders, track shipments, help with refunds & returns, or recommend products. What can I help with?`,
      createdAt: new Date().toISOString(),
    }])
    loadOrders(email)
  }

  const loadOrders = useCallback(async (mail: string) => {
    try {
      const res = await fetch(`/api/shopify/orders?email=${encodeURIComponent(mail)}`)
      const data = await res.json()
      if (data.orders) setOrders(data.orders)
    } catch {}
  }, [])

  const send = async (text: string) => {
    const content = text.trim()
    if (!content || sending) return
    setInput('')
    const userMsg: Msg = { id: `u_${Date.now()}`, role: 'customer', content, createdAt: new Date().toISOString() }
    setMessages((m) => [...m, userMsg])
    setSending(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: convId, message: content, customerEmail: email, customerName: name }),
      })
      const data = await res.json()
      if (data.conversationId) setConvId(data.conversationId)
      if (data.escalate) setEscalated(true)
      if (data.message) {
        setMessages((m) => [...m, { id: data.message.id, role: 'assistant', content: data.message.content, createdAt: data.message.createdAt }])
      } else if (data.handledBy === 'human') {
        setMessages((m) => [...m, { id: `sys_${Date.now()}`, role: 'system', content: 'A human teammate has joined and will reply shortly.', createdAt: new Date().toISOString() }])
      }
    } catch {
      setMessages((m) => [...m, { id: `err_${Date.now()}`, role: 'system', content: 'Something went wrong. Please try again.', createdAt: new Date().toISOString() }])
    }
    setSending(false)
  }

  // Pull any messages that arrived out-of-band (a human agent reply, a webhook
  // shipment update, a refund confirmation). We only append non-customer
  // messages we don't already have, so our optimistic echoes never duplicate.
  const refreshConversation = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/conversations/${id}`)
      const data = await res.json()
      const conv = data.conversation
      if (!conv) return
      if (conv.humanTakeover) setEscalated(true)
      setMessages((prev) => {
        const have = new Set(prev.map((m) => m.id))
        const incoming = (conv.messages || [])
          .filter((m: any) => m.role !== 'customer' && !have.has(m.id))
          .map((m: any) => ({ id: m.id, role: m.role, content: m.content, createdAt: m.createdAt }))
        return incoming.length ? [...prev, ...incoming] : prev
      })
    } catch {}
  }, [])

  // Realtime push for this conversation; polling fallback when Supabase is off.
  useEffect(() => {
    if (!convId) return
    const unsub = subscribeToTables(['conversations'], () => refreshConversation(convId), {
      filterColumn: 'id',
      filterValue: convId,
    })
    const t = realtimeEnabled ? null : setInterval(() => refreshConversation(convId), 5000)
    return () => { unsub(); if (t) clearInterval(t) }
  }, [convId, refreshConversation])

  // ---- Auth gate ----
  if (!authed) {
    return (
      <div style={{ minHeight: '100vh', background: T.subtle, fontFamily: SANS, color: T.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <Style />
        <div style={{ background: '#fff', border: `1px solid ${T.border}`, borderRadius: 18, padding: 32, width: '100%', maxWidth: 400, boxShadow: '0 10px 40px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 18 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: T.ink, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>A</div>
            <strong style={{ fontSize: 16 }}>Aria Support</strong>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 6px', letterSpacing: '-0.02em' }}>Welcome back</h1>
          <p style={{ color: T.muted, fontSize: 14, margin: '0 0 20px' }}>Verify your email so Aria can pull up your orders.</p>
          <form onSubmit={signIn} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input className="fld" placeholder="Email address" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input className="fld" placeholder="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
            <button type="submit" className="btn-primary">Continue</button>
          </form>
          <p style={{ color: T.faint, fontSize: 12, marginTop: 16, lineHeight: 1.5 }}>
            Demo mode: any email works and returns sample orders. In production this is a Shopify customer-account / OTP login.
          </p>
        </div>
      </div>
    )
  }

  // ---- Portal ----
  return (
    <div style={{ minHeight: '100vh', background: T.subtle, fontFamily: SANS, color: T.ink, display: 'flex', flexDirection: 'column' }}>
      <Style />
      {/* Header */}
      <header style={{ background: '#fff', borderBottom: `1px solid ${T.border}`, padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: T.ink, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 15 }}>A</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Aria Support</div>
            <div style={{ color: T.muted, fontSize: 11 }}>{email}</div>
          </div>
        </div>
        <button className="btn-ghost" onClick={() => setShowOrders((s) => !s)}>
          {showOrders ? 'Hide orders' : `My orders (${orders.length})`}
        </button>
      </header>

      <div style={{ flex: 1, display: 'flex', maxWidth: 1100, width: '100%', margin: '0 auto', gap: 0 }}>
        {/* Chat column */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {escalated && (
            <div style={{ background: 'rgba(217,119,6,0.08)', borderBottom: `1px solid rgba(217,119,6,0.25)`, color: T.warning, padding: '9px 18px', fontSize: 13, fontWeight: 500 }}>
              ⏱ This conversation has been routed to a human teammate. They'll jump in shortly.
            </div>
          )}

          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {messages.map((m) => <Bubble key={m.id} msg={m} />)}
            {sending && <Typing />}
            <div ref={endRef} />
          </div>

          {/* Quick actions */}
          <div style={{ padding: '0 18px 10px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {QUICK.map((q) => (
              <button key={q.label} className="chip" onClick={() => send(q.text)} disabled={sending}>{q.label}</button>
            ))}
          </div>

          {/* Composer */}
          <div style={{ borderTop: `1px solid ${T.border}`, background: '#fff', padding: 12, display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <textarea
              className="composer"
              rows={1}
              placeholder="Message Aria…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }}
            />
            <button className="btn-primary" style={{ width: 'auto', padding: '11px 18px' }} disabled={sending || !input.trim()} onClick={() => send(input)}>
              {sending ? '…' : 'Send'}
            </button>
          </div>
        </main>

        {/* Orders panel */}
        {showOrders && (
          <aside style={{ width: 320, borderLeft: `1px solid ${T.border}`, background: '#fff', padding: 16, overflowY: 'auto' }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', color: T.muted, marginBottom: 12 }}>YOUR ORDERS</div>
            {orders.length === 0 && <div style={{ color: T.faint, fontSize: 13 }}>No orders found for this email.</div>}
            {orders.map((o) => (
              <div key={o.name} style={{ border: `1px solid ${T.border}`, borderRadius: 12, padding: 13, marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <strong style={{ fontSize: 14 }}>{o.name}</strong>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{o.currency} {o.totalPrice}</span>
                </div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                  <Tag color={o.financialStatus === 'refunded' ? T.danger : T.success} label={o.financialStatus} />
                  <Tag color={o.fulfillmentStatus === 'fulfilled' ? T.success : T.warning} label={o.fulfillmentStatus} />
                </div>
                <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.5 }}>
                  {o.lineItems.map((l) => `${l.quantity}× ${l.title}`).join(', ')}
                </div>
                {o.fulfillments?.[0]?.trackingNumber && (
                  <a href={o.fulfillments[0].trackingUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: T.brand, display: 'inline-block', marginTop: 7 }}>
                    Track {o.fulfillments[0].trackingCompany} →
                  </a>
                )}
                <div style={{ display: 'flex', gap: 6, marginTop: 9 }}>
                  <button className="mini" onClick={() => send(`Where is my order ${o.name}?`)}>Track</button>
                  <button className="mini" onClick={() => send(`I'd like a refund for ${o.name}`)}>Refund</button>
                </div>
              </div>
            ))}
          </aside>
        )}
      </div>
    </div>
  )
}

function Bubble({ msg }: { msg: Msg }) {
  const isCustomer = msg.role === 'customer'
  const isSystem = msg.role === 'system'
  const isAgent = msg.role === 'agent'
  if (isSystem) {
    return <div style={{ alignSelf: 'center', color: T.faint, fontSize: 12, background: '#F3F4F6', padding: '5px 12px', borderRadius: 20 }}>{msg.content}</div>
  }
  return (
    <div style={{ display: 'flex', justifyContent: isCustomer ? 'flex-end' : 'flex-start' }}>
      <div style={{ maxWidth: '78%' }}>
        {!isCustomer && (
          <div style={{ fontSize: 11, color: T.muted, marginBottom: 3, marginLeft: 4, fontWeight: 600 }}>
            {isAgent ? '🧑 Support agent' : '✦ Aria'}
          </div>
        )}
        <div
          style={{
            background: isCustomer ? T.ink : isAgent ? 'rgba(91,91,214,0.08)' : '#fff',
            color: isCustomer ? '#fff' : T.ink,
            border: isCustomer ? 'none' : `1px solid ${T.border}`,
            borderRadius: 16,
            borderTopRightRadius: isCustomer ? 4 : 16,
            borderTopLeftRadius: isCustomer ? 16 : 4,
            padding: '11px 14px',
            fontSize: 14,
            lineHeight: 1.55,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {msg.content}
        </div>
      </div>
    </div>
  )
}

function Typing() {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
      <div style={{ background: '#fff', border: `1px solid ${T.border}`, borderRadius: 16, borderTopLeftRadius: 4, padding: '13px 16px', display: 'flex', gap: 4 }}>
        {[0, 1, 2].map((i) => (
          <span key={i} className="dot" style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
      </div>
    </div>
  )
}

function Tag({ color, label }: { color: string; label: string }) {
  return <span style={{ fontSize: 10, fontWeight: 600, color, background: `${color}15`, borderRadius: 6, padding: '2px 7px', textTransform: 'capitalize' }}>{label}</span>
}

function Style() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
      *{box-sizing:border-box;margin:0;padding:0}
      ::-webkit-scrollbar{width:8px}::-webkit-scrollbar-thumb{background:#E5E7EB;border-radius:4px}
      .fld{border:1px solid ${T.border};border-radius:10px;padding:11px 13px;font-size:14px;font-family:${SANS};outline:none;width:100%}
      .fld:focus{border-color:${T.ink}}
      .btn-primary{background:${T.ink};color:#fff;border:none;border-radius:10px;padding:11px;font-size:14px;font-weight:600;font-family:${SANS};cursor:pointer;width:100%}
      .btn-primary:disabled{opacity:.4;cursor:not-allowed}
      .btn-ghost{background:#fff;border:1px solid ${T.border};border-radius:9px;padding:7px 13px;font-size:13px;font-weight:500;font-family:${SANS};cursor:pointer;color:${T.ink}}
      .chip{background:#fff;border:1px solid ${T.border};border-radius:20px;padding:7px 13px;font-size:13px;font-family:${SANS};cursor:pointer;color:#404040;transition:border-color .15s}
      .chip:hover{border-color:${T.ink}}.chip:disabled{opacity:.5;cursor:not-allowed}
      .mini{flex:1;background:${T.subtle};border:1px solid ${T.border};border-radius:8px;padding:6px;font-size:12px;font-family:${SANS};cursor:pointer;color:${T.ink}}
      .mini:hover{background:#fff;border-color:${T.ink}}
      .composer{flex:1;resize:none;border:1px solid ${T.border};border-radius:12px;padding:11px 13px;font-size:14px;font-family:${SANS};outline:none;max-height:120px;line-height:1.5}
      .composer:focus{border-color:${T.ink}}
      .dot{width:6px;height:6px;border-radius:50%;background:${T.faint};display:inline-block;animation:blink 1.2s infinite}
      @keyframes blink{0%,60%,100%{opacity:.25}30%{opacity:1}}
      @media(max-width:760px){aside{display:none!important}}
    `}</style>
  )
}
