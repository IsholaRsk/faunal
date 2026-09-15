'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { EmptyState } from '@/components/ui/primitives';
import { DesktopAnimalCard } from '@/components/ui/cards';
import { useSearch, type SearchSeed } from '@/components/shared/search-state';
import { money } from '@/lib/ui/screen-helpers';

/**
 * DESKTOP search — a wide field with the parsed intent shown as removable chips
 * over a 4-column result grid. Recent and popular terms live in the same field.
 */
export function DesktopSearch({ seed }: { seed: SearchSeed }) {
  const s = useSearch(seed);
  const has = s.q.trim().length > 0 || s.result.total > 0;

  return (
    <div className="shell py-10">
      <div className="mx-auto max-w-[760px] text-center">
        <p className="eyebrow">Search FAUNAL</p>
        <h1 className="h1 mt-2">Ask in plain English.</h1>
        <p className="lede mx-auto mt-3 max-w-[54ch]">
          “female ball python under $600 for a first-time keeper in New York” becomes real filters. Legality is still decided by the rulebook, never by the
          interpreter.
        </p>
      </div>

      <form
        className="mx-auto mt-7 flex max-w-[820px] items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface)] p-2 pl-5 transition-colors focus-within:border-[var(--ink)]"
        onSubmit={(e) => {
          e.preventDefault();
          s.submit();
        }}
      >
        <Icon name="search" size={19} className="shrink-0 text-[var(--muted)]" />
        <input
          className="h-11 min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-[#a3a39c]"
          placeholder="Species, morph, sex, budget, experience level…"
          value={s.q}
          autoFocus
          onChange={(e) => s.setQ(e.target.value)}
        />
        {s.q ? (
          <button type="button" className="icon-btn" aria-label="Clear" onClick={() => s.setQ('')}>
            <Icon name="close" size={16} />
          </button>
        ) : null}
        <button className="btn h-11 shrink-0" disabled={s.busy}>
          {s.busy ? 'Searching…' : 'Search'}
        </button>
      </form>

      {s.error ? <p className="mt-3 text-center text-[13px] text-[var(--error)]">{s.error}</p> : null}

      {!has ? (
        <div className="mx-auto mt-10 grid max-w-[1000px] grid-cols-3 gap-6">
          <Panel title="Recent searches" icon="clock">
            {seed.recent.length ? (
              <ul className="space-y-1">
                {seed.recent.map((r) => (
                  <li key={r}>
                    <button className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[13.5px] hover:bg-[var(--surface-2)]" onClick={() => s.run(r)}>
                      <Icon name="clock" size={14} className="text-[var(--muted)]" /> <span className="truncate">{r}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-2 text-[13px] text-[var(--muted)]">Nothing yet — your last searches will appear here on this account.</p>
            )}
          </Panel>
          <Panel title="Popular right now" icon="chart">
            <ul className="space-y-1">
              {seed.popular.map((r) => (
                <li key={r}>
                  <button className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[13.5px] hover:bg-[var(--surface-2)]" onClick={() => s.run(r)}>
                    <Icon name="search" size={14} className="text-[var(--muted)]" /> <span className="truncate">{r}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Suggested for you" icon="sparkle">
            <div className="flex flex-wrap gap-1.5 px-2">
              {seed.suggestions.map((sg) => (
                <button key={`${sg.kind}-${sg.value}`} className="chip" onClick={() => s.run(sg.value)}>
                  {sg.label}
                </button>
              ))}
            </div>
            <div className="mt-3 px-2">
              <Link href="/animals" className="btn btn-quiet btn-sm w-full">
                Browse the full catalogue
              </Link>
            </div>
          </Panel>
        </div>
      ) : (
        <>
          <div className="mt-7 flex flex-wrap items-center gap-2">
            <span className="text-[13px] text-[var(--muted)]">
              {s.busy ? 'Searching…' : `${s.result.total} animal${s.result.total === 1 ? '' : 's'} match`}
            </span>
            {s.active.map((c) => (
              <button key={c.key} className="chip" onClick={() => s.dropChip(c.key)} title="Remove this filter">
                {c.label} <Icon name="close" size={12} />
              </button>
            ))}
            <Link href={`/animals?q=${encodeURIComponent(s.q)}`} className="chip">
              Open in Browse <Icon name="chevronRight" size={12} />
            </Link>
          </div>

          {s.result.interpreted.length ? (
            <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--muted)]">
              <Icon name="sparkle" size={13} className="mr-1 inline align-[-2px] text-[var(--accent-soft)]" />
              Read as: {s.result.interpreted.join(' · ')}
            </p>
          ) : null}

          {s.result.cards.length ? (
            <div className="mt-6 grid grid-cols-4 gap-5">
              {s.result.cards.map((c) => (
                <DesktopAnimalCard key={String(c.id)} animal={c as never} />
              ))}
            </div>
          ) : (
            <div className="py-12">
              <EmptyState
                icon="search"
                title={`No match for “${s.q}”`}
                body="Try a species name, a morph, a budget (“under $800”), or a phrase like “quiet, small, beginner”. Only approved listings inside your state’s rulebook are searchable."
                action={
                  <div className="flex gap-2">
                    <Link href="/animals" className="btn">
                      Browse all animals
                    </Link>
                    <Link href="/assistant" className="btn btn-quiet">
                      Ask the assistant
                    </Link>
                  </div>
                }
              />
            </div>
          )}

          {seed.suggestions.length && s.result.cards.length ? (
            <div className="mt-10 border-t border-[var(--line)] pt-6">
              <p className="label">Refine</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {seed.suggestions.map((sg) => (
                  <button key={`r-${sg.value}`} className="chip" onClick={() => s.run(sg.value)}>
                    {sg.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function Panel({ title, icon, children }: { title: string; icon: 'clock' | 'chart' | 'sparkle'; children: React.ReactNode }) {
  return (
    <section className="card p-4">
      <p className="label flex items-center gap-1.5">
        <Icon name={icon} size={14} className="text-[var(--muted)]" /> {title}
      </p>
      <div className="mt-2">{children}</div>
    </section>
  );
}

export { money };
