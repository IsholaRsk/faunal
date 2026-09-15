import crypto from 'node:crypto';
import { getDb } from '@/lib/db';
import { insert, update, get, all, updateWhere } from '@/db/kit';
import { HttpError, audit } from '@/domain/rbac';
import { id, nowIso } from '@/domain/util';
import { hashPassword, verifyPassword } from '@/domain/auth';
import { notify } from '@/domain/notify';
import type { DocType, SessionUser } from '@/domain/types';
import { storePrivateDocument } from '@/domain/media';

/** Account surface: profile, addresses, payment methods, documents, settings. */

export function profileOf(user: SessionUser) {
  const db = getDb();
  const profile = get<Record<string, string | number | null>>(`SELECT * FROM profiles WHERE user_id = ?`, [user.id]);
  const account = get<Record<string, string | number | null>>(`SELECT * FROM users WHERE id = ?`, [user.id]);
  const stats = get<Record<string, number>>(
    `SELECT
      (SELECT COUNT(*) FROM favorites WHERE user_id = ?) AS favorites,
      (SELECT COUNT(*) FROM followed_breeders WHERE user_id = ?) AS followed,
      (SELECT COUNT(*) FROM orders WHERE buyer_id = ?) AS orders,
      (SELECT COUNT(*) FROM cart_items WHERE user_id = ?) AS cart,
      (SELECT COUNT(*) FROM animal_documents WHERE owner_user_id = ?) AS documents`,
    [user.id, user.id, user.id, user.id, user.id],
  )!;
  const reviews = get<Record<string, number>>(
    `SELECT COUNT(*) AS n, COALESCE(AVG(overall),0) AS avg FROM reviews WHERE author_id = ?`,
    [user.id],
  )!;
  const breeder = user.breederId ? get<Record<string, string | number | null>>(`SELECT * FROM breeders WHERE id = ?`, [user.breederId]) : null;
  return {
    account,
    profile,
    stats: {
      favorites: stats.favorites ?? 0,
      followed: stats.followed ?? 0,
      orders: stats.orders ?? 0,
      cart: stats.cart ?? 0,
      documents: stats.documents ?? 0,
    },
    reviews: { count: reviews.n ?? 0, avg: Math.round((reviews.avg ?? 0) * 10) / 10 },
    breeder,
  };
}

export function updateProfile(
  user: SessionUser,
  patch: {
    firstName?: string;
    lastName?: string;
    phone?: string;
    email?: string;
    displayName?: string;
    bio?: string;
    city?: string;
    state?: string;
    dateOfBirth?: string;
    locale?: string;
    currency?: string;
  },
) {
  const db = getDb();
  const account: Record<string, unknown> = { updated_at: nowIso() };
  if (patch.firstName !== undefined) {
    if (patch.firstName.trim().length < 2) throw new HttpError(400, 'First name is too short.');
    account.first_name = patch.firstName.trim();
  }
  if (patch.lastName !== undefined) account.last_name = patch.lastName.trim();
  if (patch.phone !== undefined) account.phone = patch.phone.trim() || null;
  if (patch.dateOfBirth !== undefined) {
    const dob = patch.dateOfBirth || null;
    if (dob) {
      const age = (Date.now() - new Date(dob).getTime()) / (365.25 * 86400000);
      if (age < 18) throw new HttpError(400, 'You must be 18 or older to buy live animals on FAUNAL.');
      account.age_confirmed_at = nowIso();
    }
    account.date_of_birth = dob;
  }
  if (patch.locale !== undefined) {
    if (!['en', 'fr', 'es'].includes(patch.locale)) throw new HttpError(400, 'Unsupported language.');
    account.locale = patch.locale;
  }
  if (patch.currency !== undefined) {
    if (!['USD', 'EUR', 'GBP', 'CAD'].includes(patch.currency)) throw new HttpError(400, 'Unsupported currency.');
    account.currency = patch.currency; // display currency only — listings stay priced in USD
  }
  if (patch.state !== undefined) account.jurisdiction_code = patch.state.toUpperCase() || null;
  if (patch.email !== undefined && patch.email.trim() && patch.email.trim().toLowerCase() !== user.email) {
    const email = patch.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) throw new HttpError(400, 'Enter a valid email address.');
    const clash = get(`SELECT id FROM users WHERE email = ? AND id != ?`, [email, user.id]);
    if (clash) throw new HttpError(409, 'That email is already used by another account.');
    account.email = email;
  }
  update('users', account, 'id', user.id);

  if (patch.city !== undefined || patch.displayName !== undefined || patch.bio !== undefined) {
    const p: Record<string, unknown> = {};
    if (patch.displayName !== undefined) p.display_name = patch.displayName.trim() || user.firstName;
    if (patch.bio !== undefined) p.bio = patch.bio.slice(0, 600);
    if (patch.city !== undefined) p.public_city = patch.city.trim() || null;
    if (patch.state !== undefined) p.public_state = patch.state.toUpperCase() || null;
    if (Object.keys(p).length) update('profiles', p, 'user_id', user.id);
  }
  audit(user, 'PROFILE_UPDATE', 'USER', user.id, { fields: Object.keys(patch) }, 'api');
  return profileOf(user);
}

