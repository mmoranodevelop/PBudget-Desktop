// Logica pura della pipeline di import: nessuna dipendenza da Electron,
// così è testabile con vitest su Node semplice.
import * as XLSX from 'xlsx'
import Papa from 'papaparse'
import { createHash } from 'crypto'
import type { ColumnMapping } from '@shared/types'

export type RawCell = string | number | boolean | Date | null | undefined
export type RawRow = RawCell[]

// ---------- Parsing file ----------

export function parseFileBuffer(buf: Buffer, fileName: string): RawRow[] {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.csv') || lower.endsWith('.txt') || lower.endsWith('.tsv')) {
    return parseCsv(buf)
  }
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json<RawRow>(sheet, { header: 1, raw: true, defval: null })
}

function parseCsv(buf: Buffer): RawRow[] {
  let text = buf.toString('utf8')
  if (text.includes('�')) {
    text = new TextDecoder('windows-1252').decode(buf)
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  const result = Papa.parse<string[]>(text.trim(), { delimiter: '', skipEmptyLines: true })
  return result.data as RawRow[]
}

// ---------- Rilevamento header ----------

const HEADER_KEYWORDS = [
  'data', 'date', 'valuta', 'causale', 'descrizione', 'description', 'dettagli',
  'importo', 'amount', 'entrate', 'uscite', 'accrediti', 'addebiti', 'dare', 'avere',
  'operazione', 'movimento', 'saldo', 'divisa', 'categoria'
]

export function detectHeaderRow(rows: RawRow[]): number {
  let best = 0
  let bestScore = -1
  const scanTo = Math.min(rows.length, 25)
  for (let i = 0; i < scanTo; i++) {
    const row = rows[i] ?? []
    const cells = row.filter((c) => typeof c === 'string' && c.trim().length > 0) as string[]
    if (cells.length < 2) continue
    let score = 0
    for (const cell of cells) {
      const norm = cell.toLowerCase()
      if (HEADER_KEYWORDS.some((k) => norm.includes(k))) score += 2
    }
    score += Math.min(cells.length, 6) * 0.1
    // penalizza righe che sembrano dati (contengono date o numeri)
    if (row.some((c) => c instanceof Date || typeof c === 'number')) score -= 3
    if (score > bestScore) {
      bestScore = score
      best = i
    }
  }
  return bestScore > 0 ? best : 0
}

export function headerFingerprint(headerRow: RawRow): string {
  return headerRow
    .map((c) => String(c ?? '').trim().toLowerCase())
    .filter((c) => c.length > 0)
    .join('|')
}

// ---------- Suggerimento mapping ----------

const COLUMN_PATTERNS: { key: keyof ColumnMapping; patterns: RegExp[] }[] = [
  { key: 'dateVal', patterns: [/valuta/i] },
  { key: 'dateReg', patterns: [/data\s*(registrazione|contabile|operazione)?/i, /^date$/i] },
  { key: 'causale', patterns: [/causale/i, /tipo/i] },
  { key: 'description', patterns: [/descrizione|dettagli|movimento|description|memo/i] },
  { key: 'amountIn', patterns: [/entrate|accredit|avere|credit/i] },
  { key: 'amountOut', patterns: [/uscite|addebit|dare|debit/i] },
  { key: 'amount', patterns: [/importo|amount/i] }
]

export function suggestMapping(headerRow: RawRow, dataRows: RawRow[]): ColumnMapping {
  const mapping: ColumnMapping = {
    dateReg: null, dateVal: null, causale: null, description: null,
    amount: null, amountIn: null, amountOut: null
  }
  const headers = headerRow.map((c) => String(c ?? '').trim())
  const used = new Set<number>()

  for (const { key, patterns } of COLUMN_PATTERNS) {
    for (let i = 0; i < headers.length; i++) {
      if (used.has(i) || !headers[i]) continue
      if (patterns.some((p) => p.test(headers[i]))) {
        mapping[key] = i
        used.add(i)
        break
      }
    }
  }

  // fallback su tipi di dato se gli header non hanno aiutato
  if (mapping.dateReg === null || (mapping.amount === null && mapping.amountIn === null)) {
    const sample = dataRows.slice(0, 20)
    for (let col = 0; col < headers.length; col++) {
      if (used.has(col)) continue
      const values = sample.map((r) => r?.[col]).filter((v) => v != null && v !== '')
      if (values.length === 0) continue
      const dateLike = values.filter((v) => parseDateValue(v) !== null).length / values.length
      const numLike = values.filter((v) => parseAmountValue(v) !== null).length / values.length
      if (mapping.dateReg === null && dateLike > 0.8 && numLike < 0.5) {
        mapping.dateReg = col
        used.add(col)
      } else if (mapping.amount === null && mapping.amountIn === null && numLike > 0.8) {
        mapping.amount = col
        used.add(col)
      } else if (mapping.description === null && dateLike < 0.2 && numLike < 0.2) {
        const avgLen = values.reduce<number>((a, v) => a + String(v).length, 0) / values.length
        if (avgLen > 10) {
          mapping.description = col
          used.add(col)
        }
      }
    }
  }
  return mapping
}

// ---------- Normalizzazione valori ----------

export function parseDateValue(v: RawCell): string | null {
  if (v == null || v === '') return null
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null
    return toIso(v.getFullYear(), v.getMonth() + 1, v.getDate())
  }
  if (typeof v === 'number') {
    // seriale Excel (giorni dal 1900); range plausibile 1990-2100
    if (v > 32874 && v < 73415) {
      const d = XLSX.SSF ? excelSerialToDate(v) : null
      if (d) return d
    }
    return null
  }
  const s = String(v).trim()
  // dd/mm/yyyy o dd-mm-yyyy o dd.mm.yyyy
  let m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/)
  if (m) {
    const [, d, mo, y] = m
    if (Number(mo) <= 12) return toIso(Number(y), Number(mo), Number(d))
  }
  // yyyy-mm-dd
  m = s.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})/)
  if (m) {
    const [, y, mo, d] = m
    if (Number(mo) <= 12) return toIso(Number(y), Number(mo), Number(d))
  }
  // dd/mm/yy
  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2})$/)
  if (m) {
    const [, d, mo, y] = m
    if (Number(mo) <= 12) return toIso(2000 + Number(y), Number(mo), Number(d))
  }
  return null
}

