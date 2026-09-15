import type { SessionUser } from './types';

/** Stable, sortable, prefix-friendly ids (ULID-ish, no dependency). */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export function id(prefix: string): string {
  let t = Date.now();
  let out = '';
  for (let i = 0; i < 10; i++) {
    out = ALPHABET[t % 32] + out;
    t = Math.floor(t / 32);
  }
  let rand = '';
  for (let i = 0; i < 14; i++) rand += ALPHABET[Math.floor(Math.random() * 32)];
  return `${prefix}_${out}${rand}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function orderNumber(seq: number): string {
  const y = new Date().getFullYear();
  return `FNL-${y}-${String(seq).padStart(6, '0')}`;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70);
}

export function uniqueSlug(base: string, taken: Set<string>): string {
  let candidate = base || 'listing';
  let n = 2;
  while (taken.has(candidate)) {
    candidate = `${base}-${n++}`;
  }
  taken.add(candidate);
  return candidate;
}

/**
 * Price formatting — always USD by default (spec §"Devise principale").
 * Integer prices print without decimals: $450, $1,299 — fractional cents keep
 * two decimals: $2,499.99.
 */
export function formatMoney(cents: number, currency = 'USD', locale = 'en-US'): string {
  const amount = cents / 100;
  const fractionDigits = Number.isInteger(amount) ? 0 : 2;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `$${amount.toLocaleString('en-US', {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: 2,
    })}`;
  }
}

export function ageLabel(months: number): string {
  if (months < 12) return `${months} month${months === 1 ? '' : 's'}`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (!rest) return `${years} year${years === 1 ? '' : 's'}`;
  return `${years} yr ${rest} mo`;
}

export function sexLabel(sex: string): string {
  return sex === 'MALE' ? 'Male' : sex === 'FEMALE' ? 'Female' : 'Not sexed';
}

export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/[\s_-]+/)
    .map((w) => (w.length <= 2 ? w : w[0].toUpperCase() + w.slice(1)))
    .join(' ');
}

export function humanList(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function dateLabel(iso: string | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', opts ?? { month: 'short', day: 'numeric', year: 'numeric' });
}

export function isSeller(user: SessionUser | null): boolean {
  if (!user) return false;
  return ['BREEDER', 'PROFESSIONAL_BREEDER', 'VERIFIED_BREEDER'].includes(user.role);
}

export function isStaff(user: SessionUser | null): boolean {
  if (!user) return false;
  return user.role === 'ADMIN' || user.role === 'MODERATOR';
}

/* Document labels are needed by client components too, so they live here (pure). */
export const DOC_LABELS: Record<string, string> = {
  PROOF_OF_ORIGIN: 'Proof of captive origin',
  HEALTH_CERTIFICATE: 'Health certificate (vet, ≤ 10 days old)',
  PERMIT: 'State possession permit',
  CITES: 'CITES documentation',
  BREEDER_LICENSE: 'Breeder license',
  TRANSPORT_MANIFEST: 'Live-animal transport manifest',
};

export function docLabel(doc: string): string {
  return DOC_LABELS[doc] ?? doc.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());
}
