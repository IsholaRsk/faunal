import { getDb } from '@/lib/db';
import { HttpError, audit } from '@/domain/rbac';
import { evaluateCompliance } from '@/domain/compliance';
import type { FilterState, SessionUser, ShippingMethod } from '@/domain/types';
import { nowIso, id } from '@/domain/util';
import { notify } from '@/domain/notify';

/**
 * Cart + favorites. Adding to cart already runs the compliance engine for the
 * buyer's destination so the user learns about a legal blocker *before* paying.
 */

export interface CartLine {
  [key: string]: unknown;
  id: string;
  animal_id: string;
  species_id: string;
  breeder_id: string;
  price_cents: number;
  quantity: number;
  shipping_method: string;
  listing_blocked: boolean;
  legal: ReturnType<typeof evaluateCompliance>;
  line_cents: number;
}

export function cartFor(user: SessionUser): { lines: CartLine[]; subtotal_cents: number; blocked_count: number; checkout_ready: boolean } {
  const db = getDb();
  const items = db
    .prepare(
      `SELECT ci.id, ci.animal_id, ci.quantity, ci.shipping_method, ci.added_at,
              a.price_cents, a.currency, a.status, a.availability, a.state, a.jurisdiction_id, a.species_id,
              a.origin_jurisdiction_id, a.morph_id,
              s.common_name AS species_name, a.slug, a.name, a.sex, a.age_months,
              b.id AS breeder_id, b.business_name, b.slug AS breeder_slug,
              b.jurisdiction_id AS breeder_jurisdiction, b.tier AS breeder_tier,
              m.name AS morph_name,
              img.path_small AS image
       FROM cart_items ci
       JOIN animals a ON a.id = ci.animal_id
       JOIN species s ON s.id = a.species_id
       JOIN breeders b ON b.id = a.breeder_id
       LEFT JOIN morphs m ON m.id = a.morph_id
       LEFT JOIN (SELECT animal_id, path_small, ROW_NUMBER() OVER (PARTITION BY animal_id ORDER BY position) rn FROM animal_images) img
              ON img.animal_id = a.id AND img.rn = 1
       WHERE ci.user_id = ? ORDER BY ci.added_at DESC`,
    )
    .all(user.id) as Record<string, string | number | null>[];

  const lines = items.map((item) => {
    const verdict = evaluateCompliance({
      speciesId: String(item.species_id),
      animalId: String(item.animal_id),
      breederId: String(item.breeder_id),
      originJurisdictionId: String(item.breeder_jurisdiction ?? item.jurisdiction_id),
      destinationJurisdictionId: destinationJurisdiction(user),
      buyerUserId: user.id,
      method: String(item.shipping_method) as ShippingMethod,
    });
    const listingBlocked = !['APPROVED'].includes(String(item.status)) || item.availability === 'SOLD_OUT';
    return {
      ...item,
      listing_blocked: listingBlocked,
      legal: verdict,
      line_cents: Number(item.price_cents) * Number(item.quantity),
    };
  });

  const subtotal = lines.reduce((sum, l) => sum + (l.listing_blocked ? 0 : l.line_cents), 0);
  const blocked = lines.filter((l) => l.listing_blocked || !l.legal.canBuy);
  return { lines: lines as unknown as CartLine[], subtotal_cents: subtotal, blocked_count: blocked.length, checkout_ready: lines.length > 0 && blocked.length === 0 };
}

function destinationJurisdiction(user: SessionUser): string | null {
  const db = getDb();
  if (!user.jurisdictionCode) return null;
  const row = db.prepare(`SELECT id FROM jurisdictions WHERE code = ?`).get(user.jurisdictionCode) as { id: string } | undefined;
  return row?.id ?? null;
}

