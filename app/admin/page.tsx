'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

const T = {
  bg: '#FFFFFF', subtle: '#FAFAFA', ink: '#0A0A0A', inkSoft: '#404040',
  muted: '#6B7280', faint: '#9CA3AF', border: '#E5E7EB', brand: '#5B5BD6',
  success: '#059669', warning: '#D97706', danger: '#DC2626', info: '#2563EB',
}
const SANS = "'Inter', -apple-system, BlinkMacSystemFont, sans-serif"

const STATUS_COLOR: Record<string, string> = {
  open: T.info, pending: T.warning, escalated: T.danger, resolved: T.success, closed: T.faint,
}
const SENT_COLOR: Record<string, string> = {
  positive: T.success, neutral: T.muted, frustrated: T.warning, angry: T.danger,
}

interface ToolCall { name: string; args: any; result: any }
interface Msg { id: string; role: string; content: string; createdAt: string; confidence?: number; sentiment?: string; intent?: string; toolCalls?: ToolCall[] }
interface Conversation {
  id: string; customerEmail: string | null; customerName: string | null
  status: string; priority: string; intent: string; sentiment: string
  confidence: number; summary: string; humanTakeover: boolean
  assignedAgent: string | null; tags: string[]; messages: Msg[]
  createdAt: string; updatedAt: string
}

const FILTERS = ['all', 'open', 'pending', 'escalated', 'resolved']

interface RefundReq {
  id: string; conversationId: string | null; orderName: string
  customerEmail: string | null; amount: number | null; currency: string
  reason: string; status: string; decidedBy: string | null; note: string | null
  createdAt: string; decidedAt: string | null
}

const REFUND_COLOR: Record<string, string> = {
  pending: T.warning, approved: T.info, processed: T.success, denied: T.faint, failed: T.danger,
}

