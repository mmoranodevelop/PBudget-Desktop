import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { createRequire } from 'node:module'
import { deleteAccountRecord, updateAccountRecord } from '../src/main/account-store'

let db: DatabaseSync
beforeEach(async () => {
  const require = createRequire(import.meta.url)
  const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite')
  db = new DatabaseSync(':memory:')
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE accounts (id INTEGER PRIMARY KEY, name TEXT NOT NULL, iban TEXT, currency TEXT NOT NULL, type TEXT NOT NULL, color TEXT NOT NULL, icon TEXT NOT NULL, initial_balance REAL NOT NULL, initial_balance_date TEXT);
    CREATE TABLE mapping_profiles (id INTEGER PRIMARY KEY, account_id INTEGER);
    CREATE TABLE import_files (id INTEGER PRIMARY KEY, archived_path TEXT);
    CREATE TABLE transactions (id INTEGER PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id), import_file_id INTEGER REFERENCES import_files(id));
  `)
})
afterEach(() => db?.close())

describe('account persistence', () => {
  it('persiste e rilegge icona e colore', () => {
    db.prepare('INSERT INTO accounts VALUES (1, ?, NULL, ?, ?, ?, ?, 0, NULL)').run('Principale', 'EUR', 'main', '#0f766e', 'landmark')
    const updated = updateAccountRecord(db, 1, { color: '#7c3aed', icon: 'wallet' })
    expect(updated.color).toBe('#7c3aed')
    expect(updated.icon).toBe('wallet')
    expect(db.prepare('SELECT color, icon FROM accounts WHERE id = 1').get()).toEqual({ color: '#7c3aed', icon: 'wallet' })
  })

  it('elimina conto, movimenti e solo gli import non più utilizzati', () => {
    db.exec(`INSERT INTO accounts VALUES (1,'Carta',NULL,'EUR','credit_card','#d94645','card',0,NULL),(2,'Conto',NULL,'EUR','main','#0f766e','landmark',0,NULL);
      INSERT INTO mapping_profiles VALUES (1,1);
      INSERT INTO import_files VALUES (10,'only-card.xls'),(20,'shared.xls');
      INSERT INTO transactions VALUES (100,1,10),(101,1,20),(102,2,20);`)
    const deleted = deleteAccountRecord(db, 1)
    expect(deleted.result).toEqual({ transactionsDeleted: 2, importsDeleted: 1 })
    expect(deleted.archivedPaths).toEqual(['only-card.xls'])
    expect(db.prepare('SELECT COUNT(*) AS count FROM accounts WHERE id = 1').get()).toEqual({ count: 0 })
    expect(db.prepare('SELECT COUNT(*) AS count FROM transactions WHERE account_id = 1').get()).toEqual({ count: 0 })
    expect(db.prepare('SELECT id FROM import_files ORDER BY id').all()).toEqual([{ id: 20 }])
    expect(db.prepare('SELECT account_id AS accountId FROM mapping_profiles WHERE id = 1').get()).toEqual({ accountId: null })
  })
})
