import { ipcMain, dialog, BrowserWindow } from 'electron'
import { readFileSync, statSync, existsSync, readdirSync } from 'fs'
import { basename, join } from 'path'
import * as XLSX from 'xlsx'
import { getDb, getDbPath, getBackupDir, backupNow } from './db'
import { analyzeBuffer, stage, commit } from './importer/service'
import { applyRulesToExisting, testRule } from './rules'
import { dashboardStats, budgetGet, budgetSet, budgetVsActual, budgetCopyFromActual } from './stats'
import { forecast } from './forecast'
import {
  gdriveStatus, gdriveConfigure, gdriveConnect, gdriveDisconnect, gdriveListFiles, gdriveDownload
} from './gdrive'
import type {
  Category, ColumnMapping, Rule, ScenarioAdjustment, Tag, Transaction, TransactionFilter,
  TransactionListResult, YearReport
} from '@shared/types'

function handle(channel: string, fn: (...args: never[]) => unknown): void {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      return { ok: true, data: await (fn as (...a: unknown[]) => unknown)(...args) }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  })
}

interface TxDbRow {
  id: number
  account_id: number
  import_file_id: number | null
  date_reg: string
  date_val: string | null
  causale: string | null
  description: string
  merchant: string | null
  amount: number
  currency: string
  category_id: number | null
  notes: string | null
  status: 'active' | 'duplicate_ignored'
}

function toTx(r: TxDbRow, tags: Tag[]): Transaction {
  return {
    id: r.id,
    accountId: r.account_id,
    importFileId: r.import_file_id,
    dateReg: r.date_reg,
    dateVal: r.date_val,
    causale: r.causale,
    description: r.description,
    merchant: r.merchant,
    amount: r.amount,
    currency: r.currency,
    categoryId: r.category_id,
    notes: r.notes,
    status: r.status,
    tags
  }
}

function buildTxWhere(f: TransactionFilter): { where: string; params: (string | number)[] } {
  const conds: string[] = []
  const params: (string | number)[] = []
  conds.push(f.includeIgnored ? "t.status IN ('active','duplicate_ignored')" : "t.status = 'active'")
  if (f.from) {
    conds.push('t.date_reg >= ?')
    params.push(f.from)
  }
  if (f.to) {
    conds.push('t.date_reg <= ?')
    params.push(f.to)
  }
  if (f.categoryIds && f.categoryIds.length > 0) {
    // include anche le sottocategorie delle categorie selezionate
    const ph = f.categoryIds.map(() => '?').join(',')
    conds.push(
      `(t.category_id IN (${ph}) OR t.category_id IN (SELECT id FROM categories WHERE parent_id IN (${ph})))`
    )
    params.push(...f.categoryIds, ...f.categoryIds)
  }
  if (f.tagIds && f.tagIds.length > 0) {
    const ph = f.tagIds.map(() => '?').join(',')
    conds.push(`t.id IN (SELECT transaction_id FROM transaction_tags WHERE tag_id IN (${ph}))`)
    params.push(...f.tagIds)
  }
  if (f.uncategorized) conds.push('t.category_id IS NULL')
  if (f.search) {
    conds.push('(t.description LIKE ? OR t.merchant LIKE ? OR t.notes LIKE ?)')
    const s = `%${f.search}%`
    params.push(s, s, s)
  }
  if (f.type === 'expense') conds.push('t.amount < 0')
  if (f.type === 'income') conds.push('t.amount > 0')
  if (f.minAmount != null) {
    conds.push('ABS(t.amount) >= ?')
    params.push(f.minAmount)
  }
  if (f.maxAmount != null) {
    conds.push('ABS(t.amount) <= ?')
    params.push(f.maxAmount)
  }
  return { where: conds.join(' AND '), params }
}

const SORT_COLUMNS: Record<string, string> = {
  dateReg: 't.date_reg',
  amount: 't.amount',
  description: 't.description',
  categoryId: 't.category_id'
}

