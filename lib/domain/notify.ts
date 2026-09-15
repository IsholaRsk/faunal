import { getDb } from '@/lib/db';
import { id, nowIso } from './util';

/** Notification fan-out. Same table feeds the mobile bell and the desktop tray. */
export type NotifyKind =
  | 'ORDER_UPDATE'
  | 'PAYMENT'
  | 'MESSAGE'
  | 'FAVORITE_UPDATE'
  | 'PRICE_DROP'
  | 'LISTING_AVAILABLE'
  | 'BREEDER_VERIFICATION'
  | 'SYSTEM'
  | 'COMPLIANCE'
  | 'FRAUD';

export function notify(
  userId: string,
  kind: NotifyKind,
  title: string,
  body: string,
  href?: string,
  data: Record<string, unknown> = {},
) {
  if (!userId) return;
  const db = getDb();
  db.prepare(
    `INSERT INTO notifications (id,user_id,kind,title,body,href,data,read_at,created_at)
     VALUES (?,?,?,?,?,?,?,'',?)`,
  ).run(id('ntf'), userId, kind, title, body, href ?? null, JSON.stringify(data), nowIso());
}

export function notifyMany(userIds: string[], kind: NotifyKind, title: string, body: string, href?: string, data: Record<string, unknown> = {}) {
  for (const u of new Set(userIds.filter(Boolean))) notify(u, kind, title, body, href, data);
}

export function unreadCount(userId: string): number {
  const db = getDb();
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND (read_at = '' OR read_at IS NULL)`)
    .get(userId) as { n: number } | undefined;
  return row?.n ?? 0;
}

export function list(userId: string, limit = 60) {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`)
    .all(userId, limit) as Record<string, string | null>[];
}

export function markRead(userId: string, notificationId?: string) {
  const db = getDb();
  if (notificationId) {
    db.prepare(`UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ?`).run(nowIso(), notificationId, userId);
  } else {
    db.prepare(`UPDATE notifications SET read_at = ? WHERE user_id = ? AND (read_at = '' OR read_at IS NULL)`).run(nowIso(), userId);
  }
}
