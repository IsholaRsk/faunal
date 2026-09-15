import { getDb } from '@/db';
import type { DocStats } from '@/components/desktop/docs';

/** Live rulebook numbers shown on the trust pages — read from the same tables the engine uses. */
export function rulebookStats(): DocStats {
  const db = getDb();
  const one = (sql: string) => Number((db.prepare(sql).get() as { n: number | bigint }).n);
  return {
    kind: 'rulebook',
    states: one(`SELECT COUNT(*) AS n FROM jurisdictions WHERE level='STATE'`),
    rules: one(`SELECT COUNT(*) AS n FROM species_restrictions`),
    species: one(`SELECT COUNT(*) AS n FROM species`),
    checks: one(`SELECT COUNT(*) AS n FROM compliance_checks`),
    restricted: one(`SELECT COUNT(*) AS n FROM species_restrictions WHERE status IN ('PROHIBITED','REQUIRES_DOCUMENTATION','REQUIRES_ADMIN_REVIEW')`),
  };
}

export function documentStats(): DocStats {
  const db = getDb();
  // Columns come straight from required_documents — the same table the engine
  // reads when it decides which paperwork a listing is missing.
  const rows = db
    .prepare(
      `SELECT r.doc_type,
              r.stage,
              r.mandatory,
              r.description,
              CASE WHEN r.species_id IS NULL THEN 'All species' ELSE s.common_name END AS scope_species,
              CASE WHEN r.jurisdiction_id IS NULL THEN 'Any jurisdiction' ELSE j.code END AS scope_jurisdiction
       FROM required_documents r
       LEFT JOIN species s ON s.id = r.species_id
       LEFT JOIN jurisdictions j ON j.id = r.jurisdiction_id
       ORDER BY r.doc_type, scope_species`,
    )
    .all() as {
      doc_type: string;
      stage: string;
      mandatory: number;
      description: string;
      scope_species: string;
      scope_jurisdiction: string;
    }[];
  return { kind: 'documents', rows };
}
