import fs from 'node:fs/promises';
import path from 'node:path';
import { getDb } from '@/lib/db';
import { insert, update, get, parse, updateWhere } from '@/db/kit';
import { HttpError, audit } from '@/domain/rbac';
import { evaluateCompliance, recordComplianceCheck } from '@/domain/compliance';
import { id, nowIso, slugify, uniqueSlug } from '@/domain/util';
import { PUBLIC_ROOT, storeAnimalImage, storePrivateDocument } from '@/domain/media';
import { screenListing } from '@/domain/fraud';
import { notify } from '@/domain/notify';
import type { DocType, ListingStatus, SessionUser } from '@/domain/types';
import { cardsByIds } from './catalog';
import { evaluateFavoriteAlerts } from './cart';

/**
 * Breeder workspace (spec §24 – §26). Listings move through
 * DRAFT → PENDING_REVIEW → APPROVED | REJECTED, and a listing can never reach
 * APPROVED by a seller action alone: the compliance engine + admin queue decide.
 */

export interface ListingInput {
  id?: string;
  name: string;
  speciesId: string;
  subspeciesId?: string | null;
  morphId?: string | null;
  sex: 'MALE' | 'FEMALE' | 'UNKNOWN';
  ageMonths: number;
  dateOfBirth?: string | null;
  lengthCm?: number | null;
  weightG?: number | null;
  color?: string | null;
  temperament?: string | null;
  experienceLevel?: string;
  diet?: string | null;
  habitat?: string | null;
  temperatureF?: string | null;
  humidityPct?: string | null;
  feedingSchedule?: string | null;
  enclosureMinCm?: number | null;
  medicalNotes?: string | null;
  healthStatus?: string;
  lastHealthCheck?: string | null;
  price: number; // USD, may have cents
  currency?: string;
  description: string;
  city: string;
  state: string;
  captiveBred?: boolean;
  availability?: string;
}

export function myListings(user: SessionUser, status?: ListingStatus) {
  const db = getDb();
  if (!user.breederId) return [];
  const sql = status
    ? `SELECT id FROM animals WHERE breeder_id = ? AND status = ? ORDER BY updated_at DESC LIMIT 80`
    : `SELECT id FROM animals WHERE breeder_id = ? ORDER BY updated_at DESC LIMIT 80`;
  const rows = (status ? db.prepare(sql).all(user.breederId, status) : db.prepare(sql).all(user.breederId)) as { id: string }[];
  return cardsByIds(rows.map((r) => r.id));
}

export function listingRow(user: SessionUser, animalId: string) {
  const db = getDb();
  const row = get<Record<string, string | number | null>>(`SELECT * FROM animals WHERE id = ?`, [animalId]);
  if (!row) throw new HttpError(404, 'Listing not found.');
  if (row.breeder_id !== user.breederId && user.role !== 'ADMIN') throw new HttpError(403, 'Not your listing.', 'FORBIDDEN');
  const images = db.prepare(`SELECT * FROM animal_images WHERE animal_id = ? ORDER BY position`).all(animalId) as Record<
    string,
    string | number | null
  >[];
  const documents = db.prepare(`SELECT * FROM animal_documents WHERE animal_id = ? ORDER BY uploaded_at DESC`).all(animalId) as Record<
    string,
    string | number | null
  >[];
  const check = get<Record<string, string | null>>(
    `SELECT * FROM compliance_checks WHERE entity_type = 'ANIMAL' AND entity_id = ? ORDER BY evaluated_at DESC LIMIT 1`,
    [animalId],
  );
  return {
    ...row,
    images,
    documents: documents.map((d) => ({ ...d, storage_path: undefined })),
    compliance: check ? { ...check, matched_rules: parse(check.matched_rules as string, []) } : null,
  };
}

