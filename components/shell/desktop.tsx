'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { Logo } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/primitives';
import { useApp } from '@/lib/ui/app-provider';
import { patch, post } from '@/lib/ui/api';
import { ExperienceToggle } from '@/components/ui/interactions';
import { translate } from '@/lib/ui/i18n';

/**
 * DESKTOP shell — a horizontal marketplace header with a category mega panel,
 * inline search, account tray and a wide footer. This layout has no mobile
 * counterpart; the two only share data and behaviour (spec §27 / §50).
 */

/** Populated from the jurisdictions table by the root layout — only reviewed states are offered. */
export type StateOption = { code: string; name: string; rules: number; animals: number };

export function DesktopShell({
  children,
  categories,
  topSearches,
  states,
}: {
  children: React.ReactNode;
  categories: { slug: string; name: string; blurb: string | null; icon: string | null; animal_count?: number }[];
  topSearches: string[];
  states: StateOption[];
}) {
  const { user, badges, locale, currency } = useApp();
  const t = translate(locale);
  const [megaOpen, setMegaOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [tray, setTray] = useState<null | 'notif' | 'account'>(null);
  const [stateOpen, setStateOpen] = useState(false);
  const [query, setQuery] = useState('');
  const router = useRouter();
  const headerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      if (!el.closest('[data-tray]')) setTray(null);
      if (!el.closest('[data-mega]')) setMegaOpen(false);
      if (!el.closest('[data-state]')) setStateOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    router.push(q ? `/search?q=${encodeURIComponent(q)}` : '/search');
    setSearchOpen(false);
  }

  return (
    <div className="fx-desktop min-h-dvh bg-[var(--canvas)]">
      <div className="border-b border-[var(--line)] bg-[var(--ink)] text-[#EDEDEA]">
        <div className="shell flex h-9 items-center justify-between text-[12px]">
          <p className="flex items-center gap-2">
            <Icon name="shield" size={13} />
            Every listing is screened against federal, state and city wildlife law before it can be bought.
          </p>
          <div className="flex items-center gap-4">
            <span className="text-[#B9B9B2]">Compliance desk · Mon–Sat</span>
            <Link className="text-[#EDEDEA] hover:underline underline-offset-4" href="/compliance">
              How legality works
            </Link>
          </div>
        </div>
      </div>

      <header ref={headerRef} data-mega className="sticky top-0 z-50 border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] backdrop-blur-xl" data-stuck="false">
        <div className="shell flex h-[68px] items-center gap-7">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo size={26} />
            <span className="font-display text-[19px] font-semibold tracking-[0.06em]">FAUNAL</span>
          </Link>

          <nav className="flex items-center gap-6">
            <Link className="navlink" href="/">
              {t('nav.home')}
            </Link>
            <Link className="navlink" href="/animals">
              {t('nav.animals')}
            </Link>
            <button className="navlink" data-active={megaOpen} onClick={() => setMegaOpen((v) => !v)}>
              {t('nav.categories') ?? 'Categories'}
              <Icon name="chevronDown" size={13} />
            </button>
            <Link className="navlink" href="/breeders">
              {t('nav.breeders')}
            </Link>
            <Link className="navlink" href="/guides">
              {t('nav.guides')}
            </Link>
            <Link className="navlink" href="/about">
              {t('nav.about') ?? 'About'}
            </Link>
          </nav>

          <div className="ml-auto flex items-center gap-1.5">
            <form onSubmit={submitSearch} data-tray className="relative">
              <div className="flex h-10 items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3.5 transition-all focus-within:border-[var(--ink)]">
                <Icon name="search" size={16} className="text-[var(--muted)]" />
                <input
                  value={query}
                  onFocus={() => setSearchOpen(true)}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Escape' && setSearchOpen(false)}
                  placeholder={t('action.search')}
                  aria-label="Search"
                  className="w-[210px] bg-transparent text-[13.5px] outline-none placeholder:text-[#a3a39c] focus:w-[300px]"
                  style={{ transition: 'width .25s cubic-bezier(.22,.61,.36,1)' }}
                />
              </div>
              {searchOpen && (query || topSearches.length) ? (
                <div className="absolute right-0 top-[46px] w-[360px] rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 shadow-lift anim-in">
                  {query ? (
                    <button onClick={submitSearch} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13.5px] hover:bg-[var(--surface-2)]">
                      <Icon name="sparkle" size={15} className="text-[var(--muted)]" />
                      Interpret “<span className="font-medium">{query}</span>” as filters
                    </button>
                  ) : null}
                  {topSearches.slice(0, 5).map((s) => (
                    <button
                      key={s}
                      onClick={() => {
                        setQuery(s);
                        router.push(`/animals?q=${encodeURIComponent(s)}`);
                        setSearchOpen(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13.5px] text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
                    >
                      <Icon name="clock" size={14} /> {s}
                    </button>
                  ))}
                </div>
              ) : null}
            </form>

            <Link href="/assistant" className="icon-btn" title="AI animal assistant" aria-label="AI animal assistant">
              <Icon name="sparkle" size={19} />
            </Link>

            <div className="relative" data-state>
              <button className="chip mt-0.5" onClick={() => setStateOpen((v) => !v)}>
                <Icon name="location" size={13} />
                {user?.jurisdictionCode ? `Ship to ${user.jurisdictionCode}` : 'Set your state'}
              </button>
              {stateOpen ? (
                <div className="absolute right-0 top-[42px] z-50 w-[240px] rounded-xl border border-[var(--line)] bg-[var(--surface)] p-2 shadow-lift anim-in">
                  <p className="px-2 py-1.5 text-[11.5px] leading-snug text-[var(--muted)]">
                    Legality, shipping and tax are recomputed for this state.
                  </p>
                  <div className="max-h-[300px] overflow-y-auto">
                    {states.map(({ code, name }) => (
                      <button
                        key={code}
                        onClick={async () => {
                          if (!user) {
                            router.push('/signup');
                            return;
                          }
                          await patch('profile', { state: code });
                          setStateOpen(false);
                          router.refresh();
                        }}
                        className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-[var(--surface-2)]"
                      >
                        {name} <span className="mono text-[var(--muted)]">{code}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <Link href="/favorites" className="icon-btn relative" aria-label={t('nav.favorites')}>
              <Icon name="heart" size={19} />
              {badges.favorites ? <Dot n={badges.favorites} /> : null}
            </Link>
            <Link href="/cart" className="icon-btn relative" aria-label={t('nav.cart')}>
              <Icon name="cart" size={19} />
              {badges.cart ? <Dot n={badges.cart} /> : null}
            </Link>

            <div className="relative" data-tray>
              <button className="icon-btn relative" aria-label="Notifications" onClick={() => setTray(tray === 'notif' ? null : 'notif')}>
                <Icon name="bell" size={19} />
                {badges.unreadNotifications ? <Dot n={badges.unreadNotifications} /> : null}
              </button>
              {tray === 'notif' ? <NotificationTray onRead={() => router.refresh()} /> : null}
            </div>

            {user ? (
              <div className="relative ml-1" data-tray>
                <button className="flex items-center gap-2 rounded-full border border-[var(--line)] py-1 pl-1 pr-3 hover:bg-[var(--surface-2)]" onClick={() => setTray(tray === 'account' ? null : 'account')}>
                  <Avatar name={`${user.firstName} ${user.lastName}`} src={user.avatarPath} size={26} />
                  <span className="text-[13px] font-medium">{user.firstName}</span>
                  <Icon name="chevronDown" size={13} className="text-[var(--muted)]" />
                </button>
                {tray === 'account' ? <AccountTray onDone={() => setTray(null)} /> : null}
              </div>
            ) : (
              <div className="ml-1 flex items-center gap-2">
                <Link href="/login" className="btn btn-ghost">
                  Sign in
                </Link>
                <Link href="/become-a-breeder" className="btn btn-sm">
                  Sell on FAUNAL
                </Link>
              </div>
            )}
          </div>
        </div>

        {megaOpen ? (
          <div className="mega" data-mega>
            <div className="shell grid grid-cols-4 gap-8 py-8">
              {categories.map((c) => (
                <Link key={c.slug} href={`/categories/${c.slug}`} className="group block" onClick={() => setMegaOpen(false)}>
                  <span className="mb-2 grid h-10 w-10 place-items-center rounded-xl border border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)] transition group-hover:bg-[var(--ink)] group-hover:text-white">
                    <Icon name={(c.icon as never) || 'paw'} size={18} />
                  </span>
                  <div className="text-[15px] font-semibold tracking-[-0.01em]">{c.name}</div>
                  <p className="mt-0.5 max-w-[30ch] text-[13px] leading-snug text-[var(--muted)]">{c.blurb}</p>
                  <span className="mt-2 inline-block text-[12px] text-[var(--accent-soft)]">{c.animal_count ?? 0} available</span>
                </Link>
              ))}
            </div>
            <div className="border-t border-[var(--line)] bg-[var(--surface-2)]">
              <div className="shell flex items-center justify-between py-3 text-[12.5px] text-[var(--muted)]">
                <span className="flex items-center gap-2">
                  <Icon name="scale" size={14} /> Species legality differs by state — set yours in the header to filter automatically.
                </span>
                <Link href="/compliance" className="link">
                  Read the compliance method
                </Link>
              </div>
            </div>
          </div>
        ) : null}
      </header>

      <main className="min-h-[60vh]">{children}</main>

      <footer className="mt-16 border-t border-[var(--line)] bg-[var(--surface)]">
        <div className="shell grid grid-cols-4 gap-10 py-14">
          <div>
            <div className="flex items-center gap-2.5">
              <Logo size={24} />
              <span className="font-display text-[17px] font-semibold tracking-[0.06em]">FAUNAL</span>
            </div>
            <p className="mt-3 max-w-[34ch] text-[13.5px] leading-relaxed text-[var(--muted)]">
              A New York–built marketplace for legally permitted exotic animals, connecting private keepers with licensed,
              document-verified breeders.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="badge">Est. New York, USA</span>
              <span className="badge">USD settlement</span>
            </div>
          </div>
          <FooterCol
            title="Marketplace"
            links={[
              ['All animals', '/animals'],
              ['Reptiles', '/categories/reptiles'],
              ['Birds', '/categories/birds'],
              ['Fish', '/categories/fish'],
              ['Verified breeders', '/breeders'],
            ]}
          />
          <FooterCol
            title="Trust & legality"
            links={[
              ['How compliance works', '/compliance'],
              ['Documentation standards', '/compliance/documents'],
              ['Shipping live animals', '/compliance/shipping'],
              ['Buyer protection', '/compliance/protection'],
              ['Report a listing', '/report'],
            ]}
          />
          <FooterCol
            title="Company"
            links={[
              ['About FAUNAL', '/about'],
              ['Sell on FAUNAL', '/become-a-breeder'],
              ['Care guides', '/guides'],
              ['AI assistant', '/assistant'],
              ['Terms & privacy', '/legal'],
            ]}
          />
        </div>
        <div className="border-t border-[var(--line)]">
          <div className="shell flex flex-wrap items-center justify-between gap-3 py-5 text-[12.5px] text-[var(--muted)]">
            <span>© {new Date().getFullYear()} FAUNAL Marketplace, Inc. · 274 Madison Ave, New York, NY 10016</span>
            <span className="flex items-center gap-4">
              <ExperienceToggle current="desktop" />
              <span>Currency {currency} · Language {locale.toUpperCase()}</span>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Dot({ n }: { n: number }) {
  return (
    <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--ink)] px-1 text-[10px] font-semibold text-white">
      {n > 99 ? '99+' : n}
    </span>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <div className="eyebrow">{title}</div>
      <ul className="mt-3 space-y-2 text-[13.5px]">
        {links.map(([label, href]) => (
          <li key={label}>
            <Link href={href} className="text-[var(--muted)] hover:text-[var(--ink)]">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

const NOTIF_ICON: Record<string, string> = {
  ORDER_UPDATE: 'box',
  PAYMENT: 'card',
  MESSAGE: 'chat',
  FAVORITE_UPDATE: 'heart',
  PRICE_DROP: 'tag',
  LISTING_AVAILABLE: 'bell',
  BREEDER_VERIFICATION: 'verified',
  SYSTEM: 'info',
  COMPLIANCE: 'scale',
  FRAUD: 'alert',
};

function NotificationTray({ onRead }: { onRead: () => void }) {
  const [items, setItems] = useState<Record<string, string | null>[] | null>(null);
  useEffect(() => {
    fetch('/api/notifications', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => setItems(d.items ?? []))
      .catch(() => setItems([]));
  }, []);
  return (
    <div className="absolute right-0 top-[46px] z-50 w-[380px] overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] shadow-lift anim-in">
      <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-2.5">
        <span className="text-[13px] font-semibold">Notifications</span>
        <button
          className="text-[12px] text-[var(--muted)] hover:text-[var(--ink)]"
          onClick={async () => {
            await post('notifications/read', {});
            onRead();
            setItems((prev) => (prev ?? []).map((i) => ({ ...i, read_at: new Date().toISOString() })));
          }}
        >
          Mark all read
        </button>
      </div>
      <div className="max-h-[420px] overflow-y-auto">
        {items === null ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-12 rounded-lg" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-[var(--muted)]">Nothing new yet.</p>
        ) : (
          items.slice(0, 12).map((n) => (
            <Link
              key={String(n.id)}
              href={n.href ?? '/notifications'}
              onClick={async () => {
                await post('notifications/read', { id: n.id });
                onRead();
              }}
              className="flex gap-3 border-b border-[var(--line)] px-4 py-3 last:border-0 hover:bg-[var(--surface-2)]"
            >
              <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[var(--surface-2)] text-[var(--muted)]">
                <Icon name={(NOTIF_ICON[String(n.kind)] ?? 'info') as never} size={14} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-medium">{n.title}</span>
                <span className="mt-0.5 block line-clamp-2 text-[12.5px] leading-snug text-[var(--muted)]">{n.body}</span>
              </span>
              {n.read_at ? null : <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--ink)]" />}
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

function AccountTray({ onDone }: { onDone: () => void }) {
  const { user } = useApp();
  const router = useRouter();
  const items: [string, string, string][] = [
    ['Profile dashboard', '/profile', 'user'],
    ['My orders', '/orders', 'box'],
    ['Messages', '/messages', 'chat'],
    ['Favorites', '/favorites', 'heart'],
    ['Seller studio', user?.breederId ? '/seller' : '/become-a-breeder', 'store'],
    ['Settings', '/profile/settings', 'gear'],
  ];
  if (user && (user.role === 'ADMIN' || user.role === 'MODERATOR')) items.push(['Admin console', '/admin', 'shield']);
  return (
    <div className="absolute right-0 top-[46px] z-50 w-[248px] overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] p-1.5 shadow-lift anim-in">
      <div className="px-2.5 py-2">
        <p className="text-[13.5px] font-semibold">{user?.firstName} {user?.lastName}</p>
        <p className="truncate text-[12px] text-[var(--muted)]">{user?.email}</p>
        <span className="badge mt-2">{user?.role.replace(/_/g, ' ').toLowerCase()}</span>
      </div>
      <hr className="divider my-1.5" />
      {items.map(([label, href, icon]) => (
        <Link key={label} href={href} onClick={onDone} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] hover:bg-[var(--surface-2)]">
          <Icon name={icon as never} size={15} className="text-[var(--muted)]" /> {label}
        </Link>
      ))}
      <hr className="divider my-1.5" />
      <button
        className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13.5px] text-[var(--danger)] hover:bg-[var(--surface-2)]"
        onClick={async () => {
          await post('auth/logout', {});
          router.push('/');
          router.refresh();
        }}
      >
        <Icon name="logout" size={15} /> Sign out
      </button>
    </div>
  );
}
