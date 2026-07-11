import { randomUUID } from 'crypto'
import { writeFileSync } from 'fs'
import { join, basename } from 'path'
import { getDb, transaction, getImportArchiveDir } from '../db'
import { loadActiveRules, firstMatchingCategory } from '../rules'
import {
  parseFileBuffer, detectHeaderRow, headerFingerprint, suggestMapping,
  normalizeRows, dedupHash, fileHash, similarity,
  type RawRow, type NormalizedRow
} from './core'
import type {
  ColumnMapping, ImportAnalysis, StageResult, StagedRow, CommitResult
} from '@shared/types'

interface ImportSession {
  token: string
  fileName: string
  source: 'local' | 'gdrive'
  buf: Buffer
  rows: RawRow[]
}

const sessions = new Map<string, ImportSession>()
const DEFAULT_ACCOUNT = 1

export function analyzeBuffer(buf: Buffer, fileName: string, source: 'local' | 'gdrive' = 'local'): ImportAnalysis {
  const rows = parseFileBuffer(buf, fileName)
  if (rows.length === 0) throw new Error('Il file è vuoto o non leggibile')
  const headerRow = detectHeaderRow(rows)
  const fingerprint = headerFingerprint(rows[headerRow] ?? [])

  const db = getDb()
  const profile = db
    .prepare('SELECT id, name, mapping_json FROM mapping_profiles WHERE fingerprint = ?')
    .get(fingerprint) as { id: number; name: string; mapping_json: string } | undefined

  const dataRows = rows.slice(headerRow + 1)
  const suggestedMapping: ColumnMapping = profile
    ? (JSON.parse(profile.mapping_json) as ColumnMapping)
    : suggestMapping(rows[headerRow] ?? [], dataRows)

  const token = randomUUID()
  sessions.set(token, { token, fileName, source, buf, rows })
  // evita accumulo di sessioni abbandonate
  if (sessions.size > 5) {
    const oldest = sessions.keys().next().value
    if (oldest && oldest !== token) sessions.delete(oldest)
  }

  const toStr = (r: RawRow): string[] =>
    r.map((c) => (c instanceof Date ? c.toLocaleDateString('it-IT') : String(c ?? '')))

  return {
    token,
    fileName,
    headerRow,
    columns: (rows[headerRow] ?? []).map((c) => String(c ?? '').trim()),
    sampleRows: dataRows.slice(0, 8).map(toStr),
    totalRows: dataRows.filter((r) => r && r.some((c) => c != null && String(c).trim() !== '')).length,
    suggestedMapping,
    matchedProfile: profile ? { id: profile.id, name: profile.name } : null,
    preamble: rows.slice(0, headerRow).map((r) => toStr(r).filter(Boolean).join(' ')).filter(Boolean)
  }
}