export function saveListing(user: SessionUser, input: ListingInput, action: 'draft' | 'submit') {
  const db = getDb();
  const breederId = requireBreeder(user);
  const breeder = get<Record<string, string | null>>(`SELECT * FROM breeders WHERE id = ?`, [breederId]);
  if (!breeder) throw new HttpError(403, 'Breeder profile missing.');

  const species = get<Record<string, string | number | null>>(`SELECT * FROM species WHERE id = ?`, [input.speciesId]);
  if (!species) throw new HttpError(400, 'Choose a species from the FAUNAL taxonomy.');
  const category = String(species.category_id);
  const priceCents = Math.round(Number(input.price) * 100);
  if (!Number.isFinite(priceCents) || priceCents <= 0) throw new HttpError(400, 'Enter a price greater than $0.');
  if (!input.name.trim()) throw new HttpError(400, 'Give the animal a name.');
  if (input.description.trim().length < 40) throw new HttpError(400, 'Descriptions must be at least 40 characters — buyers ask fewer questions.');

  const jurisdiction = get<{ id: string }>(`SELECT id FROM jurisdictions WHERE code = ?`, [input.state.toUpperCase()]) ?? {
    id: get<{ id: string }>(`SELECT id FROM jurisdictions WHERE code = 'US'`)!.id,
  };

  const taken = new Set((db.prepare(`SELECT slug FROM animals`).all() as { slug: string }[]).map((r) => r.slug));
  const isNew = !input.id;
  const animalId = input.id ?? id('anm');
  const existing = input.id ? get<Record<string, string | number | null>>(`SELECT * FROM animals WHERE id = ?`, [input.id]) : undefined;
  if (existing && existing.breeder_id !== breederId && user.role !== 'ADMIN') throw new HttpError(403, 'Not your listing.', 'FORBIDDEN');
  const slug = existing?.slug ? String(existing.slug) : uniqueSlug(slugify(`${input.name}-${species.common_name}`), taken);

  const payload = {
    slug,
    breeder_id: breederId,
    category_id: category,
    species_id: input.speciesId,
    subspecies_id: input.subspeciesId || null,
    morph_id: input.morphId || null,
    name: input.name.trim(),
    sex: input.sex,
    age_months: Math.max(1, Math.round(Number(input.ageMonths) || 1)),
    date_of_birth: input.dateOfBirth || null,
    length_cm: input.lengthCm ? Number(input.lengthCm) : null,
    weight_g: input.weightG ? Number(input.weightG) : null,
    color: input.color ?? null,
    temperament: input.temperament ?? null,
    experience_level: input.experienceLevel ?? species.care_difficulty,
    origin_jurisdiction_id: jurisdiction.id,
    captive_bred: input.captiveBred === false ? 0 : 1,
    availability: input.availability ?? 'AVAILABLE',
    price_cents: priceCents,
    currency: 'USD',
    city: input.city.trim(),
    state: input.state.toUpperCase(),
    jurisdiction_id: jurisdiction.id,
    description: input.description.trim(),
    diet: input.diet ?? null,
    habitat: input.habitat ?? null,
    temperature_f: input.temperatureF ?? null,
    humidity_pct: input.humidityPct ?? null,
    feeding_schedule: input.feedingSchedule ?? null,
    enclosure_min_cm: input.enclosureMinCm ? Number(input.enclosureMinCm) : null,
    medical_notes: input.medicalNotes ?? null,
    health_status: input.healthStatus ?? 'CLEAR',
    last_health_check: input.lastHealthCheck || null,
    updated_at: nowIso(),
  };

  if (existing) {
    update('animals', payload, 'id', animalId);
  } else {
    insert('animals', { ...payload, id: animalId, status: 'DRAFT', compliance_status: 'PENDING', view_count: 0, created_at: nowIso() });
  }

  if (action === 'submit') {
    const images = db.prepare(`SELECT COUNT(*) AS n FROM animal_images WHERE animal_id = ?`).get(animalId) as { n: number };
    if (!images.n) throw new HttpError(400, 'Add at least one photo of this animal before submitting.', 'NEEDS_PHOTO');
    const docs = db.prepare(`SELECT doc_type FROM animal_documents WHERE animal_id = ?`).all(animalId) as { doc_type: DocType }[];
    const originState = get<{ code: string }>(`SELECT code FROM jurisdictions WHERE id = ?`, [jurisdiction.id])?.code ?? input.state;

    const verdict = evaluateCompliance({
      speciesId: input.speciesId,
      animalId,
      breederId,
      originJurisdictionId: jurisdiction.id,
      destinationJurisdictionId: breeder.jurisdiction_id ?? jurisdiction.id,
      method: 'SPECIALIZED_SHIPPING',
      verifiedDocuments: docs.map((d) => d.doc_type),
    });
    recordComplianceCheck('ANIMAL', animalId, {
      speciesId: input.speciesId,
      animalId,
      breederId,
      originJurisdictionId: jurisdiction.id,
      destinationJurisdictionId: breeder.jurisdiction_id ?? jurisdiction.id,
      method: 'SPECIALIZED_SHIPPING',
      verifiedDocuments: docs.map((d) => d.doc_type),
    }, verdict);
    const fraud = screenListing({ animalId, breederId, speciesId: input.speciesId, name: input.name, priceCents, user });

    // Publishing rule (spec §30): only ALLOWED/RESTRICTED with complete paperwork can
    // go live without a human. Everything else lands in PENDING_REVIEW.
    const autoPublish =
      breeder.tier === 'VERIFIED_BREEDER' &&
      (verdict.verdict === 'ALLOWED' || verdict.verdict === 'RESTRICTED') &&
      verdict.missingDocuments.length === 0 &&
      !fraud.requiresReview;

    update('animals', {
      status: autoPublish ? 'APPROVED' : 'PENDING_REVIEW',
      compliance_status: verdict.verdict,
      compliance_notes: JSON.stringify(verdict.notes),
      submitted_at: nowIso(),
      published_at: autoPublish ? nowIso() : null,
      publish_lock_reason: autoPublish ? null : verdict.verdict === 'PROHIBITED' ? `Origin/destination rules: ${originState}` : null,
    }, 'id', animalId);

    audit(user, autoPublish ? 'LISTING_AUTO_APPROVE' : 'LISTING_SUBMIT', 'ANIMAL', animalId, { verdict: verdict.verdict }, 'api');
    if (!autoPublish) {
      const admin = get<{ id: string }>(`SELECT id FROM users WHERE role IN ('ADMIN','MODERATOR') ORDER BY role LIMIT 1`);
      if (admin) {
        notify(admin.id, 'COMPLIANCE', 'Listing awaiting review', `${input.name} (${verdict.verdict}) needs a decision.`, `/admin/queue`);
      }
    }
    return {
      id: animalId,
      status: autoPublish ? ('APPROVED' as ListingStatus) : ('PENDING_REVIEW' as ListingStatus),
      verdict,
      fraud,
      autoPublished: autoPublish,
    };
  }

  audit(user, existing ? 'LISTING_UPDATE' : 'LISTING_CREATE', 'ANIMAL', animalId, { draft: true }, 'api');
  return { id: animalId, status: (existing?.status as ListingStatus) ?? 'DRAFT', verdict: null, fraud: null, autoPublished: false };
}

