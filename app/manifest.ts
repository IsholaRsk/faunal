import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'FAUNAL — exotic animals marketplace',
    short_name: 'FAUNAL',
    description: 'Buy legally permitted exotic animals from verified breeders. Escrow-protected, compliance-checked.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#F7F7F5',
    theme_color: '#151515',
    categories: ['shopping', 'lifestyle'],
    icons: [{ src: '/img/placeholder.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' }],
  };
}
