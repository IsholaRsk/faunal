import { getDb } from '@/lib/db';
import { docLabel, id, nowIso } from './util';
import type { ComplianceResult, ComplianceVerdict, DocType, ShippingMethod } from './types';

/**
 * FAUNAL compliance engine (spec §30).
 *
 * A listing/order is legal only for the *tuple*, never for the species alone:
 *   species × origin jurisdiction × destination jurisdiction × local rules ×
 *   seller status × available documents × transport method.
 *
 * The engine is pure w.r.t. the database (rules live in species_restrictions,
 * required_documents, transport_restrictions) so moderators can edit rules and
 * the verdict changes without a deploy. Precedence is deterministic:
 *   PROHIBITED > REQUIRES_DOCUMENTATION > REQUIRES_ADMIN_REVIEW > RESTRICTED > ALLOWED
 */

export interface ComplianceSubject {
  speciesId: string;
  animalId?: string | null;
  breederId?: string | null;
  originJurisdictionId: string;
  destinationJurisdictionId: string | null;
  buyerUserId?: string | null;
  method?: ShippingMethod | null;
  /** Doc types the seller has already attached *and* that were verified. */
  verifiedDocuments?: DocType[];
}

interface RuleRow {
  id: string;
  status: string;
  reason: string;
  citation: string | null;
  permit_class: string | null;
  max_specimens: number | null;
  requires_admin_review: number;
  level: string;
  jurisdiction_name: string;
  jurisdiction_code: string;
}

const RANK: Record<ComplianceVerdict, number> = {
  ALLOWED: 0,
  RESTRICTED: 1,
  REQUIRES_ADMIN_REVIEW: 2,
  REQUIRES_DOCUMENTATION: 3,
  PROHIBITED: 4,
};

function jurisdictionByCode(code: string | null | undefined): { id: string; code: string; name: string; level: string } | null {
  if (!code) return null;
  const db = getDb();
  const row = db.prepare(`SELECT id,code,name,level FROM jurisdictions WHERE code = ?`).get(code.toUpperCase()) as
    | { id: string; code: string; name: string; level: string }
    | undefined;
  return row ?? null;
}

export function jurisdictionFor(place: { state?: string | null; city?: string | null }) {
  const city = place.city ? jurisdictionByCode(cityCode(place.city, place.state)) : null;
  const state = jurisdictionByCode(place.state);
  // A city ordinance overrides the state when one exists (e.g. NYC vs. New York State).
  return { city, state: state ?? jurisdictionByCode('US') };
}

function cityCode(city: string, state?: string | null): string | null {
  const key = `${city}|${state ?? ''}`.toLowerCase();
  const known: Record<string, string> = {
    'new york|ny': 'NYC',
  };
  return known[key] ?? null;
}

function restrictionsFor(speciesId: string, jurisdictionIds: string[]): RuleRow[] {
  if (!jurisdictionIds.length) return [];
  const db = getDb();
  const placeholders = jurisdictionIds.map(() => '?').join(',');
  return db
    .prepare(
      `SELECT sr.id, sr.status, sr.reason, sr.citation, sr.permit_class, sr.max_specimens, sr.requires_admin_review,
              j.level, j.name AS jurisdiction_name, j.code AS jurisdiction_code
       FROM species_restrictions sr JOIN jurisdictions j ON j.id = sr.jurisdiction_id
       WHERE sr.species_id = ? AND sr.jurisdiction_id IN (${placeholders})`,
    )
    .all(speciesId, ...jurisdictionIds) as RuleRow[];
}

/**
 * Verified paperwork that supports a listing: documents attached to the animal
 * itself plus the seller's account-level documents (licence, permits), which
 * travel with every listing that breeder publishes.
 */
