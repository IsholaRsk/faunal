'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Experience, SessionUser } from '@/domain/types';
import type { Locale } from './i18n';
import { post } from './api';

/**
 * One client context for both surfaces: identity, locale/currency, live badge
 * counts, optimistic favorite state, and the toast queue. Layouts differ;
 * application state does not (spec §56).
 */

export interface Badges {
  cart: number;
  favorites: number;
  unreadNotifications: number;
  unreadMessages: number;
}

export interface ToastItem {
  id: number;
  message: string;
  tone?: 'default' | 'success' | 'warn' | 'error';
  actionLabel?: string;
  actionHref?: string;
}

interface AppValue {
  user: SessionUser | null;
  experience: Experience;
  locale: Locale;
  currency: string;
  badges: Badges;
  setBadges: (b: Partial<Badges>) => void;
  toasts: ToastItem[];
  toast: (message: string, opts?: Omit<ToastItem, 'id' | 'message'>) => void;
  dismissToast: (id: number) => void;
  favorites: Set<string>;
  toggleFavorite: (animalId: string) => Promise<boolean>;
  refresh: () => void;
  surface: 'mobile' | 'desktop';
}

const Ctx = createContext<AppValue | null>(null);

export function AppProvider({
  user,
  experience,
  locale,
  currency,
  badges,
  children,
}: {
  user: SessionUser | null;
  experience: Experience;
  locale: Locale;
  currency: string;
  badges: Badges;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [badgeState, setBadgeState] = useState<Badges>(badges);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const seq = useRef(0);

  useEffect(() => setBadgeState(badges), [badges.cart, badges.favorites, badges.unreadNotifications, badges.unreadMessages]);

  const setBadges = useCallback((b: Partial<Badges>) => setBadgeState((prev) => ({ ...prev, ...b })), []);

  const dismissToast = useCallback((id: number) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);

  const toast = useCallback(
    (message: string, opts: Omit<ToastItem, 'id' | 'message'> = {}) => {
      const id = ++seq.current;
      setToasts((prev) => [...prev.slice(-2), { id, message, ...opts }]);
      window.setTimeout(() => dismissToast(id), opts.actionLabel ? 5200 : 2800);
    },
    [dismissToast],
  );

  const toggleFavorite = useCallback(
    async (animalId: string) => {
      const wasFav = favorites.has(animalId);
      const next = new Set(favorites);
      if (wasFav) next.delete(animalId);
      else next.add(animalId);
      setFavorites(next); // optimistic — the server is the source of truth on refresh
      try {
        const res = await post<{ favorited: boolean }>('favorites', { animalId });
        const flipped = new Set(next);
        if (res.favorited) flipped.add(animalId);
        else flipped.delete(animalId);
        setFavorites(flipped);
        setBadgeState((b) => ({ ...b, favorites: Math.max(0, b.favorites + (res.favorited ? 1 : -1)) }));
        return res.favorited;
      } catch (e) {
        setFavorites(new Set(wasFav ? [...next, animalId] : next));
        throw e;
      }
    },
    [favorites, setBadgeState],
  );

  // Badge sync: notifications/messages counters refresh on focus + interval.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const sync = async () => {
      try {
        const res = await (await fetch('/api/notifications', { credentials: 'same-origin' })).json();
        if (!cancelled && typeof res.unread === 'number') setBadgeState((b) => ({ ...b, unreadNotifications: res.unread }));
      } catch {
        /* offline / closed session — badges simply go stale */
      }
    };
    const interval = window.setInterval(() => document.visibilityState === 'visible' && sync(), 25000);
    window.addEventListener('focus', sync);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('focus', sync);
    };
  }, [user, setBadgeState]);

  const value = useMemo<AppValue>(
    () => ({
      user,
      experience,
      locale,
      currency,
      badges: badgeState,
      setBadges,
      toasts,
      toast,
      dismissToast,
      favorites,
      toggleFavorite,
      refresh: () => router.refresh(),
      surface: experience,
    }),
    [user, experience, locale, currency, badgeState, setBadges, toasts, toast, dismissToast, favorites, toggleFavorite, router],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}

/** Redirect helper for actions that require an account (spec §8). */
export function requireAuth(user: SessionUser | null, router: ReturnType<typeof useRouter>) {
  if (user) return true;
  router.push('/login?next=' + encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname : '/'));
  return false;
}

export function useExperience() {
  return useContext(Ctx)?.experience ?? 'desktop';
}
