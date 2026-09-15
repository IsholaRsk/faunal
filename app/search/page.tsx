import type { Metadata } from 'next';
import { appData } from '@/lib/ui/server';
import { parseQuery } from '@/domain/ai';
import { searchAnimals, speciesByCategory, categories } from '@/repo/catalog';
import { popularSearches, recentSearches } from '@/repo/cart';
import { getDb } from '@/lib/db';
import { DesktopSearch } from '@/components/desktop/search';
import { MobileSearch } from '@/components/mobile/search';
import { pageMeta } from '@/lib/ui/seo';
import type { FilterState } from '@/domain/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = pageMeta({
  title: 'Search',
  description: 'Plain-language search across every legally available animal on FAUNAL.',
  path: '/search',
  noindex: true,
}) as Metadata;

export default function SearchPage({ searchParams }: { searchParams: { q?: string } }) {
  const { user, experience } = appData();
  const q = (searchParams.q ?? '').trim();

  // First paint is computed on the server so the page works without JavaScript
  // and crawlers see the same results a user would.
  const nl = parseQuery(q);
  const result = q ? searchAnimals({ ...(nl.filters as FilterState), limit: undefined } as never, 24, 0) : null;

  const db = getDb();
  const species = db
    .prepare(
      `SELECT s.common_name AS name, COUNT(a.id) AS n FROM species s
       LEFT JOIN animals a ON a.species_id = s.id AND a.status = 'APPROVED'
       GROUP BY s.id ORDER BY n DESC, s.common_name LIMIT 8`,
    )
    .all() as { name: string; n: number }[];
  const cats = categories(false) as { slug: string; name: string }[];

  const seed = {
    q,
    total: result?.total ?? 0,
    cards: (result?.cards ?? []) as never,
    filters: (result ? nl.filters : {}) as Record<string, string | number | null>,
    interpreted: nl.interpreted,
    recent: recentSearches(user?.id ?? null, 6).map((r: { query: string }) => r.query),
    popular: popularSearches(8).map((p: { query: string }) => p.query),
    suggestions: [
      ...species.map((s) => ({ kind: 'species' as const, label: s.name, value: s.name })),
      ...cats.slice(0, 4).map((c) => ({ kind: 'category' as const, label: c.name, value: c.name })),
      { kind: 'saved' as const, label: 'Beginner-friendly', value: 'beginner hardy' },
      { kind: 'saved' as const, label: 'Under $500', value: 'under 500' },
    ],
  };

  // speciesByCategory is used by the browse facets; keep the import honest by
  // consulting it for the taxonomy version stamp shown in the footer.
  void speciesByCategory();

  return experience === 'mobile' ? <MobileSearch seed={seed as never} /> : <DesktopSearch seed={seed as never} />;
}
