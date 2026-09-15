import { getDb } from '@/lib/db';
import { insert, update, get, parse, updateWhere } from '@/db/kit';
import { HttpError, audit } from '@/domain/rbac';
import { evaluateCompliance, recordComplianceCheck } from '@/domain/compliance';
import { id, nowIso, titleCase } from '@/domain/util';
import { notify } from '@/domain/notify';
import type { ComplianceVerdict, DocType, ListingStatus, Role, SessionUser } from '@/domain/types';
import { cardsByIds } from './catalog';
import { raiseFlag } from '@/domain/fraud';

/**
 * Moderation & compliance console (spec §41). Every action here writes audit
 * history and notifies the affected party — the queue is the real publish gate.
 */

export function overview() {
  const db = getDb();
  const kpis = get<Record<string, number>>(
    `SELECT
      (SELECT COUNT(*) FROM animals WHERE status='APPROVED' AND availability='AVAILABLE') AS live_listings,
      (SELECT COUNT(*) FROM animals WHERE status='PENDING_REVIEW') AS pending_listings,
      (SELECT COUNT(*) FROM breeder_verifications WHERE status='PENDING') AS pending_verifications,
      (SELECT COUNT(*) FROM reports WHERE status='OPEN') AS open_reports,
      (SELECT COUNT(*) FROM fraud_flags WHERE status='OPEN') AS open_flags,
      (SELECT COUNT(*) FROM compliance_checks WHERE result IN ('REQUIRES_ADMIN_REVIEW','RESTRICTED') AND decision IS NULL) AS compliance_backlog,
      (SELECT COUNT(*) FROM orders WHERE status IN ('PAID','BREEDER_CONFIRMED','PREPARING','SHIPPED')) AS orders_in_flight,
      (SELECT COUNT(*) FROM users) AS users,
      (SELECT COUNT(*) FROM breeders) AS breeders,
      (SELECT COALESCE(SUM(total_cents),0) FROM orders WHERE status NOT IN ('CANCELLED','REFUNDED')) AS gmv_cents,
      (SELECT COALESCE(SUM(platform_fee_cents),0) FROM orders WHERE status NOT IN ('CANCELLED','REFUNDED')) AS fee_cents,
      (SELECT COALESCE(SUM(net_cents),0) FROM payouts WHERE status='PAID') AS paid_out_cents,
      (SELECT COALESCE(SUM(net_cents),0) FROM payouts WHERE status='HELD') AS escrow_cents,
      (SELECT COUNT(*) FROM users WHERE created_at > ?) AS new_users_7d
     `,
    [new Date(Date.now() - 7 * 86400000).toISOString()],
  )!;
  const days = db
    .prepare(
      `SELECT substr(placed_at,1,10) AS day, COUNT(*) AS orders, SUM(total_cents) AS cents
       FROM orders WHERE placed_at > ? GROUP BY day ORDER BY day`,
    )
    .all(new Date(Date.now() - 30 * 86400000).toISOString()) as { day: string; orders: number; cents: number }[];
  const byCategory = db
    .prepare(
      `SELECT c.name, COUNT(a.id) AS listings, COALESCE(AVG(a.price_cents),0) AS avg_price
       FROM categories c LEFT JOIN animals a ON a.category_id = c.id AND a.status='APPROVED'
       GROUP BY c.id ORDER BY listings DESC`,
    )
    .all() as { name: string; listings: number; avg_price: number }[];
  const states = db
    .prepare(
      `SELECT j.code, j.name,
              (SELECT COUNT(*) FROM species_restrictions sr WHERE sr.jurisdiction_id = j.id AND sr.status='PROHIBITED') AS prohibited,
              (SELECT COUNT(*) FROM species_restrictions sr WHERE sr.jurisdiction_id = j.id AND sr.status='RESTRICTED') AS restricted,
              (SELECT COUNT(*) FROM animals a WHERE a.state = j.code AND a.status='APPROVED') AS listings
       FROM jurisdictions j WHERE j.level='STATE' ORDER BY j.code`,
    )
    .all() as { code: string; name: string; prohibited: number; restricted: number; listings: number }[];
  return { kpis, days, byCategory, states };
}