export function registerIpcHandlers(): void {
  // ---------- Import ----------
  handle('import:pickFile', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const res = await dialog.showOpenDialog(win, {
      title: 'Seleziona estratto conto',
      filters: [
        { name: 'Estratti conto', extensions: ['csv', 'xls', 'xlsx', 'txt', 'tsv'] },
        { name: 'Tutti i file', extensions: ['*'] }
      ],
      properties: ['openFile']
    })
    if (res.canceled || res.filePaths.length === 0) return null
    const path = res.filePaths[0]
    return analyzeBuffer(readFileSync(path), basename(path), 'local')
  })

  handle('import:analyzeBuffer', (name: string, buf: ArrayBuffer) =>
    analyzeBuffer(Buffer.from(buf), name, 'local')
  )
  handle('import:stage', (token: string, mapping: ColumnMapping, headerRow: number) =>
    stage(token, mapping, headerRow)
  )
  handle(
    'import:commit',
    (token: string, mapping: ColumnMapping, headerRow: number, includeIndexes: number[], profileName: string | null) =>
      commit(token, mapping, headerRow, includeIndexes, profileName)
  )
  handle('import:history', () =>
    getDb()
      .prepare(
        `SELECT id, filename, source, imported_at AS importedAt,
                rows_total AS rowsTotal, rows_imported AS rowsImported, rows_skipped AS rowsSkipped
         FROM import_files ORDER BY imported_at DESC LIMIT 50`
      )
      .all()
  )

  // ---------- Transactions ----------
  handle('tx:list', (filter: TransactionFilter): TransactionListResult => {
    const db = getDb()
    const { where, params } = buildTxWhere(filter)
    const sortCol = SORT_COLUMNS[filter.sortBy ?? 'dateReg'] ?? 't.date_reg'
    const sortDir = filter.sortDir === 'asc' ? 'ASC' : 'DESC'
    const limit = Math.min(filter.limit ?? 200, 1000)
    const offset = filter.offset ?? 0

    const rows = db
      .prepare(
        `SELECT t.* FROM transactions t WHERE ${where}
         ORDER BY ${sortCol} ${sortDir}, t.id ${sortDir} LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset) as unknown as TxDbRow[]

    const agg = db
      .prepare(
        `SELECT COUNT(*) AS total,
                COALESCE(SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END), 0) AS sumIncome,
                COALESCE(SUM(CASE WHEN t.amount < 0 THEN -t.amount ELSE 0 END), 0) AS sumExpense
         FROM transactions t WHERE ${where}`
      )
      .get(...params) as { total: number; sumIncome: number; sumExpense: number }

    // tag delle righe in pagina
    const tagsByTx = new Map<number, Tag[]>()
    if (rows.length > 0) {
      const ph = rows.map(() => '?').join(',')
      const tagRows = db
        .prepare(
          `SELECT tt.transaction_id AS txId, tg.id, tg.name, tg.color
           FROM transaction_tags tt JOIN tags tg ON tg.id = tt.tag_id
           WHERE tt.transaction_id IN (${ph})`
        )
        .all(...rows.map((r) => r.id)) as unknown as (Tag & { txId: number })[]
      for (const t of tagRows) {
        const list = tagsByTx.get(t.txId) ?? []
        list.push({ id: t.id, name: t.name, color: t.color })
        tagsByTx.set(t.txId, list)
      }
    }

    return {
      rows: rows.map((r) => toTx(r, tagsByTx.get(r.id) ?? [])),
      total: agg.total,
      sumIncome: Math.round(agg.sumIncome * 100) / 100,
      sumExpense: Math.round(agg.sumExpense * 100) / 100
    }
  })

  handle('tx:update', (id: number, patch: { categoryId?: number | null; notes?: string | null }) => {
    const db = getDb()
    if ('categoryId' in patch) {
      db.prepare('UPDATE transactions SET category_id = ? WHERE id = ?').run(patch.categoryId ?? null, id)
    }
    if ('notes' in patch) {
      db.prepare('UPDATE transactions SET notes = ? WHERE id = ?').run(patch.notes ?? null, id)
    }
  })

  handle('tx:bulkCategorize', (ids: number[], categoryId: number | null) => {
    if (ids.length === 0) return 0
    const db = getDb()
    const ph = ids.map(() => '?').join(',')
    db.prepare(`UPDATE transactions SET category_id = ? WHERE id IN (${ph})`).run(
      categoryId ?? null, ...ids
    )
    return ids.length
  })

  handle('tx:similar', (id: number) => {
    const db = getDb()
    const tx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id) as unknown as TxDbRow & {
      description_norm: string
    }
    if (!tx) return []
    const candidates = (
      tx.merchant
        ? db
            .prepare(
              `SELECT t.* FROM transactions t
               WHERE t.merchant = ? AND t.id != ? AND t.status = 'active'
                 AND (t.category_id IS NULL OR t.category_id != COALESCE(?, -1))
               ORDER BY t.date_reg DESC LIMIT 100`
            )
            .all(tx.merchant, id, tx.category_id)
        : db
            .prepare(
              `SELECT t.* FROM transactions t
               WHERE t.description_norm = ? AND t.id != ? AND t.status = 'active'
                 AND (t.category_id IS NULL OR t.category_id != COALESCE(?, -1))
               ORDER BY t.date_reg DESC LIMIT 100`
            )
            .all((tx as { description_norm: string }).description_norm, id, tx.category_id)
    ) as unknown as TxDbRow[]
    return candidates.map((r) => toTx(r, []))
  })

  handle('tx:addTag', (ids: number[], tagId: number) => {
    const db = getDb()
    const ins = db.prepare(
      'INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?)'
    )
    for (const id of ids) ins.run(id, tagId)
  })
  handle('tx:removeTag', (id: number, tagId: number) => {
    getDb()
      .prepare('DELETE FROM transaction_tags WHERE transaction_id = ? AND tag_id = ?')
      .run(id, tagId)
  })
  handle('tx:restoreDuplicate', (id: number) => {
    getDb().prepare("UPDATE transactions SET status = 'active' WHERE id = ?").run(id)
  })

  // ---------- Categories ----------
  handle('cat:list', (): Category[] => {
    const rows = getDb()
      .prepare(
        `SELECT id, name, color, type, parent_id AS parentId, is_system AS isSystem, sort_order AS sortOrder
         FROM categories ORDER BY sort_order, id`
      )
      .all() as unknown as (Omit<Category, 'isSystem'> & { isSystem: number })[]
    return rows.map((r) => ({ ...r, isSystem: r.isSystem === 1 }))
  })

  handle('cat:create', (c: Omit<Category, 'id' | 'isSystem'>) => {
    const res = getDb()
      .prepare(
        'INSERT INTO categories (name, color, type, parent_id, is_system, sort_order) VALUES (?, ?, ?, ?, 0, ?)'
      )
      .run(c.name, c.color, c.type, c.parentId, c.sortOrder ?? 999)
    return { ...c, id: Number(res.lastInsertRowid), isSystem: false }
  })

  handle('cat:update', (id: number, patch: Partial<Omit<Category, 'id' | 'isSystem'>>) => {
    const db = getDb()
    const cur = db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as
      | { name: string; color: string; type: string; parent_id: number | null; sort_order: number }
      | undefined
    if (!cur) throw new Error('Categoria non trovata')
    db.prepare(
      'UPDATE categories SET name = ?, color = ?, type = ?, parent_id = ?, sort_order = ? WHERE id = ?'
    ).run(
      patch.name ?? cur.name,
      patch.color ?? cur.color,
      patch.type ?? cur.type,
      patch.parentId !== undefined ? patch.parentId : cur.parent_id,
      patch.sortOrder ?? cur.sort_order,
      id
    )
  })

  handle('cat:delete', (id: number, reassignTo: number | null) => {
    const db = getDb()
    const cat = db.prepare('SELECT is_system FROM categories WHERE id = ?').get(id) as
      | { is_system: number }
      | undefined
    if (!cat) return
    if (cat.is_system === 1) throw new Error('Le categorie di sistema non si possono eliminare')
    db.prepare('UPDATE transactions SET category_id = ? WHERE category_id = ?').run(reassignTo, id)
    db.prepare('UPDATE categories SET parent_id = NULL WHERE parent_id = ?').run(id)
    db.prepare('DELETE FROM categories WHERE id = ?').run(id)
  })

  // ---------- Tags ----------
  handle('tag:list', () => getDb().prepare('SELECT id, name, color FROM tags ORDER BY name').all())
  handle('tag:create', (name: string, color: string) => {
    const res = getDb().prepare('INSERT INTO tags (name, color) VALUES (?, ?)').run(name, color)
    return { id: Number(res.lastInsertRowid), name, color }
  })
  handle('tag:delete', (id: number) => {
    getDb().prepare('DELETE FROM tags WHERE id = ?').run(id)
  })

  // ---------- Rules ----------
  handle('rule:list', (): Rule[] => {
    const rows = getDb()
      .prepare(
        `SELECT id, field, match_type AS matchType, pattern, category_id AS categoryId, priority, active
         FROM rules ORDER BY priority, id`
      )
      .all() as unknown as (Omit<Rule, 'active'> & { active: number })[]
    return rows.map((r) => ({ ...r, active: r.active === 1 }))
  })
  handle('rule:create', (r: Omit<Rule, 'id'>) => {
    const res = getDb()
      .prepare(
        'INSERT INTO rules (field, match_type, pattern, category_id, priority, active) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(r.field, r.matchType, r.pattern, r.categoryId, r.priority, r.active ? 1 : 0)
    return { ...r, id: Number(res.lastInsertRowid) }
  })
  handle('rule:update', (id: number, patch: Partial<Omit<Rule, 'id'>>) => {
    const db = getDb()
    const cur = db.prepare('SELECT * FROM rules WHERE id = ?').get(id) as
      | { field: string; match_type: string; pattern: string; category_id: number; priority: number; active: number }
      | undefined
    if (!cur) throw new Error('Regola non trovata')
    db.prepare(
      'UPDATE rules SET field = ?, match_type = ?, pattern = ?, category_id = ?, priority = ?, active = ? WHERE id = ?'
    ).run(
      patch.field ?? cur.field,
      patch.matchType ?? cur.match_type,
      patch.pattern ?? cur.pattern,
      patch.categoryId ?? cur.category_id,
      patch.priority ?? cur.priority,
      patch.active !== undefined ? (patch.active ? 1 : 0) : cur.active,
      id
    )
  })
  handle('rule:delete', (id: number) => {
    getDb().prepare('DELETE FROM rules WHERE id = ?').run(id)
  })
  handle('rule:test', testRule)
  handle('rule:applyAll', (onlyUncategorized: boolean) => applyRulesToExisting(onlyUncategorized))

  // ---------- Budget ----------
  handle('budget:get', budgetGet)
  handle('budget:set', budgetSet)
  handle('budget:vsActual', budgetVsActual)
  handle('budget:copyFromActual', budgetCopyFromActual)

  // ---------- Export ----------
  handle('tx:export', async (filter: TransactionFilter, format: 'csv' | 'xlsx') => {
    const db = getDb()
    const { where, params } = buildTxWhere(filter)
    const rows = db
      .prepare(
        `SELECT t.date_reg, t.date_val, t.causale, t.description, t.merchant, t.amount,
                c.name AS category, t.notes
         FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
         WHERE ${where} ORDER BY t.date_reg DESC`
      )
      .all(...params) as unknown as Record<string, unknown>[]

    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const res = await dialog.showSaveDialog(win, {
      title: 'Esporta movimenti',
      defaultPath: `movimenti-${new Date().toISOString().slice(0, 10)}.${format}`,
      filters: format === 'csv' ? [{ name: 'CSV', extensions: ['csv'] }] : [{ name: 'Excel', extensions: ['xlsx'] }]
    })
    if (res.canceled || !res.filePath) return null

    const header = ['Data', 'Data valuta', 'Causale', 'Descrizione', 'Esercente', 'Importo', 'Categoria', 'Note']
    const data = rows.map((r) => [
      r.date_reg, r.date_val, r.causale, r.description, r.merchant, r.amount, r.category, r.notes
    ])
    const ws = XLSX.utils.aoa_to_sheet([header, ...data])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Movimenti')
    XLSX.writeFile(wb, res.filePath, { bookType: format === 'csv' ? 'csv' : 'xlsx' })
    return res.filePath
  })

  // ---------- Report ----------
  handle('report:year', (year: number): YearReport => {
    const db = getDb()
    const income = Array(12).fill(0) as number[]
    const expense = Array(12).fill(0) as number[]
    const totals = db
      .prepare(
        `SELECT CAST(strftime('%m', t.date_reg) AS INTEGER) AS month,
                SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END) AS income,
                SUM(CASE WHEN t.amount < 0 THEN -t.amount ELSE 0 END) AS expense
         FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
         WHERE t.status = 'active' AND (t.category_id IS NULL OR c.type != 'transfer')
           AND strftime('%Y', t.date_reg) = ?
         GROUP BY month`
      )
      .all(String(year)) as unknown as { month: number; income: number; expense: number }[]
    for (const t of totals) {
      income[t.month - 1] = Math.round(t.income * 100) / 100
      expense[t.month - 1] = Math.round(t.expense * 100) / 100
    }

    const catRows = db
      .prepare(
        `SELECT COALESCE(p.id, c.id) AS categoryId, COALESCE(p.name, c.name) AS name,
                COALESCE(p.color, c.color) AS color,
                CAST(strftime('%m', t.date_reg) AS INTEGER) AS month, SUM(-t.amount) AS spent
         FROM transactions t
         JOIN categories c ON c.id = t.category_id
         LEFT JOIN categories p ON p.id = c.parent_id
         WHERE t.status = 'active' AND t.amount < 0 AND c.type = 'expense'
           AND strftime('%Y', t.date_reg) = ?
         GROUP BY COALESCE(p.id, c.id), month`
      )
      .all(String(year)) as unknown as {
      categoryId: number
      name: string
      color: string
      month: number
      spent: number
    }[]

    const byCat = new Map<number, YearReport['categories'][number]>()
    for (const r of catRows) {
      let entry = byCat.get(r.categoryId)
      if (!entry) {
        entry = { categoryId: r.categoryId, name: r.name, color: r.color, months: Array(12).fill(0), total: 0 }
        byCat.set(r.categoryId, entry)
      }
      const v = Math.round(r.spent * 100) / 100
      entry.months[r.month - 1] += v
      entry.total = Math.round((entry.total + v) * 100) / 100
    }

    return {
      year,
      income,
      expense,
      categories: [...byCat.values()].sort((a, b) => b.total - a.total)
    }
  })

  // ---------- Google Drive ----------
  handle('gdrive:status', gdriveStatus)
  handle('gdrive:configure', gdriveConfigure)
  handle('gdrive:connect', gdriveConnect)
  handle('gdrive:disconnect', gdriveDisconnect)
  handle('gdrive:listFiles', gdriveListFiles)
  handle('gdrive:import', async (fileId: string, name: string) => {
    const buf = await gdriveDownload(fileId)
    return analyzeBuffer(buf, name, 'gdrive')
  })

  // ---------- Dashboard / Forecast ----------
  handle('dashboard:stats', dashboardStats)
  handle('forecast:get', (year: number, adjustments: ScenarioAdjustment[]) =>
    forecast(year, adjustments ?? [])
  )

  // ---------- Settings ----------
  handle('settings:dataInfo', () => {
    const db = getDb()
    const dbPath = getDbPath()
    const backupDir = getBackupDir()
    const backups = existsSync(backupDir)
      ? readdirSync(backupDir)
          .filter((f) => f.endsWith('.db'))
          .map((f) => {
            const st = statSync(join(backupDir, f))
            return { file: f, date: st.mtime.toISOString(), sizeBytes: st.size }
          })
          .sort((a, b) => b.date.localeCompare(a.date))
      : []
    return {
      dbPath,
      dbSizeBytes: existsSync(dbPath) ? statSync(dbPath).size : 0,
      transactionCount: (db.prepare('SELECT COUNT(*) AS c FROM transactions').get() as { c: number }).c,
      importCount: (db.prepare('SELECT COUNT(*) AS c FROM import_files').get() as { c: number }).c,
      backups
    }
  })
  handle('settings:backupNow', () => backupNow())
  handle('settings:get', (key: string) => {
    const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined
    return row?.value ?? null
  })
  handle('settings:set', (key: string, value: string) => {
    getDb()
      .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, value)
  })
  handle('profile:list', () => {
    const rows = getDb()
      .prepare('SELECT id, name, fingerprint, mapping_json, header_row AS headerRow FROM mapping_profiles')
      .all() as unknown as { id: number; name: string; fingerprint: string; mapping_json: string; headerRow: number }[]
    return rows.map((r) => ({
      id: r.id, name: r.name, fingerprint: r.fingerprint,
      mapping: JSON.parse(r.mapping_json), headerRow: r.headerRow
    }))
  })
  handle('profile:delete', (id: number) => {
    getDb().prepare('DELETE FROM mapping_profiles WHERE id = ?').run(id)
  })
}
