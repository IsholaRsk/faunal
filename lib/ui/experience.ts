import { cookies, headers } from 'next/headers';
import { EXPERIENCE_COOKIE } from '@/domain/auth';
import type { Experience } from '@/domain/types';

/**
 * Two experiences, one app (spec §2 / §51).
 *
 * The chosen surface is a *server* decision — cookie override → user-agent →
 * desktop default — so the first paint already has the right shell; nothing is
 * "shrunk desktop". Client components read the same value from a context the
 * root layout provides, so hydration never flips layout.
 */

export function currentExperience(): Experience {
  const store = cookies();
  const forced = store.get(EXPERIENCE_COOKIE)?.value;
  if (forced === 'mobile' || forced === 'desktop') return forced;
  const ua = headers().get('user-agent') ?? '';
  if (/android|iphone|ipod|mobile|windows phone/i.test(ua)) return 'mobile';
  if (/iPad|Tablet/.test(ua)) return 'mobile';
  return 'desktop';
}

export function setExperienceCookie(value: Experience) {
  // Called from a route handler only; returns the value for the response builder.
  return value;
}
