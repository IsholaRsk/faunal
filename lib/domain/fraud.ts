import crypto from 'node:crypto';
import { getDb } from '@/lib/db';
import { id, nowIso } from './util';
import { pricingAnomaly, offPlatformRisk } from './ai';
import type { SessionUser } from './types';

/**
 * Anti-fraud & trust & safety (spec §36). Every rule here writes an
 * `fraud_flags` row that the admin dashboard consumes; nothing is cosmetic.
 */

/** 64-bit difference hash — resize to 9x8 grayscale, compare neighbours. */
export function dhashFromGrayscale(pixels: Uint8Array, width = 9, height = 8): string {
  let bits = '';
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width - 1; x++) {
      const left = pixels[y * width + x];
      const right = pixels[y * width + x + 1];
      bits += left > right ? '1' : '0';
    }
  }
  let hex = '';
  for (let i = 0; i < bits.length; i += 4) {
    hex += parseInt(bits.slice(i, i + 4) || '0', 2).toString(16);
  }
  return hex.padStart(16, '0');
}

export function hamming(a: string, b: string): number {
  if (a.length !== b.length) return 999;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    const x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    d += ((x >> 0) & 1) + ((x >> 1) & 1) + ((x >> 2) & 1) + ((x >> 3) & 1);
  }
  return d;
}

/** Stolen / recycled imagery: same image, different breeder. */
export function detectDuplicateImages(animalId: string, phash: string, breederId: string) {
  const db = getDb();
  const others = db
    .prepare(
      `SELECT i.id AS image_id, i.animal_id, i.phash, a.breeder_id, b.business_name
       FROM animal_images i JOIN animals a ON a.id = i.animal_id JOIN breeders b ON b.id = a.breeder_id
       WHERE i.phash IS NOT NULL AND a.id != ? AND phash != ''`,
    )
    .all(animalId) as { image_id: string; animal_id: string; phash: string; breeder_id: string; business_name: string }[];
  const hits = others.filter((o) => o.breeder_id !== breederId && hamming(o.phash, phash) <= 6);
  if (hits.length) {
    raiseFlag({
      kind: 'DUPLICATE_IMAGE',
      severity: 'HIGH',
      score: 0.95,
      entityType: 'ANIMAL',
      entityId: animalId,
      signals: hits.slice(0, 3).map((h) => ({
        note: 'Near-identical photo already published by another breeder (pHash distance ≤ 6).',
        matched_animal: h.animal_id,
        matched_breeder: h.business_name,
        distance: hamming(h.phash, phash),
      })),
    });
  }
  return hits.length;
}

export function detectDuplicateListings(breederId: string, speciesId: string, name: string, priceCents: number) {
  const db = getDb();
  const dup = db
    .prepare(
      `SELECT id, name FROM animals WHERE breeder_id = ? AND species_id = ? AND id != ? AND price_cents = ? AND status != 'ARCHIVED' LIMIT 5`,
    )
    .all(breederId, speciesId, name, priceCents) as { id: string; name: string }[];
  if (dup.length) {
    raiseFlag({
      kind: 'DUPLICATE_LISTING',
      severity: 'LOW',
      score: 0.4,
      entityType: 'ANIMAL',
      entityId: name,
      signals: [{ note: 'Same species, price and seller already listed.', similar: dup.map((d) => d.name) }],
    });
  }
  return dup.length;
}

export function scanMessage(messageId: string, body: string, conversationId: string) {
  const risk = offPlatformRisk(body);
  const db = getDb();
  if (risk.level === 'NONE') {
    db.prepare(`UPDATE messages SET risk_level = 'NONE', flags = '[]' WHERE id = ?`).run(messageId);
    return risk;
  }
  db.prepare(`UPDATE messages SET risk_level = ?, flags = ? WHERE id = ?`).run(
    risk.level,
    JSON.stringify(risk.signals),
    messageId,
  );
  const conv = db.prepare(`SELECT buyer_id, seller_user_id FROM conversations WHERE id = ?`).get(conversationId) as
    | { buyer_id: string; seller_user_id: string }
    | undefined;
  if (risk.level === 'HIGH' && conv) {
    raiseFlag({
      kind: 'OFF_PLATFORM_PAYMENT',
      severity: 'HIGH',
      score: 0.9,
      entityType: 'MESSAGE',
      entityId: messageId,
      signals: risk.signals.map((s) => ({ note: s, conversation: conversationId })),
    });
    notifySafetyWarning(conv.buyer_id, conv.seller_user_id, conversationId);
  }
  return risk;
}

function notifySafetyWarning(buyerId: string, sellerId: string, convId: string) {
  const db = getDb();
  for (const uid of [buyerId, sellerId]) {
    db.prepare(
      `INSERT INTO notifications (id,user_id,kind,title,body,href,data,read_at,created_at)
       VALUES (?,?,?,?,?,?,?,'', ?)`,
    ).run(
      id('ntf'),
      uid,
      'SYSTEM',
      'Keep payments inside FAUNAL',
      'A message in one of your conversations looks like an off-platform payment request. FAUNAL Protection only covers transactions completed on-platform.',
      `/messages/${convId}`,
      '{}',
      nowIso(),
    );
  }
}

