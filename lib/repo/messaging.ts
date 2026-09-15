import { getDb } from '@/lib/db';
import { insert, update, get, parse } from '@/db/kit';
import { HttpError, audit } from '@/domain/rbac';
import { id, nowIso } from '@/domain/util';
import { notify } from '@/domain/notify';
import { scanMessage } from '@/domain/fraud';
import type { SessionUser } from '@/domain/types';

/**
 * Buyer ↔ breeder messaging (spec §14). Conversations are scoped to the two
 * participants in SQL; every message is screened for off-platform payment
 * attempts before it is ever rendered.
 */

export function openConversation(buyer: SessionUser, sellerUserId: string, animalId: string | null, seed?: string) {
  const db = getDb();
  if (buyer.id === sellerUserId) throw new HttpError(400, "You can't message yourself.");
  const blocked = get(`SELECT 1 AS x FROM blocked_users WHERE blocked_id = ? AND user_id = ?`, [buyer.id, sellerUserId]);
  if (blocked) throw new HttpError(403, 'This breeder is not accepting messages from you.', 'BLOCKED');

  const existing = get<Record<string, string | null>>(
    `SELECT * FROM conversations WHERE buyer_id = ? AND seller_user_id = ? AND (animal_id IS ? OR animal_id = ?) LIMIT 1`,
    [buyer.id, sellerUserId, animalId, animalId ?? ''],
  );
  if (existing) {
    if (seed?.trim()) {
      appendMessage(String(existing.id), buyer.id, seed.trim());
    }
    return detail(buyer, String(existing.id));
  }
  const convId = id('cnv');
  insert('conversations', {
    id: convId,
    buyer_id: buyer.id,
    seller_user_id: sellerUserId,
    animal_id: animalId,
    subject: animalId ? `Listing enquiry` : 'Breeder enquiry',
    last_message_at: nowIso(),
    created_at: nowIso(),
  });
  if (seed?.trim()) appendMessage(convId, buyer.id, seed.trim());
  audit(buyer, 'CONVERSATION_OPEN', 'CONVERSATION', convId, { animal_id: animalId }, 'api');
  return detail(buyer, convId);
}

export function appendMessage(conversationId: string, senderId: string, body: string, imagePath?: string | null) {
  const db = getDb();
  const text = body.trim().slice(0, 4000);
  if (!text && !imagePath) throw new HttpError(400, 'Write a message first.');
  const messageId = id('msg');
  insert('messages', {
    id: messageId,
    conversation_id: conversationId,
    sender_id: senderId,
    body: text,
    image_path: imagePath ?? null,
    read_at: null,
    created_at: nowIso(),
    risk_level: 'NONE',
    flags: [],
  });
  update('conversations', { last_message_at: nowIso() }, 'id', conversationId);
  const risk = scanMessage(messageId, text, conversationId);
  const conv = get<Record<string, string | null>>(`SELECT * FROM conversations WHERE id = ?`, [conversationId]);
  if (conv) {
    const recipient = conv.buyer_id === senderId ? conv.seller_user_id : conv.buyer_id;
    if (recipient) {
      notify(
        recipient,
        'MESSAGE',
        risk.level === 'HIGH' ? 'New message (flagged for review)' : 'New message',
        text ? `${text.slice(0, 90)}${text.length > 90 ? '…' : ''}` : 'Sent an image',
        `/messages/${conversationId}`,
        { conversation: conversationId },
      );
    }
  }
  return { messageId, risk };
}

