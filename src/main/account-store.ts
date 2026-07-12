import type { DatabaseSync } from 'node:sqlite'
import type { Account, AccountDeleteResult, AccountType } from '@shared/types'

const ACCOUNT_SELECT = `SELECT id, name, iban, currency, type, color, icon,
  initial_balance AS initialBalance, initial_balance_date AS initialBalanceDate FROM accounts`

export function updateAccountRecord(db: DatabaseSync, id: number, patch: Partial<Omit<Account, 'id'>>): Account {
  const current = db.prepare(`${ACCOUNT_SELECT} WHERE id = ?`).get(id) as unknown as Account | undefined
  if (!current) throw new Error('Conto non trovato')
  const next = { ...current, ...patch }
  db.prepare('UPDATE accounts SET name = ?, iban = ?, currency = ?, type = ?, color = ?, icon = ?, initial_balance = ?, initial_balance_date = ? WHERE id = ?')
    .run(next.name.trim(), next.iban || null, next.currency, next.type as AccountType, next.color, next.icon, next.initialBalance, next.initialBalanceDate || null, id)
  return db.prepare(`${ACCOUNT_SELECT} WHERE id = ?`).get(id) as unknown as Account
}

export function deleteAccountRecord(db: DatabaseSync, id: number): { result: AccountDeleteResult; archivedPaths: string[] } {
  const account = db.prepare('SELECT id FROM accounts WHERE id = ?').get(id)
  if (!account) throw new Error('Conto o carta non trovato')
  const txCount = (db.prepare('SELECT COUNT(*) AS count FROM transactions WHERE account_id = ?').get(id) as { count: number }).count
  const imports = db.prepare(
    `SELECT DISTINCT f.id, f.archived_path AS archivedPath FROM import_files f
     JOIN transactions t ON t.import_file_id = f.id WHERE t.account_id = ?`
  ).all(id) as unknown as { id: number; archivedPath: string | null }[]
  const deletedImportIds = new Set<number>()
  db.exec('BEGIN')
  try {
    db.prepare('DELETE FROM transactions WHERE account_id = ?').run(id)
    db.prepare('UPDATE mapping_profiles SET account_id = NULL WHERE account_id = ?').run(id)
    for (const item of imports) {
      const usedElsewhere = (db.prepare('SELECT COUNT(*) AS count FROM transactions WHERE import_file_id = ?').get(item.id) as { count: number }).count
      if (usedElsewhere === 0) { db.prepare('DELETE FROM import_files WHERE id = ?').run(item.id); deletedImportIds.add(item.id) }
    }
    db.prepare('DELETE FROM accounts WHERE id = ?').run(id)
    db.exec('COMMIT')
  } catch (error) { db.exec('ROLLBACK'); throw error }
  return {
    result: { transactionsDeleted: txCount, importsDeleted: deletedImportIds.size },
    archivedPaths: imports.filter((item) => deletedImportIds.has(item.id) && item.archivedPath).map((item) => item.archivedPath as string)
  }
}
