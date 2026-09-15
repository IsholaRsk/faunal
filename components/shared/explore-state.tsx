'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { FilterState } from '@/domain/types';
import { post } from '@/lib/ui/api';
import { Icon } from '@/components/ui/Icon';
import type { AnimalCard } from '@/repo/catalog';

/**
 * Shared explore state (spec §11–§12): the same filter object drives the
 * desktop sidebar, the mobile bottom sheet, the URL, and the API request.
 */

export function filtersFromParams(params: URLSearchParams): FilterState {
  const num = (k: string) => (params.get(k) ? Number(params.get(k)) : undefined);
  const bool = (k: string) => params.get(k) === '1';
  const out: FilterState = {};
  const q = params.get('q');
  if (q) out.q = q;
  const category = params.get('category');
  if (category) out.category = category;
  const species = params.get('species');
  if (species) out.species = species;
  const morph = params.get('morph');
  if (morph) out.morph = morph;
  const sex = params.get('sex');
  if (sex === 'MALE' || sex === 'FEMALE') out.sex = sex;
  if (num('minAge')) out.minAgeMonths = num('minAge');
  if (num('maxAge')) out.maxAgeMonths = num('maxAge');
  if (num('minPrice')) out.minPrice = num('minPrice');
  if (num('maxPrice')) out.maxPrice = num('maxPrice');
  const state = params.get('state');
  if (state) out.state = state.toUpperCase();
  const exp = params.get('experience');
  if (exp) out.experience = exp as FilterState['experience'];
  const size = params.get('size');
  if (size) out.size = size as FilterState['size'];
  if (bool('verified')) out.verifiedOnly = true;
  if (bool('available')) out.availableOnly = true;
  if (bool('captiveBred')) out.captiveBredOnly = true;
  const sort = params.get('sort');
  if (sort) out.sort = sort as FilterState['sort'];
  return out;
}

export function paramsFromFilters(f: FilterState): string {
  const p = new URLSearchParams();
  const add = (k: string, v: unknown) => {
    if (v === undefined || v === null || v === '' || v === false) return;
    p.set(k, String(v));
  };
  add('q', f.q);
  add('category', f.category);
  add('species', f.species);
  add('morph', f.morph);
  add('sex', f.sex);
  add('minAge', f.minAgeMonths);
  add('maxAge', f.maxAgeMonths);
  add('minPrice', f.minPrice);
  add('maxPrice', f.maxPrice);
  add('state', f.state);
  add('experience', f.experience);
  add('size', f.size);
  add('verified', f.verifiedOnly ? '1' : undefined);
  add('available', f.availableOnly ? '1' : undefined);
  add('captiveBred', f.captiveBredOnly ? '1' : undefined);
  add('sort', f.sort && f.sort !== 'relevance' ? f.sort : undefined);
  return p.toString();
}

export function activeFilterCount(f: FilterState): number {
  const keys: (keyof FilterState)[] = ['category', 'species', 'morph', 'sex', 'minAgeMonths', 'maxAgeMonths', 'minPrice', 'maxPrice', 'state', 'experience', 'size', 'verifiedOnly', 'availableOnly', 'captiveBredOnly'];
  return keys.filter((k) => f[k] !== undefined && f[k] !== '').length;
}

export interface ExploreResult {
  total: number;
  cards: AnimalCard[];
  interpreted?: string[];
}

export function useExplore(initial: FilterState, basePath: string, initialResult?: ExploreResult | null) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<FilterState>(initial);
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>(initialResult ? 'done' : initial.q ? 'loading' : 'idle');
  const [result, setResult] = useState<ExploreResult | null>(initialResult ?? null);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback(
    async (next: FilterState, pushUrl = true) => {
      setFilters(next);
      if (pushUrl) {
        const qs = paramsFromFilters(next);
        router.push(qs ? `${basePath}?${qs}` : basePath, { scroll: false });
      }
      setState('loading');
      setError(null);
      try {
        const res = await post<{ total: number; cards: AnimalCard[]; interpreted: string[] }>('search', { q: next.q ?? '', filters: next, limit: 60 });
        setResult(res);
        setState('done');
      } catch (e) {
        setError((e as Error).message);
        setState('error');
      }
    },
    [basePath, router],
  );

  const set = useCallback((patch: Partial<FilterState>) => apply({ ...filters, ...patch }), [apply, filters]);
  const patchFilters = filters;
  const summary = useMemo(() => describe(filters), [filters]);

  return { filters: patchFilters, set, apply, state, result, error, summary, searchParams };
}

export function describe(f: FilterState): string[] {
  const out: string[] = [];
  if (f.q) out.push(`“${f.q}”`);
  if (f.category) out.push(f.category);
  if (f.species) out.push(f.species.replace(/-/g, ' '));
  if (f.sex) out.push(f.sex.toLowerCase());
  if (f.minPrice || f.maxPrice) out.push(`$${f.minPrice ?? 0}–$${f.maxPrice ?? '∞'}`);
  if (f.state) out.push(`in ${f.state}`);
  if (f.experience) out.push(`${f.experience.toLowerCase()} care`);
  if (f.size) out.push(`${f.size.toLowerCase()} species`);
  if (f.verifiedOnly) out.push('verified breeders');
  if (f.captiveBredOnly) out.push('captive-bred');
  if (f.maxAgeMonths) out.push(`≤ ${f.maxAgeMonths} months`);
  return out;
}

/** Interpret free text into filters through the server parser (spec §11). */
export async function interpretQuery(q: string): Promise<{ filters: FilterState; interpreted: string[] }> {
  const res = await post<{ filters: FilterState; interpreted: string[] }>('search', { q, limit: 1 });
  return { filters: res.filters, interpreted: res.interpreted };
}

export const SORTS: { value: FilterState['sort']; label: string }[] = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'newest', label: 'Newest' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'rating', label: 'Breeder rating' },
];

export function FilterChipRow({ filters, onRemove }: { filters: FilterState; onRemove: (key: keyof FilterState) => void }) {
  const chips: [string, keyof FilterState][] = [];
  if (filters.q) chips.push([`“${filters.q}”`, 'q']);
  if (filters.category) chips.push([filters.category, 'category']);
  if (filters.species) chips.push([filters.species.replace(/-/g, ' '), 'species']);
  if (filters.sex) chips.push([filters.sex.toLowerCase(), 'sex']);
  if (filters.minPrice) chips.push([`min $${filters.minPrice}`, 'minPrice']);
  if (filters.maxPrice) chips.push([`max $${filters.maxPrice}`, 'maxPrice']);
  if (filters.state) chips.push([filters.state, 'state']);
  if (filters.experience) chips.push([`${filters.experience.toLowerCase()} care`, 'experience']);
  if (filters.size) chips.push([`${filters.size.toLowerCase()} size`, 'size']);
  if (filters.verifiedOnly) chips.push(['verified breeders', 'verifiedOnly']);
  if (filters.captiveBredOnly) chips.push(['captive-bred', 'captiveBredOnly']);
  if (filters.maxAgeMonths) chips.push([`≤ ${filters.maxAgeMonths} mo`, 'maxAgeMonths']);
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {chips.map(([label, key]) => (
        <button key={String(key)} className="chip" onClick={() => onRemove(key)}>
          {label}
          <Icon name="close" size={12} />
        </button>
      ))}
    </div>
  );
}
