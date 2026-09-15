export const SITE = {
  name: 'FAUNAL',
  legalName: 'FAUNAL Marketplace, Inc.',
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  tagline: 'Exotic animals. Legally.',
  description:
    'FAUNAL is a New York–built U.S. marketplace where licensed, document-verified breeders sell legally permitted exotic animals — reptiles, birds, amphibians, fish and invertebrates — with state-by-state compliance built into every listing.',
  city: 'New York',
  state: 'NY',
  address: '274 Madison Ave, New York, NY 10016',
  support: 'compliance@faunal.market',
} as const;

/** Per-page metadata + Open Graph + canonical (spec §46). */
export function pageMeta(opts: {
  title: string;
  description: string;
  path: string;
  image?: string;
  type?: 'website' | 'article' | 'product';
  noindex?: boolean;
}) {
  const url = `${SITE.url}${opts.path}`;
  return {
    title: opts.title,
    description: opts.description,
    alternates: { canonical: opts.path },
    openGraph: {
      // Next's OpenGraph union has no 'product'; market listings use 'website'.
      type: opts.type && opts.type !== 'product' ? opts.type : 'website',
      url,
      title: opts.title,
      description: opts.description,
      siteName: SITE.name,
      images: [{ url: opts.image ?? '/img/og-cover.jpg', width: 1200, height: 630 }],
    },
    robots: opts.noindex ? { index: false, follow: false } : { index: true, follow: true },
  };
}

/** JSON-LD for product pages, breadcrumbs and organisations. */
export function jsonLd(obj: Record<string, unknown> | Record<string, unknown>[]) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(obj) }} />;
}
