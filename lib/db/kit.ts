import { getDb } from '@/lib/db';

/**
 * Tiny SQL kit: builds column lists and placeholders from objects so no query in
 * the codebase can drift from the schema, and booleans/undefined are normalised
 * the same way everywhere.
 */
export type Row = Record<string, unknown>;

function normalize(value: unknown): string | number | null {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value === null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function insertSql(table: string, values: Row) {
  const keys = Object.keys(values);
  return {
    sql: `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
    params: keys.map((k) => normalize(values[k])),
  };
}

export function insert(table: string, values: Row) {
  const { sql, params } = insertSql(table, values);
  return getDb().prepare(sql).run(...params);
}

export function update(table: string, values: Row, idColumn: string, idValue: string | number | null) {
  const keys = Object.keys(values);
  if (!keys.length) return { changes: 0 };
  const sql = `UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE ${idColumn} = ?`;
  return getDb()
    .prepare(sql)
    .run(...keys.map((k) => normalize(values[k])), idValue);
}

export function updateWhere(table: string, values: Row, where: string, whereParams: unknown[] = []) {
  const keys = Object.keys(values);
  const sql = `UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE ${where}`;
  return getDb()
    .prepare(sql)
    .run(...keys.map((k) => normalize(values[k])), ...whereParams.map(normalize));
}

export function all<T = Row>(sql: string, params: unknown[] = []): T[] {
  return getDb().prepare(sql).all(...(params as never[])) as T[];
}

export function get<T = Row>(sql: string, params: unknown[] = []): T | undefined {
  return getDb().prepare(sql).get(...(params as never[])) as T | undefined;
}

export function first<T = Row>(table: string, where: string, params: unknown[] = []): T | undefined {
  return get<T>(`SELECT * FROM ${table} WHERE ${where} LIMIT 1`, params);
}

export function parse<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || !value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