function requireBreeder(user: SessionUser): string {
  if (!user.breederId) throw new HttpError(403, 'Open a breeder account to list animals.', 'NO_BREEDER_PROFILE');
  return user.breederId;
}

export async function attachImages(user: SessionUser, animalId: string, files: File[]) {
  const db = getDb();
  const animal = get<Record<string, string | null>>(`SELECT * FROM animals WHERE id = ?`, [animalId]);
  if (!animal) throw new HttpError(404, 'Listing not found.');
  if (animal.breeder_id !== user.breederId && user.role !== 'ADMIN') throw new HttpError(403, 'Not your listing.', 'FORBIDDEN');
  const start = (db.prepare(`SELECT COALESCE(MAX(position), -1) AS p FROM animal_images WHERE animal_id = ?`).get(animalId) as { p: number }).p + 1;
  const addedIds: string[] = [];
  let index = 0;
  for (const file of files.slice(0, 8)) {
    if (!file.size) continue;
    const stored = await storeAnimalImage(file);
    const imageId = id('img');
    insert('animal_images', {
      id: imageId,
      animal_id: animalId,
      base_path: stored.base,
      path_large: stored.large,
      path_medium: stored.medium,
      path_small: stored.small,
      path_thumb: stored.thumb,
      avif_path: stored.avif ?? null,
      webp_path: stored.medium,
      width: stored.width,
      height: stored.height,
      alt: `${animal.name}`,
      position: start + index,
      phash: stored.phash,
      created_at: nowIso(),
    });
    addedIds.push(imageId);
    if (stored.phash) {
      const { detectDuplicateImages } = await import('@/domain/fraud');
      detectDuplicateImages(animalId, stored.phash, animal.breeder_id as string);
    }
    index++;
  }
  audit(user, 'LISTING_IMAGES', 'ANIMAL', animalId, { count: files.length }, 'api');
  return { added: files.length, imageIds: addedIds };
}