export function raiseFlag(input: {
  kind: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  score: number;
  entityType: string;
  entityId: string;
  signals: unknown[];
}): string {
  const db = getDb();
  const existing = db
    .prepare(`SELECT id FROM fraud_flags WHERE entity_type = ? AND entity_id = ? AND kind = ? AND status = 'OPEN'`)
    .get(input.entityType, input.entityId, input.kind) as { id: string } | undefined;
  if (existing) {
    db.prepare(`UPDATE fraud_flags SET score = ?, severity = ?, signals = ? WHERE id = ?`).run(
      input.score,
      input.severity,
      JSON.stringify(input.signals),
      existing.id,
    );
    return existing.id;
  }
  const flagId = id('frd');
  db.prepare(
    `INSERT INTO fraud_flags (id,kind,severity,score,entity_type,entity_id,signals,status,created_at,resolved_at,resolved_by)
     VALUES (?,?,?,?,?,?,?,'OPEN',?,NULL,NULL)`,
  ).run(flagId, input.kind, input.severity, input.score, input.entityType, input.entityId, JSON.stringify(input.signals), nowIso());
  return flagId;
}

/** Full screening pass for a new/edited listing + a new account sanity check. */
export function screenListing(input: {
  animalId: string;
  breederId: string;
  speciesId: string;
  name: string;
  priceCents: number;
  user: SessionUser | null;
}) {
  const anomaly = pricingAnomaly({ speciesId: input.speciesId, priceCents: input.priceCents });
  if (anomaly.z < -2.2 || anomaly.z > 3) {
    raiseFlag({
      kind: 'SUSPICIOUS_PRICING',
      severity: anomaly.z < -2.2 ? 'MEDIUM' : 'LOW',
      score: Math.min(1, Math.abs(anomaly.z) / 5),
      entityType: 'ANIMAL',
      entityId: input.animalId,
      signals: [{ note: anomaly.note, z: Number(anomaly.z.toFixed(2)) }],
    });
  }
  const db = getDb();
  const images = db.prepare(`SELECT phash FROM animal_images WHERE animal_id = ? AND phash IS NOT NULL`).all(input.animalId) as {
    phash: string;
  }[];
  let dupes = 0;
  for (const img of images) dupes += detectDuplicateImages(input.animalId, img.phash, input.breederId);
  detectDuplicateListings(input.breederId, input.speciesId, input.animalId, input.priceCents);
  return {
    pricing: anomaly,
    duplicateImages: dupes,
    requiresReview: dupes > 0 || anomaly.z < -2.2,
  };
}

/** Device/IP clustering → multiple-account detection. */
export function checkMultiAccount(userId: string, fingerprint: string) {
  const db = getDb();
  db.exec(`CREATE TABLE IF NOT EXISTS account_signals (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, kind TEXT NOT NULL, value TEXT NOT NULL, created_at TEXT NOT NULL)`);
  const hash = crypto.createHash('sha256').update(fingerprint).digest('hex').slice(0, 32);
  db.prepare(`INSERT INTO account_signals (id,user_id,kind,value,created_at) VALUES (?,?,?,?,?)`).run(
    id('sig'),
    userId,
    'device',
    hash,
    nowIso(),
  );
  const peers = db
    .prepare(
      `SELECT DISTINCT s2.user_id FROM account_signals s1 JOIN account_signals s2 ON s1.value = s2.value AND s1.user_id != s2.user_id
       WHERE s1.user_id = ?`,
    )
    .all(userId) as { user_id: string }[];
  const sellers = peers.filter((p) => {
    const r = db.prepare(`SELECT b.id FROM breeders b WHERE b.user_id = ?`).get(p.user_id);
    return !!r;
  });
  if (sellers.length >= 2) {
    raiseFlag({
      kind: 'MULTI_ACCOUNT',
      severity: 'MEDIUM',
      score: 0.6,
      entityType: 'USER',
      entityId: userId,
      signals: [{ note: 'Multiple seller accounts share this device fingerprint.', linked: sellers.length }],
    });
  }
  return { linked: peers.length, sellerLinked: sellers.length };
}

export function openReport(input: {
  reporterId: string;
  targetType: 'ANIMAL' | 'BREEDER' | 'USER' | 'MESSAGE';
  targetId: string;
  reason: string;
  details?: string;
}) {
  const db = getDb();
  const reportId = id('rpt');
  db.prepare(
    `INSERT INTO reports (id,reporter_id,target_type,target_id,reason,details,status,resolution,created_at,reviewed_at,reviewer_id)
     VALUES (?,?,?,?,?,?, 'OPEN', NULL, ?, NULL, NULL)`,
  ).run(reportId, input.reporterId, input.targetType, input.targetId, input.reason, input.details ?? null, nowIso());
  const severity = /SCAM|ILLEGAL_SPECIES|OFF_PLATFORM_PAYMENT/.test(input.reason) ? 'HIGH' : 'MEDIUM';
  raiseFlag({
    kind: 'BEHAVIOR_ANOMALY',
    severity,
    score: severity === 'HIGH' ? 0.7 : 0.45,
    entityType: input.targetType,
    entityId: input.targetId,
    signals: [{ note: `User report: ${input.reason.replace(/_/g, ' ').toLowerCase()}`, report: reportId }],
  });
  return reportId;
}