export function moderationQueue(filter = 'PENDING_REVIEW') {
  const db = getDb();
  const where = filter === 'ALL' ? `a.status != 'ARCHIVED'` : `a.status = ?`;
  const rows = db
    .prepare(
      `SELECT id FROM animals a WHERE ${where} ORDER BY
         CASE WHEN compliance_status IN ('PROHIBITED','REQUIRES_ADMIN_REVIEW') THEN 0 ELSE 1 END,
         submitted_at DESC LIMIT 60`,
    )
    .all(...(filter === 'ALL' ? [] : [filter])) as { id: string }[];
  const cards = cardsByIds(rows.map((r) => r.id));
  return rows.map((r) => {
    const animal = get<Record<string, string | number | null>>(`SELECT * FROM animals WHERE id = ?`, [r.id])!;
    const check = get<Record<string, string | null>>(
      `SELECT * FROM compliance_checks WHERE entity_type='ANIMAL' AND entity_id = ? ORDER BY evaluated_at DESC LIMIT 1`,
      [r.id],
    );
    const flags = db.prepare(`SELECT * FROM fraud_flags WHERE entity_id = ? AND status='OPEN'`).all(r.id) as Record<string, string | number | null>[];
    const docs = db.prepare(`SELECT * FROM animal_documents WHERE animal_id = ? ORDER BY uploaded_at DESC`).all(r.id) as Record<
      string,
      string | number | null
    >[];
    const breeder = get<Record<string, string | number | null>>(`SELECT * FROM breeders WHERE id = ?`, [animal.breeder_id]);
    return {
      animal,
      breeder,
      flags: flags.map((f) => ({ ...f, signals: parse(f.signals as string, []) })),
      documents: docs.map((d) => ({ ...d, storage_path: undefined })),
      check: check ? { ...check, matched_rules: parse(check.matched_rules as string, []), required_documents: parse(check.required_documents as string, []) } : null,
    };
  });
}

export function decideListing(user: SessionUser, animalId: string, decision: 'APPROVE' | 'REJECT' | 'SUSPEND' | 'NEEDS_DOCS', note?: string) {
  const db = getDb();
  const actor = requireStaff(user);
  const animal = get<Record<string, string | number | null>>(`SELECT * FROM animals WHERE id = ?`, [animalId]);
  if (!animal) throw new HttpError(404, 'Listing not found.');

  let status: ListingStatus = 'APPROVED';
  if (decision === 'REJECT') status = 'REJECTED';
  if (decision === 'SUSPEND') status = 'SUSPENDED';
  if (decision === 'NEEDS_DOCS') status = 'PENDING_REVIEW';

  if (decision === 'APPROVE') {
    // The moderator's approval satisfies admin review only if the species is
    // not outright prohibited at the seller's own state.
    const verdict = evaluateCompliance({
      speciesId: String(animal.species_id),
      animalId,
      breederId: String(animal.breeder_id),
      originJurisdictionId: String(animal.origin_jurisdiction_id ?? animal.jurisdiction_id),
      destinationJurisdictionId: String(animal.jurisdiction_id),
      method: 'SPECIALIZED_SHIPPING',
    });
    if (verdict.verdict === 'PROHIBITED') {
      throw new HttpError(409, 'Cannot approve: the species is prohibited at the origin/destination. Ask the seller to relocate the listing.', 'COMPLIANCE_BLOCK');
    }
    const missing = get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM animal_documents WHERE animal_id = ? AND status='PENDING'`,
      [animalId],
    );
    update('animals', {
      status: 'APPROVED',
      compliance_status: verdict.verdict,
      compliance_notes: JSON.stringify([...verdict.notes, ...(note ? [note] : [])]),
      published_at: animal.published_at ? String(animal.published_at) : nowIso(),
      updated_at: nowIso(),
      publish_lock_reason: null,
    }, 'id', animalId);
    updateWhere(
      'compliance_checks',
      { decision: 'APPROVED', reviewer_id: actor.id, decision_note: note ?? 'Approved in moderation queue' },
      `entity_type='ANIMAL' AND entity_id = ? AND decision IS NULL`,
      [animalId],
    );
    db.prepare(`UPDATE fraud_flags SET status='CLEARED', resolved_at=?, resolved_by=? WHERE entity_id = ? AND status='OPEN'`).run(nowIso(), actor.id, animalId);
  } else {
    update('animals', { status, updated_at: nowIso(), publish_lock_reason: note ?? null }, 'id', animalId);
    updateWhere(
      'compliance_checks',
      { decision: decision === 'NEEDS_DOCS' ? 'REJECTED' : 'REJECTED', reviewer_id: actor.id, decision_note: note ?? null },
      `entity_type='ANIMAL' AND entity_id = ? AND decision IS NULL`,
      [animalId],
    );
    if (decision === 'NEEDS_DOCS') {
      update('animals', { compliance_status: 'REQUIRES_DOCUMENTATION' }, 'id', animalId);
    }
  }

  const sellerUserId = get<{ user_id: string }>(`SELECT user_id FROM breeders WHERE id = ?`, [animal.breeder_id])?.user_id;
  if (sellerUserId) {
    notify(
      sellerUserId,
      'COMPLIANCE',
      `Listing ${titleCase(decision)}: ${animal.name}`,
      note ?? (decision === 'APPROVE' ? 'Your listing is live in the marketplace.' : 'Open the listing for the reviewer note and next steps.'),
      '/seller/listings',
    );
  }
  audit(actor, `LISTING_${decision}`, 'ANIMAL', animalId, { note: note ?? '' }, 'admin');
  return { ok: true, status };
}

export function verificationQueue() {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT v.*, b.business_name, b.slug, b.city, b.state, b.tier, b.license_number, b.years_active, b.rating_avg,
              u.email, u.first_name, u.last_name, u.created_at AS user_created
       FROM breeder_verifications v JOIN breeders b ON b.id = v.breeder_id JOIN users u ON u.id = b.user_id
       ORDER BY CASE v.status WHEN 'PENDING' THEN 0 ELSE 1 END, v.submitted_at DESC LIMIT 60`,
    )
    .all() as Record<string, string | number | null>[];
  return rows.map((r) => ({
    ...r,
    documents: parse(r.documents as string, [] as { doc_type: DocType; documentId: string }[]),
  }));
}