export async function attachDocument(
  user: SessionUser,
  animalId: string | null,
  docType: DocType,
  file: File,
  expiresAt?: string | null,
) {
  const db = getDb();
  const breederId = requireBreeder(user);
  if (animalId) {
    const animal = get<Record<string, string | null>>(`SELECT id, breeder_id FROM animals WHERE id = ?`, [animalId]);
    if (!animal) throw new HttpError(404, 'Listing not found.');
    if (animal.breeder_id !== breederId) throw new HttpError(403, 'Not your listing.', 'FORBIDDEN');
  }
  const stored = await storePrivateDocument(file, user.id, docType);
  const docId = id('doc');
  insert('animal_documents', {
    id: docId,
    animal_id: animalId,
    breeder_id: breederId,
    owner_user_id: user.id,
    doc_type: docType,
    storage_bucket: stored.storage_bucket,
    storage_path: stored.storage_path,
    filename: `${docType.toLowerCase()}-${stored.filename}`,
    size_bytes: stored.size_bytes,
    status: 'PENDING',
    expires_at: expiresAt || null,
    visibility: 'PRIVATE',
    uploaded_at: stored.uploaded_at,
  });
  audit(user, 'DOCUMENT_UPLOAD', 'ANIMAL', animalId ?? breederId, { doc_type: docType, sha256: stored.sha256.slice(0, 12) }, 'api');
  return { documentId: docId, status: 'PENDING' };
}

