import type { DatabaseSync } from 'node:sqlite'

interface SeedCategory {
  name: string
  color: string
  type: 'expense' | 'income' | 'transfer'
  system?: boolean
  children?: { name: string; color?: string }[]
}

const CATEGORIES: SeedCategory[] = [
  {
    name: 'Entrate',
    color: '#22c55e',
    type: 'income',
    children: [
      { name: 'Stipendio' },
      { name: 'Rimborsi' },
      { name: 'Interessi e Cashback' },
      { name: 'Altre entrate' }
    ]
  },
  {
    name: 'Casa',
    color: '#f59e0b',
    type: 'expense',
    children: [
      { name: 'Affitto/Mutuo' },
      { name: 'Utenze' },
      { name: 'Internet e Telefono' },
      { name: 'Manutenzione casa' }
    ]
  },
  {
    name: 'Alimentari',
    color: '#ef4444',
    type: 'expense',
    children: [{ name: 'Supermercato' }, { name: 'Ristoranti e Bar' }, { name: 'Delivery' }]
  },
  {
    name: 'Trasporti',
    color: '#3b82f6',
    type: 'expense',
    children: [
      { name: 'Carburante' },
      { name: 'Mezzi pubblici' },
      { name: 'Auto' },
      { name: 'Parcheggi e Pedaggi' }
    ]
  },
  {
    name: 'Salute',
    color: '#14b8a6',
    type: 'expense',
    children: [{ name: 'Medico e Farmacia' }, { name: 'Assicurazioni' }]
  },
  {
    name: 'Svago',
    color: '#a855f7',
    type: 'expense',
    children: [
      { name: 'Abbonamenti' },
      { name: 'Sport' },
      { name: 'Viaggi' },
      { name: 'Shopping' },
      { name: 'Hobby' }
    ]
  },
  {
    name: 'Finanza',
    color: '#64748b',
    type: 'expense',
    children: [
      { name: 'Commissioni bancarie' },
      { name: 'Imposte e Bolli' },
      { name: 'Prestiti e Finanziamenti' },
      { name: 'Risparmio e Investimenti' }
    ]
  },
  { name: 'Trasferimenti', color: '#94a3b8', type: 'transfer', system: true },
  { name: 'Da categorizzare', color: '#e2e8f0', type: 'expense', system: true }
]

