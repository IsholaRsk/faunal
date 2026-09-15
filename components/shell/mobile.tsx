'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icon, Logo, type IconName } from '@/components/ui/Icon';
import { useApp } from '@/lib/ui/app-provider';
import { ExperienceToggle } from '@/components/ui/interactions';
import { translate } from '@/lib/ui/i18n';

/**
 * MOBILE shell — a real app frame: fixed bottom navigation with five
 * destinations, sticky per-screen headers, safe-area padding, 44px targets,
 * and a boot splash. Nothing here is derived from the desktop DOM (spec §6).
 */

const TABS: { href: string; label: string; icon: IconName; badge?: 'cart' | 'favorites' }[] = [
  { href: '/', label: 'Home', icon: 'home' },
  { href: '/explore', label: 'Explore', icon: 'compass' },
  { href: '/favorites', label: 'Favorites', icon: 'heart', badge: 'favorites' },
  { href: '/cart', label: 'Cart', icon: 'cart', badge: 'cart' },
  { href: '/profile', label: 'Profile', icon: 'user' },
];

/** Screens that are part of the bottom-nav tree keep the tab bar visible. */
const TAB_SCREENS = new Set(['/', '/explore', '/favorites', '/cart', '/profile', '/search', '/notifications']);

export function MobileShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { badges, locale, experience } = useApp();
  const t = translate(locale);
  const [splash, setSplash] = useState(true);
  const showTabs = TAB_SCREENS.has(pathname) || pathname.startsWith('/profile/');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const seen = sessionStorage.getItem('faunal_splash');
    if (seen) {
      setSplash(false);
      return;
    }
    const id = window.setTimeout(() => {
      sessionStorage.setItem('faunal_splash', '1');
      setSplash(false);
    }, 1150);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <div className="phone-stage fx-mobile">
      <div className="mobile-root">
        <div className="phone-notch" aria-hidden />
        {splash ? <Splash /> : null}
        <div className="mobile-scroll">{children}</div>
        {showTabs ? (
          <nav className="tabbar" aria-label="Primary">
            {TABS.map((tab) => {
              const active = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href);
              const count = tab.badge ? badges[tab.badge] : 0;
              return (
                <Link key={tab.href} href={tab.href} data-active={active} aria-current={active ? 'page' : undefined}>
                  <span className="relative">
                    <Icon name={tab.icon} size={21} filled={active && tab.icon === 'heart'} />
                    {count ? (
                      <span className="absolute -right-2 -top-1.5 grid h-[15px] min-w-[15px] place-items-center rounded-full bg-[var(--ink)] px-[3px] text-[9.5px] font-semibold text-white">
                        {count}
                      </span>
                    ) : null}
                  </span>
                  <span>{t(`nav.${tab.label.toLowerCase()}`)}</span>
                </Link>
              );
            })}
          </nav>
        ) : null}
        <div className="pointer-events-none absolute inset-x-0 bottom-[3px] z-[85] hidden justify-center md:flex">
          <span className="h-1 w-[112px] rounded-full bg-[rgba(21,21,21,0.28)]" />
        </div>
      </div>
      {experience === 'mobile' ? (
        <div className="pointer-events-none fixed bottom-4 right-4 z-[200] hidden md:block">
          <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-2 shadow-lift">
            <span className="text-[12px] text-[var(--muted)]">Reviewing the mobile app</span>
            <ExperienceToggle current="mobile" />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Splash() {
  return (
    <div className="absolute inset-0 z-[150] grid place-items-center bg-[var(--canvas)] anim-in" role="status" aria-label="Loading FAUNAL">
      <div className="flex flex-col items-center gap-4" style={{ animation: 'fadeUp .7s var(--ease) both' }}>
        <Logo size={54} />
        <div className="text-center">
          <div className="font-display text-[26px] font-semibold tracking-[0.34em]">FAUNAL</div>
          <div className="mt-1.5 text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]">Exotic animals · Legally</div>
        </div>
        <div className="mt-2 h-[2px] w-24 overflow-hidden rounded-full bg-[var(--line)]">
          <div className="h-full w-1/3 animate-[shimmer_1.1s_infinite] bg-[var(--ink)]" />
        </div>
      </div>
    </div>
  );
}

/** Shared mobile stack header: back, title, trailing actions (spec §13). */
export function MobileHeader({
  title,
  subtitle,
  actions,
  transparent = false,
  back,
}: {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  transparent?: boolean;
  back?: string | null;
}) {
  const router = useRouter();
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const onScroll = () => {
      const el = document.querySelector('.mobile-scroll') as HTMLElement | null;
      setStuck((el?.scrollTop ?? window.scrollY) > 8);
    };
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('scroll', onScroll);
    return () => {
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);
  return (
    <header
      className={`mobile-header ${transparent && !stuck ? 'border-b-0' : ''}`}
      data-stuck={stuck}
      style={transparent && !stuck ? { background: 'transparent', backdropFilter: 'none' } : undefined}
    >
      <div className="mobile-sub flex h-[52px] items-center gap-2">
        <button
          onClick={() => (back ? router.push(back) : router.back())}
          className="icon-btn -ml-2"
          aria-label="Go back"
        >
          <Icon name="back" size={20} style={transparent && !stuck ? { filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.25))' } : undefined} />
        </button>
        <div className="min-w-0 flex-1">
          {title ? <div className={`truncate text-[15px] font-semibold tracking-[-0.01em] ${transparent && !stuck ? 'text-white' : ''}`}>{title}</div> : null}
          {subtitle ? <div className={`truncate text-[11.5px] ${transparent && !stuck ? 'text-white/80' : 'text-[var(--muted)]'}`}>{subtitle}</div> : null}
        </div>
        {actions ? <div className="flex items-center gap-0.5">{actions}</div> : null}
      </div>
    </header>
  );
}