export function decideVerification(user: SessionUser, verificationId: string, decision: 'APPROVE' | 'REJECT', note?: string) {
  const actor = requireStaff(user);
  const db = getDb();
  const row = get<Record<string, string | null>>(`SELECT * FROM breeder_verifications WHERE id = ?`, [verificationId]);
  if (!row) throw new HttpError(404, 'Application not found.');
  const breeder = get<Record<string, string | null>>(`SELECT * FROM breeders WHERE id = ?`, [row.breeder_id]);
  if (!breeder) throw new HttpError(404, 'Breeder not found.');

  if (decision === 'APPROVE') {
    update('breeder_verifications', { status: 'APPROVED', reviewed_at: nowIso(), reviewer_id: actor.id, notes: note ?? 'Documents verified' }, 'id', verificationId);
    const requestedTier = (row.requested_tier as string) || 'PROFESSIONAL_BREEDER';
    update('breeders', { status: 'APPROVED', tier: requestedTier === 'VERIFIED_BREEDER' ? 'VERIFIED_BREEDER' : breeder.tier === 'BREEDER' ? 'PROFESSIONAL_BREEDER' : breeder.tier, updated_at: nowIso() }, 'id', breeder.id);
    update('users', { role: 'VERIFIED_BREEDER', updated_at: nowIso() }, 'id', breeder.user_id);
    db.prepare(`UPDATE animal_documents SET status='VERIFIED', reviewed_at=?, reviewer_id=? WHERE breeder_id = ? AND status='PENDING'`).run(nowIso(), actor.id, breeder.id);
    // Approving a breeder unblocks their queued listings.
    const queued = db.prepare(`SELECT id, species_id, jurisdiction_id, origin_jurisdiction_id FROM animals WHERE breeder_id = ? AND status='PENDING_REVIEW'`).all(breeder.id) as {
      id: string;
      species_id: string;
      jurisdiction_id: string;
      origin_jurisdiction_id: string;
    }[];
    for (const a of queued) {
      const verdict = evaluateCompliance({
        speciesId: a.species_id,
        animalId: a.id,
        breederId: breeder.id,
        originJurisdictionId: a.origin_jurisdiction_id || a.jurisdiction_id,
        destinationJurisdictionId: a.jurisdiction_id,
        method: 'SPECIALIZED_SHIPPING',
      });
      update(
        'animals',
        {
          status: verdict.verdict === 'ALLOWED' || verdict.verdict === 'RESTRICTED' ? 'APPROVED' : 'PENDING_REVIEW',
          compliance_status: verdict.verdict,
          published_at: verdict.verdict === 'ALLOWED' || verdict.verdict === 'RESTRICTED' ? nowIso() : null,
        },
        'id',
        a.id,
      );
    }
  } else {
    update('breeder_verifications', { status: 'REJECTED', reviewed_at: nowIso(), reviewer_id: actor.id, notes: note ?? 'Documents insufficient' }, 'id', verificationId);
    update('breeders', { status: 'REJECTED', updated_at: nowIso() }, 'id', breeder.id);
  }
  notify(breeder.user_id as string, 'BREEDER_VERIFICATION', `Application ${decision === 'APPROVE' ? 'approved' : 'rejected'}`, note ?? (decision === 'APPROVE' ? 'You can now list animals and access payouts.' : 'Reapply with the missing documents.'), '/seller');
  audit(actor, `VERIFICATION_${decision}`, 'BREEDER', breeder.id as string, { note: note ?? '' }, 'admin');
  return { ok: true };
}