export function listConversations(user: SessionUser) {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT c.*,
              a.name AS animal_name, a.slug AS animal_slug, a.price_cents, a.currency,
              img.path_small AS animal_image,
              br.business_name, br.slug AS breeder_slug, br.tier AS breeder_tier,
              bu.first_name AS buyer_first, bu.last_name AS buyer_last, bu.avatar_path AS buyer_avatar,
              su.first_name AS seller_first, su.last_name AS seller_last, su.avatar_path AS seller_avatar,
              (SELECT body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_body,
              (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id
                 AND (m.read_at IS NULL OR m.read_at = '') AND m.sender_id != ?) AS unread,
              (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.risk_level = 'HIGH') AS risk_count
       FROM conversations c
       JOIN users bu ON bu.id = c.buyer_id
       JOIN users su ON su.id = c.seller_user_id
       LEFT JOIN breeders br ON br.user_id = c.seller_user_id
       LEFT JOIN animals a ON a.id = c.animal_id
       LEFT JOIN animal_images img ON img.animal_id = a.id AND img.position = 0
       WHERE c.buyer_id = ? OR c.seller_user_id = ?
       ORDER BY c.last_message_at DESC LIMIT 60`,
    )
    .all(user.id, user.id, user.id) as Record<string, string | number | null>[];

  return rows.map((r) => {
    const buyerSide = r.buyer_id === user.id;
    return {
      ...r,
      last_body: String(r.last_body ?? '').slice(0, 120),
      counterparty_id: buyerSide ? r.seller_user_id : r.buyer_id,
      counterparty_name: buyerSide
        ? (r.business_name as string) || `${r.seller_first} ${r.seller_last}`
        : `${r.buyer_first} ${r.buyer_last}`,
      counterparty_avatar: buyerSide ? r.seller_avatar : r.buyer_avatar,
    };
  });
}

export function detail(user: SessionUser, conversationId: string) {
  const db = getDb();
  const conv = get<Record<string, string | null>>(`SELECT * FROM conversations WHERE id = ?`, [conversationId]);
  if (!conv) throw new HttpError(404, 'Conversation not found.');
  if (conv.buyer_id !== user.id && conv.seller_user_id !== user.id) {
    throw new HttpError(403, 'You are not a participant in this conversation.', 'FORBIDDEN');
  }
  const messages = db
    .prepare(`SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at`)
    .all(conversationId) as Record<string, string | number | null>[];
  const otherId = conv.buyer_id === user.id ? (conv.seller_user_id as string) : (conv.buyer_id as string);
  const other = get<Record<string, string | null>>(
    `SELECT u.id, u.first_name, u.last_name, u.email, u.avatar_path, b.business_name, b.slug, b.tier, b.rating_avg, b.city, b.state
     FROM users u LEFT JOIN breeders b ON b.user_id = u.id WHERE u.id = ?`,
    [otherId],
  );
  const animal = conv.animal_id ? get<Record<string, string | number | null>>(`SELECT * FROM animals WHERE id = ?`, [conv.animal_id]) : null;
  const isBlocked = !!get(`SELECT 1 AS x FROM blocked_users WHERE user_id = ? AND blocked_id = ?`, [user.id, otherId]);

  db.prepare(`UPDATE messages SET read_at = ? WHERE conversation_id = ? AND sender_id != ? AND (read_at IS NULL OR read_at = '')`).run(
    nowIso(),
    conversationId,
    user.id,
  );

  return {
    conversation: conv,
    other,
    animal,
    isBlocked,
    messages: messages.map((m) => ({
      ...m,
      flags: parse(m.flags as string, [] as string[]),
      mine: m.sender_id === user.id,
    })),
  };
}

export function blockUser(user: SessionUser, otherId: string) {
  const db = getDb();
  const existing = get(`SELECT 1 AS x FROM blocked_users WHERE user_id = ? AND blocked_id = ?`, [user.id, otherId]);
  if (existing) {
    db.prepare(`DELETE FROM blocked_users WHERE user_id = ? AND blocked_id = ?`).run(user.id, otherId);
    return { blocked: false };
  }
  insert('blocked_users', { user_id: user.id, blocked_id: otherId, created_at: nowIso() });
  audit(user, 'BLOCK_USER', 'USER', otherId, {}, 'api');
  return { blocked: true };
}

export function replyAsSeller(seller: SessionUser, conversationId: string, body: string) {
  const conv = get<Record<string, string | null>>(`SELECT * FROM conversations WHERE id = ?`, [conversationId]);
  if (!conv) throw new HttpError(404, 'Conversation not found.');
  if (conv.seller_user_id !== seller.id) throw new HttpError(403, 'Not your conversation.', 'FORBIDDEN');
  return appendMessage(conversationId, seller.id, body);
}

export function unreadMessages(userId: string): number {
  const db = getDb();
  return (
    (db
      .prepare(
        `SELECT COUNT(*) AS n FROM messages m JOIN conversations c ON c.id = m.conversation_id
         WHERE (c.buyer_id = ? OR c.seller_user_id = ?) AND m.sender_id != ? AND (m.read_at IS NULL OR m.read_at = '')`,
      )
      .get(userId, userId, userId) as { n: number }).n ?? 0
  );
}
