import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Food SaaS',
  description: 'Sistema SaaS multi-comercio para pedidos gastronómicos'
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
