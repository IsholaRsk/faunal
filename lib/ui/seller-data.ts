import { getDb } from '@/db';
import type { SessionUser } from '@/domain/types';
import { myListings, sellerDashboard } from '@/repo/seller';
import { breederOrders } from '@/repo/orders';

/** Seller desk payload — one server read for every seller screen. */
export function sellerBundle(user: SessionUser) {
  if (!user.breederId) return null;
  const db = getDb();
  const dash = sellerDashboard(user);
  if (!dash) return null;
  const plans = (['FREE', 'PRO', 'PREMIUM'] as const).map((plan) => {
    const commission = db.prepare(`SELECT rate_bps FROM fee_rules WHERE kind='COMMISSION' AND plan=? AND active=1`).get(plan) as { rate_bps: number } | undefined;
    const sub = db.prepare(`SELECT flat_cents, description FROM fee_rules WHERE kind='SUBSCRIPTION' AND plan=? AND active=1`).get(plan) as { flat_cents: number; description: string } | undefined;
    const featured = db.prepare(`SELECT flat_cents FROM fee_rules WHERE kind='FEATURED' AND active=1 ORDER BY rate_bps LIMIT 1`).get() as { flat_cents: number } | undefined;
    const payout = db.prepare(`SELECT rate_bps FROM fee_rules WHERE kind='PAYOUT' AND active=1 LIMIT 1`).get() as { rate_bps: number } | undefined;
    return {
      plan,
      commission_bps: commission?.rate_bps ?? 800,
      price_cents_month: plan === 'FREE' ? 0 : (sub?.flat_cents ?? 0),
      featured_cents_week: featured?.flat_cents ?? 7900,
      payout_bps: payout?.rate_bps ?? 90,
      description: sub?.description ?? (plan === 'FREE' ? 'Pay as you sell: 8% commission, up to 8 live listings.' : null),
    };
  });
  const documents = db
    .prepare(
      `SELECT d.*, a.name AS animal_name FROM animal_documents d
       LEFT JOIN animals a ON a.id = d.animal_id
       WHERE d.breeder_id = ? ORDER BY CASE d.status WHEN 'PENDING' THEN 0 ELSE 1 END, d.uploaded_at DESC`,
    )
    .all(user.breederId) as Record<string, string | number | null>[];
  const reviews = db
    .prepare(
      `SELECT r.*, u.first_name, u.last_name FROM reviews r JOIN users u ON u.id = r.author_id
       WHERE r.breeder_id = ? AND r.status='PUBLISHED' ORDER BY r.created_at DESC LIMIT 30`,
    )
    .all(user.breederId) as Record<string, string | number | null>[];
  const verification = db
    .prepare(`SELECT * FROM breeder_verifications WHERE breeder_id = ? ORDER BY submitted_at DESC LIMIT 1`)
    .get(user.breederId) as Record<string, string | null> | undefined ?? null;
  return {
    dash,
    listings: myListings(user) as unknown as Record<string, string | number | null>[],
    orders: breederOrders(user).filter((o: Record<string, string | number | null>) => !['COMPLETED', 'CANCELLED', 'REFUNDED'].includes(String(o.status))),
    documents: documents.map((d) => ({ ...d, storage_path: undefined })),
    reviews,
    plan: plans,
    verification,
  };
}

export const DOCUMENT_TYPES = ['BREEDER_LICENSE', 'PROOF_OF_ORIGIN', 'HEALTH_CERTIFICATE', 'CITES', 'PERMIT', 'TRANSPORT_MANIFEST'];

/** Everything the 8-step listing wizard needs, read from the taxonomy. */
export function wizardData(animalId?: string) {
  const db = getDb();
  const species = db
    .prepare(
      `SELECT s.id, s.common_name, s.scientific_name, s.is_sensitive, s.cites_appendix, c.name AS category,
              COALESCE(json_group_array(json_object('id', m.id, 'name', m.name)) FILTER (WHERE m.id IS NOT NULL), '[]') AS morphs
       FROM species s JOIN categories c ON c.id = s.category_id
       LEFT JOIN morphs m ON m.species_id = s.id
       GROUP BY s.id ORDER BY c.name, s.common_name`,
    )
    .all() as { id: string; common_name: string; scientific_name: string; category: string; is_sensitive: number; cites_appendix: string | null; morphs: string }[];
  const states = db.prepare(`SELECT code, name FROM jurisdictions WHERE level='STATE' ORDER BY code`).all() as { code: string; name: string }[];
  let draft: Record<string, string | number | null> | null = null;
  let draftImages: Record<string, string | number | null>[] = [];
  let draftDocuments: Record<string, string | number | null>[] = [];
  if (animalId) {
    draft = (db.prepare(`SELECT * FROM animals WHERE id = ?`).get(animalId) as Record<string, string | number | null> | undefined) ?? null;
    draftImages = db.prepare(`SELECT * FROM animal_images WHERE animal_id = ? ORDER BY position`).all(animalId) as Record<string, string | number | null>[];
    draftDocuments = db.prepare(`SELECT id, doc_type, status, expires_at FROM animal_documents WHERE animal_id = ?`).all(animalId) as Record<string, string | number | null>[];
  }
  return {
    species: species.map((s) => ({
      id: s.id,
      common_name: s.common_name,
      scientific_name: s.scientific_name,
      category: s.category,
      is_sensitive: s.is_sensitive,
      cites_appendix: s.cites_appendix,
      morphs: JSON.parse(s.morphs || '[]') as { id: string; name: string }[],
    })),
    states,
    docTypes: DOCUMENT_TYPES,
    draft,
    draftImages,
    draftDocuments,
  };
}
