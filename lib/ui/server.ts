import { cookies } from 'next/headers';
import { readSession, SESSION_COOKIE } from '@/domain/auth';
import { cartCount, favoriteAnimalCards } from '@/repo/cart';
import { unreadCount } from '@/domain/notify';
import { unreadMessages } from '@/repo/messaging';
import { currentExperience } from './experience';
import { listAddresses, listPaymentMethods, listSessions, myDocuments, notificationPreferences, profileOf } from '@/repo/account';
import { myOrders } from '@/repo/orders';
import { onboardedStates } from '@/repo/catalog';
import { getDb } from '@/db';
import type { SessionUser } from '@/domain/types';
import type { Badges } from './app-provider';
import type { Locale } from './i18n';

/** Single server-side read of everything the two shells need. */
export function appData(): { user: SessionUser | null; experience: ReturnType<typeof currentExperience>; locale: Locale; currency: string; badges: Badges } {
  const user = readSession(cookies().get(SESSION_COOKIE)?.value);
  const experience = currentExperience();
  let badges: Badges = { cart: 0, favorites: 0, unreadNotifications: 0, unreadMessages: 0 };
  if (user) {
    const db = getDb();
    badges = {
      cart: cartCount(user.id),
      favorites: (db.prepare(`SELECT COUNT(*) AS n FROM favorites WHERE user_id = ?`).get(user.id) as { n: number }).n,
      unreadNotifications: unreadCount(user.id),
      unreadMessages: unreadMessages(user.id),
    };
  }
  return {
    user,
    experience,
    locale: ((user?.locale ?? 'en') as Locale) || 'en',
    currency: user?.currency ?? 'USD',
    badges,
  };
}

/**
 * Everything the account screens need — assembled once on the server so both
 * surfaces render from the same read instead of firing client waterfalls.
 */
export function accountData(user: SessionUser) {
  const info = profileOf(user);
  return {
    ...info,
    addresses: listAddresses(user),
    methods: listPaymentMethods(user),
    documents: myDocuments(user),
    sessions: listSessions(user),
    prefs: notificationPreferences(user),
    states: onboardedStates(),
    recentOrders: myOrders(user, 'all').slice(0, 3),
    twoFactor: !!(info.account?.two_factor_enabled ?? 0),
    locale: info.account?.locale ?? 'en',
    currency: info.account?.currency ?? 'USD',
    email: String(info.account?.email ?? ''),
  };
}

export function sessionOnly(): SessionUser | null {
  return readSession(cookies().get(SESSION_COOKIE)?.value);
}
