'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { MobileHeader } from '@/components/shell/mobile';
import { Media, Badge, EmptyState } from '@/components/ui/primitives';
import { renderMarkdown } from '@/lib/ui/markdown';
import { titleCaseOr } from '@/lib/ui/screen-helpers';

type Row = Record<string, string | number | null>;

/** MOBILE guides — card feed, then a focused reader with a bottom action bar. */
export function MobileGuides({ rows }: { rows: Row[] }) {
  return (
    <div className="pb-6">
      <MobileHeader title="Care guides" subtitle="Written by the FAUNAL husbandry desk" />
      <ul className="space-y-3 px-4 pt-3">
        {rows.map((g) => (
          <li key={String(g.id)}>
            <Link href={`/guides/${String(g.slug)}`} className="card overflow-hidden">
              <Media media={{ path_medium: g.cover_path ? String(g.cover_path) : null, base_path: null }} alt={String(g.title)} ratio="16 / 9" />
              <div className="p-3.5">
                <p className="text-[15px] font-medium leading-snug">{String(g.title)}</p>
                <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-relaxed text-[var(--muted)]">{String(g.excerpt)}</p>
                <div className="mt-2.5 flex items-center gap-2">
                  <Badge>{titleCaseOr(String(g.difficulty))}</Badge>
                  <span className="text-[11.5px] text-[var(--muted)]">{Number(g.reading_minutes)} min read</span>
                </div>
              </div>
            </Link>
          </li>
        ))}
        {!rows.length ? <EmptyState icon="book" title="No guides published yet" body="The care desk writes as the rulebook changes." /> : null}
      </ul>
    </div>
  );
}

export function MobileGuide({ guide, related }: { guide: Row; related: Row[] }) {
  return (
    <div className="pb-24">
      <MobileHeader title="Guide" back="/guides" />
      <article className="px-4 pt-1">
        <h1 className="h2">{String(guide.title)}</h1>
        <div className="mt-2 flex items-center gap-2 text-[12px] text-[var(--muted)]">
          <Badge tone="ink">{titleCaseOr(String(guide.difficulty))}</Badge>
          <span>{Number(guide.reading_minutes)} min</span>
          <span>·</span>
          <span>{String(guide.author_name)}</span>
        </div>
        <Media media={{ path_medium: guide.cover_path ? String(guide.cover_path) : null, base_path: null }} alt={String(guide.title)} ratio="4 / 3" className="mt-3.5 rounded-xl" />
        <p className="mt-3.5 text-[14px] leading-relaxed text-[var(--muted)]">{String(guide.excerpt)}</p>
        <div className="mt-1">{renderMarkdown(String(guide.body ?? ''))}</div>

        {related.length ? (
          <section className="mt-6">
            <p className="label">Next read</p>
            <ul className="mt-2 space-y-2">
              {related.slice(0, 3).map((g) => (
                <li key={String(g.id)}>
                  <Link href={`/guides/${String(g.slug)}`} className="card flex items-center gap-3 p-3">
                    <Media media={{ path_medium: g.cover_path ? String(g.cover_path) : null, base_path: null }} alt={String(g.title)} ratio="1 / 1" className="w-14 rounded-lg" />
                    <span className="min-w-0 flex-1 text-[13.5px] font-medium leading-snug">{String(g.title)}</span>
                    <Icon name="chevronRight" size={16} className="text-[var(--muted)]" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </article>

      <div className="sticky-cta-single">
        <Link href="/animals" className="btn btn-block">
          Browse animals this guide covers <Icon name="chevronRight" size={15} />
        </Link>
      </div>
    </div>
  );
}