// Regole precompilate per il formato UniCredit del dataset di test
const RULES: {
  field: 'description' | 'merchant' | 'causale'
  matchType: 'contains' | 'exact' | 'regex'
  pattern: string
  category: string
  priority: number
}[] = [
  { field: 'causale', matchType: 'exact', pattern: '027', category: 'Stipendio', priority: 10 },
  { field: 'description', matchType: 'contains', pattern: 'EMOLUMENTI', category: 'Stipendio', priority: 10 },
  { field: 'causale', matchType: 'exact', pattern: '016', category: 'Commissioni bancarie', priority: 20 },
  { field: 'causale', matchType: 'exact', pattern: '198', category: 'Commissioni bancarie', priority: 20 },
  { field: 'causale', matchType: 'exact', pattern: '219', category: 'Imposte e Bolli', priority: 20 },
  { field: 'description', matchType: 'contains', pattern: 'IMPOSTA BOLLO', category: 'Imposte e Bolli', priority: 20 },
  { field: 'causale', matchType: 'exact', pattern: '087', category: 'Prestiti e Finanziamenti', priority: 20 },
  { field: 'description', matchType: 'contains', pattern: 'RIMBORSO PRESTITO', category: 'Prestiti e Finanziamenti', priority: 20 },
  { field: 'causale', matchType: 'exact', pattern: '018', category: 'Interessi e Cashback', priority: 30 },
  { field: 'causale', matchType: 'exact', pattern: '226', category: 'Interessi e Cashback', priority: 30 },
  { field: 'merchant', matchType: 'contains', pattern: 'LIDL', category: 'Supermercato', priority: 50 },
  { field: 'merchant', matchType: 'contains', pattern: 'BENNET', category: 'Supermercato', priority: 50 },
  { field: 'merchant', matchType: 'contains', pattern: 'ESSELUNGA', category: 'Supermercato', priority: 50 },
  { field: 'merchant', matchType: 'contains', pattern: 'CONAD', category: 'Supermercato', priority: 50 },
  { field: 'merchant', matchType: 'contains', pattern: 'COOP', category: 'Supermercato', priority: 50 },
  { field: 'merchant', matchType: 'contains', pattern: 'CARREFOUR', category: 'Supermercato', priority: 50 },
  { field: 'merchant', matchType: 'contains', pattern: 'EUROSPIN', category: 'Supermercato', priority: 50 },
  { field: 'merchant', matchType: 'contains', pattern: 'MCDONALD', category: 'Ristoranti e Bar', priority: 50 },
  { field: 'merchant', matchType: 'contains', pattern: 'RISTORANTE', category: 'Ristoranti e Bar', priority: 50 },
  { field: 'merchant', matchType: 'contains', pattern: 'PIZZERIA', category: 'Ristoranti e Bar', priority: 50 },
  { field: 'merchant', matchType: 'contains', pattern: 'BAR ', category: 'Ristoranti e Bar', priority: 55 },
  { field: 'merchant', matchType: 'contains', pattern: 'JUST EAT', category: 'Delivery', priority: 50 },
  { field: 'merchant', matchType: 'contains', pattern: 'DELIVEROO', category: 'Delivery', priority: 50 },
  { field: 'merchant', matchType: 'contains', pattern: 'GLOVO', category: 'Delivery', priority: 50 },
  { field: 'merchant', matchType: 'contains', pattern: 'NETFLIX', category: 'Abbonamenti', priority: 50 },
  { field: 'merchant', matchType: 'contains', pattern: 'SPOTIFY', category: 'Abbonamenti', priority: 50 },
  { field: 'merchant', matchType: 'contains', pattern: 'AMAZON PRIME', category: 'Abbonamenti', priority: 50 },
  { field: 'merchant', matchType: 'contains', pattern: 'DISNEY', category: 'Abbonamenti', priority: 50 },
  { field: 'merchant', matchType: 'contains', pattern: 'AMAZON', category: 'Shopping', priority: 60 },
  { field: 'merchant', matchType: 'contains', pattern: 'FARMACIA', category: 'Medico e Farmacia', priority: 50 },
  { field: 'merchant', matchType: 'contains', pattern: 'ESSO', category: 'Carburante', priority: 50 },
  { field: 'merchant', matchType: 'contains', pattern: 'ENI ', category: 'Carburante', priority: 50 },
  { field: 'merchant', matchType: 'contains', pattern: 'Q8', category: 'Carburante', priority: 50 },
  { field: 'merchant', matchType: 'contains', pattern: 'TAMOIL', category: 'Carburante', priority: 50 },
  { field: 'merchant', matchType: 'contains', pattern: 'AUTOSTRADE', category: 'Parcheggi e Pedaggi', priority: 50 },
  { field: 'merchant', matchType: 'contains', pattern: 'TELEPASS', category: 'Parcheggi e Pedaggi', priority: 50 },
  { field: 'description', matchType: 'contains', pattern: 'ENEL', category: 'Utenze', priority: 60 },
  { field: 'description', matchType: 'contains', pattern: 'A2A', category: 'Utenze', priority: 60 },
  { field: 'description', matchType: 'contains', pattern: 'HERA', category: 'Utenze', priority: 60 },
  { field: 'description', matchType: 'contains', pattern: 'TIM ', category: 'Internet e Telefono', priority: 60 },
  { field: 'description', matchType: 'contains', pattern: 'VODAFONE', category: 'Internet e Telefono', priority: 60 },
  { field: 'description', matchType: 'contains', pattern: 'FASTWEB', category: 'Internet e Telefono', priority: 60 },
  { field: 'description', matchType: 'contains', pattern: 'ILIAD', category: 'Internet e Telefono', priority: 60 },
  { field: 'description', matchType: 'contains', pattern: 'WINDTRE', category: 'Internet e Telefono', priority: 60 },
  { field: 'description', matchType: 'contains', pattern: 'BONIFICO A VOSTRO FAVORE', category: 'Altre entrate', priority: 80 },
  { field: 'description', matchType: 'contains', pattern: 'PRELIEVO', category: 'Da categorizzare', priority: 90 }
]

export function seedIfEmpty(db: DatabaseSync): void {
  const count = db.prepare('SELECT COUNT(*) AS c FROM categories').get() as { c: number }
  if (count.c > 0) return

  const insCat = db.prepare(
    'INSERT INTO categories (name, color, type, parent_id, is_system, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
  )
  const catIds = new Map<string, number>()
  let sort = 0
  for (const c of CATEGORIES) {
    const res = insCat.run(c.name, c.color, c.type, null, c.system ? 1 : 0, sort++)
    const parentId = Number(res.lastInsertRowid)
    catIds.set(c.name, parentId)
    for (const child of c.children ?? []) {
      const r = insCat.run(child.name, child.color ?? c.color, c.type, parentId, 0, sort++)
      catIds.set(child.name, Number(r.lastInsertRowid))
    }
  }

  const insRule = db.prepare(
    'INSERT INTO rules (field, match_type, pattern, category_id, priority, active) VALUES (?, ?, ?, ?, ?, 1)'
  )
  for (const r of RULES) {
    const catId = catIds.get(r.category)
    if (catId) insRule.run(r.field, r.matchType, r.pattern, catId, r.priority)
  }

  db.prepare('INSERT INTO accounts (name, currency) VALUES (?, ?)').run('Conto principale', 'EUR')

  // Profilo di mapping precompilato per l'export UniCredit "Elenco Movimenti"
  db.prepare(
    'INSERT INTO mapping_profiles (name, fingerprint, mapping_json, header_row) VALUES (?, ?, ?, ?)'
  ).run(
    'UniCredit - Elenco Movimenti',
    'data registrazione|data valuta|causale|descrizione|importo (eur)',
    JSON.stringify({
      dateReg: 0,
      dateVal: 1,
      causale: 2,
      description: 3,
      amount: 4,
      amountIn: null,
      amountOut: null
    }),
    0
  )
}