export default function AdminDashboard() {
  const [convs, setConvs] = useState<Conversation[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [reply, setReply] = useState('')
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'inbox' | 'refunds'>('inbox')
  const [refunds, setRefunds] = useState<RefundReq[]>([])
  const [pendingRefunds, setPendingRefunds] = useState(0)
  const selectedRef = useRef<string | null>(null)
  selectedRef.current = selectedId

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/conversations')
      const data = await res.json()
      if (data.conversations) {
        setConvs(data.conversations)
        if (!selectedRef.current && data.conversations.length) setSelectedId(data.conversations[0].id)
      }
    } catch {}
    try {
      const res = await fetch('/api/refunds')
      const data = await res.json()
      if (data.refunds) { setRefunds(data.refunds); setPendingRefunds(data.pending || 0) }
    } catch {}
    setLoading(false)
  }, [])

  const decideRefund = async (id: string, action: 'approve' | 'deny') => {
    await fetch(`/api/refunds/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, agent: 'You' }),
    })
    await load()
  }

  // Near-realtime: poll every 4s. (Production: Supabase Realtime channel.)
  useEffect(() => {
    load()
    const t = setInterval(load, 4000)
    return () => clearInterval(t)
  }, [load])

  const selected = convs.find((c) => c.id === selectedId) || null

  const act = async (action: string, extra: Record<string, any> = {}) => {
    if (!selectedId) return
    await fetch(`/api/conversations/${selectedId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, agent: 'You', ...extra }),
    })
    await load()
  }

  const sendReply = async () => {
    if (!reply.trim()) return
    await act('reply', { content: reply.trim() })
    setReply('')
  }

  const filtered = convs.filter((c) => {
    const mf = filter === 'all' || c.status === filter
    const mq = !search || [c.customerEmail, c.customerName, c.summary].some((f) => f?.toLowerCase().includes(search.toLowerCase()))
    return mf && mq
  })

  // Metrics
  const open = convs.filter((c) => ['open', 'pending'].includes(c.status)).length
  const escalated = convs.filter((c) => c.status === 'escalated').length
  const resolved = convs.filter((c) => c.status === 'resolved').length
  const avgConf = convs.length ? Math.round((convs.reduce((s, c) => s + (c.confidence || 0), 0) / convs.length) * 100) : 0
  const sentiments = ['positive', 'neutral', 'frustrated', 'angry'].map((s) => ({ s, n: convs.filter((c) => c.sentiment === s).length }))
  const intents = Object.entries(convs.reduce((acc: Record<string, number>, c) => { acc[c.intent] = (acc[c.intent] || 0) + 1; return acc }, {})).sort((a, b) => b[1] - a[1])

  return (
    <div style={{ minHeight: '100vh', background: T.subtle, fontFamily: SANS, color: T.ink }}>
      <Style />
      {/* Header */}
      <header style={{ background: '#fff', borderBottom: `1px solid ${T.border}`, padding: '11px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 30 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: T.ink, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14 }}>A</div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Aria <span style={{ color: T.muted, fontWeight: 500 }}>· Operations</span></div>
          </div>
          <nav style={{ display: 'flex', gap: 4 }}>
            <button className="navbtn" onClick={() => setView('inbox')} style={{ background: view === 'inbox' ? T.ink : 'transparent', color: view === 'inbox' ? '#fff' : T.muted }}>Inbox</button>
            <button className="navbtn" onClick={() => setView('refunds')} style={{ background: view === 'refunds' ? T.ink : 'transparent', color: view === 'refunds' ? '#fff' : T.muted }}>
              Refunds
              {pendingRefunds > 0 && <span style={{ marginLeft: 6, background: T.warning, color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>{pendingRefunds}</span>}
            </button>
          </nav>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.muted }}>
          <span className="pulse" />
          Live · updates every 4s
        </div>
      </header>

      {/* Metrics */}
      <div style={{ padding: '14px 18px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
        <Metric label="Open" value={open} color={T.info} />
        <Metric label="Escalated" value={escalated} color={T.danger} />
        <Metric label="Resolved" value={resolved} color={T.success} />
        <Metric label="Avg AI confidence" value={`${avgConf}%`} color={T.brand} />
        <div style={{ background: '#fff', border: `1px solid ${T.border}`, borderRadius: 14, padding: '12px 14px' }}>
          <div style={{ fontSize: 11, color: T.muted, fontWeight: 600, marginBottom: 8 }}>SENTIMENT</div>
          <div style={{ display: 'flex', gap: 6, height: 8, borderRadius: 4, overflow: 'hidden', background: '#F3F4F6' }}>
            {sentiments.map(({ s, n }) => (
              <div key={s} title={`${s}: ${n}`} style={{ flex: n || 0.01, background: SENT_COLOR[s] }} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 7, flexWrap: 'wrap' }}>
            {sentiments.map(({ s, n }) => (
              <span key={s} style={{ fontSize: 10, color: SENT_COLOR[s], fontWeight: 600 }}>{s} {n}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Main grid (Inbox view) */}
      {view === 'inbox' && (
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr 280px', gap: 0, height: 'calc(100vh - 168px)', borderTop: `1px solid ${T.border}` }} className="admin-grid">

        {/* Inbox */}
        <div style={{ borderRight: `1px solid ${T.border}`, background: '#fff', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: 12, borderBottom: `1px solid ${T.border}` }}>
            <input className="search" placeholder="Search conversations…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <div style={{ display: 'flex', gap: 5, marginTop: 9, flexWrap: 'wrap' }}>
              {FILTERS.map((f) => (
                <button key={f} onClick={() => setFilter(f)} className="filt" style={{ background: filter === f ? T.ink : '#fff', color: filter === f ? '#fff' : T.muted, borderColor: filter === f ? T.ink : T.border }}>{f}</button>
              ))}
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {loading && <div style={{ padding: 20, color: T.faint, fontSize: 13 }}>Loading…</div>}
            {!loading && filtered.length === 0 && <div style={{ padding: 20, color: T.faint, fontSize: 13 }}>No conversations yet. Start one in the <a href="/support" style={{ color: T.brand }}>support portal</a>.</div>}
            {filtered.map((c) => (
              <button key={c.id} onClick={() => setSelectedId(c.id)} className="inbox-item" style={{ background: c.id === selectedId ? T.subtle : '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                  <span style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.customerName || c.customerEmail || 'Anonymous'}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: STATUS_COLOR[c.status], textTransform: 'uppercase' }}>{c.status}</span>
                </div>
                <div style={{ fontSize: 12, color: T.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 5 }}>{c.summary}</div>
                <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: SENT_COLOR[c.sentiment] }} />
                  <span style={{ fontSize: 10, color: T.faint }}>{c.intent.replace('_', ' ')}</span>
                  {c.humanTakeover && <span style={{ fontSize: 9, fontWeight: 700, color: T.brand, marginLeft: 'auto' }}>👤 HUMAN</span>}
                  {!c.humanTakeover && <span style={{ fontSize: 9, color: T.faint, marginLeft: 'auto' }}>{Math.round((c.confidence || 0) * 100)}%</span>}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Conversation */}
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, background: T.subtle }}>
          {!selected ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.faint, fontSize: 14 }}>Select a conversation</div>
          ) : (
            <>
              <div style={{ background: '#fff', borderBottom: `1px solid ${T.border}`, padding: '11px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{selected.customerName || selected.customerEmail || 'Anonymous'}</div>
                  <div style={{ fontSize: 12, color: T.muted }}>{selected.customerEmail} · {selected.messages.length} messages</div>
                </div>
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                  {!selected.humanTakeover
                    ? <button className="act" onClick={() => act('takeover')}>Take over</button>
                    : <button className="act" onClick={() => act('release')}>Return to AI</button>}
                  <select className="act" value={selected.status} onChange={(e) => act('status', { status: e.target.value })}>
                    {['open', 'pending', 'escalated', 'resolved', 'closed'].map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
                {selected.messages.map((m) => <AdminBubble key={m.id} msg={m} />)}
              </div>

              <div style={{ borderTop: `1px solid ${T.border}`, background: '#fff', padding: 12, display: 'flex', gap: 9 }}>
                <input
                  className="reply"
                  placeholder={selected.humanTakeover ? 'Reply as agent…' : 'Reply (this takes over from AI)…'}
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') sendReply() }}
                />
                <button className="btn-dark" onClick={sendReply} disabled={!reply.trim()}>Send</button>
              </div>
            </>
          )}
        </div>

        {/* Context / analytics */}
        <div style={{ borderLeft: `1px solid ${T.border}`, background: '#fff', overflowY: 'auto', minHeight: 0 }} className="ctx-pane">
          {selected ? (
            <div style={{ padding: 16 }}>
              <Section title="AI ASSESSMENT">
                <Row k="Intent" v={selected.intent.replace('_', ' ')} />
                <Row k="Sentiment" v={<span style={{ color: SENT_COLOR[selected.sentiment], fontWeight: 600, textTransform: 'capitalize' }}>{selected.sentiment}</span>} />
                <Row k="Confidence" v={`${Math.round((selected.confidence || 0) * 100)}%`} />
                <Row k="Priority" v={<span style={{ textTransform: 'capitalize' }}>{selected.priority}</span>} />
                <Row k="Handled by" v={selected.humanTakeover ? `👤 ${selected.assignedAgent || 'Agent'}` : '✦ Aria (AI)'} />
              </Section>
              <Section title="CUSTOMER">
                <Row k="Email" v={selected.customerEmail || '—'} />
                <Row k="Opened" v={new Date(selected.createdAt).toLocaleString()} />
                <a href={`/support`} style={{ fontSize: 12, color: T.brand }}>Open in portal →</a>
              </Section>
              {selected.tags.length > 0 && (
                <Section title="TAGS">
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {selected.tags.map((t) => <span key={t} style={{ fontSize: 11, background: '#F3F4F6', borderRadius: 6, padding: '3px 8px' }}>{t}</span>)}
                  </div>
                </Section>
              )}
            </div>
          ) : (
            <div style={{ padding: 16 }}>
              <Section title="INTENT DISTRIBUTION">
                {intents.length === 0 && <div style={{ color: T.faint, fontSize: 13 }}>No data yet.</div>}
                {intents.map(([k, n]) => (
                  <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ width: 110, fontSize: 11, color: T.muted }}>{k.replace('_', ' ')}</span>
                    <div style={{ flex: 1, height: 6, background: '#F3F4F6', borderRadius: 3 }}>
                      <div style={{ width: `${(n / convs.length) * 100}%`, height: '100%', background: T.ink, borderRadius: 3 }} />
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600 }}>{n}</span>
                  </div>
                ))}
              </Section>
            </div>
          )}
        </div>
      </div>
      )}

      {view === 'refunds' && <RefundsView refunds={refunds} onDecide={decideRefund} />}
    </div>
  )
}

function RefundsView({ refunds, onDecide }: { refunds: RefundReq[]; onDecide: (id: string, a: 'approve' | 'deny') => void }) {
  return (
    <div style={{ padding: 18, borderTop: `1px solid ${T.border}`, maxWidth: 1000, margin: '0 auto', width: '100%' }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', color: T.muted, marginBottom: 12 }}>REFUND APPROVAL QUEUE</div>
      {refunds.length === 0 && (
        <div style={{ background: '#fff', border: `1px solid ${T.border}`, borderRadius: 14, padding: 28, color: T.faint, fontSize: 14, textAlign: 'center' }}>
          No refund requests yet. They appear here when Aria files one (try “refund #1001” in the <a href="/support" style={{ color: T.brand }}>support portal</a>).
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {refunds.map((r) => (
          <div key={r.id} style={{ background: '#fff', border: `1px solid ${T.border}`, borderRadius: 14, padding: 16, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 90 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{r.orderName}</div>
              <div style={{ fontSize: 12, color: T.muted }}>{r.customerEmail || '—'}</div>
            </div>
            <div style={{ minWidth: 90 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{r.amount != null ? `${r.currency} ${r.amount.toFixed(2)}` : '—'}</div>
              <div style={{ fontSize: 11, color: T.muted }}>suggested</div>
            </div>
            <div style={{ flex: 1, minWidth: 180, fontSize: 13, color: T.inkSoft }}>
              <span style={{ color: T.muted }}>Reason: </span>{r.reason || '—'}
              {r.note && <div style={{ fontSize: 11, color: T.faint, marginTop: 3 }}>{r.note}</div>}
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: REFUND_COLOR[r.status] || T.muted }}>{r.status}</span>
            {r.status === 'pending' ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-dark" onClick={() => onDecide(r.id, 'approve')}>Approve</button>
                <button className="act" onClick={() => onDecide(r.id, 'deny')}>Deny</button>
              </div>
            ) : (
              <div style={{ fontSize: 11, color: T.faint, minWidth: 120, textAlign: 'right' }}>
                {r.decidedBy ? `by ${r.decidedBy}` : ''}{r.decidedAt ? ` · ${new Date(r.decidedAt).toLocaleDateString()}` : ''}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function AdminBubble({ msg }: { msg: Msg }) {
  const isCustomer = msg.role === 'customer'
  const isAgent = msg.role === 'agent'
  const isSystem = msg.role === 'system'
  if (isSystem) return <div style={{ alignSelf: 'center', color: T.faint, fontSize: 12 }}>{msg.content}</div>
  return (
    <div style={{ display: 'flex', justifyContent: isCustomer ? 'flex-start' : 'flex-end' }}>
      <div style={{ maxWidth: '80%' }}>
        <div style={{ fontSize: 10, color: T.faint, marginBottom: 3, textAlign: isCustomer ? 'left' : 'right' }}>
          {isCustomer ? (msg.role) : isAgent ? '🧑 Agent' : '✦ Aria'}
          {typeof msg.confidence === 'number' && ` · ${Math.round(msg.confidence * 100)}%`}
        </div>
        <div style={{
          background: isCustomer ? '#fff' : isAgent ? 'rgba(91,91,214,0.1)' : T.ink,
          color: isCustomer ? T.ink : isAgent ? T.ink : '#fff',
          border: isCustomer ? `1px solid ${T.border}` : 'none',
          borderRadius: 14, padding: '10px 13px', fontSize: 13.5, lineHeight: 1.5, whiteSpace: 'pre-wrap',
        }}>
          {msg.content}
        </div>
        {msg.toolCalls && msg.toolCalls.length > 0 && (
          <div style={{ marginTop: 5, display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: isCustomer ? 'flex-start' : 'flex-end' }}>
            {msg.toolCalls.map((tc, i) => (
              <span key={i} title={JSON.stringify(tc.args)} style={{ fontSize: 10, fontFamily: "'JetBrains Mono',monospace", background: '#F3F4F6', color: T.inkSoft, borderRadius: 6, padding: '2px 7px' }}>
                ⚙ {tc.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Metric({ label, value, color }: { label: string; value: any; color: string }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${T.border}`, borderRadius: 14, padding: '12px 14px' }}>
      <div style={{ fontSize: 11, color: T.muted, fontWeight: 600 }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color, letterSpacing: '-0.02em', marginTop: 4 }}>{value}</div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: T.muted, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  )
}

function Row({ k, v }: { k: string; v: any }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, marginBottom: 7 }}>
      <span style={{ color: T.muted }}>{k}</span>
      <span style={{ fontWeight: 500, textAlign: 'right' }}>{v}</span>
    </div>
  )
}

function Style() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
      *{box-sizing:border-box;margin:0;padding:0}
      ::-webkit-scrollbar{width:8px}::-webkit-scrollbar-thumb{background:#E5E7EB;border-radius:4px}
      .search{width:100%;border:1px solid ${T.border};border-radius:9px;padding:8px 11px;font-size:13px;font-family:${SANS};outline:none}
      .search:focus{border-color:${T.ink}}
      .filt{border:1px solid ${T.border};border-radius:16px;padding:4px 11px;font-size:11px;font-weight:600;font-family:${SANS};cursor:pointer;text-transform:capitalize}
      .navbtn{border:none;border-radius:8px;padding:6px 13px;font-size:13px;font-weight:600;font-family:${SANS};cursor:pointer;display:inline-flex;align-items:center}
      .inbox-item{display:block;width:100%;text-align:left;border:none;border-bottom:1px solid ${T.border};padding:11px 13px;cursor:pointer;font-family:${SANS}}
      .inbox-item:hover{background:${T.subtle}!important}
      .act{border:1px solid ${T.border};background:#fff;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:600;font-family:${SANS};cursor:pointer;color:${T.ink}}
      .act:hover{border-color:${T.ink}}
      .reply{flex:1;border:1px solid ${T.border};border-radius:10px;padding:10px 13px;font-size:13px;font-family:${SANS};outline:none}
      .reply:focus{border-color:${T.ink}}
      .btn-dark{background:${T.ink};color:#fff;border:none;border-radius:10px;padding:10px 18px;font-size:13px;font-weight:600;font-family:${SANS};cursor:pointer}
      .btn-dark:disabled{opacity:.4;cursor:not-allowed}
      .pulse{width:8px;height:8px;border-radius:50%;background:${T.success};display:inline-block;animation:p 1.6s infinite}
      @keyframes p{0%{box-shadow:0 0 0 0 rgba(5,150,105,.5)}70%{box-shadow:0 0 0 6px rgba(5,150,105,0)}100%{box-shadow:0 0 0 0 rgba(5,150,105,0)}}
      @media(max-width:980px){.admin-grid{grid-template-columns:1fr!important;height:auto!important}.ctx-pane{display:none!important}}
    `}</style>
  )
}
