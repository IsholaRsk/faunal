'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { post } from '@/lib/ui/api';
import { useApp } from '@/lib/ui/app-provider';

export interface SearchPayload {
  total: number;
  cards: Record<string, string | number | null>[];
  filters: Record<string, string | number | null>;
  interpreted: string[];
}

export interface SearchSeed extends SearchPayload {
  q: string;
  recent: string[];
  popular: string[];
  suggestions: { kind: 'species' | 'category' | 'saved'; label: string; value: string }[];
}

const FILTER_LABELS: Record<string, string> = {
  q: 'text',
  category: 'category',
  speciesId: 'species',
  species: 'species',
  morphId: 'morph',
  sex: 'sex',
  availability: 'availability',
  level: 'care level',
  minPrice: 'min price',
  maxPrice: 'max price',
  minAgeMonths: 'min age (months)',
  maxAgeMonths: 'max age (months)',
  size: 'size',
  experience: 'experience',
  state: 'state',
  breederId: 'breeder',
  featuredOnly: 'featured only',
  documentedOnly: 'documented only',
  sort: 'sort',
};

/** Turns a filter object into removable chips, then re-queries without that key. */
export function chipsFor(filters: Record<string, string | number | null>) {
  return Object.entries(filters)
    .filter(([k, v]) => k !== 'q' && k !== 'sort' && v !== null && v !== undefined && v !== '')
    .map(([k, v]) => {
      const numeric = typeof v === 'number' || /^\d+$/.test(String(v));
      const price = k.toLowerCase().includes('price');
      const shown = price
        ? `$${Number(v).toLocaleString('en-US')}`
        : numeric
          ? String(v)
          : String(v)
              .replace(/_/g, ' ')
              .replace(/-/g, ' ')
              .toLowerCase()
              .replace(/(^|\s)([a-z])/g, (_m, sp, ch) => sp + ch.toUpperCase());
      return { key: k, label: `${FILTER_LABELS[k] ?? k}: ${shown}` };
    });
}

export function useSearch(seed: SearchSeed) {
  const router = useRouter();
  const { user } = useApp();
  const [q, setQ] = useState(seed.q);
  const [result, setResult] = useState<SearchPayload>({ total: seed.total, cards: seed.cards, filters: seed.filters, interpreted: seed.interpreted });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Filters the parser applied that the user has explicitly switched off.
  const [removals, setRemovals] = useState<string[]>([]);
  const [extra, setExtra] = useState<Record<string, string | number | null>>({});

  const run = useCallback(
    async (nextQ: string, more: Record<string, string | number | null> = {}) => {
      setBusy(true);
      setError(null);
      const filters = { ...more, ...Object.fromEntries(removals.map((k) => [k, null])) };
      try {
        const res = await post<SearchPayload>('search', { q: nextQ, filters, limit: 24 });
        setResult(res);
        if (nextQ.trim()) router.replace(`/search?q=${encodeURIComponent(nextQ.trim())}`, { scroll: false });
        if (user) router.refresh();
        return res;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Search failed.');
        return null;
      } finally {
        setBusy(false);
      }
    },
    [router, user, removals],
  );

  function submit(next = q) {
    void run(next.trim());
  }

  function dropChip(key: string) {
    setRemovals((r) => [...r, key]);
    void run(q, { ...extra, [key]: null });
  }

  function toggle(key: string, value: string | number | null) {
    const next = { ...extra, [key]: extra[key] === value ? null : value };
    setExtra(next);
    void run(q, next);
  }

  const active = chipsFor(result.filters);

  return { q, setQ, result, busy, error, submit, run, active, dropChip, toggle, extra, removals };
}