export function grantTier(user: SessionUser, breederId: string, tier: Role) {
  const actor = requireStaff(user);
  if (!['VERIFIED_BREEDER', 'PROFESSIONAL_BREEDER', 'BREEDER'].includes(tier)) throw new HttpError(400, 'Unknown tier.');
  const breeder = get<Record<string, string | null>>(`SELECT * FROM breeders WHERE id = ?`, [breederId]);
  if (!breeder) throw new HttpError(404, 'Breeder not found.');
  update('breeders', { tier, status: 'APPROVED', updated_at: nowIso() }, 'id', breederId);
  update('users', { role: tier as Role }, 'id', breeder.user_id);
  audit(actor, 'BREEDER_TIER', 'BREEDER', breederId, { tier }, 'admin');
  notify(breeder.user_id as string, 'BREEDER_VERIFICATION', `Your account is now ${titleCase(tier.replace('_', ' '))}`, 'Your storefront badge has been updated.', `/breeders/${breeder.slug}`);
  return { ok: true, tier };
}

export function users(query: string, limit = 40) {
  const db = getDb();
  const like = `%${query.trim()}%`;
  return db
    .prepare(
      `SELECT u.*, b.business_name, b.slug AS breeder_slug, b.status AS breeder_status, b.tier AS breeder_tier,
              (SELECT COUNT(*) FROM orders o WHERE o.buyer_id = u.id) AS buyer_orders,
              (SELECT COUNT(*) FROM animals a JOIN breeders bb ON bb.id = a.breeder_id WHERE bb.user_id = u.id) AS listings
       FROM users u LEFT JOIN breeders b ON b.user_id = u.id
       WHERE u.email LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ?
       ORDER BY u.created_at DESC LIMIT ?`,
    )
    .all(like, like, like, limit) as Record<string, string | number | null>[];
}

export function setUserStatus(user: SessionUser, targetId: string, status: 'ACTIVE' | 'SUSPENDED' | 'BANNED', reason?: string) {
  const actor = requireStaff(user);
  if (targetId === actor.id) throw new HttpError(400, 'You cannot suspend your own account.');
  update('users', { status, updated_at: nowIso() }, 'id', targetId);
  if (status !== 'ACTIVE') {
    getDb().prepare(`DELETE FROM sessions WHERE user_id = ?`).run(targetId);
  }
  const target = get<Record<string, string | null>>(`SELECT * FROM users WHERE id = ?`, [targetId]);
  notify(targetId, 'SYSTEM', `Account ${status.toLowerCase()}`, reason ?? 'Contact FAUNAL support for details.');
  audit(actor, `USER_${status}`, 'USER', targetId, { reason: reason ?? '' }, 'admin');
  getDb().prepare(`UPDATE breeders SET status = 'SUSPENDED', updated_at = ? WHERE user_id = ? AND ? != 'ACTIVE'`).run(nowIso(), targetId, status);
  return { ok: true };
}

