import { Suspense } from 'react';
import type { Metadata } from 'next';
import { appData } from '@/lib/ui/server';
import { facets, searchAnimals } from '@/repo/catalog';
import { MobileExplore } from '@/components/mobile/explore';
import { DesktopExplore } from '@/components/desktop/explore';
import { pageMeta } from '@/lib/ui/seo';
import type { FilterState } from '@/domain/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = pageMeta({
  title: 'Explore animals',
  description: 'Filter live exotic-animal listings by species, morph, price, state and experience level.',
  path: '/explore',
}) as Metadata;

export default function ExplorePage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const { experience } = appData();
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) if (typeof v === 'string') params.set(k, v);
  const filters: FilterState = {};
  for (const key of ['q', 'category', 'species', 'morph', 'state', 'sort', 'experience', 'size'] as const) {
    const v = params.get(key);
    if (v) (filters as Record<string, unknown>)[key] = v;
  }
  for (const key of ['minPrice', 'maxPrice', 'maxAge', 'minAge'] as const) {
    const v = params.get(key);
    if (v) (filters as Record<string, unknown>)[key === 'maxAge' ? 'maxAgeMonths' : key === 'minAge' ? 'minAgeMonths' : key] = Number(v);
  }
  if (params.get('verified') === '1') filters.verifiedOnly = true;

  const facetData = facets(filters) as never as Parameters<typeof DesktopExplore>[0]['facets'];
  const page = searchAnimals(filters, 60);
  const initialResult = { total: page.total, cards: page.cards };
  if (experience === 'desktop') {
    return (
      <Suspense fallback={null}>
        <DesktopExplore initial={filters} facets={facetData} basePath="/animals" heading="Explore the marketplace" initialResult={initialResult} />
      </Suspense>
    );
  }
  return (
    <Suspense fallback={null}>
      <MobileExplore initial={filters} facets={facetData} basePath="/explore" initialResult={initialResult} />
    </Suspense>
  );
}
