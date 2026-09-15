import crypto from 'node:crypto';
import { getDb } from '@/lib/db';
import { id, nowIso } from './util';
import type { Role, SessionUser } from './types';

/**
 * Authentication. scrypt password hashing (node:crypto), opaque bearer token in
 * an HttpOnly cookie, session rows in `sessions` (revocable) with the token
 * stored only as a SHA-256 hash. This is the local implementation of the
 * contract Supabase Auth would fill in production — see docs/ARCHITECTURE.md §5.
 */

export const SESSION_COOKIE = 'faunal_session';
export const EXPERIENCE_COOKIE = 'faunal_fx';

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, SCRYPT.keylen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
  });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('hex')}$${key.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [scheme, N, r, p, saltHex, keyHex] = stored.split('$');
    if (scheme !== 'scrypt') return false;
    const key = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), Number(keyHex.length / 2), {
      N: Number(N),
      r: Number(r),
      p: Number(p),
    });
    return crypto.timingSafeEqual(Buffer.from(keyHex, 'hex'), key);
  } catch {
    return false;
  }
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export interface SignUpInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role?: Role;
  jurisdictionCode?: string | null;
  city?: string | null;
  phone?: string | null;
  dateOfBirth?: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

export function validatePassword(pw: string): string[] {
  const problems: string[] = [];
  if (pw.length < 10) problems.push('Use at least 10 characters.');
  if (!/[A-Za-z]/.test(pw)) problems.push('Include at least one letter.');
  if (!/[0-9]/.test(pw)) problems.push('Include at least one number.');
  return problems;
}

export function signUp(input: SignUpInput): { userId: string; token: string } {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new Error('Enter a valid email address.');
  const problems = validatePassword(input.password);
  if (problems.length) throw new Error(problems.join(' '));
  const db = getDb();
  const existing = db.prepare(`SELECT id FROM users WHERE email = ?`).get(email);
  if (existing) throw new Error('An account with that email already exists.');

  const userId = id('usr');
  const t = nowIso();
  db.prepare(
    `INSERT INTO users (id,email,password_hash,role,status,first_name,last_name,phone,date_of_birth,
        locale,currency,jurisdiction_code,city,two_factor_enabled,tos_accepted_at,age_confirmed_at,created_at,updated_at)
     VALUES (?,?,?,?,?, ?,?,?,?, ?,?,?,?,0,?,?,?,?)`,
  ).run(
    userId,
    email,
    hashPassword(input.password),
    input.role ?? 'BUYER',
    'ACTIVE',
    input.firstName.trim(),
    input.lastName.trim(),
    input.phone ?? null,
    input.dateOfBirth ?? null,
    'en',
    'USD',
    input.jurisdictionCode ?? null,
    input.city ?? null,
    t,
    t,
    t,
    t,
  );
  db.prepare(
    `INSERT INTO profiles (user_id,display_name,bio,public_city,public_state,member_since,show_favorites)
     VALUES (?,?,?,?,?,?,0)`,
  ).run(userId, `${input.firstName.trim()} ${input.lastName.trim()[0] ?? ''}.`, null, input.city ?? null, input.jurisdictionCode ?? null, t);

  return { userId, token: createSession(userId, 'signup') };
}

export function signIn(email: string, password: string, userAgent = ''): { userId: string; token: string } {
  const db = getDb();
  const user = db
    .prepare(`SELECT id, password_hash, status FROM users WHERE email = ?`)
    .get(email.trim().toLowerCase()) as { id: string; password_hash: string; status: string } | undefined;
  // Constant-ish time: always run a verification pass.
  const ok = user ? verifyPassword(password, user.password_hash) : verifyPassword(password, hashPassword('x'));
  if (!user || !ok) throw new Error('Email or password is incorrect.');
  if (user.status === 'SUSPENDED') throw new Error('This account is suspended. Contact support.');
  if (user.status === 'BANNED') throw new Error('This account has been closed for policy violations.');
  return { userId: user.id, token: createSession(user.id, userAgent) };
}

/** Password check without minting a session — used when 2FA is enabled on the account. */
export function verifyLogin(email: string, password: string): { userId: string; twoFactor: boolean } {
  const db = getDb();
  const user = db
    .prepare(`SELECT id, password_hash, status, two_factor_enabled FROM users WHERE email = ?`)
    .get(email.trim().toLowerCase()) as { id: string; password_hash: string; status: string; two_factor_enabled: number } | undefined;
  const ok = user ? verifyPassword(password, user.password_hash) : verifyPassword(password, hashPassword('x'));
  if (!user || !ok) throw new Error('Email or password is incorrect.');
  if (user.status === 'SUSPENDED') throw new Error('This account is suspended. Contact support.');
  if (user.status === 'BANNED') throw new Error('This account has been closed for policy violations.');
  return { userId: user.id, twoFactor: !!user.two_factor_enabled };
}

/** One-time 6-digit code for a sign-in challenge. No mail transport here: the caller surfaces it in dev. */
export function beginLoginChallenge(userId: string): string {
  const code = String(crypto.randomInt(100000, 999999));
  getDb()
    .prepare(`INSERT INTO auth_challenges (id,user_id,kind,code_hash,expires_at,created_at) VALUES (?,?,?,?,?,?)`)
    .run(
      id('chc'),
      userId,
      'TWO_FACTOR',
      crypto.createHash('sha256').update(code).digest('hex'),
      new Date(Date.now() + 5 * 60000).toISOString(),
      nowIso(),
    );
  return code;
}