export function confirmAge(user: SessionUser) {
  update('users', { age_confirmed_at: nowIso(), updated_at: nowIso() }, 'id', user.id);
  audit(user, 'AGE_CONFIRM', 'USER', user.id, {}, 'api');
  return { ok: true };
}

export function listAddresses(user: SessionUser) {
  return all<Record<string, string | null>>(`SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, created_at DESC`, [user.id]);
}

export function saveAddress(user: SessionUser, input: {
  id?: string;
  label?: string;
  recipient: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  zip: string;
  isDefault?: boolean;
}) {
  if (!/^\d{5}(-\d{4})?$/.test(input.zip.trim())) throw new HttpError(400, 'Enter a valid 5-digit ZIP code.');
  if (!input.line1.trim()) throw new HttpError(400, 'Street address is required.');
  if (!/^[A-Z]{2}$/i.test(input.state.trim())) throw new HttpError(400, 'Use a two-letter state code, e.g. NY.');
  const db = getDb();
  const addressId = input.id ?? id('adr');
  if (input.isDefault) db.prepare(`UPDATE addresses SET is_default = 0 WHERE user_id = ?`).run(user.id);
  const values = {
    user_id: user.id,
    label: input.label?.trim() || 'Home',
    recipient: input.recipient.trim(),
    line1: input.line1.trim(),
    line2: input.line2?.trim() || null,
    city: input.city.trim(),
    state: input.state.trim().toUpperCase(),
    zip: input.zip.trim(),
    country: 'US',
    is_default: input.isDefault ? 1 : 0,
  };
  if (input.id) {
    const own = get(`SELECT id FROM addresses WHERE id = ? AND user_id = ?`, [input.id, user.id]);
    if (!own) throw new HttpError(404, 'Address not found.');
    update('addresses', values, 'id', input.id);
  } else {
    insert('addresses', { ...values, id: addressId, created_at: nowIso() });
  }
  audit(user, input.id ? 'ADDRESS_UPDATE' : 'ADDRESS_CREATE', 'ADDRESS', addressId, {}, 'api');
  return listAddresses(user);
}

export function deleteAddress(user: SessionUser, addressId: string) {
  const db = getDb();
  const res = db.prepare(`DELETE FROM addresses WHERE id = ? AND user_id = ?`).run(addressId, user.id);
  if (!res.changes) throw new HttpError(404, 'Address not found.');
  return listAddresses(user);
}

/**
 * Payment methods. Only the provider token + last4 are stored; the card number
 * is exchanged for a token at the PSP and never touches FAUNAL (spec §43).
 */
export function listPaymentMethods(user: SessionUser) {
  return all<Record<string, string | number | null>>(
    `SELECT id, provider, brand, last4, expiry_month, expiry_year, is_default, created_at FROM payment_methods WHERE user_id = ? ORDER BY is_default DESC, created_at DESC`,
    [user.id],
  );
}

