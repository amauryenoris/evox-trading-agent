import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'PAQUITO — EVOX Trading Agent',
  description: 'AI-powered autonomous stock trading agent with self-learning',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-screen bg-[#0A0A0F] text-slate-100 antialiased">
        {children}
      </body>
    </html>
  )
}
