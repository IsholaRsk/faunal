import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { appData } from '@/lib/ui/server';
import { facets, searchAnimals } from '@/repo/catalog';
import { parseQuery } from '@/domain/ai';
import { DesktopExplore } from '@/components/desktop/explore';
import { MobileExplore } from '@/components/mobile/explore';
import { pageMeta } from '@/lib/ui/seo';
import type { FilterState } from '@/domain/types';

export const dynamic = 'force-dynamic';

type Search = { [k: string]: string | string[] | undefined };

function buildFilters(sp: Search, forced: Partial<FilterState>): { filters: FilterState; interpreted: string[] } {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === 'string') params.set(k, v);
  const raw: FilterState = {};
  const q = params.get('q');
  const nl = q ? parseQuery(q) : { filters: {}, interpreted: [] as string[] };
  Object.assign(raw, nl.filters);
  const num = (k: string) => (params.get(k) ? Number(params.get(k)) : undefined);
  for (const key of ['category', 'species', 'morph', 'state', 'size', 'experience'] as const) {
    const v = params.get(key);
    if (v) (raw as Record<string, unknown>)[key] = v;
  }
  if (params.get('verified') === '1') raw.verifiedOnly = true;
  if (params.get('available') === '1') raw.availableOnly = true;
  if (params.get('captiveBred') === '1') raw.captiveBredOnly = true;
  if (params.get('featured') === '1') raw.sort = 'rating';
  const minPrice = num('minPrice');
  const maxPrice = num('maxPrice');
  if (minPrice) raw.minPrice = minPrice;
  if (maxPrice) raw.maxPrice = maxPrice;
  const maxAge = num('maxAge');
  if (maxAge) raw.maxAgeMonths = maxAge;
  const sex = params.get('sex');
  if (sex === 'MALE' || sex === 'FEMALE') raw.sex = sex;
  const sort = params.get('sort');
  if (sort) raw.sort = sort as FilterState['sort'];
  return { filters: { ...raw, ...forced }, interpreted: nl.interpreted };
}

export function generateMetadata({ searchParams }: { searchParams: Search }): Metadata {
  const q = typeof searchParams.q === 'string' ? searchParams.q : '';
  return pageMeta({
    title: q ? `${q} — available on FAUNAL` : 'Browse legally available exotic animals',
    description: q
      ? `Live listings matching “${q}”, filtered by what is legal to keep and ship in your state.`
      : 'Browse captive-bred reptiles, birds, amphibians, fish and invertebrates from document-verified U.S. breeders.',
    path: '/animals',
  }) as Metadata;
}

export default async function AnimalsPage({ searchParams }: { searchParams: Search }) {
  const { user, experience } = appData();
  const { filters, interpreted } = buildFilters(searchParams, {});
  const facetData = facets(filters) as never as Parameters<typeof DesktopExplore>[0]['facets'];
  const page = searchAnimals(filters, 60);
  const initialResult = { total: page.total, cards: page.cards, interpreted };
  const heading = typeof searchParams.q === 'string' && searchParams.q ? `Results for “${searchParams.q}”` : 'All animals';
  const intro = interpreted.length
    ? `FAUNAL read your search as: ${interpreted.join(' · ')}. Everything listed is legal to keep and receive in ${user?.jurisdictionCode ?? 'your state'}.`
    : 'Every listing has cleared species law, seller credentials, documentation and the transport route.';

  if (experience === 'mobile') {
    return (
      <Suspense fallback={null}>
        <MobileExplore initial={filters} facets={facetData} heading={heading} basePath="/explore" initialResult={initialResult} />
      </Suspense>
    );
  }
  return (
    <Suspense fallback={null}>
      <DesktopExplore initial={filters} facets={facetData} heading={heading} intro={intro} basePath="/animals" initialResult={initialResult} />
    </Suspense>
  );
}