export function verifiedDocTypesFor(animalId?: string | null, breederId?: string | null): DocType[] {
  if (!animalId && !breederId) return [];
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT DISTINCT doc_type FROM animal_documents
       WHERE status = 'VERIFIED'
         AND (expires_at IS NULL OR expires_at > ?)
         AND (
           (animal_id IS NOT NULL AND animal_id = ?)
           OR (animal_id IS NULL AND ? IS NOT NULL AND breeder_id = ?)
         )`,
    )
    .all(nowIso(), animalId, breederId, breederId) as { doc_type: DocType }[];
  return rows.map((r) => r.doc_type);
}

/** Full evaluation. Called on listing submit, cart add, and checkout. */
export function evaluateCompliance(subject: ComplianceSubject): ComplianceResult {
  const db = getDb();
  const species = db
    .prepare(`SELECT id,common_name,scientific_name,cites_appendix,is_sensitive FROM species WHERE id = ?`)
    .get(subject.speciesId) as
    | { id: string; common_name: string; scientific_name: string; cites_appendix: string | null; is_sensitive: number }
    | undefined;

  const result: ComplianceResult = {
    verdict: 'ALLOWED',
    canPublish: true,
    canBuy: true,
    needsAdminReview: false,
    requiredDocuments: [],
    missingDocuments: [],
    allowedMethods: ['LOCAL_PICKUP', 'SPECIALIZED_SHIPPING', 'BREEDER_DELIVERY'],
    blockedMethods: [],
    rules: [],
    notes: [],
    estimatedDocLeadDays: 0,
  };

  if (!species) {
    result.verdict = 'REQUIRES_ADMIN_REVIEW';
    result.canPublish = false;
    result.notes.push('Species is not in the FAUNAL rulebook — a moderator must add it before this listing can go live.');
    result.rules.push({
      id: 'unknown-species',
      table: 'species',
      label: 'Unknown species',
      detail: 'No taxonomy entry, therefore no legal evaluation is possible.',
    });
    return result;
  }

  const elevate = (next: ComplianceVerdict) => {
    if (RANK[next] > RANK[result.verdict]) result.verdict = next;
  };

  const destIds: string[] = [];
  if (subject.destinationJurisdictionId) destIds.push(subject.destinationJurisdictionId);
  // Include the parent state of a city destination so both layers are checked.
  const destRow = db
    .prepare(`SELECT id, code, name, level FROM jurisdictions WHERE id = ?`)
    .get(subject.destinationJurisdictionId ?? '') as { id: string; code: string; name: string; level: string } | undefined;
  if (destRow?.level === 'CITY') {
    const parent = jurisdictionByCode(destRow.code.replace(/^[A-Z]{2,3}C?$/, 'US'));
    if (parent) destIds.push(parent.id);
  }
  if (destRow) destIds.push(destRow.id);
  const originIds = [subject.originJurisdictionId];

  // A purchase is never self-served against an unreviewed destination. Sellers
  // drafting a listing have no buyer address yet, so this only bites the
  // buy-side evaluations (cart, checkout, AI, admin review).
  if (subject.buyerUserId && !subject.destinationJurisdictionId) {
    elevate('REQUIRES_ADMIN_REVIEW');
    result.canBuy = false;
    result.needsAdminReview = true;
    result.notes.push(
      'FAUNAL has not completed its rulebook review for this destination, so no purchase can be released. Choose a state inside the reviewed coverage list, or ask the compliance desk to review your address.',
    );
    result.rules.push({
      id: 'unreviewed-destination',
      table: 'jurisdictions',
      label: 'Destination outside the reviewed rulebook',
      detail: 'No self-service verdict is issued where state law has not been read and recorded.',
    });
  }

  // 1) Destination: possession/keep rules (state + city).
  const destRules = restrictionsFor(subject.speciesId, [...new Set(destIds)]);
  for (const r of destRules) {
    result.rules.push({
      id: r.id,
      table: 'species_restrictions',
      label: `${r.jurisdiction_name} — ${labelForStatus(r.status as ComplianceVerdict)}`,
      detail: r.reason,
      citation: r.citation ?? undefined,
    });
    if (r.status === 'PROHIBITED') {
      elevate('PROHIBITED');
      result.canBuy = false;
      result.notes.push(`${species.common_name} cannot be kept in ${r.jurisdiction_name}. This order cannot ship or be picked up there.`);
    } else if (r.status === 'REQUIRES_DOCUMENTATION') {
      elevate('REQUIRES_DOCUMENTATION');
      if (r.permit_class) pushDoc(result, permitDocFor(r.permit_class));
      result.estimatedDocLeadDays = Math.max(result.estimatedDocLeadDays, 10);
    } else if (r.status === 'REQUIRES_ADMIN_REVIEW') {
      elevate('REQUIRES_ADMIN_REVIEW');
      result.needsAdminReview = true;
    } else if (r.status === 'RESTRICTED') {
      elevate('RESTRICTED');
      if (r.max_specimens) result.notes.push(`${r.jurisdiction_name} caps private possession at ${r.max_specimens} specimen(s) of this species.`);
    }
  }

  // 2) Origin: wild-source / export rules.
  for (const r of restrictionsFor(subject.speciesId, originIds)) {
    if (r.status === 'PROHIBITED' || r.status === 'REQUIRES_DOCUMENTATION') {
      result.rules.push({
        id: r.id,
        table: 'species_restrictions',
        label: `Origin — ${r.jurisdiction_name}: ${labelForStatus(r.status as ComplianceVerdict)}`,
        detail: r.reason,
        citation: r.citation ?? undefined,
      });
      if (r.status === 'PROHIBITED') {
        elevate('PROHIBITED');
        result.canPublish = false;
        result.notes.push(`Collection or sale of this species is prohibited in the origin state (${r.jurisdiction_name}).`);
      } else {
        elevate('REQUIRES_DOCUMENTATION');
        pushDoc(result, 'PROOF_OF_ORIGIN');
      }
    }
  }

  // 3) Federal layer: CITES + Lacey-adjacent sensitivity.
  const fedRules = restrictionsFor(subject.speciesId, [jurisdictionByCode('US')?.id ?? '']);
  for (const r of fedRules) {
    result.rules.push({
      id: r.id,
      table: 'species_restrictions',
      label: `Federal — ${labelForStatus(r.status as ComplianceVerdict)}`,
      detail: r.reason,
      citation: r.citation ?? undefined,
    });
    if (r.status === 'PROHIBITED') {
      elevate('PROHIBITED');
      result.canBuy = false;
      result.canPublish = false;
    } else if (r.status === 'REQUIRES_DOCUMENTATION') {
      elevate('REQUIRES_DOCUMENTATION');
      pushDoc(result, 'CITES');
      result.estimatedDocLeadDays = Math.max(result.estimatedDocLeadDays, 21);
    } else if (r.status === 'REQUIRES_ADMIN_REVIEW') {
      elevate('REQUIRES_ADMIN_REVIEW');
      result.needsAdminReview = true;
    }
  }
  if (species.cites_appendix) pushDoc(result, 'CITES');

  // 4) Documented requirements for the exact species/jurisdiction pairs.
  const docRows = db
    .prepare(
      `SELECT rd.doc_type, rd.jurisdiction_id, j.code AS code
       FROM required_documents rd LEFT JOIN jurisdictions j ON j.id = rd.jurisdiction_id
       WHERE (rd.species_id = ? OR rd.species_id IS NULL)
         AND (rd.jurisdiction_id IS NULL OR rd.jurisdiction_id IN (${[...new Set([...destIds, ...originIds])]
           .map(() => '?')
           .join(',') || '"_'}) )`,
    )
    .all(subject.speciesId, ...[...new Set([...destIds, ...originIds])]) as { doc_type: DocType }[];
  for (const d of docRows) pushDoc(result, d.doc_type);

  // 5) Health certificate is mandatory for any live-animal transport (never for pickup).
  if (!subject.method || subject.method !== 'LOCAL_PICKUP') pushDoc(result, 'HEALTH_CERTIFICATE');

  // 6) Seller status.
  if (subject.breederId) {
    const breeder = db
      .prepare(`SELECT tier, status FROM breeders WHERE id = ?`)
      .get(subject.breederId) as { tier: string; status: string } | undefined;
    if (!breeder || breeder.status !== 'APPROVED') {
      elevate('REQUIRES_ADMIN_REVIEW');
      result.needsAdminReview = true;
      result.canPublish = false;
      result.notes.push('Seller is not an approved FAUNAL breeder.');
    } else if (breeder.tier !== 'VERIFIED_BREEDER' && (species.is_sensitive || species.cites_appendix)) {
      elevate('REQUIRES_ADMIN_REVIEW');
      result.needsAdminReview = true;
      result.notes.push('Sensitive species may only be sold by VERIFIED_BREEDER accounts — manual review required.');
    }
  }

  // 7) Transport restrictions per method, then the requested method.
  const methodRows = db
    .prepare(
      `SELECT tr.method, tr.allowed, tr.note, tr.requires_health_certificate FROM transport_restrictions tr
       WHERE (tr.species_id = ? OR tr.species_id IS NULL)
         AND (tr.origin_jurisdiction_id IS NULL OR tr.origin_jurisdiction_id = ?)
         AND (tr.destination_jurisdiction_id IS NULL OR tr.destination_jurisdiction_id IN (${
           [...new Set(destIds)].map(() => '?').join(',') || '"_"'
         }))`,
    )
    .all(subject.speciesId, subject.originJurisdictionId, ...[...new Set(destIds)]) as {
    method: ShippingMethod;
    allowed: number;
    note: string | null;
    requires_health_certificate: number;
  }[];
  for (const m of methodRows) {
    if (!m.allowed) {
      result.blockedMethods.push({ method: m.method, reason: m.note ?? 'Transport method prohibited for this species on this route.' });
      result.allowedMethods = result.allowedMethods.filter((x) => x !== m.method);
    }
    if (m.requires_health_certificate) pushDoc(result, 'HEALTH_CERTIFICATE');
  }
  if (subject.method && result.blockedMethods.some((b) => b.method === subject.method)) {
    result.canBuy = false;
    result.notes.push(
      `Selected transport (${subject.method.replace(/_/g, ' ').toLowerCase()}) is not permitted for this species on this route. Choose another option or local pickup.`,
    );
  }

  // 8) Buyer eligibility gate: 18+ and jurisdiction acknowledged.
  if (subject.buyerUserId) {
    const buyer = db.prepare(`SELECT age_confirmed_at, date_of_birth, status FROM users WHERE id = ?`).get(subject.buyerUserId) as
      | { age_confirmed_at: string | null; date_of_birth: string | null; status: string }
      | undefined;
    if (buyer?.status !== 'ACTIVE') {
      result.canBuy = false;
      result.notes.push('Buyer account is not active.');
    }
    if (buyer && !buyer.age_confirmed_at) {
      elevate('RESTRICTED');
      result.canBuy = false;
      result.notes.push('Buyer must confirm they are 18 or older before completing a live-animal purchase.');
    }
  }

  // 9) Cross-check declared documents against required ones.
  const have = new Set<DocType>(subject.verifiedDocuments ?? verifiedDocTypesFor(subject.animalId ?? null, subject.breederId ?? null));
  result.missingDocuments = result.requiredDocuments.filter((d) => !have.has(d));
  if (result.missingDocuments.length && result.verdict !== 'PROHIBITED') {
    if (RANK.REQUIRES_DOCUMENTATION > RANK[result.verdict]) elevate('REQUIRES_DOCUMENTATION');
    result.notes.push(
      `Outstanding documentation: ${result.missingDocuments.map((d) => docLabel(d)).join(', ')}. The listing stays in PENDING_REVIEW until verified copies are attached.`,
    );
  }

  if (result.verdict === 'ALLOWED') {
    result.canPublish = true;
    result.notes.push('No species/state/local conflicts found for this route. Standard FAUNAL seller terms apply.');
  }
  if (result.verdict === 'PROHIBITED') {
    result.canPublish = false;
    result.canBuy = false;
    result.allowedMethods = [];
  }
  if (result.verdict === 'REQUIRES_DOCUMENTATION' && result.missingDocuments.length) {
    result.canBuy = false; // never complete a sale while paperwork is outstanding
  }
  return result;
}

function pushDoc(result: ComplianceResult, doc: DocType) {
  if (!result.requiredDocuments.includes(doc)) result.requiredDocuments.push(doc);
}

function permitDocFor(permitClass: string): DocType {
  if (/CITES/i.test(permitClass)) return 'CITES';
  if (/HEALTH/i.test(permitClass)) return 'HEALTH_CERTIFICATE';
  if (/ORIGIN/i.test(permitClass)) return 'PROOF_OF_ORIGIN';
  return 'PERMIT';
}

export { docLabel };

export function labelForStatus(status: ComplianceVerdict): string {
  return (
    {
      ALLOWED: 'Allowed',
      RESTRICTED: 'Restricted',
      PROHIBITED: 'Prohibited',
      REQUIRES_DOCUMENTATION: 'Documents required',
      REQUIRES_ADMIN_REVIEW: 'Manual review required',
    } as Record<ComplianceVerdict, string>
  )[status];
}

/** Persist an evaluation so the moderation queue has an evidence trail. */
export function recordComplianceCheck(
  entityType: 'ANIMAL' | 'ORDER' | 'CART' | 'MESSAGE',
  entityId: string,
  subject: ComplianceSubject,
  result: ComplianceResult,
) {
  const db = getDb();
  const checkId = id('cck');
  db.prepare(
    `INSERT INTO compliance_checks
      (id,entity_type,entity_id,species_id,origin_jurisdiction_id,destination_jurisdiction_id,result,
       matched_rules,required_documents,allowed_methods,evaluated_at,reviewer_id,decision,decision_note)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,NULL,NULL,NULL)`,
  ).run(
    checkId,
    entityType,
    entityId,
    subject.speciesId,
    subject.originJurisdictionId,
    subject.destinationJurisdictionId,
    result.verdict,
    JSON.stringify(result.rules),
    JSON.stringify(result.requiredDocuments),
    JSON.stringify(result.allowedMethods),
    nowIso(),
  );
  return checkId;
}

export function latestCheckFor(entityType: string, entityId: string) {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM compliance_checks WHERE entity_type = ? AND entity_id = ? ORDER BY evaluated_at DESC LIMIT 1`)
    .get(entityType, entityId) as Record<string, string | null> | undefined;
}

/** Human summary used on listing detail ("why can't I buy this in CA?"). */
export function explainVerdict(result: ComplianceResult, destinationLabel: string): string {
  switch (result.verdict) {
    case 'ALLOWED':
      return `Legally transferable to ${destinationLabel} with standard FAUNAL terms.`;
    case 'RESTRICTED':
      return `Allowed in ${destinationLabel} with conditions: ${result.notes[0] ?? 'see rule details'}`;
    case 'REQUIRES_DOCUMENTATION':
      return `${destinationLabel} requires ${result.missingDocuments.map(docLabel).join(', ')} before this animal can be transferred.`;
    case 'REQUIRES_ADMIN_REVIEW':
      return `A FAUNAL moderator is reviewing this listing for ${destinationLabel} eligibility. You can still contact the breeder.`;
    case 'PROHIBITED':
      return `This species cannot be sold for ${destinationLabel}. It remains visible for education only.`;
  }
}
