import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

export const metadata: Metadata = {
  title: 'HashChat — Make Korean friends',
  description: 'Make Korean friends, even before your Korean is good. Chats show in each person’s language, voice talks are interpreted live, and you can report or block in one tap.',
  icons: {
    icon: '/favicon.ico',
  },
  openGraph: {
    title: 'HashChat — Make Korean friends',
    description: 'Make Korean friends, even before your Korean is good. Chats show in each person’s language, voice talks are interpreted live, and you can report or block in one tap.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'HashChat — Make Korean friends',
      },
    ],
    type: 'website',
    siteName: 'HashChat',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'HashChat — Make Korean friends',
    description: 'Make Korean friends, even before your Korean is good. Chats show in each person’s language, voice talks are interpreted live, and you can report or block in one tap.',
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
