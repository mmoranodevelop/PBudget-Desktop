import { DatabaseSync } from 'node:sqlite'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync, rmSync } from 'fs'
import { seedIfEmpty } from './seed'

let db: DatabaseSync | null = null

export function getDbPath(): string {
  return join(app.getPath('userData'), 'budget.db')
}

export function getBackupDir(): string {
  return join(app.getPath('userData'), 'backups')
}

export function getImportArchiveDir(): string {
  return join(app.getPath('userData'), 'imports')
}

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  iban TEXT,
  currency TEXT NOT NULL DEFAULT 'EUR',
  initial_balance REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#8884d8',
  type TEXT NOT NULL DEFAULT 'expense' CHECK (type IN ('expense','income','transfer')),
  parent_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  is_system INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS mapping_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  fingerprint TEXT NOT NULL UNIQUE,
  mapping_json TEXT NOT NULL,
  header_row INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS import_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  hash TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'local',
  archived_path TEXT,
  imported_at TEXT NOT NULL DEFAULT (datetime('now')),
  rows_total INTEGER NOT NULL DEFAULT 0,
  rows_imported INTEGER NOT NULL DEFAULT 0,
  rows_skipped INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL DEFAULT 1 REFERENCES accounts(id),
  import_file_id INTEGER REFERENCES import_files(id),
  date_reg TEXT NOT NULL,
  date_val TEXT,
  causale TEXT,
  description TEXT NOT NULL,
  description_norm TEXT NOT NULL,
  merchant TEXT,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  notes TEXT,
  hash_dedup TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','duplicate_ignored')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(date_reg);
CREATE INDEX IF NOT EXISTS idx_tx_cat ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_tx_hash ON transactions(hash_dedup);
CREATE INDEX IF NOT EXISTS idx_tx_status ON transactions(status);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#64748b'
);

CREATE TABLE IF NOT EXISTS transaction_tags (
  transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (transaction_id, tag_id)
);

CREATE TABLE IF NOT EXISTS rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  field TEXT NOT NULL CHECK (field IN ('description','merchant','causale')),
  match_type TEXT NOT NULL CHECK (match_type IN ('contains','exact','regex')),
  pattern TEXT NOT NULL,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  priority INTEGER NOT NULL DEFAULT 100,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS budget_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  year INTEGER NOT NULL,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  month INTEGER, -- NULL = annuale
  amount REAL NOT NULL DEFAULT 0,
  UNIQUE (year, category_id, month)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`

export function initDb(): DatabaseSync {
  if (db) return db
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  for (const d of [getBackupDir(), getImportArchiveDir()]) {
    if (!existsSync(d)) mkdirSync(d, { recursive: true })
  }
  db = new DatabaseSync(getDbPath())
  db.exec(SCHEMA)
  seedIfEmpty(db)
  rotateBackups()
  return db
}

export function getDb(): DatabaseSync {
  if (!db) throw new Error('DB not initialized')
  return db
}

export function transaction<T>(fn: () => T): T {
  const d = getDb()
  d.exec('BEGIN')
  try {
    const result = fn()
    d.exec('COMMIT')
    return result
  } catch (e) {
    d.exec('ROLLBACK')
    throw e
  }
}

const MAX_BACKUPS = 10

export function backupNow(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const dest = join(getBackupDir(), `budget-${stamp}.db`)
  getDb().exec('PRAGMA wal_checkpoint(TRUNCATE)')
  copyFileSync(getDbPath(), dest)
  rotateBackups()
  return dest
}

function rotateBackups(): void {
  try {
    const dir = getBackupDir()
    if (!existsSync(dir)) return
    const files = readdirSync(dir)
      .filter((f) => f.endsWith('.db'))
      .map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t)
    for (const { f } of files.slice(MAX_BACKUPS)) {
      rmSync(join(dir, f))
    }
  } catch {
    // best effort
  }
}

export function closeDb(): void {
  if (db) {
    try {
      backupNow()
    } catch {
      // best effort
    }
    db.close()
    db = null
  }
}
