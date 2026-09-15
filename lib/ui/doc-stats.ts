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
  const rows = db
    .prepare(
      `SELECT doc_type, purpose, issuing_authority, retention_months, verification_method
       FROM required_documents ORDER BY doc_type`,
    )
    .all() as DocStats extends { rows: infer R } ? R : never;
  return { kind: 'documents', rows };
}