export function verifyDocumentAccess(user: SessionUser, documentId: string): { ok: boolean; reason?: string; row?: Record<string, string | null> } {
  const db = getDb();
  const doc = get<Record<string, string | null>>(`SELECT * FROM animal_documents WHERE id = ?`, [documentId]);
  if (!doc) return { ok: false, reason: 'not-found' };
  if (user.role === 'ADMIN' || user.role === 'MODERATOR') return { ok: true, row: doc };
  if (doc.owner_user_id === user.id) return { ok: true, row: doc };
  // Order participants may read the paperwork that governs their own handoff.
  const participant = get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM orders o JOIN order_items oi ON oi.order_id = o.id
     WHERE o.buyer_id = ? AND oi.animal_id = ? AND o.status NOT IN ('CANCELLED','REFUNDED')`,
    [user.id, doc.animal_id],
  );
  if (participant?.n) return { ok: true, row: doc };
  return { ok: false, reason: 'forbidden' };
}

export function deleteImage(user: SessionUser, imageId: string) {
  const db = getDb();
  const img = get<Record<string, string | null>>(
    `SELECT i.*, a.breeder_id FROM animal_images i JOIN animals a ON a.id = i.animal_id WHERE i.id = ?`,
    [imageId],
  );
  if (!img) throw new HttpError(404, 'Image not found.');
  if (img.breeder_id !== user.breederId && user.role !== 'ADMIN') throw new HttpError(403, 'Not your image.', 'FORBIDDEN');
  db.prepare(`DELETE FROM animal_images WHERE id = ?`).run(imageId);
  for (const rel of [img.base_path, img.path_large, img.path_medium, img.path_small, img.path_thumb, img.avif_path]) {
    if (!rel) continue;
    const abs = path.join(PUBLIC_ROOT, rel.replace(/^\//, ''));
    fs.unlink(abs).catch(() => undefined);
  }
  return { ok: true };
}

export function setListingStatus(user: SessionUser, animalId: string, status: ListingStatus) {
  const db = getDb();
  const animal = get<Record<string, string | null>>(`SELECT * FROM animals WHERE id = ?`, [animalId]);
  if (!animal) throw new HttpError(404, 'Listing not found.');
  if (animal.breeder_id !== user.breederId && user.role !== 'ADMIN') throw new HttpError(403, 'Not your listing.', 'FORBIDDEN');
  const allowedForSeller: ListingStatus[] = ['ARCHIVED', 'SOLD', 'DRAFT'];
  if (user.role !== 'ADMIN' && !allowedForSeller.includes(status)) {
    throw new HttpError(403, 'Sellers can only mark a listing SOLD or archive it.', 'FORBIDDEN');
  }
  const before = { price_cents: Number(animal.price_cents), availability: String(animal.availability) };
  update('animals', { status, updated_at: nowIso() }, 'id', animalId);
  if (status === 'SOLD') updateWhere('animals', { availability: 'SOLD_OUT' }, 'id = ?', [animalId]);
  evaluateFavoriteAlerts(animalId, before);
  audit(user, `LISTING_${status}`, 'ANIMAL', animalId, {}, 'api');
  return { ok: true, status };
}

export function updatePrice(user: SessionUser, animalId: string, price: number) {
  const db = getDb();
  const animal = get<Record<string, string | number | null>>(`SELECT * FROM animals WHERE id = ?`, [animalId]);
  if (!animal) throw new HttpError(404, 'Listing not found.');
  if (animal.breeder_id !== user.breederId && user.role !== 'ADMIN') throw new HttpError(403, 'Not your listing.', 'FORBIDDEN');
  const cents = Math.round(Number(price) * 100);
  if (!Number.isFinite(cents) || cents <= 0) throw new HttpError(400, 'Enter a valid price.');
  const before = { price_cents: Number(animal.price_cents), availability: String(animal.availability) };
  update('animals', { price_cents: cents, updated_at: nowIso() }, 'id', animalId);
  const sent = evaluateFavoriteAlerts(animalId, before);
  audit(user, 'LISTING_PRICE', 'ANIMAL', animalId, { from: before.price_cents, to: cents, watchers_notified: sent }, 'api');
  return { ok: true, price_cents: cents, watchers_notified: sent };
}

export function sellerDashboard(user: SessionUser) {
  const db = getDb();
  const breederId = user.breederId;
  if (!breederId) return null;
  const counts = get<Record<string, number>>(
    `SELECT
       SUM(CASE WHEN status='APPROVED' THEN 1 ELSE 0 END) AS active,
       SUM(CASE WHEN status='PENDING_REVIEW' THEN 1 ELSE 0 END) AS pending,
       SUM(CASE WHEN status='SOLD' THEN 1 ELSE 0 END) AS sold,
       SUM(CASE WHEN status='REJECTED' THEN 1 ELSE 0 END) AS rejected,
       SUM(CASE WHEN status='SUSPENDED' THEN 1 ELSE 0 END) AS suspended,
       SUM(CASE WHEN status='DRAFT' THEN 1 ELSE 0 END) AS drafts
     FROM animals WHERE breeder_id = ?`,
    [breederId],
  )!;
  const revenue = get<Record<string, number>>(
    `SELECT COALESCE(SUM(CASE WHEN o.status NOT IN ('CANCELLED','REFUNDED') THEN p.amount_cents - o.platform_fee_cents END),0) AS gross_cents,
            COALESCE(SUM(CASE WHEN py.status='PAID' THEN py.net_cents END),0) AS paid_cents,
            COALESCE(SUM(CASE WHEN py.status='HELD' THEN py.net_cents END),0) AS held_cents
     FROM orders o
     LEFT JOIN payments p ON p.order_id = o.id
     LEFT JOIN payouts py ON py.order_id = o.id
     WHERE o.breeder_id = ?`,
    [breederId],
  )!;
  const orders = get<Record<string, number>>(
    `SELECT COUNT(*) AS n, SUM(CASE WHEN status IN ('BREEDER_CONFIRMED','PREPARING','SHIPPED','READY_FOR_PICKUP','DELIVERED') THEN 1 ELSE 0 END) AS open
     FROM orders WHERE breeder_id = ?`,
    [breederId],
  )!;
  const messages = get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM messages m JOIN conversations c ON c.id = m.conversation_id
     WHERE c.seller_user_id = ? AND (m.read_at IS NULL OR m.read_at = '') AND m.sender_id != ?`,
    [user.id, user.id],
  )!;
  const views = get<{ n: number }>(
    `SELECT COALESCE(SUM(view_count),0) AS n FROM animals WHERE breeder_id = ?`,
    [breederId],
  )!;
  const trend = db
    .prepare(
      `SELECT substr(placed_at,1,10) AS day, SUM(total_cents) AS cents FROM orders
       WHERE breeder_id = ? AND placed_at > ? GROUP BY day ORDER BY day`,
    )
    .all(breederId, new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString()) as { day: string; cents: number }[];
  const breeder = get<Record<string, string | number | null>>(`SELECT * FROM breeders WHERE id = ?`, [breederId]);
  return {
    breeder,
    counts: {
      active: counts.active ?? 0,
      pending: counts.pending ?? 0,
      sold: counts.sold ?? 0,
      rejected: counts.rejected ?? 0,
      suspended: counts.suspended ?? 0,
      drafts: counts.drafts ?? 0,
    },
    revenue: { gross_cents: revenue.gross_cents ?? 0, paid_cents: revenue.paid_cents ?? 0, held_cents: revenue.held_cents ?? 0 },
    orders: { total: orders.n ?? 0, open: orders.open ?? 0 },
    unreadMessages: messages.n ?? 0,
    views: views.n ?? 0,
    trend,
  };
}

