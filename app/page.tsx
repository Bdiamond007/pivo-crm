import Link from 'next/link'

const T = {
  ink: '#0A0A0A', muted: '#6B7280', border: '#E5E7EB', brand: '#5B5BD6',
}

export default function Home() {
  const cards = [
    {
      href: '/support',
      tag: 'CUSTOMER',
      title: 'Support Portal',
      desc: 'Chat with Aria, the AI assistant. Track orders, request refunds, get recommendations — resolved instantly.',
    },
    {
      href: '/admin',
      tag: 'INTERNAL',
      title: 'Admin Operations',
      desc: 'Live inbox, AI conversation monitoring, sentiment & confidence scoring, manual takeover, and analytics.',
    },
    {
      href: '/crm',
      tag: 'LEGACY',
      title: 'Pivo CRM',
      desc: 'The original prospect & client command center (unchanged).',
    },
  ]
  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#FFFFFF',
        color: T.ink,
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 20px',
      }}
    >
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');*{box-sizing:border-box}a{text-decoration:none}`}</style>

      <div style={{ maxWidth: 880, width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: T.ink, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18 }}>A</div>
          <span style={{ fontWeight: 700, letterSpacing: '-0.02em', fontSize: 18 }}>Aria</span>
          <span style={{ color: T.muted, fontSize: 13 }}>· AI Support Platform for Shopify</span>
        </div>

        <h1 style={{ fontSize: 44, lineHeight: 1.05, fontWeight: 800, letterSpacing: '-0.03em', margin: '0 0 14px' }}>
          Customer support that resolves itself.
        </h1>
        <p style={{ color: T.muted, fontSize: 17, lineHeight: 1.55, maxWidth: 600, margin: '0 0 36px' }}>
          An AI-first support portal wired into your Shopify store — order intelligence, refunds,
          tracking, and smart escalation, with a clean operations dashboard for your team.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 16 }}>
          {cards.map((c) => (
            <Link key={c.href} href={c.href} style={{ display: 'block' }}>
              <div
                style={{
                  border: `1px solid ${T.border}`,
                  borderRadius: 16,
                  padding: 22,
                  height: '100%',
                  transition: 'border-color .15s, transform .15s',
                  background: '#fff',
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: T.brand, marginBottom: 10 }}>{c.tag}</div>
                <div style={{ fontSize: 19, fontWeight: 700, marginBottom: 8, letterSpacing: '-0.01em' }}>{c.title} →</div>
                <div style={{ color: T.muted, fontSize: 14, lineHeight: 1.5 }}>{c.desc}</div>
              </div>
            </Link>
          ))}
        </div>

        <div style={{ marginTop: 32, color: T.muted, fontSize: 13 }}>
          Runs in demo mode with zero config. Add Shopify + OpenAI keys for live mode — see{' '}
          <code style={{ background: '#F3F4F6', padding: '2px 6px', borderRadius: 5 }}>docs/ARCHITECTURE.md</code>.
        </div>
      </div>
    </main>
  )
}
