'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { Badge } from '@/components/ui/primitives';

const titleCase = (value: string) =>
  value.toLowerCase().replace(/_/g, ' ').replace(/(^|\s)([a-z])/g, (_m, sp, ch) => sp + ch.toUpperCase());
import { renderMarkdown } from '@/lib/ui/markdown';
import type { Doc } from '@/lib/ui/static-content';

export type DocStats =
  | { kind: 'rulebook'; states: number; rules: number; species: number; checks: number; restricted: number }
  | {
      kind: 'documents';
      rows: { doc_type: string; stage: string; mandatory: number; description: string; scope_species: string; scope_jurisdiction: string }[];
    }
  | null;

/**
 * DESKTOP policy page — long-form editorial column with a sticky contents rail,
 * live rulebook numbers, and the related documents as full-width cards.
 */
export function DesktopDoc({ doc, stats }: { doc: Doc; stats?: DocStats }) {
  const toc = doc.sections.map((s) => ({
    id: s.heading.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim().replace(/\s+/g, '-'),
    text: s.heading,
  }));

  return (
    <article className="shell py-12">
      <nav className="flex items-center gap-1.5 text-[12.5px] text-[var(--muted)]">
        <Link href="/" className="hover:text-[var(--ink)]">
          FAUNAL
        </Link>
        <Icon name="chevronRight" size={12} />
        <span>{doc.kind}</span>
        <Icon name="chevronRight" size={12} />
        <span className="text-[var(--ink)]">{doc.title}</span>
      </nav>

      <header className="mt-6 max-w-[62ch]">
        <p className="eyebrow">
          {doc.kind} · updated {doc.updated}
        </p>
        <h1 className="h1 mt-2">{doc.title}</h1>
        <p className="lede mt-4">{doc.lede}</p>
      </header>

      {stats?.kind === 'rulebook' ? (
        <div className="mt-8 grid max-w-[900px] grid-cols-5 gap-4 border-y border-[var(--line)] py-5">
          {[
            ['States reviewed', stats.states],
            ['Recorded restrictions', stats.rules],
            ['Species tracked', stats.species],
            ['Evaluations run', stats.checks],
            ['Prohibited pairings blocked', stats.restricted],
          ].map(([label, value]) => (
            <div key={String(label)}>
              <p className="h3">{Number(value).toLocaleString('en-US')}</p>
              <p className="mt-1 text-[12px] leading-snug text-[var(--muted)]">{String(label)}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-9 grid grid-cols-[minmax(0,1fr)_260px] items-start gap-12">
        <div className="max-w-[72ch]">
          {doc.sections.map((s) => {
            const id = s.heading.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim().replace(/\s+/g, '-');
            return (
              <section key={s.heading} id={id} style={{ scrollMarginTop: 96 }}>
                <h2 className="h3 mt-9 first:mt-0">{s.heading}</h2>
                <div className="mt-1">{renderMarkdown(s.body)}</div>
              </section>
            );
          })}

          {stats?.kind === 'documents' ? (
            <section className="mt-10">
              <h2 className="h3">Document types we accept</h2>
              <div className="mt-4 overflow-hidden rounded-xl border border-[var(--line)]">
                <table className="w-full text-left text-[13px]">
                  <thead className="bg-[var(--surface-2)] text-[11.5px] uppercase tracking-[.08em] text-[var(--muted)]">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Document</th>
                      <th className="px-4 py-2.5 font-medium">Required at</th>
                      <th className="px-4 py-2.5 font-medium">Scope</th>
                      <th className="px-4 py-2.5 font-medium">What it has to show</th>
                      <th className="px-4 py-2.5 font-medium">Obligatory</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line)] bg-[var(--surface)]">
                    {stats.rows.map((r) => (
                      <tr key={`${r.doc_type}-${r.scope_species}-${r.scope_jurisdiction}`}>
                        <td className="px-4 py-3 font-medium">{titleCase(r.doc_type)}</td>
                        <td className="px-4 py-3">{titleCase(r.stage)}</td>
                        <td className="px-4 py-3 text-[var(--muted)]">
                          {r.scope_species}
                          {r.scope_jurisdiction !== 'Any jurisdiction' ? ` · ${r.scope_jurisdiction}` : ''}
                        </td>
                        <td className="max-w-[380px] px-4 py-3 text-[var(--muted)]">{r.description}</td>
                        <td className="px-4 py-3">
                          <Badge tone={r.mandatory ? 'ink' : 'quiet'}>{r.mandatory ? 'always' : 'if applicable'}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </div>

        <aside className="sticky top-[86px] space-y-4">
          <div className="card-quiet p-4">
            <p className="label">On this page</p>
            <ul className="mt-2 space-y-1.5">
              {toc.map((t) => (
                <li key={t.id}>
                  <a href={`#${t.id}`} className="block text-[13px] leading-snug text-[var(--muted)] hover:text-[var(--ink)]">
                    {t.text}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className="card p-4">
            <p className="label">Need a decision on your case</p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--muted)]">
              The compliance desk answers legality questions about a specific animal and address, Monday to Saturday.
            </p>
            <div className="mt-3 space-y-2">
              <Link href="/assistant" className="btn btn-sm btn-block">
                <Icon name="sparkle" size={15} /> Ask the assistant
              </Link>
              <Link href="/report" className="btn btn-quiet btn-sm btn-block">
                <Icon name="flag" size={15} /> Report a listing
              </Link>
            </div>
          </div>

          {doc.slug.startsWith('compliance') ? (
            <div className="card p-4">
              <p className="label">Rulebook status</p>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--muted)]">
                Rules are re-read when a state agency publishes a change. Citations sit next to every rule so you can verify them yourself.
              </p>
              <Link href="/admin/rules" className="btn btn-ghost btn-sm mt-3 w-full">
                Browse the rulebook
              </Link>
            </div>
          ) : null}
        </aside>
      </div>

      {doc.related?.length ? (
        <div className="mt-12 border-t border-[var(--line)] pt-7">
          <p className="label">Related</p>
          <div className="mt-3 grid grid-cols-3 gap-4">
            {doc.related.map((r) => (
              <Link key={r.href} href={r.href} className="group-card flex items-start gap-3 p-4">
                <Icon name="doc" size={17} className="mt-0.5 text-[var(--accent-soft)]" />
                <span>
                  <span className="block text-[14px] font-medium">{r.label}</span>
                  <span className="mt-0.5 block text-[12.5px] leading-relaxed text-[var(--muted)]">{r.blurb}</span>
                </span>
                <Icon name="chevronRight" size={15} className="ml-auto mt-0.5 shrink-0 text-[var(--muted)] transition-transform group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <footer className="mt-12 flex items-center gap-2 border-t border-[var(--line)] pt-5 text-[12px] text-[var(--muted)]">
        <Badge icon="shield">FAUNAL Trust &amp; Compliance</Badge>
        <span>
          {doc.title} · last reviewed {doc.updated} · not legal advice
        </span>
      </footer>
    </article>
  );
}
