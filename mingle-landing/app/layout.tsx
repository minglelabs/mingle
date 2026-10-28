import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

export const metadata: Metadata = {
  title: 'HashChat, Seamless Translator',
  description: 'Just stay in the conversation. HashChat lets you talk without translating sentence by sentence.',
  icons: {
    icon: '/favicon.ico',
  },
  openGraph: {
    title: 'HashChat, Seamless Translator',
    description: 'Just stay in the conversation. HashChat lets you talk without translating sentence by sentence.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'HashChat - Seamless Translator',
      },
    ],
    type: 'website',
    siteName: 'HashChat',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'HashChat, Seamless Translator',
    description: 'Just stay in the conversation. HashChat lets you talk without translating sentence by sentence.',
    images: ['/og-image.png'],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