export function reports(status = 'OPEN') {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT r.*, u.first_name, u.last_name, u.email,
              COALESCE(a.name, b.business_name, tu.first_name || ' ' || tu.last_name, 'message') AS target_label,
              a.slug AS animal_slug, b.slug AS breeder_slug
       FROM reports r
       JOIN users u ON u.id = r.reporter_id
       LEFT JOIN animals a ON r.target_type='ANIMAL' AND a.id = r.target_id
       LEFT JOIN breeders b ON r.target_type='BREEDER' AND b.id = r.target_id
       LEFT JOIN users tu ON r.target_type='USER' AND tu.id = r.target_id
       WHERE (? = 'ALL' OR r.status = ?)
       ORDER BY CASE r.status WHEN 'OPEN' THEN 0 ELSE 1 END, r.created_at DESC LIMIT 60`,
    )
    .all(status, status) as Record<string, string | number | null>[];
  return rows;
}

export function decideReport(user: SessionUser, reportId: string, decision: 'RESOLVE' | 'DISMISS' | 'ACTION', note?: string) {
  const actor = requireStaff(user);
  const db = getDb();
  const report = get<Record<string, string | null>>(`SELECT * FROM reports WHERE id = ?`, [reportId]);
  if (!report) throw new HttpError(404, 'Report not found.');
  update('reports', { status: decision === 'DISMISS' ? 'DISMISSED' : 'RESOLVED', resolution: note ?? decision, reviewed_at: nowIso(), reviewer_id: actor.id }, 'id', reportId);

  if (decision === 'ACTION') {
    if (report.target_type === 'ANIMAL') {
      update('animals', { status: 'SUSPENDED', updated_at: nowIso(), publish_lock_reason: note ?? 'Suspended after a report' }, 'id', report.target_id);
    }
    if (report.target_type === 'BREEDER') {
      update('breeders', { status: 'SUSPENDED', updated_at: nowIso() }, 'id', report.target_id);
    }
    db.prepare(`UPDATE fraud_flags SET status='ACTIONED', resolved_at=?, resolved_by=? WHERE entity_id = ?`).run(nowIso(), actor.id, report.target_id);
  } else {
    db.prepare(`UPDATE fraud_flags SET status='CLEARED', resolved_at=?, resolved_by=? WHERE entity_id = ? AND status='OPEN'`).run(nowIso(), actor.id, report.target_id);
  }
  const reporter = get<{ first_name: string }>(`SELECT first_name FROM users WHERE id = ?`, [report.reporter_id]);
  notify(report.reporter_id as string, 'SYSTEM', 'Report update', `Your report was ${decision === 'DISMISS' ? 'closed without action' : 'resolved'}. Thank you for keeping FAUNAL safe.`, '/profile');
  audit(actor, `REPORT_${decision}`, 'REPORT', reportId, { note: note ?? '' }, 'admin');
  return { ok: true };
}

export function fraudQueue() {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT f.*, u.email AS entity_email, a.name AS animal_name, b.business_name, a.slug AS animal_slug
       FROM fraud_flags f
       LEFT JOIN animals a ON f.entity_type='ANIMAL' AND a.id = f.entity_id
       LEFT JOIN breeders b ON b.id = COALESCE(a.breeder_id, CASE WHEN f.entity_type='BREEDER' THEN f.entity_id END)
       LEFT JOIN users u ON u.id = CASE WHEN f.entity_type='USER' THEN f.entity_id ELSE b.user_id END
       WHERE f.status IN ('OPEN','REVIEWING')
       ORDER BY CASE f.severity WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 ELSE 2 END, f.created_at DESC LIMIT 80`,
    )
    .all() as Record<string, string | number | null>[];
  return rows.map((r) => ({ ...r, signals: parse(r.signals as string, []) }));
}