/** Second factor of the login flow: verify the code, consume it, then open a session. */
export function completeLoginWithCode(email: string, code: string, userAgent: string): { userId: string; token: string } {
  const db = getDb();
  const user = db.prepare(`SELECT id FROM users WHERE email = ?`).get(email.trim().toLowerCase()) as { id: string } | undefined;
  if (!user) throw new Error('Start the sign-in again.');
  const challenge = db
    .prepare(
      `SELECT * FROM auth_challenges WHERE user_id = ? AND kind='TWO_FACTOR' AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1`,
    )
    .get(user.id) as { id: string; code_hash: string; expires_at: string } | undefined;
  if (!challenge) throw new Error('No active code. Sign in again.');
  if (new Date(challenge.expires_at).getTime() < Date.now()) throw new Error('That code expired.');
  if (crypto.createHash('sha256').update(code.trim()).digest('hex') !== challenge.code_hash) throw new Error('Incorrect code.');
  db.prepare(`UPDATE auth_challenges SET consumed_at = ? WHERE id = ?`).run(nowIso(), challenge.id);
  return { userId: user.id, token: createSession(user.id, userAgent) };
}

/** "Forgot password" — real code, delivered through the queued mailer in production. */
export function beginPasswordReset(email: string): { sentTo: string; code: string; exists: boolean } {
  const db = getDb();
  const user = db.prepare(`SELECT id, email FROM users WHERE email = ?`).get(email.trim().toLowerCase()) as { id: string; email: string } | undefined;
  // Same answer whether or not the address exists — no account enumeration.
  if (!user) return { sentTo: email.trim().toLowerCase(), code: '', exists: false };
  const code = String(crypto.randomInt(100000, 999999));
  db.prepare(
    `INSERT INTO auth_challenges (id,user_id,kind,code_hash,expires_at,created_at) VALUES (?,?,?,?,?,?)`,
  ).run(
    id('chc'),
    user.id,
    'PASSWORD_RESET',
    crypto.createHash('sha256').update(code).digest('hex'),
    new Date(Date.now() + 15 * 60000).toISOString(),
    nowIso(),
  );
  return { sentTo: user.email, code, exists: true };
}

export function completePasswordReset(email: string, code: string, newPassword: string) {
  const db = getDb();
  const user = db.prepare(`SELECT id FROM users WHERE email = ?`).get(email.trim().toLowerCase()) as { id: string } | undefined;
  if (!user) throw new Error('That reset link is no longer valid.');
  const challenge = db
    .prepare(
      `SELECT * FROM auth_challenges WHERE user_id = ? AND kind='PASSWORD_RESET' AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1`,
    )
    .get(user.id) as { id: string; code_hash: string; expires_at: string } | undefined;
  if (!challenge) throw new Error('No active reset code. Request a new one.');
  if (new Date(challenge.expires_at).getTime() < Date.now()) throw new Error('That reset code expired.');
  if (crypto.createHash('sha256').update(code.trim()).digest('hex') !== challenge.code_hash) throw new Error('Incorrect reset code.');
  if (newPassword.length < 10) throw new Error('Choose a password of at least 10 characters.');
  updatePassword(user.id, newPassword);
  db.prepare(`UPDATE auth_challenges SET consumed_at = ? WHERE id = ?`).run(nowIso(), challenge.id);
  db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(user.id);
  return { ok: true };
}

/** Admin-assisted reset used by the support desk; invalidates every session. */
export function updatePassword(userId: string, newPassword: string) {
  getDb().prepare(`UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`).run(hashPassword(newPassword), nowIso(), userId);
}

export function createSession(userId: string, userAgent: string): string {
  const token = crypto.randomBytes(32).toString('base64url');
  const db = getDb();
  db.prepare(
    `INSERT INTO sessions (id,user_id,token_hash,expires_at,created_at,user_agent,ip)
     VALUES (?,?,?,?,?,?,NULL)`,
  ).run(id('ses'), userId, hashToken(token), new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(), nowIso(), userAgent.slice(0, 200));
  return token;
}

export function destroySession(token: string) {
  const db = getDb();
  db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(hashToken(token));
}

export function readSession(token: string | undefined | null): SessionUser | null {
  if (!token) return null;
  const db = getDb();
  const row = db
    .prepare(
      `SELECT u.id,u.email,u.role,u.first_name,u.last_name,u.currency,u.locale,u.jurisdiction_code,u.avatar_path,
              b.id AS breeder_id, b.tier AS breeder_tier, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
       LEFT JOIN breeders b ON b.user_id = u.id
       WHERE s.token_hash = ?`,
    )
    .get(hashToken(token)) as Record<string, string | null> | undefined;
  if (!row) return null;
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(hashToken(token));
    return null;
  }
  return {
    id: row.id as string,
    email: row.email as string,
    role: row.role as Role,
    firstName: row.first_name as string,
    lastName: row.last_name as string,
    currency: (row.currency as string) || 'USD',
    locale: (row.locale as string) || 'en',
    jurisdictionCode: row.jurisdiction_code ?? null,
    avatarPath: row.avatar_path ?? null,
    breederId: row.breeder_id ?? null,
    breederTier: row.breeder_tier ?? null,
  };
}

export function changePassword(userId: string, current: string, next: string) {
  const db = getDb();
  const row = db.prepare(`SELECT password_hash FROM users WHERE id = ?`).get(userId) as
    | { password_hash: string }
    | undefined;
  if (!row) throw new Error('Account not found.');
  if (!verifyPassword(current, row.password_hash)) throw new Error('Current password is incorrect.');
  const problems = validatePassword(next);
  if (problems.length) throw new Error(problems.join(' '));
  db.prepare(`UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`).run(
    hashPassword(next),
    nowIso(),
    userId,
  );
  // Revoke every other session (security hygiene on credential rotation).
  db.prepare(`DELETE FROM sessions WHERE user_id = ? AND expires_at < ?`).run(userId, '9999');
}
