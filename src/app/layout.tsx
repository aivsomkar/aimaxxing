import type { Metadata } from 'next'
import { DM_Sans, Geist_Mono } from 'next/font/google'
import './globals.css'
import { Header } from '@/components/Header'
import { AuthProvider } from '@/components/AuthProvider'

const sans = DM_Sans({ subsets: ['latin'], variable: '--font-dm-sans' })
const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' })

export const metadata: Metadata = {
  title: 'AI Maxxing',
  description: 'A public leaderboard where developers publish verified AI-tool usage.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body
        className={`${sans.variable} ${mono.variable} font-sans bg-background text-foreground antialiased`}
      >
        <AuthProvider>
          <Header />
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}