export function clearFlag(user: SessionUser, flagId: string, status: 'CLEARED' | 'ACTIONED', note?: string) {
  const actor = requireStaff(user);
  const flag = get<Record<string, string | null>>(`SELECT * FROM fraud_flags WHERE id = ?`, [flagId]);
  if (!flag) throw new HttpError(404, 'Flag not found.');
  update('fraud_flags', { status, resolved_at: nowIso(), resolved_by: actor.id }, 'id', flagId);
  if (status === 'ACTIONED' && flag.entity_type === 'ANIMAL') {
    update('animals', { status: 'SUSPENDED', publish_lock_reason: note ?? 'Suspended by trust & safety' }, 'id', flag.entity_id);
  }
  audit(actor, `FLAG_${status}`, 'FRAUD_FLAG', flagId, { note: note ?? '' }, 'admin');
  return { ok: true };
}

/** Admins can edit the rulebook; verdicts change immediately afterwards. */
export function upsertRestriction(
  user: SessionUser,
  input: {
    id?: string;
    speciesId: string;
    jurisdictionCode: string;
    status: ComplianceVerdict;
    reason: string;
    citation?: string;
    permitClass?: string;
    maxSpecimens?: number | null;
    requiresAdminReview?: boolean;
  },
) {
  const actor = requireStaff(user, ['ADMIN']);
  const jurisdiction = get<{ id: string }>(`SELECT id FROM jurisdictions WHERE code = ?`, [input.jurisdictionCode.toUpperCase()]);
  if (!jurisdiction) throw new HttpError(400, 'Unknown jurisdiction code.');
  if (input.id) {
    update(
      'species_restrictions',
      {
        species_id: input.speciesId,
        jurisdiction_id: jurisdiction.id,
        status: input.status,
        reason: input.reason,
        citation: input.citation ?? null,
        permit_class: input.permitClass ?? null,
        max_specimens: input.maxSpecimens ?? null,
        requires_admin_review: input.requiresAdminReview ? 1 : 0,
        source: 'ADMIN',
        updated_at: nowIso(),
      },
      'id',
      input.id,
    );
    audit(actor, 'RULE_UPDATE', 'SPECIES_RESTRICTION', input.id, { status: input.status }, 'admin');
    return { id: input.id };
  }
  const ruleId = id('rul');
  insert('species_restrictions', {
    id: ruleId,
    species_id: input.speciesId,
    jurisdiction_id: jurisdiction.id,
    status: input.status,
    reason: input.reason,
    citation: input.citation ?? null,
    permit_class: input.permitClass ?? null,
    max_specimens: input.maxSpecimens ?? null,
    requires_admin_review: input.requiresAdminReview ? 1 : 0,
    source: 'ADMIN',
    updated_at: nowIso(),
  });
  audit(actor, 'RULE_CREATE', 'SPECIES_RESTRICTION', ruleId, { status: input.status, jurisdiction: input.jurisdictionCode }, 'admin');
  return { id: ruleId };
}

export function rulesFor(speciesId?: string) {
  const db = getDb();
  const sql = speciesId
    ? `SELECT sr.*, j.code, j.name AS jurisdiction_name, s.common_name FROM species_restrictions sr
       JOIN jurisdictions j ON j.id = sr.jurisdiction_id JOIN species s ON s.id = sr.species_id
       WHERE s.slug = ? OR sr.species_id = ? ORDER BY j.code`
    : `SELECT sr.*, j.code, j.name AS jurisdiction_name, s.common_name FROM species_restrictions sr
       JOIN jurisdictions j ON j.id = sr.jurisdiction_id JOIN species s ON s.id = sr.species_id ORDER BY s.common_name, j.code`;
  return (speciesId ? db.prepare(sql).all(speciesId, speciesId) : db.prepare(sql).all()) as Record<string, string | number | null>[];
}

export function recentAudit(limit = 60) {
  const db = getDb();
  return db
    .prepare(`SELECT al.*, u.first_name, u.last_name, u.role FROM audit_logs al LEFT JOIN users u ON u.id = al.actor_id ORDER BY al.created_at DESC LIMIT ?`)
    .all(limit) as Record<string, string | number | null>[];
}