export function addToCart(user: SessionUser, animalId: string, method: ShippingMethod = 'SPECIALIZED_SHIPPING') {
  const db = getDb();
  const animal = db.prepare(`SELECT * FROM animals WHERE id = ?`).get(animalId) as Record<string, string | number | null> | undefined;
  if (!animal) throw new HttpError(404, 'Listing not found.');
  if (animal.status !== 'APPROVED') throw new HttpError(409, 'This listing is not open for purchase yet.');
  if (animal.availability !== 'AVAILABLE') throw new HttpError(409, `This animal is ${String(animal.availability).toLowerCase().replace('_', ' ')}.`);
  if (String(animal.breeder_id) === user.breederId) throw new HttpError(400, 'You cannot buy your own listing.');

  const verdict = evaluateCompliance({
    speciesId: String(animal.species_id),
    animalId: String(animal.id),
    breederId: String(animal.breeder_id),
    originJurisdictionId: String(animal.jurisdiction_id),
    destinationJurisdictionId: destinationJurisdiction(user),
    buyerUserId: user.id,
    method,
  });
  if (verdict.verdict === 'PROHIBITED' || !verdict.canBuy) {
    audit(user, 'CART_BLOCKED', 'ANIMAL', animalId, { verdict: verdict.verdict }, 'api');
    throw new HttpError(451, verdict.notes[0] ?? 'This animal cannot be transferred to your location.', 'COMPLIANCE_BLOCK');
  }

  db.prepare(
    `INSERT INTO cart_items (id,user_id,animal_id,quantity,shipping_method,added_at) VALUES (?,?,?,1,?,?)
     ON CONFLICT(user_id, animal_id) DO UPDATE SET shipping_method = excluded.shipping_method`,
  ).run(id('crt'), user.id, animalId, method, nowIso());

  db.prepare(
    `INSERT INTO compliance_checks (id,entity_type,entity_id,species_id,origin_jurisdiction_id,destination_jurisdiction_id,result,matched_rules,required_documents,allowed_methods,evaluated_at,reviewer_id,decision,decision_note)
     VALUES (?,'CART',?,?,?,?,?,?,?,?,?,NULL,NULL,NULL)`,
  ).run(
    id('cck'),
    animalId,
    animal.species_id as string,
    animal.jurisdiction_id as string,
    destinationJurisdiction(user),
    verdict.verdict,
    JSON.stringify(verdict.rules),
    JSON.stringify(verdict.requiredDocuments),
    JSON.stringify(verdict.allowedMethods),
    nowIso(),
  );
  audit(user, 'CART_ADD', 'ANIMAL', animalId, { price_cents: animal.price_cents }, 'api');
  return { ok: true, cart: cartFor(user), verdict };
}

export function updateCartItem(user: SessionUser, itemId: string, patch: { shipping_method?: ShippingMethod }) {
  const db = getDb();
  const row = db.prepare(`SELECT id FROM cart_items WHERE id = ? AND user_id = ?`).get(itemId, user.id);
  if (!row) throw new HttpError(404, 'Cart item not found.');
  if (patch.shipping_method) {
    db.prepare(`UPDATE cart_items SET shipping_method = ? WHERE id = ?`).run(patch.shipping_method, itemId);
  }
  return cartFor(user);
}

export function removeFromCart(user: SessionUser, itemId: string) {
  const db = getDb();
  db.prepare(`DELETE FROM cart_items WHERE id = ? AND user_id = ?`).run(itemId, user.id);
  return cartFor(user);
}

export function cartCount(userId: string): number {
  const db = getDb();
  const row = db.prepare(`SELECT COUNT(*) AS n FROM cart_items WHERE user_id = ?`).get(userId) as { n: number };
  return row.n;
}

/* ----------------------------------------------------------------- favorites */

export function toggleFavorite(user: SessionUser, animalId: string) {
  const db = getDb();
  const existing = db.prepare(`SELECT id, notify_on_price_drop FROM favorites WHERE user_id = ? AND animal_id = ?`).get(user.id, animalId) as
    | { id: string; notify_on_price_drop: number }
    | undefined;
  if (existing) {
    db.prepare(`DELETE FROM favorites WHERE id = ?`).run(existing.id);
    audit(user, 'FAVORITE_REMOVE', 'ANIMAL', animalId, {}, 'api');
    return { favorited: false };
  }
  db.prepare(`INSERT INTO favorites (id,user_id,animal_id,notify_on_price_drop,created_at) VALUES (?,?,?,1,?)`).run(
    id('fav'),
    user.id,
    animalId,
    nowIso(),
  );
  audit(user, 'FAVORITE_ADD', 'ANIMAL', animalId, {}, 'api');
  const animal = db
    .prepare(`SELECT a.name, a.price_cents, b.business_name, b.user_id FROM animals a JOIN breeders b ON b.id = a.breeder_id WHERE a.id = ?`)
    .get(animalId) as { name: string; price_cents: number; business_name: string; user_id: string } | undefined;
  if (animal && animal.user_id !== user.id) {
    notify(animal.user_id, 'FAVORITE_UPDATE', 'A buyer favorited your listing', `${animal.name} was added to a wishlist. Responding fast lifts conversion.`, '/seller/listings');
  }
  return { favorited: true };
}

export function favoritesFor(user: SessionUser) {
  const db = getDb();
  const animals = db
    .prepare(`SELECT a.id, f.created_at FROM favorites f JOIN animals a ON a.id = f.animal_id WHERE f.user_id = ? ORDER BY f.created_at DESC`)
    .all(user.id) as { id: string; created_at: string }[];
  const breeders = db
    .prepare(`SELECT b.* FROM followed_breeders fb JOIN breeders b ON b.id = fb.breeder_id WHERE fb.user_id = ? ORDER BY fb.created_at DESC`)
    .all(user.id) as Record<string, string | number | null>[];
  return { animals, breeders };
}

