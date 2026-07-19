import { DatabaseSync } from 'node:sqlite'
import { app } from 'electron'
import { basename, join } from 'path'
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
  type TEXT NOT NULL DEFAULT 'main' CHECK (type IN ('main','secondary','credit_card')),
  color TEXT NOT NULL DEFAULT '#0f766e',
  icon TEXT NOT NULL DEFAULT 'landmark',
  initial_balance REAL NOT NULL DEFAULT 0,
  initial_balance_date TEXT
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
  header_row INTEGER NOT NULL DEFAULT 0,
  account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL
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

CREATE TABLE IF NOT EXISTS credit_card_links (
  main_transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  card_transaction_id INTEGER NOT NULL UNIQUE REFERENCES transactions(id) ON DELETE CASCADE,
  PRIMARY KEY (main_transaction_id, card_transaction_id)
);
CREATE INDEX IF NOT EXISTS idx_card_links_main ON credit_card_links(main_transaction_id);

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
  account_id INTEGER NOT NULL DEFAULT 1 REFERENCES accounts(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  month INTEGER, -- NULL = annuale
  amount REAL NOT NULL DEFAULT 0,
  UNIQUE (account_id, year, category_id, month)
);

CREATE TABLE IF NOT EXISTS forecast_scenarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  label TEXT NOT NULL,
  monthly_amount REAL NOT NULL,
  from_month INTEGER NOT NULL CHECK (from_month BETWEEN 1 AND 12)
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
  // Migrazioni additive per database creati prima dell'introduzione di conti e profili evoluti.
  migrateSchema(db)
  seedIfEmpty(db)
  rotateBackups()
  return db
}

function migrateSchema(database: DatabaseSync): void {
  const columns = (table: string): Set<string> => new Set(
    (database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name)
  )
  const accountColumns = columns('accounts')
  if (!accountColumns.has('type')) database.exec("ALTER TABLE accounts ADD COLUMN type TEXT NOT NULL DEFAULT 'main'")
  if (!accountColumns.has('color')) database.exec("ALTER TABLE accounts ADD COLUMN color TEXT NOT NULL DEFAULT '#0f766e'")
  if (!accountColumns.has('icon')) database.exec("ALTER TABLE accounts ADD COLUMN icon TEXT NOT NULL DEFAULT 'landmark'")
  if (!accountColumns.has('initial_balance_date')) database.exec('ALTER TABLE accounts ADD COLUMN initial_balance_date TEXT')
  const profileColumns = columns('mapping_profiles')
  if (!profileColumns.has('account_id')) database.exec('ALTER TABLE mapping_profiles ADD COLUMN account_id INTEGER')
  const budgetColumns = columns('budget_lines')
  if (!budgetColumns.has('account_id')) {
    database.exec(`ALTER TABLE budget_lines RENAME TO budget_lines_legacy;
      CREATE TABLE budget_lines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id INTEGER NOT NULL DEFAULT 1 REFERENCES accounts(id) ON DELETE CASCADE,
        year INTEGER NOT NULL,
        category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
        month INTEGER,
        amount REAL NOT NULL DEFAULT 0,
        UNIQUE (account_id, year, category_id, month)
      );
      INSERT INTO budget_lines (id, account_id, year, category_id, month, amount)
        SELECT id, 1, year, category_id, month, amount FROM budget_lines_legacy;
      DROP TABLE budget_lines_legacy;`)
  }
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

/** Elimina un backup locale identificato dal solo nome file. */
export function deleteBackup(file: string): void {
  const safeName = basename(file)
  if (safeName !== file || !safeName.endsWith('.db')) {
    throw new Error('Nome backup non valido')
  }

  const backupPath = join(getBackupDir(), safeName)
  if (!existsSync(backupPath)) throw new Error('Backup non trovato')
  rmSync(backupPath)
}

/** Elimina dati finanziari e archivi importati, preservando categorie, regole e profili. */
export function wipeFinancialData(): void {
  const d = getDb()
  transaction(() => {
    d.exec('DELETE FROM budget_lines; DELETE FROM transactions; DELETE FROM import_files; DELETE FROM tags;')
  })
  const archive = getImportArchiveDir()
  if (existsSync(archive)) rmSync(archive, { recursive: true, force: true })
  mkdirSync(archive, { recursive: true })
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