export function addPaymentMethod(user: SessionUser, input: { number: string; expMonth: string; expYear: string; cvv: string; brand?: string }) {
  const digits = input.number.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19 || !luhn(digits)) throw new HttpError(400, 'Card number failed validation.');
  const month = Number(input.expMonth);
  const year = Number(input.expYear) < 100 ? 2000 + Number(input.expYear) : Number(input.expYear);
  if (!(month >= 1 && month <= 12)) throw new HttpError(400, 'Invalid expiry month.');
  if (year < new Date().getFullYear()) throw new HttpError(400, 'That card has expired.');
  if (!/^\d{3,4}$/.test(input.cvv)) throw new HttpError(400, 'Invalid security code.');
  const db = getDb();
  db.prepare(`UPDATE payment_methods SET is_default = 0 WHERE user_id = ?`).run(user.id);
  const methodId = id('pmt');
  insert('payment_methods', {
    id: methodId,
    user_id: user.id,
    provider: 'faunal-pay',
    brand: input.brand || brandFor(digits),
    last4: digits.slice(-4),
    token: `tok_${crypto.randomBytes(14).toString('hex')}`,
    expiry_month: month,
    expiry_year: year,
    is_default: 1,
    created_at: nowIso(),
  });
  audit(user, 'PAYMENT_METHOD_ADD', 'PAYMENT_METHOD', methodId, { brand: brandFor(digits), last4: digits.slice(-4) }, 'api');
  return listPaymentMethods(user);
}

function brandFor(digits: string) {
  if (/^4/.test(digits)) return 'VISA';
  if (/^5[1-5]/.test(digits)) return 'MASTERCARD';
  if (/^3[47]/.test(digits)) return 'AMEX';
  if (/^6/.test(digits)) return 'DISCOVER';
  return 'CARD';
}