export function ordersTable(scope: 'ALL' | 'DISPUTED' | 'ESCROW' = 'ALL') {
  const db = getDb();
  const where =
    scope === 'DISPUTED'
      ? `o.status = 'DISPUTED'`
      : scope === 'ESCROW'
        ? `o.escrow_state = 'HELD'`
        : `1=1`;
  return db
    .prepare(
      `SELECT o.*, b.business_name, bu.email AS buyer_email, bu.first_name, bu.last_name,
              (SELECT s.status FROM shipping s WHERE s.order_id = o.id LIMIT 1) AS shipping_status,
              (SELECT p.status FROM payments p WHERE p.order_id = o.id LIMIT 1) AS payment_status
       FROM orders o JOIN breeders b ON b.id = o.breeder_id JOIN users bu ON bu.id = o.buyer_id
       WHERE ${where} ORDER BY o.placed_at DESC LIMIT 80`,
    )
    .all() as Record<string, string | number | null>[];
}

export function documentsQueue() {
  const db = getDb();
  return db
    .prepare(
      `SELECT d.*, a.name AS animal_name, a.slug AS animal_slug, b.business_name
       FROM animal_documents d
       LEFT JOIN animals a ON a.id = d.animal_id
       LEFT JOIN breeders b ON b.id = d.breeder_id
       ORDER BY CASE d.status WHEN 'PENDING' THEN 0 ELSE 1 END, d.uploaded_at DESC LIMIT 80`,
    )
    .all() as Record<string, string | number | null>[];
}

export function reviewDocument(user: SessionUser, documentId: string, decision: 'VERIFIED' | 'REJECTED', note?: string) {
  const actor = requireStaff(user);
  const doc = get<Record<string, string | null>>(`SELECT * FROM animal_documents WHERE id = ?`, [documentId]);
  if (!doc) throw new HttpError(404, 'Document not found.');
  update('animal_documents', { status: decision, reviewed_at: nowIso(), reviewer_id: actor.id, review_note: note ?? null }, 'id', documentId);
  notify(doc.owner_user_id as string, 'COMPLIANCE', `Document ${decision.toLowerCase()}`, note ?? (decision === 'VERIFIED' ? 'It is now attached to the relevant listings.' : 'Re-upload a legible copy.'), '/profile/documents');
  audit(actor, `DOCUMENT_${decision}`, 'DOCUMENT', documentId, {}, 'admin');
  return { ok: true };
}

export function analytics() {
  const db = getDb();
  const funnel = db
    .prepare(
      `SELECT kind, COUNT(*) AS n FROM user_events WHERE created_at > ? GROUP BY kind ORDER BY n DESC`,
    )
    .all(new Date(Date.now() - 30 * 86400000).toISOString()) as { kind: string; n: number }[];
  const topAnimals = db
    .prepare(
      `SELECT a.id, a.name, a.price_cents, a.view_count, b.business_name, a.slug
       FROM animals a JOIN breeders b ON b.id = a.breeder_id ORDER BY a.view_count DESC LIMIT 10`,
    )
    .all() as Record<string, string | number | null>[];
  const conversion = get<Record<string, number>>(
    `SELECT (SELECT COUNT(*) FROM user_events WHERE kind='ADD_TO_CART') AS carts,
            (SELECT COUNT(*) FROM orders) AS orders,
            (SELECT COUNT(*) FROM user_events WHERE kind='VIEW_ANIMAL') AS views`,
  )!;
  const complianceMix = db
    .prepare(`SELECT result, COUNT(*) AS n FROM compliance_checks GROUP BY result ORDER BY n DESC`)
    .all() as { result: ComplianceVerdict; n: number }[];
  return { funnel, topAnimals, conversion, complianceMix };
}

function requireStaff(user: SessionUser, roles: string[] = ['ADMIN', 'MODERATOR']): SessionUser {
  if (!roles.includes(user.role)) throw new HttpError(403, 'Staff role required.', 'FORBIDDEN');
  return user;
}

export function systemFlag(kind: string, entityType: string, entityId: string, note: string) {
  raiseFlag({ kind, severity: 'MEDIUM', score: 0.5, entityType, entityId, signals: [{ note }] });
}
