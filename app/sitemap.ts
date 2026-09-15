import type { MetadataRoute } from 'next';
import { getDb } from '@/db';
import { SITE } from '@/lib/ui/seo';

/** Generated from the database so every live listing, breeder and guide is in it. */
export default function sitemap(): MetadataRoute.Sitemap {
  const db = getDb();
  const now = new Date();
  const statics: MetadataRoute.Sitemap = [
    { url: `${SITE.url}/`, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE.url}/animals`, lastModified: now, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${SITE.url}/explore`, lastModified: now, changeFrequency: 'hourly', priority: 0.8 },
    { url: `${SITE.url}/breeders`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
    { url: `${SITE.url}/guides`, lastModified: now, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${SITE.url}/compliance`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${SITE.url}/compliance/documents`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE.url}/compliance/shipping`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE.url}/compliance/protection`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE.url}/become-a-breeder`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE.url}/about`, lastModified: now, changeFrequency: 'yearly', priority: 0.4 },
    { url: `${SITE.url}/legal/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE.url}/legal/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ];

  const animals = db
    .prepare(`SELECT slug, updated_at FROM animals WHERE status='APPROVED' AND availability != 'NOT_AVAILABLE' ORDER BY published_at DESC LIMIT 5000`)
    .all() as { slug: string; updated_at: string }[];
  const breeders = db.prepare(`SELECT slug, updated_at FROM breeders WHERE status='APPROVED'`).all() as { slug: string; updated_at: string }[];
  const guides = db.prepare(`SELECT slug, published_at FROM guides ORDER BY published_at DESC`).all() as { slug: string; published_at: string }[];
  const categories = db.prepare(`SELECT slug FROM categories`).all() as { slug: string }[];

  return [
    ...statics,
    ...animals.map((a) => ({ url: `${SITE.url}/animals/${a.slug}`, lastModified: new Date(a.updated_at), changeFrequency: 'daily' as const, priority: 0.8 })),
    ...breeders.map((b) => ({ url: `${SITE.url}/breeders/${b.slug}`, lastModified: new Date(b.updated_at), changeFrequency: 'weekly' as const, priority: 0.7 })),
    ...guides.map((g) => ({ url: `${SITE.url}/guides/${g.slug}`, lastModified: new Date(g.published_at), changeFrequency: 'monthly' as const, priority: 0.5 })),
    ...categories.map((c) => ({ url: `${SITE.url}/animals?category=${c.slug}`, lastModified: now, changeFrequency: 'daily' as const, priority: 0.6 })),
  ];
}
