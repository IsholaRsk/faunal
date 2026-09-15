import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/ui/seo';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Private surfaces and per-user state must never be crawled.
        disallow: ['/api/', '/cart', '/checkout', '/orders', '/messages', '/profile', '/notifications', '/seller', '/admin', '/assistant'],
      },
    ],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