export function stage(token: string, mapping: ColumnMapping, headerRow: number): StageResult {
  const session = sessions.get(token)
  if (!session) throw new Error('Sessione di import scaduta: ricarica il file')
  const db = getDb()
  const { rows: normalized, errors } = normalizeRows(session.rows, headerRow, mapping)

  if (normalized.length === 0) {
    throw new Error(
      'Nessun movimento riconosciuto con questo mapping. Verifica le colonne Data e Importo.'
    )
  }

  // finestra di movimenti esistenti nel range del file (±3 giorni) per il dedup
  const dates = normalized.map((r) => r.dateReg).sort()
  const from = dates[0]
  const to = dates[dates.length - 1]
  const existing = db
    .prepare(
      `SELECT id, date_reg, description, description_norm, amount, hash_dedup
       FROM transactions
       WHERE account_id = ? AND date_reg BETWEEN date(?, '-3 days') AND date(?, '+3 days')`
    )
    .all(DEFAULT_ACCOUNT, from, to) as unknown as {
    id: number
    date_reg: string
    description: string
    description_norm: string
    amount: number
    hash_dedup: string
  }[]

  const byHash = new Map<string, (typeof existing)[number][]>()
  for (const e of existing) {
    const list = byHash.get(e.hash_dedup) ?? []
    list.push(e)
    byHash.set(e.hash_dedup, list)
  }

  const rules = loadActiveRules()
  const seenInFile = new Map<string, number>() // hash → conteggio già visto nel file stesso
  const staged: StagedRow[] = []
  let dup = 0
  let probable = 0
  let overlapFrom: string | null = null
  let overlapTo: string | null = null

  for (const r of normalized) {
    const hash = dedupHash(DEFAULT_ACCOUNT, r.dateReg, r.amount, r.descriptionNorm)
    const seenCount = seenInFile.get(hash) ?? 0
    seenInFile.set(hash, seenCount + 1)

    const existingMatches = byHash.get(hash) ?? []
    let status: StagedRow['status'] = 'new'
    let existingHit: (typeof existing)[number] | undefined

    // duplicato esatto: nel DB ci sono più occorrenze di questo hash di quante già "consumate" dal file
    if (existingMatches.length > seenCount) {
      status = 'duplicate'
      existingHit = existingMatches[seenCount]
      dup++
      if (overlapFrom === null || r.dateReg < overlapFrom) overlapFrom = r.dateReg
      if (overlapTo === null || r.dateReg > overlapTo) overlapTo = r.dateReg
    } else {
      // duplicato probabile: stesso importo, data ±1 giorno, descrizione simile
      const near = existing.find(
        (e) =>
          e.hash_dedup !== hash &&
          Math.abs(e.amount - r.amount) < 0.005 &&
          Math.abs(new Date(e.date_reg).getTime() - new Date(r.dateReg).getTime()) <= 86400000 &&
          similarity(e.description_norm, r.descriptionNorm) > 0.75
      )
      if (near) {
        status = 'probable_duplicate'
        existingHit = near
        probable++
      }
    }

    staged.push({
      index: r.index,
      dateReg: r.dateReg,
      dateVal: r.dateVal,
      causale: r.causale,
      description: r.description,
      amount: r.amount,
      status,
      existing: existingHit
        ? {
            id: existingHit.id,
            dateReg: existingHit.date_reg,
            description: existingHit.description,
            amount: existingHit.amount
          }
        : undefined,
      suggestedCategoryId: firstMatchingCategory(rules, r),
      include: status === 'new'
    })
  }

  for (const e of errors) {
    staged.push({
      index: e.index,
      dateReg: '',
      dateVal: null,
      causale: null,
      description: e.raw,
      amount: 0,
      status: 'error',
      error: e.error,
      suggestedCategoryId: null,
      include: false
    })
  }

  staged.sort((a, b) => a.index - b.index)

  return {
    token,
    rows: staged,
    stats: {
      total: staged.length,
      new: staged.filter((s) => s.status === 'new').length,
      duplicates: dup,
      probableDuplicates: probable,
      errors: errors.length,
      overlapFrom,
      overlapTo
    }
  }
}

export function commit(
  token: string,
  mapping: ColumnMapping,
  headerRow: number,
  includeIndexes: number[],
  profileName: string | null
): CommitResult {
  const session = sessions.get(token)
  if (!session) throw new Error('Sessione di import scaduta: ricarica il file')
  const db = getDb()
  const { rows: normalized } = normalizeRows(session.rows, headerRow, mapping)
  const includeSet = new Set(includeIndexes)
  const rules = loadActiveRules()
  const hash = fileHash(session.buf)

  return transaction(() => {
    // archivia il file originale
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const archivedPath = join(getImportArchiveDir(), `${stamp}_${basename(session.fileName)}`)
    writeFileSync(archivedPath, session.buf)

    const toImport = normalized.filter((r) => includeSet.has(r.index))
    const skipped = normalized.length - toImport.length

    const insFile = db.prepare(
      `INSERT INTO import_files (filename, hash, source, archived_path, rows_total, rows_imported, rows_skipped)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    const fileRes = insFile.run(
      session.fileName, hash, session.source, archivedPath,
      normalized.length, toImport.length, skipped
    )
    const importFileId = Number(fileRes.lastInsertRowid)

    const insTx = db.prepare(
      `INSERT INTO transactions
       (account_id, import_file_id, date_reg, date_val, causale, description, description_norm,
        merchant, amount, category_id, hash_dedup, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`
    )
    let categorized = 0
    for (const r of toImport) {
      const catId = firstMatchingCategory(rules, r)
      if (catId != null) categorized++
      insTx.run(
        DEFAULT_ACCOUNT, importFileId, r.dateReg, r.dateVal, r.causale,
        r.description, r.descriptionNorm, r.merchant, r.amount,
        catId, dedupHash(DEFAULT_ACCOUNT, r.dateReg, r.amount, r.descriptionNorm)
      )
    }

    // salva/aggiorna il profilo di mapping per import futuri
    if (profileName) {
      const fp = headerFingerprint(session.rows[headerRow] ?? [])
      db.prepare(
        `INSERT INTO mapping_profiles (name, fingerprint, mapping_json, header_row)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(fingerprint) DO UPDATE SET name = excluded.name,
           mapping_json = excluded.mapping_json, header_row = excluded.header_row`
      ).run(profileName, fp, JSON.stringify(mapping), headerRow)
    }

    sessions.delete(token)
    return { importFileId, imported: toImport.length, skippedDuplicates: skipped, categorized }
  })
}

export function listNormalized(token: string, mapping: ColumnMapping, headerRow: number): NormalizedRow[] {
  const session = sessions.get(token)
  if (!session) throw new Error('Sessione di import scaduta')
  return normalizeRows(session.rows, headerRow, mapping).rows
}
