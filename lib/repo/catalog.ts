import { getDb } from '@/lib/db';
import type { FilterState, SessionUser } from '@/domain/types';
import { queryAnimalIds } from '@/domain/ai';

/**
 * Catalog reads shared verbatim by the mobile app and the desktop site.
 * Presentation differs (spec §48); data access does not.
 */

export interface AnimalCard {
  id: string;
  slug: string;
  name: string;
  sex: string;
  age_months: number;
  price_cents: number;
  currency: string;
  availability: string;
  city: string;
  state: string;
  species_name: string;
  scientific_name: string;
  morph_name: string | null;
  business_name: string;
  breeder_slug: string;
  breeder_tier: string;
  rating_avg: number;
  image_medium: string | null;
  image_small: string | null;
  image_alt: string;
  experience_level: string;
  compliance_status: string;
  is_featured: number;
  view_count: number;
  published_at: string | null;
}

export function cardsByIds(ids: string[]): AnimalCard[] {
  if (!ids.length) return [];
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM v_animal_cards WHERE id IN (${ids.map(() => '?').join(',')})`,
    )
    .all(...ids) as AnimalCard[];
  const order = new Map(ids.map((x, i) => [x, i]));
  return rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

export function searchAnimals(filters: FilterState, limit = 48, offset = 0) {
  const db = getDb();
  // Counting uses the same compiler so "128 Animals Available" is truthful.
  const allIds = queryAnimalIds({ ...filters, availableOnly: filters.availableOnly }, 1000);
  const page = allIds.slice(offset, offset + limit);
  return { total: allIds.length, ids: page, cards: cardsByIds(page) };
}

export function featured(limit = 6): AnimalCard[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id FROM v_animal_cards
       WHERE status = 'APPROVED' AND availability = 'AVAILABLE'
       ORDER BY is_featured DESC, rating_avg DESC, published_at DESC LIMIT ?`,
    )
    .all(limit) as { id: string }[];
  return cardsByIds(rows.map((r) => r.id));
}

export function byCategory(categorySlug: string, limit = 24): AnimalCard[] {
  return searchAnimals({ category: categorySlug, sort: 'rating' }, limit).cards;
}

