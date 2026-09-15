import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';

/**
 * Single shared SQLite handle.
 *
 * SQLite is the dev/CI engine; the same relational model targets Postgres +
 * Supabase in production (docs/schema.postgres.sql). Every read/write in the
 * app goes through lib/repo/*, so swapping the driver is a one-file change
 * (see DATABASE_DRIVER note in docs/ARCHITECTURE.md §4).
 */
const SERVERLESS = !!process.env.VERCEL || !!process.env.LAMBDA_TASK_ROOT;

/**
 * Where the database lives.
 *
 * On a serverless runtime the filesystem outside /tmp is read-only, so the
 * seeded database that ships inside the function bundle is copied to /tmp once
 * per cold start and used from there. Reads and writes then behave exactly as
 * they do locally; state is per-instance, which is what a demo deployment
 * needs (docs/ARCHITECTURE.md §9 covers the Postgres/Supabase target for real
 * multi-instance persistence).
 */
function resolveDbPath(): { file: string; seed?: string } {
  if (process.env.FAUNAL_DB) return { file: path.resolve(process.env.FAUNAL_DB) };
  const bundled = path.join(process.cwd(), 'data', 'faunal.db');
  if (!SERVERLESS) return { file: bundled };
  const warm = path.join('/tmp', 'faunal.db');
  if (fs.existsSync(warm)) return { file: warm };
  for (const candidate of [bundled, path.join(process.cwd(), '.next', 'data', 'faunal.db')]) {
    if (fs.existsSync(candidate)) return { file: warm, seed: candidate };
  }
  return { file: warm };
}

const { file: DB_PATH, seed: SEED_PATH } = resolveDbPath();

type Handle = Database.Database;

declare global {
  // eslint-disable-next-line no-var
  var __faunalDb: Handle | undefined;
}

function migrate(db: Handle) {
  const stampTable = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='_migrations'`).get();
  if (stampTable && db.prepare(`SELECT COUNT(*) AS n FROM _migrations`).get() && (db.prepare(`SELECT COUNT(*) AS n FROM _migrations WHERE name='0001_core'`).get() as { n: number }).n) {
    // Bundled database is already at the current schema — nothing to read.
    db.pragma('foreign_keys = ON');
    return;
  }
  const schemaPath = [path.join(process.cwd(), 'lib', 'db', 'schema.sql'), path.join(__dirname, 'schema.sql')].find((f) => fs.existsSync(f));
  if (!schemaPath) throw new Error('schema.sql not found in the bundle.');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  // PRAGMA statements must run outside a transaction wrapper.
  db.exec(sql);
  db.exec(
    `CREATE TABLE IF NOT EXISTS _migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, applied_at TEXT NOT NULL)`,
  );
  const stamp = '0001_core';
  const seen = db.prepare(`SELECT 1 FROM _migrations WHERE name = ?`).get(stamp);
  if (!seen) {
    db.prepare(`INSERT INTO _migrations (name, applied_at) VALUES (?, ?)`).run(
      stamp,
      new Date().toISOString(),
    );
  }
}

/**
 * Copy the bundled database into the writable directory. Serverless instances
 * handle concurrent requests, so the copy is written to a private temp file and
 * moved into place with rename(2) — atomic on the same filesystem. A reader
 * therefore never observes a half-written database.
 */
function copySeed() {
  if (!SEED_PATH || fs.existsSync(DB_PATH)) return;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  // Stale sidecars from a previous cold start would shadow a fresh copy.
  for (const suffix of ['-wal', '-shm']) {
    const side = `${DB_PATH}${suffix}`;
    if (fs.existsSync(side)) fs.rmSync(side, { force: true });
  }
  const tmp = `${DB_PATH}.${process.pid}.${Date.now()}.tmp`;
  fs.copyFileSync(SEED_PATH, tmp);
  try {
    fs.renameSync(tmp, DB_PATH);
  } catch {
    fs.rmSync(tmp, { force: true });
    if (!fs.existsSync(DB_PATH)) fs.copyFileSync(SEED_PATH, DB_PATH);
  }
}

function open(): Handle {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  return new Database(DB_PATH, { fileMustExist: false });
}

/**
 * Open the working database. A copy made by a sibling instance can be swapped in
 * between our existence check and the open, which SQLite reports as a malformed
 * or empty file — so the handle is probed and, on failure, rebuilt from the
 * pristine bundle before the first request is served.
 */
function openChecked(): Handle {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  try {
    const db = new Database(DB_PATH, { fileMustExist: false });
    db.prepare(`SELECT COUNT(*) AS n FROM users`).get();
    return db;
  } catch (e) {
    console.warn('[db] re-seeding the working copy after a failed open:', (e as Error).message);
    fs.rmSync(DB_PATH, { force: true });
    for (const suffix of ['-wal', '-shm']) fs.rmSync(`${DB_PATH}${suffix}`, { force: true });
    copySeed();
    return new Database(DB_PATH, { fileMustExist: false });
  }
}

export function getDb(): Handle {
  if (globalThis.__faunalDb) return globalThis.__faunalDb;
  copySeed();
  const db = openChecked();
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  migrate(db);
  globalThis.__faunalDb = db;
  return db;
}

export function dbFile() {
  return DB_PATH;
}

export function tx<T>(fn: () => T): T {
  const db = getDb();
  const run = db.transaction(fn);
  return run();
}
