import { getDb } from './db'
import type { RuleField, RuleMatchType } from '@shared/types'

export interface DbRule {
  id: number
  field: RuleField
  match_type: RuleMatchType
  pattern: string
  category_id: number
  priority: number
  active: number
}

export function loadActiveRules(): DbRule[] {
  return getDb()
    .prepare('SELECT * FROM rules WHERE active = 1 ORDER BY priority ASC, id ASC')
    .all() as unknown as DbRule[]
}

export interface MatchableTx {
  description: string
  merchant: string | null
  causale: string | null
}

export function ruleMatches(rule: DbRule, tx: MatchableTx): boolean {
  const value =
    rule.field === 'description' ? tx.description : rule.field === 'merchant' ? tx.merchant : tx.causale
  if (!value) return false
  const v = value.toUpperCase()
  const p = rule.pattern.toUpperCase()
  switch (rule.match_type) {
    case 'exact':
      return v === p
    case 'contains':
      return v.includes(p)
    case 'regex':
      try {
        return new RegExp(rule.pattern, 'i').test(value)
      } catch {
        return false
      }
  }
}

export function firstMatchingCategory(rules: DbRule[], tx: MatchableTx): number | null {
  for (const r of rules) {
    if (ruleMatches(r, tx)) return r.category_id
  }
  return null
}

/** Applica le regole ai movimenti esistenti. Ritorna il numero di movimenti aggiornati. */
export function applyRulesToExisting(onlyUncategorized: boolean): number {
  const db = getDb()
  const rules = loadActiveRules()
  if (rules.length === 0) return 0
  const where = onlyUncategorized ? 'WHERE category_id IS NULL AND status = \'active\'' : "WHERE status = 'active'"
  const txs = db
    .prepare(`SELECT id, description, merchant, causale, category_id FROM transactions ${where}`)
    .all() as unknown as {
    id: number
    description: string
    merchant: string | null
    causale: string | null
    category_id: number | null
  }[]
  const upd = db.prepare('UPDATE transactions SET category_id = ? WHERE id = ?')
  let count = 0
  for (const tx of txs) {
    const cat = firstMatchingCategory(rules, tx)
    if (cat != null && cat !== tx.category_id) {
      upd.run(cat, tx.id)
      count++
    }
  }
  return count
}

export function testRule(field: RuleField, matchType: RuleMatchType, pattern: string): number {
  const db = getDb()
  const txs = db
    .prepare("SELECT description, merchant, causale FROM transactions WHERE status = 'active'")
    .all() as unknown as MatchableTx[]
  const rule: DbRule = {
    id: 0, field, match_type: matchType, pattern, category_id: 0, priority: 0, active: 1
  }
  return txs.filter((t) => ruleMatches(rule, t)).length
}
