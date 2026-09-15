'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { MobileHeader } from '@/components/shell/mobile';
import { Media, Badge, Stars, EmptyState, VerifiedMark, ComplianceBadge } from '@/components/ui/primitives';
import { Sheet } from '@/components/ui/interactions';
import { MobileAnimalCard } from '@/components/ui/cards';
import { titleCaseOr } from '@/lib/ui/screen-helpers';
import type { BreederView } from '@/components/desktop/breeders';

type Row = Record<string, string | number | null>;

export function MobileBreeders({ rows, total }: { rows: Row[]; total: number }) {
  const [query, setQuery] = useState('');
  const filtered = rows.filter((r) => !query || `${r.business_name} ${r.city} ${r.state}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="pb-6">
      <MobileHeader title="Breeders" subtitle={`${total} verified sellers`} />
      <div className="px-4 pt-2">
        <div className="flex h-11 items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3">
          <Icon name="search" size={17} className="text-[var(--muted)]" />
          <input className="min-w-0 flex-1 bg-transparent text-[14px] outline-none" placeholder="Name or city" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      {!filtered.length ? (
        <div className="px-4 py-8">
          <EmptyState icon="store" title="No seller matches" body="Try a shorter term, or browse the catalogue — every listing names its breeder." action={<Link href="/explore" className="btn">Explore animals</Link>} />
        </div>
      ) : (
        <ul className="mt-2 divide-y divide-[var(--line)]">
          {filtered.map((b) => (
            <li key={String(b.id)}>
              <Link href={`/breeders/${String(b.slug)}`} className="flex items-start gap-3 px-4 py-3.5">
                <Media media={{ path_medium: b.logo_path ? String(b.logo_path) : null, base_path: null }} alt={String(b.business_name)} ratio="1 / 1" className="h-12 w-12 shrink-0 rounded-full border border-[var(--line)]" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[14.5px] font-medium">{String(b.business_name)}</span>
                    <VerifiedMark tier={String(b.tier)} />
                  </span>
                  <span className="mt-0.5 block text-[12px] text-[var(--muted)]">
                    {String(b.city)}, {String(b.state)} · {Number(b.years_active)} yrs
                  </span>
                  <span className="mt-1.5 flex items-center gap-2">
                    <Stars value={Number(b.rating_avg)} size={13} />
                    <span className="mono text-[11.5px]">{Number(b.rating_avg).toFixed(2)}</span>
                    <Badge tone="ink">{Number(b.live_count)} live</Badge>
                    <Badge>{Number(b.transactions_count)} transfers</Badge>
                  </span>
                </span>
                <Icon name="chevronRight" size={16} className="mt-2 shrink-0 text-[var(--muted)]" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function MobileBreederStorefront({ data }: { data: BreederView }) {
  const b = data.breeder;
  const [sheet, setSheet] = useState<null | 'paper' | 'reviews'>(null);

  return (
    <div className="pb-24">
      <MobileHeader title={String(b.business_name)} back="/breeders" />

      <div className="px-4 pt-2">
        <div className="flex items-start gap-3.5">
          <Media media={{ path_medium: b.logo_path ? String(b.logo_path) : null, base_path: null }} alt={String(b.business_name)} ratio="1 / 1" className="h-16 w-16 shrink-0 rounded-xl border border-[var(--line)]" />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[17px] font-medium leading-tight">
              {String(b.business_name)} <VerifiedMark tier={String(b.tier)} />
            </p>
            <p className="mt-1 text-[12.5px] text-[var(--muted)]">
              {String(b.city)}, {String(b.state)} · licence {String(b.license_number ?? 'on file')}
            </p>
            <div className="mt-1.5 flex items-center gap-2">
              <Stars value={Number(b.rating_avg)} size={14} />
              <span className="mono text-[12px]">{Number(b.rating_avg).toFixed(2)}</span>
              <span className="text-[12px] text-[var(--muted)]">· {Number(b.rating_count)} reviews</span>
            </div>
          </div>
        </div>

        <p className="mt-3 text-[13.5px] leading-relaxed text-[var(--muted)]">{String(b.bio ?? '')}</p>

        <div className="mt-3 grid grid-cols-4 gap-2">
          {[
            ['Live', Number(b.live_count ?? data.animals.length)],
            ['Transfers', Number(b.transactions_count)],
            ['Reply', `${Number(b.response_hours)}h`],
            ['Years', Number(b.years_active)],
          ].map(([label, value]) => (
            <div key={String(label)} className="card p-2.5 text-center">
              <p className="text-[15px] font-semibold">{String(value)}</p>
              <p className="mt-0.5 text-[10.5px] text-[var(--muted)]">{String(label)}</p>
            </div>
          ))}
        </div>

        <div className="mt-3 flex gap-2">
          <Link href={`/messages?to=${String(b.user_id)}&breeder=${String(b.id)}`} className="btn flex-1">
            <Icon name="chat" size={15} /> Contact
          </Link>
          <button className="btn btn-quiet flex-1" onClick={() => setSheet('paper')}>
            <Icon name="shield" size={15} /> Paperwork
          </button>
        </div>

        {data.specialties.length ? (
          <>
            <p className="mt-5 label">Taxa kept</p>
            <div className="hscroll mt-1.5 flex gap-1.5">
              {data.specialties.map((sp) => (
                <Link key={sp} href={`/animals?q=${encodeURIComponent(sp)}`} className="chip shrink-0">
                  {sp}
                </Link>
              ))}
            </div>
          </>
        ) : null}

        <div className="mt-5 flex items-center justify-between">
          <p className="label">Available now</p>
          <button className="text-[12.5px] text-[var(--muted)]" onClick={() => setSheet('reviews')}>
            {Number(b.rating_count)} reviews
          </button>
        </div>
      </div>

      {data.animals.length ? (
        <div className="mt-2 grid grid-cols-2 gap-2.5 px-4">
          {data.animals.map((a) => (
            <MobileAnimalCard key={String(a.id)} animal={a as never} />
          ))}
        </div>
      ) : (
        <div className="px-4 py-6">
          <EmptyState icon="paw" title="Nothing available" body="Their next clutch is not listed yet. Contact the breeder or follow the storefront to hear first." />
        </div>
      )}

      {data.soldAnimals.length ? (
        <div className="mt-5 px-4">
          <p className="label">Recently placed</p>
          <div className="hscroll mt-1.5 flex gap-2">
            {data.soldAnimals.slice(0, 6).map((a) => (
              <Link key={String(a.id)} href={`/animals/${String(a.slug)}`} className="w-[108px] shrink-0">
                <Media media={{ path_medium: a.image_medium as string, path_small: a.image_small as string, base_path: a.base_path as string }} alt={String(a.name)} ratio="1 / 1" className="rounded-lg" />
                <p className="mt-1 truncate text-[11.5px]">{String(a.name)}</p>
                <Badge tone="quiet">placed</Badge>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <div className="sticky-cta-single">
        <Link href={`/messages?to=${String(b.user_id)}&breeder=${String(b.id)}`} className="btn btn-block">
          <Icon name="chat" size={16} /> Ask about an animal
        </Link>
      </div>

      <Sheet open={sheet === 'paper'} onClose={() => setSheet(null)} title="Verification & documents">
        <ul className="space-y-2.5 text-[13px]">
          <li className="flex justify-between gap-4 border-b border-[var(--line)] pb-2">
            <span className="text-[var(--muted)]">Tier</span>
            <span className="font-medium">{titleCaseOr(String(b.tier))}</span>
          </li>
          <li className="flex justify-between gap-4 border-b border-[var(--line)] pb-2">
            <span className="text-[var(--muted)]">Status</span>
            <Badge tone={String(b.status) === 'APPROVED' ? 'ok' : 'warn'}>{titleCaseOr(String(b.status))}</Badge>
          </li>
          <li className="flex justify-between gap-4 border-b border-[var(--line)] pb-2">
            <span className="text-[var(--muted)]">Licence</span>
            <span className="mono">{String(b.license_number ?? '—')}</span>
          </li>
          {data.verification ? (
            <li className="flex justify-between gap-4 border-b border-[var(--line)] pb-2">
              <span className="text-[var(--muted)]">Last reviewed</span>
              <span>{String(data.verification.submitted_at).slice(0, 10)}</span>
            </li>
          ) : null}
        </ul>
        <p className="mt-3 label">Documents on file</p>
        <ul className="mt-1.5 space-y-2">
          {data.publicDocs.map((d) => (
            <li key={d.doc_type} className="rounded-lg border border-[var(--line)] p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13.5px] font-medium">{titleCaseOr(d.doc_type)}</span>
                <ComplianceBadge verdict={d.status === 'VERIFIED' ? 'ALLOWED' : d.status === 'PENDING' ? 'REQUIRES_DOCUMENTATION' : 'PROHIBITED'} label={titleCaseOr(d.status)} />
              </div>
              {d.expires_at ? <p className="mt-1 text-[11.5px] text-[var(--muted)]">valid until {String(d.expires_at).slice(0, 10)}</p> : null}
            </li>
          ))}
          {!data.publicDocs.length ? <li className="text-[12.5px] text-[var(--muted)]">Paperwork is verified per listing rather than badged on the storefront.</li> : null}
        </ul>
        <p className="mt-3 text-[11.5px] leading-relaxed text-[var(--muted)]">
          Files are private. FAUNAL shows that a document exists and that it was checked; the image itself is released only to the buyer of an order that
          needs it and to our compliance desk.
        </p>
      </Sheet>

      <Sheet open={sheet === 'reviews'} onClose={() => setSheet(null)} title={`Reviews · ${Number(b.rating_avg).toFixed(2)}`}>
        <div className="mb-3 space-y-2">
          {data.ratingBreakdown.map((r) => (
            <div key={r.category} className="flex items-center gap-2.5">
              <span className="w-[92px] shrink-0 text-[12px]">{titleCaseOr(r.category)}</span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-2)]">
                <span className="block h-full rounded-full bg-[var(--ink)]" style={{ width: `${(r.avg / 5) * 100}%` }} />
              </span>
              <span className="mono w-[56px] text-right text-[11px] text-[var(--muted)]">
                {r.avg.toFixed(1)} · {r.n}
              </span>
            </div>
          ))}
        </div>
        <ul className="space-y-2.5">
          {data.reviews.map((r) => (
            <li key={String(r.id)} className="rounded-lg border border-[var(--line)] p-3">
              <div className="flex items-center gap-2">
                <Stars value={Number(r.overall)} size={13} />
                <span className="text-[12.5px] font-medium">{String(r.title)}</span>
              </div>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--muted)]">{String(r.body)}</p>
              <p className="mt-1.5 text-[11px] text-[var(--muted)]">
                {String(r.first_name)} · {String(r.created_at).slice(0, 10)} · verified purchase
              </p>
            </li>
          ))}
          {!data.reviews.length ? <li className="text-[12.5px] text-[var(--muted)]">No written reviews yet.</li> : null}
        </ul>
      </Sheet>
    </div>
  );
}