/** Breeder application → verification ladder (spec §32). */
export function applyForBreeder(user: SessionUser, input: { businessName: string; city: string; state: string; licenseNumber?: string; bio: string; yearsActive: number; documents: { doc_type: DocType; documentId: string }[] }) {
  const db = getDb();
  if (user.breederId) throw new HttpError(409, 'You already have a breeder account.');
  const jurisdiction = get<{ id: string }>(`SELECT id FROM jurisdictions WHERE code = ?`, [input.state.toUpperCase()]);
  const breederId = id('brd');
  const taken = new Set((db.prepare(`SELECT slug FROM breeders`).all() as { slug: string }[]).map((r) => r.slug));
  insert('breeders', {
    id: breederId,
    user_id: user.id,
    slug: uniqueSlug(slugify(input.businessName), taken),
    business_name: input.businessName.trim(),
    legal_name: `${user.firstName} ${user.lastName}`,
    tier: 'BREEDER',
    status: 'PENDING',
    license_number: input.licenseNumber || null,
    city: input.city.trim(),
    state: input.state.toUpperCase(),
    jurisdiction_id: jurisdiction?.id ?? get<{ id: string }>(`SELECT id FROM jurisdictions WHERE code='US'`)!.id,
    bio: input.bio.trim(),
    years_active: Math.max(0, Math.round(Number(input.yearsActive) || 0)),
    storefront_plan: 'FREE',
    created_at: nowIso(),
    updated_at: nowIso(),
  });
  const verificationId = id('vrf');
  insert('breeder_verifications', {
    id: verificationId,
    breeder_id: breederId,
    requested_tier: 'PROFESSIONAL_BREEDER',
    status: 'PENDING',
    documents: input.documents,
    submitted_at: nowIso(),
  });
  update('users', { role: 'BREEDER', updated_at: nowIso() }, 'id', user.id);
  const admin = get<{ id: string }>(`SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1`);
  if (admin) notify(admin.id, 'BREEDER_VERIFICATION', 'New breeder application', `${input.businessName} (${input.state}) applied.`, `/admin/verification`);
  audit(user, 'BREEDER_APPLY', 'BREEDER', breederId, { state: input.state }, 'api');
  return { breederId, verificationId };
}

export function breederStats(breederId: string) {
  const db = getDb();
  const row = get<{ n: number; sold: number; revenue: number }>(
    `SELECT (SELECT COUNT(*) FROM animals WHERE breeder_id = ? AND status='APPROVED' AND availability='AVAILABLE') AS n,
            (SELECT COUNT(*) FROM animals WHERE breeder_id = ? AND status='SOLD') AS sold,
            (SELECT COALESCE(SUM(subtotal_cents),0) FROM orders WHERE breeder_id = ? AND status='COMPLETED') AS revenue`,
    [breederId, breederId, breederId],
  );
  return { live: row?.n ?? 0, sold: row?.sold ?? 0, revenue_cents: row?.revenue ?? 0 };
}
