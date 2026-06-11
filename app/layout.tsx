import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Aria — AI Support Portal',
  description: 'AI-powered Shopify customer support portal',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/* Background is owned by each page so the white Support Portal and the
          dark-navy CRM can coexist. */}
      <body style={{ margin: 0, padding: 0, background: '#FFFFFF' }}>
        {children}
      </body>
    </html>
  )
}
