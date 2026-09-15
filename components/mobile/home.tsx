'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { MobileAnimalCard, CategoryPill, BreederCard } from '@/components/ui/cards';
import { Media, Money, EmptyState } from '@/components/ui/primitives';
import type { AnimalCard } from '@/repo/catalog';
import { useApp } from '@/lib/ui/app-provider';

/**
 * MOBILE home — an app home screen: greeting + location, search entry,
 * horizontal categories, two-up product grid, progressive disclosure.
 * No desktop grid was squeezed to make this (spec §9).
 */
export function MobileHome({
  firstName,
  city,
  categories,
  featured,
  recommended,
  breeders,
  guides,
  recentlyViewed,
  unread,
  destinationState,
}: {
  firstName: string;
  city: string;
  categories: { slug: string; name: string; icon: string | null; animal_count: number }[];
  featured: AnimalCard[];
  recommended: AnimalCard[];
  breeders: Record<string, string | number | null>[];
  guides: Record<string, string | number | null>[];
  recentlyViewed: AnimalCard[];
  unread: number;
  destinationState: string | null;
}) {
  const { badges, user } = useApp();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="pb-6">
      <header className="mobile-header">
        <div className="mobile-sub flex items-center gap-2 pt-2">
          <button className="flex min-w-0 flex-1 items-center gap-1.5 text-left" onClick={() => undefined}>
            <span className="min-w-0">
              <span className="block truncate text-[17px] font-semibold leading-tight tracking-[-0.02em]">
                {greeting}, {firstName}
              </span>
              <span className="mt-0.5 flex items-center gap-1 text-[12px] text-[var(--muted)]">
                <Icon name="location" size={12} /> {city}
                {destinationState ? <span className="text-[var(--line)]">·</span> : null}
                {destinationState ? <span className="text-[11px]">{destinationState} rules on</span> : null}
              </span>
            </span>
          </button>
          <Link href="/notifications" className="icon-btn relative" aria-label="Notifications">
            <Icon name="bell" size={20} />
            {badges.unreadNotifications ? (
              <span className="absolute right-1.5 top-1.5 h-[7px] w-[7px] rounded-full bg-[var(--danger)]" />
            ) : null}
          </Link>
        </div>

        <div className="mobile-sub pb-3 pt-2">
          <Link
            href="/search"
            className="flex h-11 items-center gap-2.5 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[14px] text-[var(--muted)]"
          >
            <Icon name="search" size={17} />
            <span className="flex-1 truncate">Search animals, species or breeders</span>
            <span className="grid h-6 w-6 place-items-center rounded-md bg-[var(--surface-2)]">
              <Icon name="sparkle" size={13} />
            </span>
          </Link>
        </div>
      </header>

      <nav className="hscroll pb-1 pt-1" aria-label="Categories">
        <Link href="/explore" className="chip shrink-0" data-active>
          <Icon name="grid" size={14} /> All
        </Link>
        {categories.map((c) => (
          <CategoryPill key={c.slug} {...c} count={c.animal_count} />
        ))}
      </nav>

      <section className="mobile-screen mt-4">
        <PromoCard breedersCount={breeders.length} />
      </section>

      <HomeSection title="Featured animals" href="/animals?featured=1">
        <div className="grid grid-cols-2 gap-x-3 gap-y-6">
          {featured.slice(0, 6).map((a, i) => (
            <MobileAnimalCard key={a.id} animal={a} priority={i < 2} />
          ))}
        </div>
      </HomeSection>

      {recommended.length ? (
        <HomeSection title="Recommended for you" href="/assistant" actionLabel="Ask the AI">
          <div className="hscroll gap-3">
            {recommended.map((a) => (
              <Link key={a.id} href={`/animals/${a.slug}`} className="w-[190px] shrink-0">
                <div className="card-media" style={{ aspectRatio: '4 / 3' }}>
                  <Media media={{ path_small: a.image_small ?? a.image_medium }} alt={a.name} ratio="4 / 3" sizes="52vw" />
                </div>
                <div className="pt-2 text-[13px] font-semibold leading-tight">{a.species_name}</div>
                <div className="text-[11.5px] text-[var(--muted)]">
                  {a.morph_name ?? a.city} · <Money cents={a.price_cents} size="sm" className="inline" />
                </div>
              </Link>
            ))}
          </div>
        </HomeSection>
      ) : (
        <HomeSection title="Trending in your region" href="/explore">
          <div className="hscroll gap-3">
            {featured.slice(0, 6).map((a) => (
              <Link key={a.id} href={`/animals/${a.slug}`} className="w-[150px] shrink-0">
                <div className="card-media" style={{ aspectRatio: '3 / 4' }}>
                  <Media media={{ path_small: a.image_small ?? a.image_medium }} alt={a.name} ratio="3 / 4" sizes="44vw" />
                </div>
                <div className="pt-2 text-[12.5px] font-semibold leading-tight">{a.name}</div>
                <Money cents={a.price_cents} size="sm" />
              </Link>
            ))}
          </div>
        </HomeSection>
      )}

      <HomeSection title="Verified breeders" href="/breeders">
        <div className="card px-3.5 py-1">
          {breeders.slice(0, 4).map((b) => (
            <BreederCard key={String(b.id)} breeder={b} surface="mobile" />
          ))}
        </div>
      </HomeSection>

      <HomeSection title="Care guides" href="/guides">
        <div className="hscroll gap-3">
          {guides.slice(0, 4).map((g) => (
            <Link key={String(g.slug)} href={`/guides/${g.slug}`} className="w-[230px] shrink-0 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
              <div className="card-media" style={{ aspectRatio: '16 / 9', borderRadius: 0 }}>
                <Media media={{ path_small: '/img/derived/guide-care-small.webp', path_medium: String(g.cover_path ?? '/img/derived/guide-care-medium.webp') }} alt={String(g.title)} ratio="16 / 9" sizes="62vw" />
              </div>
              <div className="p-3">
                <div className="text-[13px] font-semibold leading-snug">{g.title as string}</div>
                <div className="mt-1 text-[11.5px] text-[var(--muted)]">{g.reading_minutes as number} min · {String(g.difficulty).toLowerCase()}</div>
              </div>
            </Link>
          ))}
        </div>
      </HomeSection>

      {recentlyViewed.length ? (
        <HomeSection title="Recently viewed" href="/explore">
          <div className="hscroll gap-3">
            {recentlyViewed.map((a) => (
              <Link key={a.id} href={`/animals/${a.slug}`} className="w-[120px] shrink-0">
                <div className="card-media" style={{ aspectRatio: '1 / 1' }}>
                  <Media media={{ path_small: a.image_small }} alt={a.name} ratio="1 / 1" sizes="34vw" />
                </div>
                <div className="pt-1.5 text-[12px] font-medium leading-tight">{a.name}</div>
                <div className="text-[11px] text-[var(--muted)]">{a.species_name}</div>
              </Link>
            ))}
          </div>
        </HomeSection>
      ) : null}

      {!user ? (
        <div className="mobile-screen mt-8">
          <div className="rounded-2xl bg-[var(--ink)] p-5 text-[#F2F2EF]">
            <h3 className="font-display text-[19px] leading-snug">Create an account to save favorites, chat with breeders and buy with escrow protection.</h3>
            <div className="mt-4 flex gap-2.5">
              <Link href="/signup" className="btn bg-white text-[var(--ink)]" style={{ borderColor: '#fff' }}>
                Create account
              </Link>
              <Link href="/login" className="btn btn-ghost text-[#C9C9C2]">
                Sign in
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function HomeSection({ title, href, children, actionLabel }: { title: string; href?: string; children: React.ReactNode; actionLabel?: string }) {
  return (
    <section className="mt-8">
      <div className="mobile-sub mb-3 flex items-baseline justify-between">
        <h2 className="text-[16px] font-semibold tracking-[-0.01em]">{title}</h2>
        {href ? (
          <Link href={href} className="flex items-center gap-0.5 text-[12.5px] text-[var(--muted)]">
            {actionLabel ?? 'See all'} <Icon name="chevronRight" size={13} />
          </Link>
        ) : null}
      </div>
      <div className="mobile-sub">{children}</div>
    </section>
  );
}

function PromoCard({ breedersCount }: { breedersCount: number }) {
  const [offset, setOffset] = useState(0);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => setOffset(Math.min(1, el.getBoundingClientRect().top / -260));
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <Link href="/compliance" className="block overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
      <div className="relative">
        <div className="card-media" style={{ aspectRatio: '16 / 7', borderRadius: 0 }}>
          <Media
            media={{
              path_medium: '/img/derived/breeder-facility-medium.webp',
              path_small: '/img/derived/breeder-facility-small.webp',
              path_large: '/img/derived/breeder-facility-large.webp',
            }}
            alt="A FAUNAL verified breeding facility"
            ratio="16 / 7"
            sizes="92vw"
            priority
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-[rgba(21,21,21,0.82)] to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-3.5 text-white">
          <div className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.16em] text-white/75">
            <Icon name="shield" size={12} /> {breedersCount} verified sellers
          </div>
          <div className="mt-1 font-display text-[17px] leading-snug">Every listing cleared for your state before you can buy</div>
        </div>
      </div>
    </Link>
  );
}
