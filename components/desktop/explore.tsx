'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { DesktopAnimalCard } from '@/components/ui/cards';
import { CardSkeleton, EmptyState, ErrorNote } from '@/components/ui/primitives';
import { SORTS, activeFilterCount, describe, useExplore, type ExploreResult } from '@/components/shared/explore-state';
import type { FilterState } from '@/domain/types';
import { post } from '@/lib/ui/api';

/**
 * DESKTOP explore — the classic marketplace browse: persistent left rail with
 * faceted filters + sorting, wide 4-column result grid, sticky result header.
 */
export function DesktopExplore({
  initial,
  facets,
  basePath = '/animals',
  heading = 'All animals',
  intro,
  initialResult,
}: {
  initial: FilterState;
  facets: Facets;
  basePath?: string;
  heading?: string;
  intro?: string;
  initialResult?: ExploreResult | null;
}) {
  const { filters, set, state, result, error } = useExplore(initial, basePath, initialResult);
  const cards = result?.cards ?? [];
  const total = result?.total ?? 0;
  const [applied, setApplied] = useState<FilterState>(initial);

  return (
    <div className="shell py-8">
      <div className="mb-6 flex items-end justify-between gap-8 border-b border-[var(--line)] pb-6">
        <div>
          <p className="eyebrow">Marketplace</p>
          <h1 className="h2 mt-1.5">{heading}</h1>
          {intro ? <p className="lede mt-2 max-w-[68ch]">{intro}</p> : null}
          {describe(applied).length ? (
            <p className="mt-3 text-[13px] text-[var(--muted)]">
              Interpreted as <span className="text-[var(--ink)]">{describe(applied).join(' · ')}</span>
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-3 pb-1">
          <span className="text-[13px] text-[var(--muted)]">{state === 'loading' ? 'Searching…' : `${total} animal${total === 1 ? '' : 's'} available`}</span>
          <label className="flex items-center gap-2">
            <span className="text-[13px] text-[var(--muted)]">Sort</span>
            <select
              className="select h-10 w-[190px] text-[13px]"
              value={filters.sort ?? 'relevance'}
              onChange={(e) => {
                const next = { ...filters, sort: e.target.value as FilterState['sort'] };
                setApplied(next);
                set({ sort: next.sort });
              }}
            >
              {SORTS.map((s) => (
                <option key={String(s.value)} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="grid grid-cols-[264px_1fr] gap-10">
        <DesktopFilterRail
          facets={facets}
          filters={filters}
          onApply={(next) => {
            setApplied(next);
            set(next);
          }}
        />
        <div>
          {state === 'error' ? <ErrorNote>{error}</ErrorNote> : null}
          {state === 'loading' ? (
            <div className="grid-products">
              {Array.from({ length: 8 }).map((_, i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          ) : cards.length === 0 ? (
            <EmptyState
              icon="search"
              title="No animals match those filters"
              body="Try widening the price range, clearing the state filter, or searching a species instead of a morph."
              action={<Link href="/animals" className="btn btn-quiet">Clear filters</Link>}
            />
          ) : (
            <>
              <div className="grid-products">
                {cards.map((a, i) => (
                  <DesktopAnimalCard key={a.id} animal={a} index={i} />
                ))}
              </div>
              <p className="mt-8 border-t border-[var(--line)] pt-4 text-[12.5px] text-[var(--muted)]">
                Showing {cards.length} of {total}. Legality is re-evaluated for your ship-to state at checkout — listings blocked there are
                hidden from this view.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export interface Facets {
  categories: { value: string; label: string; count: number }[];
  species: { value: string; label: string; count: number }[];
  morphs: { value: string; label: string; count: number }[];
  sexes: { value: string; label: string; count: number }[];
  states: { value: string; label: string; count: number }[];
  experience: { value: string; label: string; count: number }[];
  price: { min_cents: number | null; max_cents: number | null };
  availableTotal: number;
}

export function DesktopFilterRail({ facets, filters, onApply }: { facets: Facets; filters: FilterState; onApply: (f: FilterState) => void }) {
  const [local, setLocal] = useState<FilterState>(filters);
  useEffect(() => setLocal(filters), [filters]);
  const count = activeFilterCount(local);
  const set2 = (patch: Partial<FilterState>) => setLocal((prev) => ({ ...prev, ...patch }));

  return (
    <aside className="sticky top-[86px] self-start">
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">Filters</h2>
        {count ? (
          <button className="text-[12.5px] text-[var(--ink)] underline underline-offset-4" onClick={() => { setLocal({}); onApply({}); }}>
            Clear {count}
          </button>
        ) : null}
      </div>

      <Group title="Search">
        <div className="input-group">
          <span className="pl-3 text-[var(--muted)]">
            <Icon name="search" size={15} />
          </span>
          <input
            className="input border-0"
            placeholder="ball python under $600"
            value={local.q ?? ''}
            onChange={(e) => set2({ q: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && onApply(local)}
          />
        </div>
        <p className="field-hint">Natural language works: “female ball python under $600 near New York”.</p>
      </Group>

      <Group title="Category">
        <FacetList
          items={facets.categories}
          value={local.category}
          onPick={(v) => onApply({ ...local, category: v })}
        />
      </Group>

      <Group title="Species">
        <FacetList items={facets.species.slice(0, 8)} value={local.species} onPick={(v) => onApply({ ...local, species: v })} searchable={facets.species} />
      </Group>

      <Group title="Sex">
        <div className="flex gap-2">
          {['FEMALE', 'MALE'].map((s) => (
            <button
              key={s}
              className="chip"
              data-active={local.sex === s}
              onClick={() => onApply({ ...local, sex: local.sex === s ? undefined : (s as FilterState['sex']) })}
            >
              {s.toLowerCase()}
            </button>
          ))}
        </div>
      </Group>

      <Group title="Price (USD)">
        <div className="flex items-center gap-2">
          <NumberBox label="Min" value={local.minPrice} onChange={(v) => set2({ minPrice: v })} />
          <span className="mt-4 text-[var(--muted)]">—</span>
          <NumberBox label="Max" value={local.maxPrice} onChange={(v) => set2({ maxPrice: v })} />
        </div>
        <input
          type="range"
          className="range mt-3"
          min={0}
          max={15000}
          step={50}
          value={local.maxPrice ?? 15000}
          onChange={(e) => set2({ maxPrice: Number(e.target.value) })}
        />
        <p className="field-hint">
          Catalogue spans {Math.round((facets.price.min_cents ?? 0) / 100)} – {Math.round((facets.price.max_cents ?? 0) / 100).toLocaleString()} USD.
        </p>
        <button className="btn btn-quiet btn-sm mt-2 w-full" onClick={() => onApply(local)}>
          Apply price
        </button>
      </Group>

      <Group title="Ship to / origin">
        <select className="select" value={local.state ?? ''} onChange={(e) => onApply({ ...local, state: e.target.value || undefined })}>
          <option value="">Any state</option>
          {facets.states.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label} ({s.count})
            </option>
          ))}
        </select>
      </Group>

      <Group title="Experience level">
        <div className="flex flex-wrap gap-2">
          {['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT'].map((x) => (
            <button
              key={x}
              className="chip"
              data-active={local.experience === x}
              onClick={() => onApply({ ...local, experience: local.experience === x ? undefined : (x as FilterState['experience']) })}
            >
              {x.charAt(0) + x.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </Group>

      <Group title="Adult size">
        <div className="flex gap-2">
          {(['SMALL', 'MEDIUM', 'LARGE'] as const).map((s) => (
            <button key={s} className="chip" data-active={local.size === s} onClick={() => onApply({ ...local, size: local.size === s ? undefined : s })}>
              {s.charAt(0) + s.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </Group>

      <Group title="Seller & status" last>
        <label className="check">
          <input type="checkbox" checked={!!local.verifiedOnly} onChange={(e) => onApply({ ...local, verifiedOnly: e.target.checked })} />
          Verified breeders only
        </label>
        <label className="check">
          <input type="checkbox" checked={!!local.captiveBredOnly} onChange={(e) => onApply({ ...local, captiveBredOnly: e.target.checked })} />
          Captive-bred only
        </label>
        <label className="check">
          <input type="checkbox" checked={local.availableOnly !== false} onChange={(e) => onApply({ ...local, availableOnly: e.target.checked })} />
          Available now
        </label>
      </Group>

      <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-3.5 text-[12px] leading-relaxed text-[var(--muted)]">
        <b className="text-[var(--ink)]">{facets.availableTotal}</b> listings are cleared for sale right now. Species that are prohibited in your
        state are filtered out automatically.
      </div>
    </aside>
  );
}

function Group({ title, children, last }: { title: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div className={`desktop-filter ${last ? 'border-b-0' : ''}`}>
      <div className="mb-2.5 text-[12.5px] font-semibold tracking-[-0.01em]">{title}</div>
      {children}
    </div>
  );
}

function FacetList({ items, value, onPick, searchable }: { items: { value: string; label: string; count: number }[]; value?: string; onPick: (v: string | undefined) => void; searchable?: { value: string; label: string; count: number }[] }) {
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const source = searchable ?? items;
    const filtered = q ? source.filter((i) => i.label.toLowerCase().includes(q.toLowerCase())) : source;
    return filtered.slice(0, 10);
  }, [items, q, searchable]);
  return (
    <div>
      {searchable ? (
        <input className="input mb-2 h-9 text-[13px]" placeholder="Find species" value={q} onChange={(e) => setQ(e.target.value)} />
      ) : null}
      <ul className="space-y-0.5">
        <li>
          <button onClick={() => onPick(undefined)} className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[13.5px] ${!value ? 'bg-[var(--surface-2)] font-medium' : 'text-[var(--muted)] hover:bg-[var(--surface-2)]'}`}>
            All <span className="chip-count">{searchable?.reduce((s, i) => s + i.count, 0) ?? items.reduce((s, i) => s + i.count, 0)}</span>
          </button>
        </li>
        {list.map((i) => (
          <li key={i.value}>
            <button
              onClick={() => onPick(value === i.value ? undefined : i.value)}
              className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[13.5px] ${value === i.value ? 'bg-[var(--ink)] text-white' : 'hover:bg-[var(--surface-2)]'}`}
            >
              <span className="truncate capitalize">{i.label}</span>
              <span className={`chip-count ${value === i.value ? 'text-white/70' : ''}`}>{i.count}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function NumberBox({ label, value, onChange, prefix = '$' }: { label: string; value?: number; onChange: (v: number | undefined) => void; prefix?: string }) {
  return (
    <label className="flex-1">
      <span className="label">{label}</span>
      <div className="input-group">
        <span className="pl-2.5 text-[var(--muted)]">{prefix}</span>
        <input
          className="input h-10 text-[13.5px]"
          inputMode="numeric"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value.replace(/[^0-9.]/g, '')) : undefined)}
        />
      </div>
    </label>
  );
}
