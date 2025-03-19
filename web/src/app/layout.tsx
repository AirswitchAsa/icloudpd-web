import { Metadata } from 'next'
import { Providers } from './providers'

export const metadata: Metadata = {
  title: 'iCloud Photos Downloader',
  description: 'A Web UI wrapper for icloudpd with additional features',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, backgroundColor: '#F7FAFC' }}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}
