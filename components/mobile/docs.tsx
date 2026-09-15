'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { Badge } from '@/components/ui/primitives';
import { Accordion } from '@/components/ui/interactions';
import { renderMarkdown } from '@/lib/ui/markdown';
import type { Doc } from '@/lib/ui/static-content';
import type { DocStats } from '@/components/desktop/docs';

/**
 * MOBILE policy page — the same document, restructured for a phone: a short
 * lede, every section as an accordion (read only what you need), stats as a
 * scannable row, related links as full-width rows.
 */
export function MobileDoc({ doc, stats }: { doc: Doc; stats?: DocStats }) {
  return (
    <article className="pb-10">
      <div className="px-4 pb-4 pt-3">
        <p className="eyebrow">
          {doc.kind} · {doc.updated}
        </p>
        <h1 className="h2 mt-1.5">{doc.title}</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--muted)]">{doc.lede}</p>
      </div>

      {stats?.kind === 'rulebook' ? (
        <div className="hscroll flex gap-2 px-4 pb-4">
          {[
            ['States', stats.states],
            ['Rules', stats.rules],
            ['Species', stats.species],
            ['Checks', stats.checks],
            ['Blocked', stats.restricted],
          ].map(([label, value]) => (
            <div key={String(label)} className="shrink-0 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-center">
              <p className="h4">{Number(value).toLocaleString('en-US')}</p>
              <p className="mt-0.5 text-[11px] text-[var(--muted)]">{String(label)}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="px-4">
        {doc.sections.map((s, i) => (
          <Accordion key={s.heading} title={s.heading} defaultOpen={i === 0} meta={`${i + 1}/${doc.sections.length}`}>
            <div className="pb-1">{renderMarkdown(s.body)}</div>
          </Accordion>
        ))}

        {stats?.kind === 'documents' ? (
          <div className="mt-3 space-y-2">
            <p className="label">Document types we accept</p>
            {stats.rows.map((r) => (
              <div key={r.doc_type} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3.5">
                <p className="text-[14px] font-medium">{titleCase(r.doc_type)}</p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--muted)]">{r.description}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge icon="clock">{titleCase(r.stage)}</Badge>
                  <Badge>{r.scope_species}</Badge>
                  {r.scope_jurisdiction !== 'Any jurisdiction' ? <Badge icon="location">{r.scope_jurisdiction}</Badge> : null}
                  {r.mandatory ? <Badge tone="ink">always required</Badge> : null}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {doc.related?.length ? (
        <div className="mt-5 px-4">
          <p className="label">Related</p>
          <ul className="mt-2 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)]">
            {doc.related.map((r) => (
              <li key={r.href} className="border-b border-[var(--line)] last:border-0">
                <Link href={r.href} className="flex items-center gap-3 px-4 py-3.5">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-medium">{r.label}</span>
                    <span className="block text-[12px] text-[var(--muted)]">{r.blurb}</span>
                  </span>
                  <Icon name="chevronRight" size={16} className="text-[var(--muted)]" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-5 flex gap-2 px-4">
        <Link href="/assistant" className="btn btn-quiet btn-sm flex-1">
          <Icon name="sparkle" size={15} /> Ask a question
        </Link>
        <Link href="/report" className="btn btn-quiet btn-sm flex-1">
          <Icon name="flag" size={15} /> Report
        </Link>
      </div>

      <p className="mt-5 px-4 text-[11px] leading-relaxed text-[var(--muted)]">
        Reviewed {doc.updated}. FAUNAL’s rulebook is our reading of published regulation and is not legal advice.
      </p>
    </article>
  );
}

function titleCase(value: string) {
  return value
    .toLowerCase()
    .split('_')
    .map((w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}
