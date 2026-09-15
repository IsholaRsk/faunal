'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { Media, Badge, EmptyState } from '@/components/ui/primitives';
import { renderMarkdown, headingsOf } from '@/lib/ui/markdown';
import { titleCaseOr, relTime } from '@/lib/ui/screen-helpers';

type Row = Record<string, string | number | null>;

/** DESKTOP guides — magazine index, then a long-form article with a species rail. */
export function DesktopGuides({ rows, featured }: { rows: Row[]; featured: Row | null }) {
  const rest = rows.filter((r) => !featured || r.id !== featured.id);
  return (
    <div className="shell py-10">
      <header className="border-b border-[var(--line)] pb-6">
        <p className="eyebrow">Care desk</p>
        <h1 className="h1 mt-2 max-w-[24ch]">Keep the animal you can legally keep — well.</h1>
        <p className="lede mt-3 max-w-[64ch]">
          Written by our husbandry desk and reviewed against the same species records that drive the legality engine. No product placement, no affiliate
          links.
        </p>
      </header>

      {featured ? (
        <Link href={`/guides/${String(featured.slug)}`} className="mt-7 grid grid-cols-[1.15fr_1fr] items-center gap-9 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-7 transition-shadow hover:shadow-lift">
          <Media media={{ path_medium: featured.cover_path ? String(featured.cover_path) : null, base_path: null }} alt={String(featured.title)} ratio="16 / 10" />
          <div>
            <div className="flex items-center gap-2">
              <Badge tone="ink">New guide</Badge>
              <span className="text-[12px] text-[var(--muted)]">{Number(featured.reading_minutes)} min read</span>
            </div>
            <h2 className="h2 mt-3">{String(featured.title)}</h2>
            <p className="mt-3 text-[14.5px] leading-relaxed text-[var(--muted)]">{String(featured.excerpt)}</p>
            <p className="mt-4 flex items-center gap-1.5 text-[13px] font-medium">
              Read the guide <Icon name="chevronRight" size={15} />
            </p>
          </div>
        </Link>
      ) : null}

      <div className="mt-8 grid grid-cols-3 gap-6">
        {rest.map((g) => (
          <Link key={String(g.id)} href={`/guides/${String(g.slug)}`} className="group-card flex flex-col">
            <Media media={{ path_medium: g.cover_path ? String(g.cover_path) : null, base_path: null }} alt={String(g.title)} ratio="16 / 10" className="rounded-xl" />
            <p className="mt-3 text-[16px] font-medium leading-snug">{String(g.title)}</p>
            <p className="mt-1.5 line-clamp-2 text-[13.5px] leading-relaxed text-[var(--muted)]">{String(g.excerpt)}</p>
            <div className="mt-3 flex items-center gap-2 text-[12px] text-[var(--muted)]">
              <Badge>{titleCaseOr(String(g.difficulty))}</Badge>
              <span>{Number(g.reading_minutes)} min</span>
              <span>·</span>
              <span>{String(g.author_name)}</span>
            </div>
          </Link>
        ))}
        {!rest.length ? (
          <div className="col-span-3">
            <EmptyState icon="book" title="More guides are being written" body="The desk publishes as species rules change." />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function DesktopGuide({ guide, related }: { guide: Row; related: Row[] }) {
  const toc = headingsOf(String(guide.body ?? ''));
  const tags = (Array.isArray(guide.tags) ? (guide.tags as unknown as string[]) : []);
  return (
    <article className="shell py-10">
      <div className="mx-auto max-w-[1180px]">
        <Link href="/guides" className="flex items-center gap-1 text-[12.5px] text-[var(--muted)] hover:text-[var(--ink)]">
          <Icon name="back" size={14} /> Care guides
        </Link>
        <header className="mx-auto mt-5 max-w-[64ch] text-center">
          <p className="eyebrow">
            {titleCaseOr(String(guide.difficulty))} · {Number(guide.reading_minutes)} min · {String(guide.author_name)}
          </p>
          <h1 className="h1 mt-3">{String(guide.title)}</h1>
          <p className="lede mt-4">{String(guide.excerpt)}</p>
        </header>

        <Media media={{ path_medium: guide.cover_path ? String(guide.cover_path) : null, base_path: null }} alt={String(guide.title)} ratio="21 / 9" className="mt-8 rounded-2xl" />

        <div className="mt-9 grid grid-cols-[minmax(0,1fr)_240px] items-start gap-12">
          <div className="mx-auto max-w-[68ch]">{renderMarkdown(String(guide.body ?? ''))}</div>
          <aside className="sticky top-[86px] space-y-4">
            {toc.length > 1 ? (
              <div className="card-quiet p-4">
                <p className="label">Contents</p>
                <ul className="mt-2 space-y-1.5">
                  {toc.map((h) => (
                    <li key={h.id}>
                      <a href={`#${h.id}`} className={`block leading-snug text-[var(--muted)] hover:text-[var(--ink)] ${h.level === 2 ? 'text-[13px]' : 'pl-2 text-[12.5px]'}`}>
                        {h.text}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {tags.length ? (
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <Link key={t} href={`/animals?q=${encodeURIComponent(t)}`} className="chip">
                    {t}
                  </Link>
                ))}
              </div>
            ) : null}

            <div className="card p-4">
              <p className="label">Before you buy</p>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--muted)]">
                Legality depends on your address, not on the species alone. Check the verdict on a listing, or ask the desk about your setup.
              </p>
              <Link href="/compliance" className="btn btn-quiet btn-sm mt-3 w-full">
                How legality works
              </Link>
              <Link href="/assistant" className="btn btn-ghost btn-sm mt-1.5 w-full">
                Ask the assistant
              </Link>
            </div>
          </aside>
        </div>

        {related.length ? (
          <section className="mt-12 border-t border-[var(--line)] pt-7">
            <p className="label">Keep reading</p>
            <div className="mt-3 grid grid-cols-3 gap-5">
              {related.map((g) => (
                <Link key={String(g.id)} href={`/guides/${String(g.slug)}`} className="group-card flex gap-3 p-3">
                  <Media media={{ path_medium: g.cover_path ? String(g.cover_path) : null, base_path: null }} alt={String(g.title)} ratio="1 / 1" className="w-20 shrink-0 rounded-lg" />
                  <span className="min-w-0">
                    <span className="line-clamp-2 block text-[13.5px] font-medium leading-snug">{String(g.title)}</span>
                    <span className="mt-1 block text-[11.5px] text-[var(--muted)]">
                      {Number(g.reading_minutes)} min · {relTime(String(g.published_at))}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </article>
  );
}