export function recentlyViewed(userId: string | null, limit = 10): AnimalCard[] {
  if (!userId) return [];
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT DISTINCT entity_id AS id FROM user_events
       WHERE user_id = ? AND kind = 'VIEW_ANIMAL' AND entity_id IS NOT NULL
       ORDER BY created_at DESC LIMIT ?`,
    )
    .all(userId, limit) as { id: string }[];
  return cardsByIds(rows.map((r) => r.id));
}

export interface AnimalDetail {
  animal: Record<string, string | number | null>;
  species: Record<string, string | number | null>;
  images: Record<string, string | number | null>[];
  videos: Record<string, string | number | null>[];
  breeder: Record<string, string | number | null>;
  documents: { doc_type: string; status: string; expires_at: string | null; visibility: string; accessible: boolean }[];
  requiredDocuments: { doc_type: string; mandatory: number; description: string }[];
  reviews: Record<string, string | number | null>[];
  similar: AnimalCard[];
  compliance: { status: string; notes: string } | null;
}

export function animalBySlug(slug: string, viewer: SessionUser | null): AnimalDetail | null {
  const db = getDb();
  const animal = db
    .prepare(
      `SELECT a.*, s.common_name AS species_name, s.scientific_name, m.name AS morph_name,
              c.name AS category_name, c.slug AS category_slug, sub.name AS subspecies_name
       FROM animals a
       JOIN species s ON s.id = a.species_id
       JOIN categories c ON c.id = a.category_id
       LEFT JOIN morphs m ON m.id = a.morph_id
       LEFT JOIN subspecies sub ON sub.id = a.subspecies_id
       WHERE a.slug = ?`,
    )
    .get(slug) as Record<string, string | number | null> | undefined;
  if (!animal) return null;

  // Row-level policy: buyers never see DRAFT/REJECTED/ARCHIVED or medical notes.
  const isOwner = !!viewer && viewer.breederId === animal.breeder_id;
  const isStaff = viewer?.role === 'ADMIN' || viewer?.role === 'MODERATOR';
  const publicStatuses = ['APPROVED', 'SOLD', 'SUSPENDED'];
  if (!isOwner && !isStaff && !publicStatuses.includes(String(animal.status))) return null;
  if (!isOwner && !isStaff) delete animal.medical_notes;

  const species = db.prepare(`SELECT * FROM species WHERE id = ?`).get(animal.species_id) as Record<string, string | number | null>;
  const images = db.prepare(`SELECT * FROM animal_images WHERE animal_id = ? ORDER BY position`).all(animal.id) as Record<
    string,
    string | number | null
  >[];
  const videos = db.prepare(`SELECT * FROM animal_videos WHERE animal_id = ? ORDER BY position`).all(animal.id) as Record<
    string,
    string | number | null
  >[];
  const breeder = db.prepare(`SELECT * FROM breeders WHERE id = ?`).get(animal.breeder_id) as Record<string, string | number | null>;

  const docs = db
    .prepare(`SELECT doc_type,status,expires_at,visibility FROM animal_documents WHERE animal_id = ? ORDER BY uploaded_at DESC`)
    .all(animal.id) as { doc_type: string; status: string; expires_at: string | null; visibility: string }[];
  const documents = docs.map((d) => ({
    ...d,
    accessible: isOwner || isStaff || (d.visibility === 'PUBLIC_BADGE' && d.status === 'VERIFIED'),
  }));

  const jurisdictionId = animal.jurisdiction_id as string;
  const requiredDocuments = db
    .prepare(
      `SELECT doc_type, mandatory, description FROM required_documents
       WHERE (species_id = ? OR species_id IS NULL) AND (jurisdiction_id = ? OR jurisdiction_id IS NULL)`,
    )
    .all(animal.species_id, jurisdictionId) as { doc_type: string; mandatory: number; description: string }[];

  const reviews = db
    .prepare(
      `SELECT r.*, u.first_name, u.last_name FROM reviews r JOIN users u ON u.id = r.author_id
       WHERE r.breeder_id = ? AND r.status = 'PUBLISHED' ORDER BY r.created_at DESC LIMIT 8`,
    )
    .all(animal.breeder_id) as Record<string, string | number | null>[];

  const similar = bySimilar(String(animal.species_id), String(animal.id), 8);
  const check = db
    .prepare(`SELECT result, matched_rules FROM compliance_checks WHERE entity_type = 'ANIMAL' AND entity_id = ? ORDER BY evaluated_at DESC LIMIT 1`)
    .get(animal.id) as { result: string; matched_rules: string } | undefined;

  return {
    animal,
    species,
    images,
    videos,
    breeder,
    documents,
    requiredDocuments,
    reviews,
    similar,
    compliance: check ? { status: check.result, notes: check.matched_rules } : null,
  };
}

function bySimilar(speciesId: string, excludeId: string, limit: number): AnimalCard[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id FROM animals WHERE species_id = ? AND id != ? AND status = 'APPROVED' AND availability = 'AVAILABLE'
       ORDER BY price_cents LIMIT ?`,
    )
    .all(speciesId, excludeId, limit) as { id: string }[];
  if (rows.length >= 4) return cardsByIds(rows.map((r) => r.id));
  const extra = db
    .prepare(
      `SELECT id FROM animals WHERE id != ? AND status = 'APPROVED' AND availability = 'AVAILABLE' ORDER BY published_at DESC LIMIT ?`,
    )
    .all(excludeId, limit) as { id: string }[];
  const merged = [...new Set([...rows.map((r) => r.id), ...extra.map((r) => r.id)])].slice(0, limit);
  return cardsByIds(merged);
}

export function bumpViews(animalId: string) {
  const db = getDb();
  db.prepare(`UPDATE animals SET view_count = view_count + 1 WHERE id = ?`).run(animalId);
}

