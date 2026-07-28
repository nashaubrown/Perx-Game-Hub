import type { Metadata, Viewport } from 'next'
import './globals.css'
import { AppShell } from '@/components/AppShell'

export const metadata: Metadata = {
  title: 'Debt-Free Journey',
  description: 'Your personal debt payoff coach — month by month until zero.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Apply the saved theme before first paint to avoid a flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('dfj-theme');if(t)document.documentElement.dataset.theme=t}catch(e){}`,
          }}
        />
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
