'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Media, Badge, Stars, EmptyState, VerifiedMark, ComplianceBadge } from '@/components/ui/primitives';
import { FollowBreederButton } from '@/components/ui/interactions';
import { DesktopAnimalCard } from '@/components/ui/cards';
import { titleCaseOr } from '@/lib/ui/screen-helpers';

type Row = Record<string, string | number | null>;

export interface BreederView {
  breeder: Row;
  user: Row | null;
  animals: Row[];
  soldAnimals: Row[];
  reviews: Row[];
  approvedCount: number;
  verification: Row | null;
  publicDocs: { doc_type: string; status: string; expires_at: string | null }[];
  isFollowing: boolean;
  viewerId: string | null;
  specialties: string[];
  ratingBreakdown: { category: string; avg: number; n: number }[];
}

/* ------------------------------------------------------------------ index */

export function DesktopBreeders({ rows, total }: { rows: Row[]; total: number }) {
  const [query, setQuery] = useState('');
  const [tier, setTier] = useState('');
  const filtered = rows.filter((r) => {
    const hay = `${r.business_name} ${r.city} ${r.state}`.toLowerCase();
    if (query && !hay.includes(query.toLowerCase())) return false;
    if (tier && String(r.tier) !== tier) return false;
    return true;
  });

  return (
    <div className="shell py-8">
      <header className="flex items-end justify-between gap-8 border-b border-[var(--line)] pb-6">
        <div className="max-w-[62ch]">
          <p className="eyebrow">Verified sellers</p>
          <h1 className="h1 mt-2">Breeders with paperwork on file</h1>
          <p className="lede mt-3">
            Every storefront here has passed licence verification: {total} approved sellers, each with the documents their state requires to breed and sell
            these taxa. Reviews come only from completed orders.
          </p>
        </div>
        <div className="w-[300px] shrink-0 space-y-2">
          <div className="flex h-11 items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3">
            <Icon name="search" size={16} className="text-[var(--muted)]" />
            <input className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none" placeholder="Name, city, taxon" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="flex gap-1.5">
            {[
              ['', 'All'],
              ['VERIFIED_BREEDER', 'Verified'],
              ['PARTNER_BREEDER', 'Partner'],
            ].map(([value, label]) => (
              <button key={value} className={`chip ${tier === value ? 'bg-[var(--ink)] text-white' : ''}`} onClick={() => setTier(value)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {!filtered.length ? (
        <div className="py-14">
          <EmptyState icon="store" title="No breeder matches" body="Try a shorter term, or browse the catalogue — every listing shows its seller." action={<Link href="/animals" className="btn">Browse animals</Link>} />
        </div>
      ) : (
        <div className="mt-7 grid grid-cols-3 gap-5">
          {filtered.map((b) => (
            <Link key={String(b.id)} href={`/breeders/${String(b.slug)}`} className="card group-card flex flex-col p-5">
              <div className="flex items-start gap-3.5">
                <Media media={{ path_medium: b.logo_path ? String(b.logo_path) : null, base_path: null }} alt={String(b.business_name)} ratio="1 / 1" className="h-14 w-14 shrink-0 rounded-full border border-[var(--line)]" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-[16px] font-medium leading-snug">
                    <span className="truncate">{String(b.business_name)}</span>
                    <VerifiedMark tier={String(b.tier)} />
                  </p>
                  <p className="mt-0.5 text-[12.5px] text-[var(--muted)]">
                    {String(b.city)}, {String(b.state)} · since {String(b.founded_year ?? String(b.created_at).slice(0, 4))}
                  </p>
                </div>
              </div>

              <p className="mt-3 line-clamp-2 text-[13px] leading-relaxed text-[var(--muted)]">{String(b.bio ?? '')}</p>

              <div className="mt-3.5 flex items-center gap-3 text-[12.5px]">
                <Stars value={Number(b.rating_avg)} />
                <span className="mono">{Number(b.rating_avg).toFixed(2)}</span>
                <span className="text-[var(--muted)]">{Number(b.rating_count)} reviews</span>
              </div>

              <div className="mt-auto flex flex-wrap gap-1.5 pt-4">
                <Badge tone="ink">{Number(b.live_count)} available</Badge>
                <Badge icon="box">{Number(b.transactions_count)} transfers</Badge>
                {Number(b.response_hours) ? <Badge icon="chat">replies in ~{Number(b.response_hours)}h</Badge> : null}
                {b.storefront_plan && String(b.storefront_plan) !== 'FREE' ? <Badge tone="ok">{titleCaseOr(String(b.storefront_plan))} plan</Badge> : null}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- storefront */

export function DesktopBreederStorefront({ data }: { data: BreederView }) {
  const b = data.breeder;
  const [tab, setTab] = useState<'listings' | 'reviews' | 'about' | 'sold'>('listings');
  const rating = Number(b.rating_avg);

  return (
    <div className="pb-10">
      <div className="border-b border-[var(--line)] bg-[var(--surface)]">
        <div className="shell py-8">
          <div className="flex items-start gap-6">
            <Media media={{ path_medium: b.logo_path ? String(b.logo_path) : null, base_path: null }} alt={String(b.business_name)} ratio="1 / 1" className="h-24 w-24 shrink-0 rounded-xl border border-[var(--line)]" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="h2">{String(b.business_name)}</h1>
                <VerifiedMark tier={String(b.tier)} />
                <Badge tone={String(b.status) === 'APPROVED' ? 'ok' : 'warn'}>{titleCaseOr(String(b.status))}</Badge>
              </div>
              <p className="mt-1.5 text-[13.5px] text-[var(--muted)]">
                {String(b.city)}, {String(b.state)} · {Number(b.years_active)} years keeping · {String(b.license_number)}
              </p>
              <p className="mt-3 max-w-[80ch] text-[14px] leading-relaxed">{String(b.bio ?? '')}</p>
              <div className="mt-4 flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Stars value={rating} />
                  <span className="mono text-[13px]">{rating.toFixed(2)}</span>
                  <span className="text-[12.5px] text-[var(--muted)]">· {Number(b.rating_count)} completed orders reviewed</span>
                </div>
              </div>
            </div>
            <div className="w-[240px] shrink-0 space-y-2">
              <Link href={`/messages?to=${String(b.user_id)}&breeder=${String(b.id)}`} className="btn btn-block btn-sm">
                <Icon name="chat" size={15} /> Contact breeder
              </Link>
              <div className="flex gap-2">
                <FollowBreederButton breederId={String(b.id)} initial={data.isFollowing} businessName={String(b.business_name)} />
                <Link href="/become-a-breeder" className="btn btn-ghost btn-sm">
                  Sell too
                </Link>
              </div>
            </div>
          </div>

          <div className="mt-7 grid grid-cols-5 gap-6 border-t border-[var(--line)] pt-5">
            {[
              ['Transfers completed', Number(b.transactions_count).toLocaleString('en-US')],
              ['Live listings', Number(b.live_count ?? data.animals.length).toLocaleString('en-US')],
              ['Animals approved', data.approvedCount.toLocaleString('en-US')],
              ['Typical reply', `${Number(b.response_hours)} h`],
              ['Storefront plan', titleCaseOr(String(b.storefront_plan ?? 'FREE'))],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <p className="h4">{String(value)}</p>
                <p className="mt-1 text-[12px] text-[var(--muted)]">{String(label)}</p>
              </div>
            ))}
          </div>

          <nav className="mt-6 flex gap-1">
            {(
              [
                ['listings', `Available (${data.animals.length})`],
                ['reviews', `Reviews (${Number(b.rating_count)})`],
                ['about', 'Verification & paperwork'],
                ['sold', `Recently placed (${data.soldAnimals.length})`],
              ] as const
            ).map(([key, label]) => (
              <button key={key} className={`chip py-2 ${tab === key ? 'bg-[var(--ink)] text-white' : ''}`} onClick={() => setTab(key)}>
                {label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <div className="shell mt-7 grid grid-cols-[minmax(0,1fr)_330px] items-start gap-9">
        <div>
          {tab === 'listings' ? (
            data.animals.length ? (
              <div className="grid grid-cols-3 gap-5">
                {data.animals.map((a, i) => (
                  <DesktopAnimalCard key={String(a.id)} animal={a as never} index={i} />
                ))}
              </div>
            ) : (
              <EmptyState icon="paw" title="Nothing available right now" body="This breeder’s current clutch is not listed yet. Follow the storefront to hear when it goes live." />
            )
          ) : null}

          {tab === 'sold' ? (
            data.soldAnimals.length ? (
              <div className="grid grid-cols-3 gap-5">
                {data.soldAnimals.map((a, i) => (
                  <DesktopAnimalCard key={String(a.id)} animal={a as never} index={i} />
                ))}
              </div>
            ) : (
              <EmptyState icon="box" title="No animals placed from this storefront yet" body="Completed transfers appear here so buyers can see the track record." />
            )
          ) : null}

          {tab === 'reviews' ? (
            <div className="space-y-4">
              {data.ratingBreakdown?.length ? (
                <div className="card p-5">
                  <p className="label">What buyers score</p>
                  <ul className="mt-3 space-y-2.5">
                    {data.ratingBreakdown.map((r) => (
                      <li key={r.category} className="flex items-center gap-3">
                        <span className="w-[130px] shrink-0 text-[13px]">{titleCaseOr(r.category)}</span>
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-2)]">
                          <span className="block h-full rounded-full bg-[var(--ink)]" style={{ width: `${(r.avg / 5) * 100}%` }} />
                        </span>
                        <span className="mono w-[68px] shrink-0 text-right text-[12px] text-[var(--muted)]">
                          {r.avg.toFixed(2)} · {r.n}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {!data.reviews.length ? (
                <EmptyState icon="star" title="No reviews yet" body="Only buyers with a completed order can review a breeder." />
              ) : (
                <ul className="space-y-3">
                  {data.reviews.map((r) => (
                    <li key={String(r.id)} className="card p-5">
                      <div className="flex items-center gap-3">
                        <Stars value={Number(r.overall)} showValue />
                        <span className="text-[13px] font-medium">{String(r.title)}</span>
                        <span className="ml-auto text-[12px] text-[var(--muted)]">
                          {String(r.first_name)} {String(r.last_name ?? '').slice(0, 1)}. · {String(r.created_at).slice(0, 10)}
                        </span>
                      </div>
                      <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--muted)]">{String(r.body)}</p>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {(['animal_health', 'documentation', 'transport', 'communication'] as const).map((k) =>
                          r[k] != null ? (
                            <Badge key={k}>
                              {titleCaseOr(k)} {Number(r[k]).toFixed(1)}
                            </Badge>
                          ) : null,
                        )}
                        {r.species_name ? <Badge icon="paw">{String(r.species_name)}</Badge> : null}
                        <Badge tone="ok" icon="check">
                          verified purchase
                        </Badge>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          {tab === 'about' ? (
            <div className="space-y-4">
              <section className="card p-6">
                <p className="label">Verification</p>
                <div className="mt-3 space-y-2.5 text-[13.5px]">
                  <Row label="Tier" value={<span className="flex items-center gap-1.5">{titleCaseOr(String(b.tier))} <VerifiedMark tier={String(b.tier)} /></span>} />
                  <Row label="Account status" value={titleCaseOr(String(b.status))} />
                  <Row label="Licence" value={String(b.license_number ?? '—')} />
                  <Row label="Jurisdiction" value={String(b.city ? `${b.city}, ${b.state}` : String(b.state))} />
                  <Row label="Years active" value={String(Number(b.years_active))} />
                  <Row label="Founded" value={String(b.founded_year ?? '—')} />
                  {data.verification ? (
                    <>
                      <Row label="Last review" value={String(data.verification.submitted_at).slice(0, 10)} />
                      <Row label="Decision" value={<Badge tone={String(data.verification.status) === 'APPROVED' ? 'ok' : 'warn'}>{titleCaseOr(String(data.verification.status))}</Badge>} />
                      {data.verification.rejection_reason ? <Row label="Notes" value={String(data.verification.rejection_reason)} /> : null}
                    </>
                  ) : null}
                </div>
              </section>

              <section className="card p-6">
                <p className="label">Documents supporting this storefront</p>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--muted)]">
                  FAUNAL shows which documents exist and whether they are verified. The files themselves stay private — they are released only to the
                  buyer of an order that needs them and to our compliance desk.
                </p>
                <ul className="mt-3 space-y-2">
                  {data.publicDocs.map((d) => (
                    <li key={d.doc_type} className="flex items-center gap-3 rounded-lg border border-[var(--line)] px-3.5 py-2.5">
                      <Icon name="doc" size={16} className="text-[var(--accent-soft)]" />
                      <span className="flex-1 text-[13.5px]">{titleCaseOr(d.doc_type)}</span>
                      <ComplianceBadge verdict={d.status === 'VERIFIED' ? 'ALLOWED' : d.status === 'PENDING' ? 'REQUIRES_DOCUMENTATION' : 'PROHIBITED'} label={titleCaseOr(d.status)} />
                      {d.expires_at ? <span className="text-[12px] text-[var(--muted)]">until {String(d.expires_at).slice(0, 10)}</span> : null}
                    </li>
                  ))}
                  {!data.publicDocs.length ? <li className="text-[13px] text-[var(--muted)]">No public badge documents — this seller’s paperwork is checked per listing.</li> : null}
                </ul>
              </section>
            </div>
          ) : null}
        </div>

        <aside className="sticky top-[86px] space-y-4">
          <div className="card p-5">
            <p className="label">Talk to {String(b.business_name).split(' ')[0]}</p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--muted)]">
              Ask about lineage, feeding history, or whether this breeder can ship to your state. Messages stay on the record and inside buyer
              protection.
            </p>
            <div className="mt-3 space-y-2">
              <Link href={`/messages?to=${String(b.user_id)}&breeder=${String(b.id)}`} className="btn btn-block btn-sm">
                Contact breeder
              </Link>
              <FollowBreederButton breederId={String(b.id)} initial={data.isFollowing} businessName={String(b.business_name)} />
            </div>
          </div>

          <div className="card p-5">
            <p className="label">Specialties</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {data.specialties.map((sp) => (
                <Link key={sp} href={`/animals?q=${encodeURIComponent(sp)}`} className="chip">
                  {sp}
                </Link>
              ))}
              {!data.specialties.length ? <span className="text-[13px] text-[var(--muted)]">Nothing listed right now.</span> : null}
            </div>
          </div>

          {data.viewerId ? (
            <div className="card p-5">
              <p className="label">Save this seller</p>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--muted)]">
                Following adds their new listings to your feed and notifies you the moment a matching animal is published.
              </p>
              <div className="mt-3">
                <FollowBreederButton breederId={String(b.id)} initial={data.isFollowing} businessName={String(b.business_name)} />
              </div>
            </div>
          ) : null}

          <div className="card-quiet p-5 text-[12px] leading-relaxed text-[var(--muted)]">
            <p className="label">Buying safely</p>
            <p className="mt-1.5">
              Never pay a breeder outside FAUNAL — wire transfers and cash apps have no escrow and no protection. Payments here are held until you
              confirm the animal arrived.
            </p>
            <Link href="/compliance/protection" className="link mt-2 inline-block">
              Read buyer protection
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-[var(--line)] pb-2 last:border-0 last:pb-0">
      <span className="text-[12.5px] text-[var(--muted)]">{label}</span>
      <span className="text-right text-[13px] font-medium">{value}</span>
    </div>
  );
}

