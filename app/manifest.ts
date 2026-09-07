import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Food SaaS',
    short_name: 'Food SaaS',
    description: 'Pedidos y gestión gastronómica',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#111111',
    icons: []
  }
}
