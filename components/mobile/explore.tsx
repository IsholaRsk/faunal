'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { MobileAnimalCard } from '@/components/ui/cards';
import { CardSkeleton, EmptyState, ErrorNote } from '@/components/ui/primitives';
import { Sheet, Segmented } from '@/components/ui/interactions';
import { MobileFilterForm } from '@/components/mobile/filters';
import { SORTS, activeFilterCount, useExplore , type ExploreResult } from '@/components/shared/explore-state';
import type { FilterState } from '@/domain/types';
import type { Facets } from '@/components/desktop/explore';
import { NumberBox } from '@/components/desktop/explore';

/**
 * MOBILE explore — an app browse screen: compact search entry, category strip,
 * filter + sort affordances (full-height sheet), 2-up grid, count line.
 * Structured from the mobile wireframe flow, not from the desktop rail (spec §10).
 */
export function MobileExplore({
  initial,
  facets,
  heading = 'Explore',
  basePath = '/explore',
  initialResult,
}: {
  initial: FilterState;
  facets: Facets;
  heading?: string;
  basePath?: string;
  initialResult?: ExploreResult | null;
}) {
  const router = useRouter();
  const { filters, set, state, result, error } = useExplore(initial, basePath, initialResult);
  const [sortOpen, setSortOpen] = useState(false);
  const cards = result?.cards ?? [];
  const total = result?.total ?? 0;
  const filterCount = activeFilterCount(filters);

  return (
    <div className="pb-4">
      <header className="mobile-header">
        <div className="mobile-sub flex items-center justify-between pt-2">
          <h1 className="font-display text-[24px] leading-none tracking-[-0.02em]">{heading}</h1>
          <Link href="/assistant" className="chip">
            <Icon name="sparkle" size={13} /> Ask AI
          </Link>
        </div>
        <div className="mobile-sub flex gap-2 pt-3">
          <Link href="/search" className="flex h-11 flex-1 items-center gap-2.5 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 text-[14px] text-[var(--muted)]">
            <Icon name="search" size={17} />
            <span className="truncate">{filters.q ? filters.q : 'Search species, morph, breeder'}</span>
          </Link>
          <button className="icon-btn border border-[var(--line)] bg-[var(--surface)]" onClick={() => setSortOpen(true)} aria-label="Sort results">
            <Icon name="sort" size={18} />
          </button>
        </div>
      </header>

      <div className="hscroll mt-1 px-4 pb-1">
        {facets.categories.map((c) => (
          <button key={c.value} className="chip shrink-0" data-active={filters.category === c.value} onClick={() => set({ category: filters.category === c.value ? undefined : c.value })}>
            {c.label}
            <span className="chip-count">{c.count}</span>
          </button>
        ))}
      </div>

      <div className="mobile-sub mt-3 flex items-center justify-between">
        <p className="text-[13px] text-[var(--muted)]">
          {state === 'loading' ? 'Searching…' : <><b className="text-[16px] font-semibold text-[var(--ink)]">{total}</b> Animals Available</>}
        </p>
        <FilterButton count={filterCount} facets={facets} filters={filters} onApply={set} />
      </div>

      <div className="mobile-sub mt-4">
        {state === 'error' ? <ErrorNote>{error}</ErrorNote> : null}
        {state === 'loading' ? (
          <div className="grid grid-cols-2 gap-x-3 gap-y-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : cards.length === 0 ? (
          <EmptyState
            icon="search"
            title="Nothing matches yet"
            body="Widen your price range or clear a filter. You can also ask the AI assistant to find a legal match in your state."
            action={<Link href="/assistant" className="btn btn-quiet">Ask the assistant</Link>}
          />
        ) : (
          <div className="grid grid-cols-2 gap-x-3 gap-y-6 stagger">
            {cards.map((a, i) => (
              <MobileAnimalCard key={a.id} animal={a} priority={i < 2} />
            ))}
          </div>
        )}
      </div>

      <Sheet open={sortOpen} onClose={() => setSortOpen(false)} title="Sort results">
        <div className="space-y-1.5">
          {SORTS.map((s) => (
            <button
              key={String(s.value)}
              className="list-row"
              onClick={() => {
                set({ sort: s.value });
                setSortOpen(false);
              }}
            >
              <span>{s.label}</span>
              {filters.sort === s.value ? <Icon name="check" size={16} /> : null}
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}

function FilterButton({ count, facets, filters, onApply }: { count: number; facets: Facets; filters: FilterState; onApply: (f: FilterState) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="chip" onClick={() => setOpen(true)} aria-label="Open filters">
        <Icon name="filter" size={14} /> Filters{count ? ` · ${count}` : ''}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Filters">
        <MobileFilterForm facets={facets} initial={filters} onApply={(next) => { onApply(next); setOpen(false); }} />
      </Sheet>
    </>
  );
}
