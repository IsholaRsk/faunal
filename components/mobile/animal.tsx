'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { MobileHeader } from '@/components/shell/mobile';
import { Media, Badge, Money, Stars, VerifiedMark, DataRow, ComplianceBadge, Tag } from '@/components/ui/primitives';
import { Accordion, FavoriteButton, ContactBreederButton, ShareButton, ReportDialog, FollowBreederButton } from '@/components/ui/interactions';
import { MobileAnimalCard } from '@/components/ui/cards';
import { useApp, requireAuth } from '@/lib/ui/app-provider';
import { post, ApiError } from '@/lib/ui/api';
import { money, husbandryRows, specRows, documents, faq, trustPoints, verdictHeadline, verdictTone, primaryActionLabel, isAvailable, type AnimalView } from '@/lib/ui/animal-view';
import { titleCase } from '@/domain/util';

/**
 * MOBILE animal detail — an app screen, not a squeezed page: full-bleed swipe
 * gallery, progressive disclosure through accordions, and a sticky dual CTA
 * (Contact Breeder / Buy Now) that respects the iOS home-indicator safe area.
 */
export function MobileAnimal({ v }: { v: AnimalView }) {
  const a = v.animal;
  const s = v.species;
  const b = v.breeder;
  const tone = verdictTone(v.verdict.verdict);
  const action = primaryActionLabel(v);
  const available = isAvailable(v);
  const docs = documents(v);
  const questions = faq(v);
  const gallery: { src: string; alt: string; kind?: 'image' | 'video'; poster?: string }[] = v.images.map((img) => ({
    src: String(img.path_medium ?? img.base_path),
    alt: String(img.alt ?? `${a.name}`),
    poster: String(img.path_thumb ?? ''),
  }));
  for (const video of v.videos) gallery.push({ src: String(video.storage_path ?? video.url ?? ''), alt: 'video', kind: 'video' as const });
  const facts = specRows(v).slice(0, 4);

  return (
    <div className="flex flex-col">
      <MobileHeader
        title={String(a.name)}
        subtitle={`${String(s.common_name)}${a.morph_name ? ` · ${String(a.morph_name)}` : ''}`}
        back="/animals"
        actions={
          <>
            <ShareButton title={`${String(a.name)}`} url={`/animals/${String(a.slug)}`} />
          </>
        }
      />

      <div className="relative">
        {gallery.length ? (
          <GalleryFull items={gallery} />
        ) : (
          <div className="card-media" style={{ aspectRatio: '1 / 1', borderRadius: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/img/placeholder.svg" alt="Photography pending" className="h-full w-full object-cover" />
          </div>
        )}
      </div>

      <div className="px-4 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="h2">{String(a.name)}</h1>
            <p className="mt-0.5 text-[13px] text-[var(--muted)]">
              {String(s.common_name)} · <span className="italic">{String(s.scientific_name)}</span>
            </p>
          </div>
          <div className="shrink-0 text-right">
            <Money cents={Number(a.price_cents)} size="lg" />
            <p className="mt-0.5 text-[11.5px] text-[var(--muted)]">{available ? 'available now' : titleCase(String(a.availability))}</p>
          </div>
        </div>

        <div className="hscroll mt-3 flex gap-2">
          <ComplianceBadge verdict={String(v.verdict.verdict)} />
          <Badge icon="location">
            {String(a.city)}, {String(a.state)}
          </Badge>
          <Badge icon="leaf">{titleCase(String(a.experience_level))} care</Badge>
          {Number(a.is_featured) ? (
            <Badge tone="ink" icon="sparkle">
              Featured
            </Badge>
          ) : null}
          {Number(s.is_sensitive) ? (
            <Badge tone="warn" icon="shield">
              Sensitive
            </Badge>
          ) : null}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
          {facts.map((f) => (
            <DataRow key={f.label} label={f.label} value={f.value} />
          ))}
        </div>

        {/* ------------------------------------------------ compliance verdict */}
        <section className={`mt-4 rounded-xl border p-4 tone-${tone}`}>
          <div className="flex items-center gap-2">
            <Icon name={tone === 'ok' ? 'verified' : tone === 'warn' ? 'alert' : 'ban'} size={17} />
            <p className="text-[13.5px] font-semibold uppercase tracking-wide">{titleCase(String(v.verdict.verdict))}</p>
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-[var(--muted)]">{verdictHeadline(v)}</p>
          <Link href="/compliance" className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium">
            Why FAUNAL decided this <Icon name="chevronRight" size={14} />
          </Link>
        </section>

        <div className="mt-4 flex gap-2">
          <FavoriteButton animalId={String(a.id)} initial={v.isFavorite} label={v.isFavorite ? 'Saved' : 'Save'} variant="row" />
          <FollowBreederButton breederId={String(b.id)} businessName={String(b.business_name)} />
          <ReportDialog targetType="ANIMAL" targetId={String(a.id)}>
            <span className="icon-btn" role="button" tabIndex={0} aria-label="Report listing">
              <Icon name="flag" size={16} />
            </span>
          </ReportDialog>
        </div>

        {/* ------------------------------------------------------- accordions */}
        <div className="mt-4 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)]">
          <Accordion title="About this animal" icon="info" defaultOpen>
            <p className="text-[13.5px] leading-relaxed">{String(a.description)}</p>
            <dl className="mt-3 space-y-2 border-t border-[var(--line)] pt-3">
              {specRows(v).map((r) => (
                <div key={r.label} className="flex items-baseline justify-between gap-4">
                  <dt className="text-[12.5px] text-[var(--muted)]">{r.label}</dt>
                  <dd className="text-right text-[13px]">{r.value}</dd>
                </div>
              ))}
            </dl>
          </Accordion>
          <Accordion title="Husbandry & setup" icon="thermometer">
            <dl className="space-y-2.5">
              {husbandryRows(v).map((r) => (
                <div key={r.label}>
                  <dt className="text-[12px] uppercase tracking-wide text-[var(--muted)]">{r.label}</dt>
                  <dd className="text-[13.5px] leading-snug">{r.value}</dd>
                </div>
              ))}
            </dl>
          </Accordion>
          <Accordion title={`Documentation (${docs.length})`} icon="doc" meta={docs.some((d) => d.status === 'Not Attached') ? <Tag>pending</Tag> : undefined}>
            <ul className="space-y-3">
              {docs.map((d) => (
                <li key={d.label} className="flex items-start gap-2.5">
                  <Icon
                    name={d.status === 'Verified' ? 'verified' : d.status === 'Pending' ? 'clock' : 'doc'}
                    size={16}
                    className={`mt-0.5 shrink-0 ${d.status === 'Verified' ? 'text-[var(--success)]' : 'text-[var(--muted)]'}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-medium leading-tight">
                      {d.label} {d.mandatory ? <Tag>required</Tag> : null}
                    </p>
                    <p className="mt-0.5 text-[12px] text-[var(--muted)]">
                      {d.status} · expires {d.expires} · {d.accessible ? 'viewable by you' : 'private to order participants'}
                    </p>
                    {d.note ? <p className="mt-1 text-[12px] leading-relaxed text-[var(--muted)]">{d.note}</p> : null}
                  </div>
                </li>
              ))}
            </ul>
          </Accordion>
          <Accordion title="Shipping & pickup" icon="truck">
            <ul className="space-y-3">
              {v.quotes.map((q) => (
                <li key={q.method} className={`flex items-start gap-2.5 ${q.available ? '' : 'opacity-55'}`}>
                  <Icon name={q.available ? 'check' : 'ban'} size={16} className={`mt-0.5 ${q.available ? 'text-[var(--success)]' : 'text-[var(--error)]'}`} />
                  <div className="flex-1">
                    <p className="text-[13.5px] font-medium">
                      {q.label} · <span className="mono font-normal">{q.cost_cents ? money(q.cost_cents) : 'included'}</span>
                    </p>
                    <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--muted)]">{q.unavailable_reason ?? q.blurb}</p>
                    {q.temp_controlled ? (
                      <p className="mt-1 flex items-center gap-1 text-[11.5px] text-[var(--warning)]">
                        <Icon name="thermometer" size={12} /> temperature-controlled crate
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </Accordion>
          <Accordion title="Health & guarantee" icon="shield">
            <ul className="space-y-2.5">
              {trustPoints(v).map((t) => (
                <li key={t} className="flex gap-2 text-[13px] leading-relaxed text-[var(--muted)]">
                  <Icon name="check" size={14} className="mt-0.5 shrink-0 text-[var(--success)]" />
                  {t}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[12px] leading-relaxed text-[var(--muted)]">
              Health status {titleCase(String(a.health_status ?? 'clear'))} · last check {String(a.last_health_check ?? '').slice(0, 10) || 'not recorded'}
              {String(a.diet) ? ` · on ${String(a.diet).toLowerCase()}` : ''}
            </p>
          </Accordion>
          <Accordion title="Breeder" icon="store">
            <div className="flex items-start gap-3">
              <Media media={{ path_medium: b.logo_path ? String(b.logo_path) : null }} alt={String(b.business_name)} ratio="1 / 1" className="w-12 shrink-0 rounded-full" />
              <div className="min-w-0">
                <p className="text-[14px] font-medium flex items-center gap-1.5">
                  {String(b.business_name)} <VerifiedMark tier={String(b.tier)} />
                </p>
                <div className="mt-1 flex items-center gap-2 text-[12px] text-[var(--muted)]">
                  <Stars value={Number(b.rating_avg)} count={Number(b.rating_count)} /> · {Number(b.transactions_count)} transfers
                </div>
                <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--muted)]">{String(b.bio ?? '')}</p>
                <Link href={`/breeders/${String(b.slug)}`} className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium">
                  View storefront <Icon name="chevronRight" size={14} />
                </Link>
              </div>
            </div>
          </Accordion>
          <Accordion title={`Reviews (${v.reviews.length})`} icon="star">
            <ul className="space-y-3.5">
              {v.reviews.slice(0, 4).map((r) => (
                <li key={String(r.id)}>
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-medium">
                      {String(r.first_name)} {String(r.last_name ?? '').slice(0, 1)}.
                    </span>
                    <Stars value={Number(r.rating)} showValue={false} />
                  </div>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--muted)]">{String(r.title)}. {String(r.body)}</p>
                </li>
              ))}
              {!v.reviews.length ? <li className="text-[12.5px] text-[var(--muted)]">Reviews open after a completed order with this breeder.</li> : null}
            </ul>
          </Accordion>
          <Accordion title="Buyer questions" icon="chat">
            <ul className="space-y-3.5">
              {questions.map((q) => (
                <li key={q.q}>
                  <p className="text-[13px] font-medium leading-snug">{q.q}</p>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--muted)]">{q.a}</p>
                </li>
              ))}
            </ul>
          </Accordion>
        </div>

        {v.similar.length ? (
          <section className="-mx-4 mt-5">
            <div className="flex items-baseline justify-between px-4">
              <h2 className="h4">More {String(s.common_name).toLowerCase()}</h2>
              <Link href={`/animals?species=${String(s.slug)}`} className="text-[12.5px] font-medium text-[var(--muted)]">
                See all
              </Link>
            </div>
            <div className="hscroll mt-2.5 flex gap-2.5 px-4">
              {v.similar.slice(0, 6).map((card) => (
                <div key={String(card.id)} className="w-[168px] shrink-0">
                  <MobileAnimalCard animal={card as never} />
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      {/* ---------------------------------------------------------- dual CTA */}
      <div className="sticky-cta">
        <ContactBreederButton animalId={String(a.id)} sellerUserId={String(b.user_id)} price={money(Number(a.price_cents))} name={String(a.name)} />
        <BuyNowButton animalId={String(a.id)} blocked={action.blockedReason} disabled={!available} />
      </div>
    </div>
  );
}

/** Swipeable full-bleed gallery with a live position indicator (spec §16). */
function GalleryFull({ items }: { items: { src: string; alt: string; kind?: 'image' | 'video' }[] }) {
  const [i, setI] = useState(0);
  return (
    <div className="relative">
      <div
        className="snap-gallery"
        onScroll={(e) => {
          const el = e.currentTarget;
          setI(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
        }}
      >
        {items.map((it, idx) => (
          <div key={idx} className="card-media" style={{ aspectRatio: '1 / 1', borderRadius: 0 }}>
            {it.kind === 'video' ? (
              <video src={it.src} controls playsInline muted className="h-full w-full object-cover" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={it.src} alt={it.alt} className="h-full w-full object-cover" loading={idx === 0 ? 'eager' : 'lazy'} />
            )}
          </div>
        ))}
      </div>
      {items.length > 1 ? (
        <span className="absolute right-3 top-3 rounded-full bg-black/45 px-2.5 py-1 text-[11.5px] font-medium text-white backdrop-blur-sm">
          {i + 1} / {items.length}
        </span>
      ) : null}
    </div>
  );
}

/** "Buy Now" adds to the cart through the real API — the compliance check runs server-side. */
function BuyNowButton({ animalId, blocked, disabled }: { animalId: string; blocked: string | null; disabled: boolean }) {
  const { user, toast, refresh, setBadges, badges } = useApp();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function buy() {
    if (!requireAuth(user, router)) return;
    if (blocked) {
      toast(blocked, { tone: 'warn' });
      return;
    }
    setBusy(true);
    try {
      await post('cart', { animalId });
      setBadges({ cart: badges.cart + 1 });
      refresh();
      router.push('/checkout');
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not start checkout', { tone: 'error' });
      if (e instanceof ApiError && e.status === 451) router.push('/cart');
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className="btn" onClick={buy} disabled={busy || disabled}>
      {busy ? <Icon name="refresh" size={15} className="animate-spin" /> : <Icon name="lock" size={15} />}
      {disabled ? 'Not available' : busy ? 'Checking…' : 'Buy now'}
    </button>
  );
}
