import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import {
  parseFileBuffer, detectHeaderRow, headerFingerprint, suggestMapping, normalizeRows,
  parseAmountValue, parseDateValue, normalizeDescription, extractMerchant, dedupHash, similarity
} from '../src/main/importer/core'

const SAMPLE = resolve(__dirname, '../data/Elenco_Movimenti.xls')

describe('parseAmountValue (formati importi)', () => {
  it('numeri nativi', () => {
    expect(parseAmountValue(-5.72)).toBe(-5.72)
    expect(parseAmountValue(4553.91)).toBe(4553.91)
  })
  it('formato italiano', () => {
    expect(parseAmountValue('-5,72')).toBe(-5.72)
    expect(parseAmountValue('1.234,56')).toBe(1234.56)
    expect(parseAmountValue('-1.234,56')).toBe(-1234.56)
    expect(parseAmountValue('4.553,91 EUR')).toBe(4553.91)
  })
  it('formato anglosassone', () => {
    expect(parseAmountValue('1,234.56')).toBe(1234.56)
    expect(parseAmountValue('-15.10')).toBe(-15.1)
  })
  it('valori non numerici', () => {
    expect(parseAmountValue('abc')).toBeNull()
    expect(parseAmountValue('')).toBeNull()
    expect(parseAmountValue(null)).toBeNull()
  })
})

describe('normalizzazione import carta', () => {
  it('inverte il segno quando gli acquisti della carta sono positivi nel file', () => {
    const { rows, errors } = normalizeRows(
      [['Data', 'Descrizione', 'Importo'], ['12/07/2026', 'Supermercato', '42,50']],
      0,
      { dateReg: 0, dateVal: null, causale: null, description: 1, amount: 2, amountIn: null, amountOut: null, amountMultiplier: -1 }
    )
    expect(errors).toEqual([])
    expect(rows[0].amount).toBe(-42.5)
  })
})

describe('parseDateValue (formati date)', () => {
  it('Date js', () => {
    expect(parseDateValue(new Date(2026, 6, 9))).toBe('2026-07-09')
  })
  it('dd/mm/yyyy', () => {
    expect(parseDateValue('09/07/2026')).toBe('2026-07-09')
    expect(parseDateValue('9/7/2026')).toBe('2026-07-09')
  })
  it('mm/dd/yyyy quando il formato viene selezionato', () => {
    expect(parseDateValue('07/09/2026', 'mdy')).toBe('2026-07-09')
  })
  it('yyyy-mm-dd', () => {
    expect(parseDateValue('2026-07-09')).toBe('2026-07-09')
  })
  it('non-date', () => {
    expect(parseDateValue('PAGAMENTO')).toBeNull()
    expect(parseDateValue(null)).toBeNull()
  })
})

describe('normalizzazione date import', () => {
  it('usa il formato scelto per data registrazione e data valuta', () => {
    const { rows, errors } = normalizeRows(
      [['Data', 'Valuta', 'Descrizione', 'Importo'], ['07/09/2026', '07/10/2026', 'Acquisto', '-10']],
      0,
      { dateReg: 0, dateVal: 1, causale: null, description: 2, amount: 3, amountIn: null, amountOut: null, dateFormat: 'mdy' }
    )
    expect(errors).toEqual([])
    expect(rows[0]).toMatchObject({ dateReg: '2026-07-09', dateVal: '2026-07-10' })
  })
})

describe('normalizzazione descrizione ed esercente', () => {
  const desc =
    'PAGAMENTO APPLE PAY MASTERCARD NFC DEL 07/07/2026 CARTA *8451 DI EUR 5,72 LIDL 2090 COMO'
  it('rimuove date, carta e importi', () => {
    const norm = normalizeDescription(desc)
    expect(norm).not.toContain('07/07/2026')
    expect(norm).not.toContain('8451')
    expect(norm).not.toContain('5,72')
    expect(norm).toContain('LIDL')
  })
  it('estrae esercente dal formato carta UniCredit', () => {
    expect(extractMerchant(desc)).toContain('LIDL')
  })
  it('estrae mittente da bonifico emolumenti', () => {
    const m = extractMerchant('VOSTRI EMOLUMENTI BONIFICO SEPA DA: ZUCCHETTI SPA')
    expect(m).toContain('ZUCCHETTI')
  })
})

describe('dedup', () => {
  it('hash stabile e sensibile ai campi', () => {
    const h1 = dedupHash(1, '2026-07-09', -5.72, 'PAGAMENTO LIDL COMO')
    const h2 = dedupHash(1, '2026-07-09', -5.72, 'PAGAMENTO LIDL COMO')
    const h3 = dedupHash(1, '2026-07-09', -5.73, 'PAGAMENTO LIDL COMO')
    expect(h1).toBe(h2)
    expect(h1).not.toBe(h3)
  })
  it('similarity riconosce descrizioni quasi identiche', () => {
    expect(similarity('PAGAMENTO LIDL COMO', 'PAGAMENTO LIDL COMO')).toBe(1)
    expect(similarity('PAGAMENTO LIDL 2090 COMO', 'PAGAMENTO LIDL COMO')).toBeGreaterThan(0.7)
    expect(similarity('PAGAMENTO LIDL COMO', 'BONIFICO AFFITTO ROSSI')).toBeLessThan(0.4)
  })
})

const describeRealFile = existsSync(SAMPLE) ? describe : describe.skip
describeRealFile('file reale UniCredit (data/Elenco_Movimenti.xls)', () => {
  const buf = existsSync(SAMPLE) ? readFileSync(SAMPLE) : Buffer.alloc(0)
  const rows = parseFileBuffer(buf, 'Elenco_Movimenti.xls')

  it('salta il preambolo e trova la riga header', () => {
    const header = detectHeaderRow(rows)
    expect(header).toBe(4)
    expect(String(rows[header][0])).toMatch(/data registrazione/i)
  })

  it('fingerprint corrisponde al profilo seed UniCredit', () => {
    const header = detectHeaderRow(rows)
    expect(headerFingerprint(rows[header])).toBe(
      'data registrazione|data valuta|causale|descrizione|importo (eur)'
    )
  })

  it('suggerisce il mapping corretto dalle intestazioni', () => {
    const header = detectHeaderRow(rows)
    const m = suggestMapping(rows[header], rows.slice(header + 1))
    expect(m.dateReg).toBe(0)
    expect(m.dateVal).toBe(1)
    expect(m.causale).toBe(2)
    expect(m.description).toBe(3)
    expect(m.amount).toBe(4)
  })

  it('normalizza tutti i movimenti del file', () => {
    const header = detectHeaderRow(rows)
    const m = suggestMapping(rows[header], rows.slice(header + 1))
    const { rows: normalized, errors } = normalizeRows(rows, header, m)
    expect(normalized.length).toBeGreaterThanOrEqual(280)
    expect(errors.length).toBe(0)
    for (const r of normalized) {
      expect(r.dateReg).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(typeof r.amount).toBe('number')
      expect(r.description.length).toBeGreaterThan(0)
    }
    // la causale numerica viene normalizzata a 3 cifre
    const causali = new Set(normalized.map((r) => r.causale))
    expect(causali.has('043')).toBe(true)
    // gli esercenti noti vengono estratti
    const merchants = normalized.map((r) => r.merchant ?? '')
    expect(merchants.some((x) => x.includes('LIDL'))).toBe(true)
  })
})