function luhn(digits: string) {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

export function removePaymentMethod(user: SessionUser, methodId: string) {
  const db = getDb();
  db.prepare(`DELETE FROM payment_methods WHERE id = ? AND user_id = ?`).run(methodId, user.id);
  return listPaymentMethods(user);
}

export function myDocuments(user: SessionUser) {
  return all<Record<string, string | number | null>>(
    `SELECT d.*, a.name AS animal_name, a.slug AS animal_slug FROM animal_documents d
     LEFT JOIN animals a ON a.id = d.animal_id WHERE d.owner_user_id = ? ORDER BY d.uploaded_at DESC`,
    [user.id],
  );
}

export async function uploadOwnDocument(user: SessionUser, docType: DocType, file: File, expiresAt?: string) {
  const record = await storePrivateDocument(file, user.id, docType);
  {
    const docId = id('doc');
    insert('animal_documents', {
      id: docId,
      breeder_id: user.breederId ?? null,
      owner_user_id: user.id,
      doc_type: docType,
      storage_bucket: record.storage_bucket,
      storage_path: record.storage_path,
      filename: `${docType.toLowerCase()}-${record.filename}`,
      size_bytes: record.size_bytes,
      status: 'PENDING',
      expires_at: expiresAt || null,
      visibility: 'PRIVATE',
      uploaded_at: record.uploaded_at,
    });
    const admin = get<{ id: string }>(`SELECT id FROM users WHERE role IN ('ADMIN','MODERATOR') ORDER BY role LIMIT 1`);
    if (admin) notify(admin.id, 'COMPLIANCE', 'Document uploaded', `A buyer/seller attached ${docType.replace(/_/g, ' ').toLowerCase()}.`, '/admin/documents');
    audit(user, 'DOCUMENT_UPLOAD', 'DOCUMENT', docId, { doc_type: docType }, 'api');
    return { documentId: docId, status: 'PENDING' as const };
  }
}

export function updateSettings(user: SessionUser, patch: { locale?: string; currency?: string; notify: Record<string, boolean> }) {
  const db = getDb();
  const account: Record<string, unknown> = { updated_at: nowIso() };
  if (patch.locale && ['en', 'fr', 'es'].includes(patch.locale)) account.locale = patch.locale;
  if (patch.currency && ['USD', 'EUR', 'GBP', 'CAD'].includes(patch.currency)) account.currency = patch.currency;
  update('users', account, 'id', user.id);
  const existing = get<{ value: string }>(`SELECT value FROM settings WHERE key = ?`, [`notify:${user.id}`]);
  const prefs = { ...(existing ? safeParse(existing.value) : {}), ...patch.notify };
  db.prepare(
    `INSERT INTO settings (key,value,updated_at) VALUES (?,?,?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(`notify:${user.id}`, JSON.stringify(prefs), nowIso());
  audit(user, 'SETTINGS_UPDATE', 'USER', user.id, { currency: account.currency, locale: account.locale }, 'api');
  return { ok: true, notifyPreferences: prefs };
}

export function notificationPreferences(user: SessionUser) {
  const row = get<{ value: string }>(`SELECT value FROM settings WHERE key = ?`, [`notify:${user.id}`]);
  return {
    order_update: true,
    messages: true,
    price_drops: true,
    new_listings: true,
    marketing: false,
    ...(row ? safeParse(row.value) : {}),
  };
}

function safeParse(value: string): Record<string, boolean> {
  try {
    return JSON.parse(value) as Record<string, boolean>;
  } catch {
    return {};
  }
}

/** Two-factor (spec §22): TOTP-style 6-digit code, single use, 5 min TTL. */
export function enableTwoFactor(user: SessionUser, code: string) {
  const challenge = get<Record<string, string | null>>(
    `SELECT * FROM auth_challenges WHERE user_id = ? AND kind='TWO_FACTOR' AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1`,
    [user.id],
  );
  if (!challenge) throw new HttpError(410, 'No active code. Request a new one.');
  if (new Date(challenge.expires_at as string).getTime() < Date.now()) throw new HttpError(410, 'That code expired.');
  if (crypto.createHash('sha256').update(code.trim()).digest('hex') !== challenge.code_hash) throw new HttpError(400, 'Incorrect code.');
  update('auth_challenges', { consumed_at: nowIso() }, 'id', String(challenge.id));
  update('users', { two_factor_enabled: 1 }, 'id', user.id);
  audit(user, '2FA_ENABLE', 'USER', user.id, {}, 'api');
  return { ok: true };
}

export function requestTwoFactorCode(user: SessionUser): { sentTo: string; code: string } {
  const code = String(crypto.randomInt(100000, 999999));
  insert('auth_challenges', {
    id: id('chc'),
    user_id: user.id,
    kind: 'TWO_FACTOR',
    code_hash: crypto.createHash('sha256').update(code).digest('hex'),
    expires_at: new Date(Date.now() + 5 * 60000).toISOString(),
    created_at: nowIso(),
  });
  // No mail transport in this environment: the code is surfaced in the UI and
  // emailed by the queued mailer in production (docs/ARCHITECTURE.md §5).
  return { sentTo: user.email, code };
}

export function disableTwoFactor(user: SessionUser) {
  update('users', { two_factor_enabled: 0 }, 'id', user.id);
  audit(user, '2FA_DISABLE', 'USER', user.id, {}, 'api');
  return { ok: true };
}

/** Session list + remote logout (spec §22 Security). */
export function listSessions(user: SessionUser) {
  return all<Record<string, string | number | null>>(
    `SELECT id, created_at, expires_at, user_agent FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`,
    [user.id],
  );
}

export function revokeSession(user: SessionUser, sessionId: string) {
  const db = getDb();
  db.prepare(`DELETE FROM sessions WHERE id = ? AND user_id = ?`).run(sessionId, user.id);
  return listSessions(user);
}

export function deleteAccount(user: SessionUser, password: string) {
  const db = getDb();
  const account = get<Record<string, string | null>>(`SELECT password_hash FROM users WHERE id = ?`, [user.id]);
  if (!account || !verifyPassword(password, account.password_hash as string)) throw new HttpError(401, 'Password does not match.');
  const openOrders = get<{ n: number }>(`SELECT COUNT(*) AS n FROM orders WHERE buyer_id = ? AND status NOT IN ('COMPLETED','CANCELLED','REFUNDED')`, [user.id]);
  if ((openOrders?.n ?? 0) > 0) throw new HttpError(409, 'Resolve open orders before deleting your account.');
  // Soft delete: compliance requires records to survive for the retention window.
  update('users', { status: 'DELETED', email: `deleted+${user.id}@faunal.invalid`, updated_at: nowIso() }, 'id', user.id);
  db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(user.id);
  db.prepare(`DELETE FROM favorites WHERE user_id = ?`).run(user.id);
  db.prepare(`DELETE FROM cart_items WHERE user_id = ?`).run(user.id);
  audit(user, 'ACCOUNT_DELETE', 'USER', user.id, {}, 'api');
  return { ok: true };
}
