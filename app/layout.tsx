import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Pivo Web — Command Center',
  description: 'Pivo Web Client Management Platform',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, background: '#07101F' }}>
        {children}
      </body>
    </html>
  )
}
