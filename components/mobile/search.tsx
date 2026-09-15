'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { MobileHeader } from '@/components/shell/mobile';
import { Media, Money, EmptyState } from '@/components/ui/primitives';
import { useSearch, type SearchSeed } from '@/components/shared/search-state';
import { titleCaseOr, relTime } from '@/lib/ui/screen-helpers';

/**
 * MOBILE search — a dedicated screen: field pinned under the header, then
 * recent / popular / suggested lists, replaced by results once there is a query.
 */
export function MobileSearch({ seed }: { seed: SearchSeed }) {
  const s = useSearch(seed);
  const started = s.q.trim().length > 0 || s.result.cards.length > 0;

  return (
    <div className="pb-8">
      <MobileHeader title="Search" back="/" />

      <div className="sticky top-0 z-20 bg-[color-mix(in_srgb,var(--canvas)_92%,transparent)] px-4 pb-3 pt-1 backdrop-blur">
        <form
          className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3"
          onSubmit={(e) => {
            e.preventDefault();
            s.submit();
          }}
        >
          <Icon name="search" size={18} className="shrink-0 text-[var(--muted)]" />
          <input
            className="h-12 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-[#a3a39c]"
            placeholder="Species, morph, budget…"
            value={s.q}
            autoFocus
            enterKeyHint="search"
            onChange={(e) => s.setQ(e.target.value)}
          />
          {s.q ? (
            <button type="button" className="icon-btn" aria-label="Clear" onClick={() => s.setQ('')}>
              <Icon name="close" size={16} />
            </button>
          ) : null}
        </form>
        {s.active.length ? (
          <div className="hscroll mt-2 flex gap-1.5">
            {s.active.map((c) => (
              <button key={c.key} className="chip" onClick={() => s.dropChip(c.key)}>
                {c.label} <Icon name="close" size={12} />
              </button>
            ))}
          </div>
        ) : null}
        {s.result.interpreted.length ? (
          <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--muted)]">Read as {s.result.interpreted.join(' · ')}</p>
        ) : null}
        {s.error ? <p className="mt-2 text-[12px] text-[var(--error)]">{s.error}</p> : null}
      </div>

      {!started ? (
        <div className="px-4 pt-2">
          {seed.recent.length ? (
            <>
              <ListTitle icon="clock" title="Recent" action={<button className="text-[12px] text-[var(--muted)]" onClick={() => s.run('')}>clear</button>} />
              <ul className="-mx-4 mb-4">
                {seed.recent.map((r) => (
                  <li key={r} className="border-b border-[var(--line)] last:border-0">
                    <button className="flex w-full items-center gap-3 px-4 py-3 text-left" onClick={() => s.run(r)}>
                      <Icon name="clock" size={16} className="text-[var(--accent-soft)]" />
                      <span className="flex-1 text-[14px]">{r}</span>
                      <Icon name="chevronRight" size={15} className="text-[var(--muted)]" />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          <ListTitle icon="chart" title="Popular on FAUNAL" />
          <div className="flex flex-wrap gap-1.5">
            {seed.popular.map((r) => (
              <button key={r} className="chip py-2" onClick={() => s.run(r)}>
                {r}
              </button>
            ))}
          </div>

          <ListTitle icon="sparkle" title="Suggested" />
          <div className="flex flex-wrap gap-1.5">
            {seed.suggestions.map((sg) => (
              <button key={`${sg.kind}-${sg.value}`} className="chip py-2" onClick={() => s.run(sg.value)}>
                {sg.label}
              </button>
            ))}
          </div>

          <Link href="/explore" className="btn btn-quiet btn-block mt-5">
            Browse with filters instead
          </Link>
        </div>
      ) : s.busy && !s.result.cards.length ? (
        <div className="space-y-2.5 px-4 pt-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3">
              <span className="skeleton block h-16 w-16 shrink-0 rounded-lg" />
              <span className="flex-1 space-y-2 py-1">
                <span className="skeleton block h-3 w-2/3 rounded" />
                <span className="skeleton block h-3 w-1/3 rounded" />
              </span>
            </div>
          ))}
        </div>
      ) : s.result.cards.length ? (
        <ul className="space-y-2.5 px-4 pt-1">
          <li className="pb-1 text-[12.5px] text-[var(--muted)]">
            {s.result.total} animal{s.result.total === 1 ? '' : 's'} · <Link href="/explore" className="link">refine in Explore</Link>
          </li>
          {s.result.cards.map((c) => (
            <li key={String(c.id)}>
              <Link href={`/animals/${String(c.slug)}`} className="card flex gap-3 p-3">
                <Media media={{ path_medium: c.path_medium as string, path_small: c.path_small as string, base_path: c.base_path as string }} alt={String(c.name)} ratio="1 / 1" className="w-16 shrink-0 rounded-lg" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium">{String(c.name)}</span>
                  <span className="block truncate text-[12px] text-[var(--muted)]">
                    {String(c.species_name)}
                    {c.morph_name ? ` · ${String(c.morph_name)}` : ''} · {titleCaseOr(String(c.sex))}
                  </span>
                  <span className="mt-1.5 flex items-center justify-between">
                    <Money cents={Number(c.price_cents)} size="sm" />
                    <span className="text-[11px] text-[var(--muted)]">
                      {String(c.breeder_city ?? '')}, {String(c.state)} · {relTime(String(c.published_at ?? c.created_at))}
                    </span>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="px-4 pt-4">
          <EmptyState
            icon="search"
            title="No match"
            body="Say it differently — species first, then budget or size. Only approved listings legal in your state are searched."
            action={
              <Link href="/explore" className="btn">
                Open Explore
              </Link>
            }
          />
        </div>
      )}
    </div>
  );
}

function ListTitle({ icon, title, action }: { icon: 'clock' | 'chart' | 'sparkle'; title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-2 mt-4 flex items-center gap-2">
      <p className="label flex items-center gap-1.5">
        <Icon name={icon} size={13} className="text-[var(--muted)]" /> {title}
      </p>
      <span className="ml-auto">{action}</span>
    </div>
  );
}