export function favoriteAnimalCards(user: SessionUser) {
  const db = getDb();
  const rows = db
    .prepare(`SELECT a.id FROM favorites f JOIN animals a ON a.id = f.animal_id WHERE f.user_id = ? ORDER BY f.created_at DESC`)
    .all(user.id) as { id: string }[];
  return rows.map((r) => r.id);
}

/** Price-drop + back-in-stock alerts (spec §19/§23) — run after any listing edit. */
export function evaluateFavoriteAlerts(animalId: string, previous: { price_cents: number; availability: string }) {
  const db = getDb();
  const now = db.prepare(`SELECT price_cents, availability, name, slug FROM animals WHERE id = ?`).get(animalId) as
    | { price_cents: number; availability: string; name: string; slug: string }
    | undefined;
  if (!now) return 0;
  const fans = db.prepare(`SELECT user_id, notify_on_price_drop FROM favorites WHERE animal_id = ?`).all(animalId) as {
    user_id: string;
    notify_on_price_drop: number;
  }[];
  let sent = 0;
  for (const f of fans) {
    if (previous.price_cents > now.price_cents && f.notify_on_price_drop) {
      notify(
        f.user_id,
        'PRICE_DROP',
        `Price dropped on ${now.name}`,
        `Now $${(now.price_cents / 100).toLocaleString('en-US')} — was $${(previous.price_cents / 100).toLocaleString('en-US')}.`,
        `/animals/${now.slug}`,
        { animal_id: animalId },
      );
      sent++;
    } else if (previous.availability !== 'AVAILABLE' && now.availability === 'AVAILABLE') {
      notify(f.user_id, 'LISTING_AVAILABLE', `${now.name} is available again`, 'The breeder reopened this listing. First message wins the hold.', `/animals/${now.slug}`, {
        animal_id: animalId,
      });
      sent++;
    }
  }
  if (sent) db.prepare(`UPDATE animals SET compliance_notes = compliance_notes WHERE id = ?`).run(animalId);
  return sent;
}

/* ---------------------------------------------------- followed breeders */

export function toggleFollowBreeder(user: SessionUser, breederId: string) {
  const db = getDb();
  const existing = db.prepare(`SELECT 1 AS x FROM followed_breeders WHERE user_id = ? AND breeder_id = ?`).get(user.id, breederId);
  if (existing) {
    db.prepare(`DELETE FROM followed_breeders WHERE user_id = ? AND breeder_id = ?`).run(user.id, breederId);
    return { following: false };
  }
  db.prepare(`INSERT INTO followed_breeders (user_id,breeder_id,notify_on_new_listing,created_at) VALUES (?, ?,1,?)`).run(
    user.id,
    breederId,
    nowIso(),
  );
  audit(user, 'FOLLOW_BREEDER', 'BREEDER', breederId, {}, 'api');
  return { following: true };
}

export function isFavorited(userId: string | null, animalId: string): boolean {
  if (!userId) return false;
  const db = getDb();
  return !!db.prepare(`SELECT 1 AS x FROM favorites WHERE user_id = ? AND animal_id = ?`).get(userId, animalId);
}

export function isFollowing(userId: string | null, breederId: string): boolean {
  if (!userId) return false;
  const db = getDb();
  return !!db.prepare(`SELECT 1 AS x FROM followed_breeders WHERE user_id = ? AND breeder_id = ?`).get(userId, breederId);
}

export function recordSearch(userId: string | null, query: string, filters: FilterState, resultCount: number) {
  if (!userId || !query.trim()) return;
  const db = getDb();
  db.prepare(`INSERT INTO searches (id,user_id,query,filters,result_count,created_at) VALUES (?,?,?,?,?,?)`).run(
    id('srh'),
    userId,
    query.trim().slice(0, 140),
    JSON.stringify(filters),
    resultCount,
    nowIso(),
  );
}

export function recentSearches(userId: string | null, limit = 6) {
  if (!userId) return [];
  const db = getDb();
  return db
    .prepare(`SELECT query, MAX(created_at) AS at FROM searches WHERE user_id = ? GROUP BY query ORDER BY at DESC LIMIT ?`)
    .all(userId, limit) as { query: string; at: string }[];
}

export function popularSearches(limit = 6) {
  const db = getDb();
  return db
    .prepare(`SELECT query, COUNT(*) AS hits FROM searches GROUP BY query ORDER BY hits DESC LIMIT ?`)
    .all(limit) as { query: string; hits: number }[];
}
