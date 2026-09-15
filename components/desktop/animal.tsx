import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { Media, Money, Badge, ComplianceBadge, VerifiedMark, Stars, Section, DataRow, EmptyState, Tag } from '@/components/ui/primitives';
import { Gallery, FavoriteButton, AddToCartButton, ContactBreederButton, ShareButton, FollowBreederButton, ReportDialog, Accordion } from '@/components/ui/interactions';
import { DesktopAnimalCard } from '@/components/ui/cards';
import { money, husbandryRows, specRows, documents, faq, trustPoints, verdictHeadline, verdictTone, primaryActionLabel, isAvailable, type AnimalView } from '@/lib/ui/animal-view';
import { titleCase } from '@/domain/util';

/**
 * DESKTOP animal detail — wide imagery, two columns with a 400px purchase rail,
 * generous vertical rhythm. Same data and same compliance verdict as mobile.
 */
export function DesktopAnimal({ v }: { v: AnimalView }) {
  const a = v.animal;
  const s = v.species;
  const b = v.breeder;
  const tone = verdictTone(v.verdict.verdict);
  const available = isAvailable(v);
  const action = primaryActionLabel(v);
  const docs = documents(v);
  const questions = faq(v);
  const gallery: { src: string; alt: string; kind?: 'image' | 'video'; poster?: string }[] = v.images.map((img) => ({
    src: String(img.path_medium ?? img.base_path),
    alt: String(img.alt ?? `${a.name} — ${s.common_name}`),
    poster: String(img.path_thumb ?? ''),
  }));
  for (const video of v.videos) {
    gallery.push({ src: String(video.storage_path ?? video.url ?? ''), alt: `${a.name} — ${String(video.caption ?? 'video')}`, kind: 'video' as const });
  }

  return (
    <div className="shell py-7">
      <nav className="flex items-center gap-2 text-[12.5px] text-[var(--muted)]" aria-label="Breadcrumb">
        <Link href="/animals" className="hover:text-[var(--ink)]">
          Animals
        </Link>
        <Icon name="chevronRight" size={13} />
        <Link href={`/animals?category=${String(s.category_slug ?? a.category_slug ?? '')}`} className="hover:text-[var(--ink)]">
          {String(a.category_name ?? titleCase(String(s.category_slug ?? 'reptiles')))}
        </Link>
        <Icon name="chevronRight" size={13} />
        <Link href={`/animals?species=${String(s.slug)}`} className="hover:text-[var(--ink)]">
          {String(s.common_name)}
        </Link>
        <Icon name="chevronRight" size={13} />
        <span className="text-[var(--ink)]">{String(a.name)}</span>
      </nav>

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)_400px] items-start gap-12">
        {/* ------------------------------------------------------------ media */}
        <div>
          <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)]">
            <Gallery items={gallery.length ? gallery : [{ src: '/img/placeholder.svg', alt: 'Photography pending' }]} ratio="4 / 3" showThumbs />
          </div>
          <div className="mt-3 flex items-center justify-between text-[12px] text-[var(--muted)]">
            <span>
              Photography taken in the {String(a.city)} facility · {v.images.length} stills · {v.videos.length} video{v.videos.length === 1 ? '' : 's'}
            </span>
            <span className="flex items-center gap-1">
              <Icon name="camera" size={14} /> no retouching, no borrowed images
            </span>
          </div>

          {/* -------------------------------------------------------- headline */}
          <div className="mt-9 flex items-start justify-between gap-6">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                {Number(a.is_featured) ? (
                  <Badge tone="ink" icon="sparkle">
                    Featured
                  </Badge>
                ) : null}
                <ComplianceBadge verdict={String(v.verdict.verdict)} />
                {Number(s.is_sensitive) ? (
                  <Badge tone="warn" icon="shield">
                    Sensitive species
                  </Badge>
                ) : null}
                <Badge icon="leaf">Care level: {titleCase(String(a.experience_level))}</Badge>
              </div>
              <h1 className="h1 mt-3">{String(a.name)}</h1>
              <p className="lede mt-1.5">
                {String(s.common_name)}
                {a.morph_name ? ` · ${String(a.morph_name)}` : ''} · <span className="italic text-[var(--muted)]">{String(s.scientific_name)}</span>
              </p>
            </div>
            <div className="flex items-center gap-1.5 pt-2">
              <FavoriteButton animalId={String(a.id)} initial={v.isFavorite} label="Save" variant="row" />
              <ShareButton title={`${String(a.name)} — ${String(s.common_name)}`} url={`/animals/${String(a.slug)}`} />
              <ReportDialog targetType="ANIMAL" targetId={String(a.id)}>
                <span className="icon-btn" role="button" tabIndex={0} aria-label="Report this listing">
                  <Icon name="flag" size={17} />
                </span>
              </ReportDialog>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-4 gap-x-8 gap-y-5 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
            {specRows(v).map((row) => (
              <DataRow key={row.label} label={row.label} value={row.value} />
            ))}
          </div>

          {/* ------------------------------------------------------ compliance */}
          <section className="mt-9">
            <div
              className="rounded-xl border p-6"
              style={{
                borderColor: tone === 'ok' ? 'rgba(79,107,85,.35)' : tone === 'warn' ? 'rgba(154,123,69,.4)' : 'rgba(139,75,75,.35)',
                background: tone === 'ok' ? 'rgba(79,107,85,.06)' : tone === 'warn' ? 'rgba(154,123,69,.07)' : 'rgba(139,75,75,.06)',
              }}
            >
              <div className="flex items-start justify-between gap-6">
                <div>
                  <p className="eyebrow">Legality check · {v.destination.label}</p>
                  <h2 className="h3 mt-2 flex items-center gap-2">
                    <Icon name={tone === 'ok' ? 'verified' : tone === 'warn' ? 'alert' : 'ban'} size={20} />
                    {titleCase(String(v.verdict.verdict))}
                  </h2>
                  <p className="mt-2 max-w-[62ch] text-[14.5px] leading-relaxed text-[var(--ink-soft,var(--muted))]">{verdictHeadline(v)}</p>
                </div>
                <Link href="/compliance" className="btn btn-quiet btn-sm shrink-0">
                  How this is decided <Icon name="chevronRight" size={15} />
                </Link>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-6 border-t border-[var(--line)] pt-5">
                <div>
                  <p className="label">Rules matched</p>
                  {v.verdict.rules.length ? (
                    <ul className="mt-2 space-y-2">
                      {v.verdict.rules.map((r) => (
                        <li key={r.id} className="text-[13px] leading-relaxed">
                          <span className="font-medium">{r.label}</span>{' '}
                          <span className="text-[var(--muted)]">— {r.detail}</span>
                          <p className="mono mt-0.5 text-[11.5px] text-[var(--muted)]">
                            {r.table}
                            {r.citation ? ` · ${r.citation}` : ''}
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-[13px] text-[var(--muted)]">No species-specific restriction applies to {v.destination.label}.</p>
                  )}
                </div>
                <div>
                  <p className="label">Documentation</p>
                  <ul className="mt-2 space-y-1.5">
                    {v.verdict.requiredDocuments.length ? (
                      v.verdict.requiredDocuments.map((d) => {
                        const missing = v.verdict.missingDocuments.includes(d);
                        return (
                          <li key={d} className="flex items-center gap-2 text-[13px]">
                            <Icon name={missing ? 'alert' : 'check'} size={14} className={missing ? 'text-[var(--warning)]' : 'text-[var(--success)]'} />
                            <span className={missing ? '' : 'text-[var(--muted)]'}>{titleCase(d)}</span>
                          </li>
                        );
                      })
                    ) : (
                      <li className="text-[13px] text-[var(--muted)]">Nothing extra required for this transfer.</li>
                    )}
                  </ul>
                  {v.verdict.estimatedDocLeadDays > 0 ? (
                    <p className="mt-3 text-[12.5px] text-[var(--muted)]">
                      Expect roughly {v.verdict.estimatedDocLeadDays} days of paperwork lead time before dispatch.
                    </p>
                  ) : null}
                </div>
              </div>

              {v.verdict.notes.length ? (
                <ul className="mt-5 space-y-1.5 border-t border-[var(--line)] pt-4">
                  {v.verdict.notes.map((n, i) => (
                    <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-[var(--muted)]">
                      <Icon name="info" size={14} className="mt-0.5 shrink-0" />
                      {n}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </section>

          {/* ------------------------------------------------------ narrative */}
          <Section title="About this animal" lead={`${String(a.name)} is one of ${v.images.length} photographed animals in this group.`}>
            <div className="prose max-w-[68ch]">
              <p>{String(a.description)}</p>
              <p>
                temperament · {String(a.temperament ?? 'documented at handling')}
                <br />
                colour · {String(a.color ?? 'see photography')}
              </p>
            </div>
            <div className="mt-6 grid grid-cols-3 gap-3">
              {trustPoints(v).map((t) => (
                <div key={t} className="group-card flex items-start gap-2.5 p-4 text-[13px] leading-relaxed">
                  <Icon name="check" size={15} className="mt-0.5 shrink-0 text-[var(--success)]" />
                  {t}
                </div>
              ))}
            </div>
          </Section>

          {/* ----------------------------------------------------- husbandry */}
          <Section title="Husbandry requirements" lead="What this animal needs to stay healthy — printed in the dossier you receive with it.">
            <div className="overflow-hidden rounded-xl border border-[var(--line)]">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Parameter</th>
                    <th>Requirement</th>
                  </tr>
                </thead>
                <tbody>
                  {husbandryRows(v).map((row) => (
                    <tr key={row.label}>
                      <td className="text-[var(--muted)]">{row.label}</td>
                      <td>{row.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          {/* ------------------------------------------------------ documents */}
          <Section title="Documentation on file" lead="Buyers see verified status; the files themselves stay private and are only released to the participant of an order.">
            <ul className="divide-y divide-[var(--line)] overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)]">
              {docs.map((d) => (
                <li key={d.label} className="flex items-center gap-4 px-5 py-4">
                  <Icon name={d.status === 'Verified' ? 'verified' : d.status === 'Pending' ? 'clock' : 'doc'} size={18} className="shrink-0 text-[var(--accent-soft)]" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-medium">
                      {d.label} {d.mandatory ? <Tag>required</Tag> : null}
                    </p>
                    <p className="mt-0.5 text-[12.5px] text-[var(--muted)]">{d.note || 'Filed by the breeder and reviewed by the compliance desk.'}</p>
                  </div>
                  <span className="text-[12px] text-[var(--muted)]">expires {d.expires}</span>
                  <Badge tone={d.status === 'Verified' ? 'ok' : d.status === 'Pending' ? 'warn' : d.status === 'Rejected' ? 'bad' : 'quiet'}>{d.status}</Badge>
                  {d.accessible ? (
                    <Link href={`/documents/${d.label}`} className="btn btn-ghost btn-sm">
                      <Icon name="eye" size={15} /> View
                    </Link>
                  ) : (
                    <span className="flex items-center gap-1 text-[12px] text-[var(--muted)]">
                      <Icon name="lock" size={13} /> private
                    </span>
                  )}
                </li>
              ))}
              {!docs.length ? <li className="p-5"><EmptyState compact icon="doc" title="No documents attached yet" body="This listing cannot go live until the required paperwork is filed and verified." /></li> : null}
            </ul>
          </Section>

          {/* -------------------------------------------------------- shipping */}
          <Section title="Getting it home" lead={`Quoted from ${String(b.city)}, ${String(b.state)} to ${v.destination.label}. Method availability is decided by the compliance engine, not by the seller.`}>
            <div className="grid grid-cols-3 gap-3">
              {v.quotes.map((q) => (
                <div key={q.method} className={`group-card p-5 ${q.available ? '' : 'opacity-60'}`}>
                  <div className="flex items-center justify-between">
                    <Icon name={q.method === 'LOCAL_PICKUP' ? 'location' : q.method === 'BREEDER_DELIVERY' ? 'store' : 'truck'} size={18} />
                    <Badge tone={q.available ? 'ok' : 'bad'}>{q.available ? 'available' : 'blocked'}</Badge>
                  </div>
                  <p className="mt-3 text-[14.5px] font-medium">{q.label}</p>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--muted)]">{q.unavailable_reason ?? q.blurb}</p>
                  <div className="mt-3 flex items-end justify-between border-t border-[var(--line)] pt-3">
                    <span className="price text-[16px]">{q.cost_cents ? money(q.cost_cents) : 'Included'}</span>
                    <span className="text-[12px] text-[var(--muted)]">{q.eta_days} day transit</span>
                  </div>
                  {q.temp_controlled ? (
                    <p className="mt-2 flex items-center gap-1.5 text-[12px] text-[var(--warning)]">
                      <Icon name="thermometer" size={13} /> temperature-controlled crate
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </Section>

          {/* --------------------------------------------------------- breeder */}
          <Section title="The breeder" action={<Link href={`/breeders/${String(b.slug)}`} className="btn btn-quiet btn-sm">Visit storefront <Icon name="chevronRight" size={14} /></Link>}>
            <div className="grid grid-cols-[1fr_1.2fr] gap-6">
              <div className="card p-6">
                <div className="flex items-start gap-4">
                  <Media media={{ path_medium: b.logo_path ? String(b.logo_path) : null, width: 96, height: 96 }} alt={String(b.business_name)} ratio="1 / 1" className="w-16 shrink-0 rounded-full border border-[var(--line)]" />
                  <div className="min-w-0">
                    <p className="h4 flex items-center gap-2">
                      {String(b.business_name)} <VerifiedMark tier={String(b.tier)} />
                    </p>
                    <p className="mt-1 text-[13px] text-[var(--muted)]">
                      {String(b.city)}, {String(b.state)} · member since {String(b.created_at).slice(0, 7)}
                    </p>
                    <div className="mt-2 flex items-center gap-3">
                      <Stars value={Number(b.rating_avg)} count={Number(b.rating_count)} />
                    </div>
                  </div>
                </div>
                <p className="mt-4 text-[13.5px] leading-relaxed text-[var(--muted)]">{String(b.bio ?? '')}</p>
                <div className="mt-4 grid grid-cols-3 gap-3 border-t border-[var(--line)] pt-4 text-center">
                  <div>
                    <p className="h4">{Number(b.transactions_count)}</p>
                    <p className="text-[11.5px] text-[var(--muted)]">transfers</p>
                  </div>
                  <div>
                    <p className="h4">{Number(b.response_hours ?? 4)} h</p>
                    <p className="text-[11.5px] text-[var(--muted)]">reply time</p>
                  </div>
                  <div>
                    <p className="h4">{Number(b.years_active)} yr</p>
                    <p className="text-[11.5px] text-[var(--muted)]">breeding on site</p>
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <FollowBreederButton breederId={String(b.id)} businessName={String(b.business_name)} />
                  <Link href={`/breeders/${String(b.slug)}?tab=reviews`} className="btn btn-ghost btn-sm">
                    Read {Number(b.rating_count)} reviews
                  </Link>
                </div>
              </div>
              <div className="card p-6">
                <p className="label">Recent buyer reviews</p>
                <ul className="mt-3 space-y-4">
                  {v.reviews.slice(0, 3).map((r) => (
                    <li key={String(r.id)} className="border-b border-[var(--line)] pb-3 last:border-0 last:pb-0">
                      <div className="flex items-center justify-between">
                        <span className="text-[13px] font-medium">
                          {String(r.first_name)} {String(r.last_name ?? '').slice(0, 1)}.
                        </span>
                        <Stars value={Number(r.rating)} showValue={false} />
                      </div>
                      <p className="mt-1.5 text-[13.5px] leading-relaxed text-[var(--muted)]">{String(r.title)}. {String(r.body)}</p>
                    </li>
                  ))}
                  {!v.reviews.length ? <li className="text-[13px] text-[var(--muted)]">No published reviews yet — reviews only open after a completed, escrow-released order.</li> : null}
                </ul>
              </div>
            </div>
          </Section>

          {/* ------------------------------------------------------------ faq */}
          <Section title="Questions buyers ask" lead="Written from the actual compliance verdict and husbandry record for this listing.">
            <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)]">
              {questions.map((q, i) => (
                <Accordion key={q.q} title={q.q} defaultOpen={i === 0}>
                  <p className="text-[14px] leading-relaxed text-[var(--muted)]">{q.a}</p>
                </Accordion>
              ))}
            </div>
          </Section>
        </div>

        {/* ------------------------------------------------------ purchase rail */}
        <aside className="sticky top-[92px]">
          <div className="card p-6">
            <div className="flex items-end justify-between">
              <div>
                <Money cents={Number(a.price_cents)} size="xl" />
                {Number(a.deposit_cents) > 0 ? (
                  <p className="mt-1 text-[12.5px] text-[var(--muted)]">or {money(Number(a.deposit_cents))} deposit to reserve</p>
                ) : (
                  <p className="mt-1 text-[12.5px] text-[var(--muted)]">full payment held in escrow</p>
                )}
              </div>
              <span className={`text-[12px] font-medium ${available ? 'text-[var(--success)]' : 'text-[var(--muted)]'}`}>
                {available ? 'Available' : titleCase(String(a.availability))}
              </span>
            </div>

            <div className="mt-4 flex items-center gap-2 text-[12.5px] text-[var(--muted)]">
              <Icon name="location" size={14} />
              Ships from {String(a.city)}, {String(a.state)} · to {v.destination.label}
              <Link href="/profile/settings" className="link">
                change
              </Link>
            </div>

            <div className="mt-5 space-y-2">
              <AddToCartButton animalId={String(a.id)} blockedReason={action.blockedReason} label={action.label} />
              <ContactBreederButton animalId={String(a.id)} sellerUserId={String(b.user_id)} price={money(Number(a.price_cents))} name={String(a.name)} />
              <div className="flex gap-2">
                <FavoriteButton animalId={String(a.id)} initial={v.isFavorite} label="Save for later" variant="row" />
                <ShareButton title={`${String(a.name)} — ${String(s.common_name)}`} url={`/animals/${String(a.slug)}`} />
              </div>
            </div>

            {!available ? (
              <div className="mt-4 flex gap-2 rounded-lg bg-[var(--surface-2)] p-3 text-[12.5px] leading-relaxed text-[var(--muted)]">
                <Icon name="info" size={14} className="mt-0.5 shrink-0" />
                {String(a.availability) === 'SOLD_OUT'
                  ? 'This animal is placed. Save the listing and the breeder will be notified of interest in similar offspring.'
                  : 'This listing is not currently purchasable — see the compliance panel for the exact reason.'}
              </div>
            ) : null}

            <ul className="mt-5 space-y-2.5 border-t border-[var(--line)] pt-5">
              {trustPoints(v).map((t) => (
                <li key={t} className="flex gap-2 text-[12.5px] leading-relaxed text-[var(--muted)]">
                  <Icon name="shield" size={14} className="mt-0.5 shrink-0 text-[var(--success)]" />
                  {t}
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-4 card-quiet p-5">
            <p className="label">Shipping options at checkout</p>
            <ul className="mt-2.5 space-y-2">
              {v.quotes.map((q) => (
                <li key={q.method} className="flex items-center justify-between text-[13px]">
                  <span className={q.available ? '' : 'text-[var(--muted)] line-through decoration-[var(--error)]/50'}>{q.label}</span>
                  <span className="mono text-[12px] text-[var(--muted)]">{q.available ? money(q.cost_cents) : 'blocked'}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11.5px] leading-relaxed text-[var(--muted)]">
              {v.verdict.blockedMethods.length
                ? `Blocked for this route: ${v.verdict.blockedMethods.map((m) => `${titleCase(m.method)} — ${m.reason}`).join(' · ')}.`
                : 'No transport restriction applies to this route.'}
            </p>
          </div>
        </aside>
      </div>

      {v.similar.length ? (
        <Section title="More like this" lead={`${v.similar.length} live ${String(s.common_name).toLowerCase()} listings that also clear your jurisdiction.`}>
          <div className="grid grid-cols-4 gap-5">
            {v.similar.map((card) => (
              <DesktopAnimalCard key={String(card.id)} animal={card as never} />
            ))}
          </div>
        </Section>
      ) : null}
    </div>
  );
}