export function trackEvent(userId: string | null, kind: string, entityId: string | null, weight = 1) {
  if (!userId || !entityId) return;
  const db = getDb();
  db.prepare(`INSERT INTO user_events (id,user_id,kind,entity_id,weight,created_at) VALUES (?,?,?,?,?,?)`).run(
    `evt_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    userId,
    kind,
    entityId,
    weight,
    new Date().toISOString(),
  );
  // Keep the behaviour window bounded.
  db.prepare(
    `DELETE FROM user_events WHERE user_id = ? AND created_at < ?`,
  ).run(userId, new Date(Date.now() - 1000 * 60 * 60 * 24 * 120).toISOString());
}

/* ------------------------------------------------------------------ taxonomy */

export function categories(withCounts = false) {
  const db = getDb();
  if (!withCounts) return db.prepare(`SELECT * FROM categories ORDER BY sort`).all() as Record<string, string | number | null>[];
  return db
    .prepare(
      `SELECT c.*, (SELECT COUNT(*) FROM animals a WHERE a.category_id = c.id AND a.status='APPROVED' AND a.availability='AVAILABLE') AS animal_count
       FROM categories c ORDER BY c.sort`,
    )
    .all() as Record<string, string | number | null>[];
}

export function speciesByCategory(categorySlug?: string) {
  const db = getDb();
  const sql = categorySlug
    ? `SELECT s.* FROM species s JOIN categories c ON c.id = s.category_id WHERE c.slug = ? ORDER BY s.common_name`
    : `SELECT * FROM species ORDER BY common_name`;
  return (categorySlug ? db.prepare(sql).all(categorySlug) : db.prepare(sql).all()) as Record<string, string | number | null>[];
}

export function speciesBySlug(slug: string) {
  const db = getDb();
  return db.prepare(`SELECT * FROM species WHERE slug = ?`).get(slug) as Record<string, string | number | null> | undefined;
}

export function morphsFor(speciesId: string) {
  const db = getDb();
  return db.prepare(`SELECT * FROM morphs WHERE species_id = ? ORDER BY name`).all(speciesId) as Record<string, string | number | null>[];
}

/** Facet counts for the filter sheet / sidebar — computed, never hard-coded. */
export function facets(filters: FilterState) {
  const db = getDb();
  // Counts are computed over the *current* result set, so what a shopper sees
  // next to each facet is the number of listings they would actually get.
  const matched = queryAnimalIds(filters, 600);
  const ph = matched.map(() => '?').join(',');
  const base = matched.length
    ? `FROM animals a JOIN species s ON s.id = a.species_id JOIN breeders b ON b.id = a.breeder_id
        JOIN categories c ON c.id = a.category_id LEFT JOIN morphs m ON m.id = a.morph_id
        WHERE a.id IN (${ph})`
    : `FROM animals a JOIN species s ON s.id = a.species_id JOIN breeders b ON b.id = a.breeder_id
        JOIN categories c ON c.id = a.category_id LEFT JOIN morphs m ON m.id = a.morph_id WHERE 0`;
  const group = (select: string, extra: string) =>
    db.prepare(`${select} ${base} ${extra}`).all(...matched) as { value: string; label: string; count: number }[];
  const price = db
    .prepare(
      `SELECT MIN(price_cents) AS min_cents, MAX(price_cents) AS max_cents FROM animals WHERE status = 'APPROVED' AND availability = 'AVAILABLE'`,
    )
    .get() as { min_cents: number | null; max_cents: number | null };
  const total = db
    .prepare(`SELECT COUNT(*) AS n FROM animals WHERE status = 'APPROVED' AND availability = 'AVAILABLE'`)
    .get() as { n: number };
  return {
    categories: group(`SELECT c.slug AS value, c.name AS label, COUNT(*) AS count`, `GROUP BY c.slug, c.name ORDER BY count DESC`),
    species: group(`SELECT s.slug AS value, s.common_name AS label, COUNT(*) AS count`, `GROUP BY s.slug, s.common_name ORDER BY count DESC LIMIT 60`),
    morphs: group(`SELECT m.name AS value, m.name AS label, COUNT(*) AS count`, `AND m.name IS NOT NULL GROUP BY m.name ORDER BY count DESC LIMIT 30`),
    sexes: group(`SELECT a.sex AS value, a.sex AS label, COUNT(*) AS count`, `GROUP BY a.sex`),
    states: group(`SELECT a.state AS value, a.state AS label, COUNT(*) AS count`, `GROUP BY a.state ORDER BY a.state`),
    experience: group(`SELECT a.experience_level AS value, a.experience_level AS label, COUNT(*) AS count`, `GROUP BY a.experience_level`),
    price,
    availableTotal: total.n,
  };
}

export function availableCount(filters: FilterState = {}): number {
  return searchAnimals({ ...filters, sort: 'newest' }, 1, 0).total;
}

/* -------------------------------------------------------------------- sellers */

export function breederBySlug(slug: string) {
  const db = getDb();
  const breeder = db.prepare(`SELECT * FROM breeders WHERE slug = ?`).get(slug) as Record<string, string | number | null> | undefined;
  if (!breeder) return null;
  const user = db.prepare(`SELECT first_name,last_name,avatar_path FROM users WHERE id = ?`).get(breeder.user_id) as Record<
    string,
    string | null
  >;
  const animals = db
    .prepare(`SELECT id FROM animals WHERE breeder_id = ? AND status='APPROVED' AND availability='AVAILABLE' ORDER BY published_at DESC`)
    .all(breeder.id) as { id: string }[];
  const sold = db
    .prepare(`SELECT id FROM animals WHERE breeder_id = ? AND status IN ('SOLD','ARCHIVED') ORDER BY updated_at DESC LIMIT 12`)
    .all(breeder.id) as { id: string }[];
  const reviews = db
    .prepare(
      `SELECT r.*, u.first_name, u.last_name FROM reviews r JOIN users u ON u.id = r.author_id
       WHERE r.breeder_id = ? AND r.status='PUBLISHED' ORDER BY r.created_at DESC LIMIT 10`,
    )
    .all(breeder.id) as Record<string, string | number | null>[];
  const stats = db
    .prepare(`SELECT COUNT(*) AS n FROM animals WHERE breeder_id = ? AND status='APPROVED'`)
    .get(breeder.id) as { n: number };
  const verification = db
    .prepare(`SELECT * FROM breeder_verifications WHERE breeder_id = ? ORDER BY submitted_at DESC LIMIT 1`)
    .get(breeder.id) as Record<string, string | null> | undefined;
  const publicDocs = db
    .prepare(
      `SELECT doc_type, status, expires_at FROM animal_documents WHERE breeder_id = ? AND visibility='PUBLIC_BADGE' ORDER BY uploaded_at DESC LIMIT 6`,
    )
    .all(breeder.id) as { doc_type: string; status: string; expires_at: string | null }[];
  return {
    breeder,
    user,
    animals: cardsByIds(animals.map((a) => a.id)),
    soldAnimals: cardsByIds(sold.map((a) => a.id)),
    reviews,
    approvedCount: stats.n,
    verification,
    publicDocs,
  };
}

export function breederBySlugLite(slug: string) {
  const db = getDb();
  return db
    .prepare(
      `SELECT b.*, u.first_name, u.last_name, u.avatar_path FROM breeders b JOIN users u ON u.id = b.user_id WHERE b.slug = ?`,
    )
    .get(slug) as Record<string, string | number | null> | undefined;
}

export function verifiedBreeders(limit = 8) {
  const db = getDb();
  return db
    .prepare(
      `SELECT b.*, u.avatar_path, u.first_name, u.last_name,
              (SELECT COUNT(*) FROM animals a WHERE a.breeder_id = b.id AND a.status='APPROVED' AND a.availability='AVAILABLE') AS live_count
       FROM breeders b JOIN users u ON u.id = b.user_id
       WHERE b.status='APPROVED' ORDER BY b.tier='VERIFIED_BREEDER' DESC, b.rating_avg DESC, live_count DESC LIMIT ?`,
    )
    .all(limit) as Record<string, string | number | null>[];
}

export function stateAvailability(speciesId: string) {
  const db = getDb();
  return db
    .prepare(
      `SELECT j.code, j.name, sr.status, sr.reason, sr.citation FROM species_restrictions sr
       JOIN jurisdictions j ON j.id = sr.jurisdiction_id WHERE sr.species_id = ? ORDER BY j.code`,
    )
    .all(speciesId) as { code: string; name: string; status: string; reason: string; citation: string | null }[];
}

/* --------------------------------------------------------------------- guides */

export function guides(list = false) {
  const db = getDb();
  const sql = list
    ? `SELECT slug,title,excerpt,category_slug,difficulty,reading_minutes,cover_path,author_name,published_at,tags FROM guides ORDER BY published_at DESC`
    : `SELECT * FROM guides ORDER BY published_at DESC LIMIT 12`;
  return db.prepare(sql).all() as Record<string, string | number | null>[];
}

export function guideBySlug(slug: string) {
  const db = getDb();
  return db.prepare(`SELECT * FROM guides WHERE slug = ?`).get(slug) as Record<string, string | number | null> | undefined;
}

/* ---------------------------------------------------------------- homepage */

/** States whose wildlife rulebook FAUNAL has actually read and recorded. */
export function onboardedStates(): { code: string; name: string; rules: number; animals: number }[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT j.code, j.name,
              (SELECT COUNT(*) FROM species_restrictions sr WHERE sr.jurisdiction_id = j.id) AS rules,
              (SELECT COUNT(*) FROM animals a WHERE a.state = j.code AND a.status = 'APPROVED') AS animals
       FROM jurisdictions j WHERE j.level = 'STATE' ORDER BY j.code`,
    )
    .all() as { code: string; name: string; rules: number; animals: number }[];
}

export function homeStats() {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM animals WHERE status='APPROVED' AND availability='AVAILABLE') AS animals,
              (SELECT COUNT(*) FROM breeders WHERE status='APPROVED') AS breeders,
              (SELECT COUNT(*) FROM breeders WHERE tier='VERIFIED_BREEDER') AS verified,
              (SELECT COUNT(*) FROM orders WHERE status='COMPLETED') AS completed_orders,
              (SELECT COUNT(*) FROM reviews) AS reviews,
              (SELECT COUNT(*) FROM species) AS species`,
    )
    .get() as Record<string, number>;
  return row;
}