function excelSerialToDate(serial: number): string | null {
  const utcDays = Math.floor(serial - 25569)
  const date = new Date(utcDays * 86400 * 1000)
  if (isNaN(date.getTime())) return null
  return toIso(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
}

function toIso(y: number, m: number, d: number): string | null {
  if (y < 1970 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function parseAmountValue(v: RawCell): number | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') return isFinite(v) ? v : null
  let s = String(v).trim().replace(/\s/g, '').replace(/€|EUR/gi, '')
  if (!s || !/\d/.test(s)) return null
  let negative = false
  if (s.startsWith('(') && s.endsWith(')')) {
    negative = true
    s = s.slice(1, -1)
  }
  if (s.startsWith('-')) {
    negative = true
    s = s.slice(1)
  } else if (s.startsWith('+')) {
    s = s.slice(1)
  }
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma > -1 && lastDot > -1) {
    // il separatore più a destra è il decimale
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.')
    else s = s.replace(/,/g, '')
  } else if (lastComma > -1) {
    const decimals = s.length - lastComma - 1
    if (decimals <= 2) s = s.replace(/\./g, '').replace(',', '.')
    else s = s.replace(/,/g, '') // probabile separatore migliaia
  }
  // se solo punto: potrebbe essere migliaia it-IT "1.234" — ambiguo, trattiamo come decimale/numero
  const n = Number(s)
  if (!isFinite(n)) return null
  return negative ? -n : n
}

// ---------- Normalizzazione descrizione ed esercente ----------

export function normalizeDescription(desc: string): string {
  return desc
    .toUpperCase()
    .replace(/\b\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}\b/g, '') // date
    .replace(/CARTA\s*\*?\d+/g, 'CARTA')
    .replace(/\bEUR?\s*[\d.,]+/g, '') // importi
    .replace(/\b\d{5,}\b/g, '') // codici lunghi (CRO, riferimenti)
    .replace(/[^A-Z0-9À-Ü\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const MERCHANT_NOISE = new Set([
  'PAGAMENTO', 'APPLE', 'PAY', 'GOOGLE', 'MASTERCARD', 'VISA', 'MAESTRO', 'NFC',
  'CONTACTLESS', 'E', 'COMMERCE', 'ECOMMERCE', 'DEL', 'CARTA', 'DI', 'EUR', 'POS'
])

export function extractMerchant(desc: string): string | null {
  const upper = desc.toUpperCase()
  // formato UniCredit carta: "... DI EUR 5,72 LIDL 2090 COMO"
  const m = upper.match(/\bDI\s+EUR\s+[\d.,]+\s+(.{3,})$/)
  let candidate = m ? m[1] : null
  if (!candidate) {
    // SEPA DD / bonifici: prova dopo parole chiave note
    const m2 = upper.match(/(?:A FAVORE DI|DA:|CARICO DA|MANDATO.*?CREDITORE)\s*:?\s*(.{3,60})/)
    if (m2) candidate = m2[1]
  }
  if (!candidate) {
    // fallback: descrizione normalizzata senza rumore
    const words = normalizeDescription(upper)
      .split(' ')
      .filter((w) => !MERCHANT_NOISE.has(w) && !/^\d+$/.test(w))
    candidate = words.slice(0, 4).join(' ')
  }
  const cleaned = candidate
    .replace(/[^A-Z0-9À-Ü\s.'-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0 && !/^\d+$/.test(w))
    .join(' ')
    .trim()
  return cleaned.length >= 3 ? cleaned.slice(0, 60) : null
}

// ---------- Riga normalizzata e dedup ----------

export interface NormalizedRow {
  index: number
  dateReg: string
  dateVal: string | null
  causale: string | null
  description: string
  descriptionNorm: string
  merchant: string | null
  amount: number
}

export interface RowError {
  index: number
  error: string
  raw: string
}

export function normalizeRows(
  rows: RawRow[],
  headerRow: number,
  mapping: ColumnMapping
): { rows: NormalizedRow[]; errors: RowError[] } {
  const out: NormalizedRow[] = []
  const errors: RowError[] = []
  for (let i = headerRow + 1; i < rows.length; i++) {
    const raw = rows[i]
    if (!raw || raw.every((c) => c == null || String(c).trim() === '')) continue
    const dateReg = mapping.dateReg != null ? parseDateValue(raw[mapping.dateReg]) : null
    let amount: number | null = null
    if (mapping.amount != null) {
      amount = parseAmountValue(raw[mapping.amount])
    } else if (mapping.amountIn != null || mapping.amountOut != null) {
      const inc = mapping.amountIn != null ? parseAmountValue(raw[mapping.amountIn]) : null
      const exp = mapping.amountOut != null ? parseAmountValue(raw[mapping.amountOut]) : null
      if (inc != null || exp != null) amount = (inc ?? 0) - Math.abs(exp ?? 0)
    }
    const description =
      mapping.description != null ? String(raw[mapping.description] ?? '').trim() : ''

    if (!dateReg || amount == null) {
      const rawStr = raw.map((c) => String(c ?? '')).join(' | ').slice(0, 120)
      // salta silenziosamente righe di footer/saldo senza dati utili
      if (dateReg || amount != null || description) {
        errors.push({
          index: i,
          error: !dateReg ? 'Data non riconosciuta' : 'Importo non riconosciuto',
          raw: rawStr
        })
      }
      continue
    }
    const causaleRaw = mapping.causale != null ? raw[mapping.causale] : null
    const causale =
      causaleRaw == null || causaleRaw === ''
        ? null
        : typeof causaleRaw === 'number'
          ? String(Math.trunc(causaleRaw)).padStart(3, '0')
          : String(causaleRaw).trim()

    out.push({
      index: i,
      dateReg,
      dateVal: mapping.dateVal != null ? parseDateValue(raw[mapping.dateVal]) : null,
      causale,
      description,
      descriptionNorm: normalizeDescription(description),
      merchant: extractMerchant(description),
      amount: Math.round(amount * 100) / 100
    })
  }
  return { rows: out, errors }
}

export function dedupHash(accountId: number, dateReg: string, amount: number, descriptionNorm: string): string {
  return createHash('sha256')
    .update(`${accountId}|${dateReg}|${amount.toFixed(2)}|${descriptionNorm}`)
    .digest('hex')
}

export function fileHash(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex')
}

// Similarità semplice (bigrammi) per duplicati probabili e suggerimenti
export function similarity(a: string, b: string): number {
  if (a === b) return 1
  if (a.length < 2 || b.length < 2) return 0
  const bigrams = (s: string): Map<string, number> => {
    const m = new Map<string, number>()
    for (let i = 0; i < s.length - 1; i++) {
      const bg = s.slice(i, i + 2)
      m.set(bg, (m.get(bg) ?? 0) + 1)
    }
    return m
  }
  const ma = bigrams(a)
  const mb = bigrams(b)
  let inter = 0
  for (const [bg, ca] of ma) inter += Math.min(ca, mb.get(bg) ?? 0)
  return (2 * inter) / (a.length - 1 + b.length - 1)
}
