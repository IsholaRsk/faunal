import { getDb } from '@/lib/db';
import { id, nowIso } from './util';
import type { SessionUser } from './types';

/**
 * RBAC + "RLS-like" enforcement.
 *
 * There is no trusted-browser path to the database: every API handler calls
 * requireSession()/requireRole() and every repository function takes the
 * acting user, so row scoping lives in SQL predicates, not in the client.
 * docs/schema.postgres.sql mirrors these rules as real Postgres RLS policies.
 */

export const ROLE_RANK: Record<string, number> = {
  BUYER: 10,
  BREEDER: 20,
  PROFESSIONAL_BREEDER: 30,
  VERIFIED_BREEDER: 40,
  MODERATOR: 80,
  ADMIN: 90,
};

export class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, message: string, code = 'error') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function requireUser(user: SessionUser | null): SessionUser {
  if (!user) throw new HttpError(401, 'Sign in to continue.', 'AUTH_REQUIRED');
  return user;
}

export function requireRole(user: SessionUser | null, roles: string[]): SessionUser {
  const u = requireUser(user);
  if (!roles.includes(u.role)) {
    throw new HttpError(403, `This action requires one of: ${roles.join(', ')}.`, 'FORBIDDEN');
  }
  return u;
}

export function requireSeller(user: SessionUser | null): SessionUser & { breederId: string } {
  const u = requireRole(user, ['BREEDER', 'PROFESSIONAL_BREEDER', 'VERIFIED_BREEDER']);
  if (!u.breederId) throw new HttpError(403, 'Open a breeder account first.', 'NO_BREEDER_PROFILE');
  return u as SessionUser & { breederId: string };
}

export function requireStaff(user: SessionUser | null): SessionUser {
  return requireRole(user, ['ADMIN', 'MODERATOR']);
}

export function isStaff(user: SessionUser | null): boolean {
  return !!user && (user.role === 'ADMIN' || user.role === 'MODERATOR');
}

/** Sensitive health/document fields are never serialized outside this allow-list. */
export function canSeeMedicalNotes(user: SessionUser | null, animal: { breeder_id: string; created_by?: string }): boolean {
  if (!user) return false;
  if (isStaff(user)) return true;
  return user.breederId === animal.breeder_id;
}

export function audit(
  user: SessionUser | null,
  action: string,
  entityType: string,
  entityId: string,
  metadata: Record<string, unknown> = {},
  surface: 'web' | 'mobile' | 'desktop' | 'api' | 'admin' | 'system' = 'api',
) {
  try {
    getDb()
      .prepare(
        `INSERT INTO audit_logs (id,actor_id,actor_role,action,entity_type,entity_id,metadata,ip,surface,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id('aud'),
        user?.id ?? null,
        user?.role ?? 'ANONYMOUS',
        action,
        entityType,
        entityId,
        JSON.stringify(redact(metadata)),
        null,
        surface,
        nowIso(),
      );
  } catch {
    // Audit must never break the request path.
  }
}

const SENSITIVE_KEYS = /password|token|secret|card|cvv|pan|authorization/i;

function redact(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    out[k] = SENSITIVE_KEYS.test(k) ? '[redacted]' : typeof v === 'object' ? '[object]' : v;
  }
  return out;
}

/** Rate limiting: fixed window per (actor|ip, bucket). Guards auth + write endpoints. */
export function rateLimit(key: string, limit = 20, windowMs = 60_000): { ok: boolean; retryAfter: number } {
  const db = getDb();
  db.exec(`CREATE TABLE IF NOT EXISTS rate_limits (
    bucket TEXT NOT NULL, window_start INTEGER NOT NULL, hits INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (bucket, window_start))`);
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const row = db
    .prepare(`SELECT hits FROM rate_limits WHERE bucket = ? AND window_start = ?`)
    .get(key, windowStart) as { hits: number } | undefined;
  const hits = (row?.hits ?? 0) + 1;
  db.prepare(
    `INSERT INTO rate_limits (bucket, window_start, hits) VALUES (?, ?, 1)
     ON CONFLICT(bucket, window_start) DO UPDATE SET hits = rate_limits.hits + 1`,
  ).run(key, windowStart);
  db.prepare(`DELETE FROM rate_limits WHERE window_start < ?`).run(now - windowMs * 6);
  if (hits > limit) return { ok: false, retryAfter: Math.ceil((windowStart + windowMs - now) / 1000) };
  return { ok: true, retryAfter: 0 };
}
