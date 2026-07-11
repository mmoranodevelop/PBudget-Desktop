import { getDb } from './db'
import type { ForecastResult, ForecastMonth, RecurringItem, ScenarioAdjustment } from '@shared/types'

const MONTH_LABELS = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic']

interface TxRow {
  date_reg: string
  amount: number
  merchant: string | null
  description_norm: string
  category_name: string | null
}

/**
 * Rileva movimenti ricorrenti (mensili) raggruppando per esercente/descrizione:
 * almeno 3 occorrenze in mesi distinti con intervallo medio ~1 mese e importo stabile.
 */
export function detectRecurring(txs: TxRow[]): RecurringItem[] {
  const groups = new Map<string, TxRow[]>()
  for (const t of txs) {
    const key = (t.merchant ?? t.description_norm).slice(0, 40)
    if (!key) continue
    const list = groups.get(key) ?? []
    list.push(t)
    groups.set(key, list)
  }

  const out: RecurringItem[] = []
  for (const [key, list] of groups) {
    if (list.length < 3) continue
    const sorted = [...list].sort((a, b) => a.date_reg.localeCompare(b.date_reg))
    const months = new Set(sorted.map((t) => t.date_reg.slice(0, 7)))
    if (months.size < 3) continue

    const times = sorted.map((t) => new Date(t.date_reg).getTime())
    const intervals: number[] = []
    for (let i = 1; i < times.length; i++) intervals.push((times[i] - times[i - 1]) / 86400000)
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length
    const isMonthly = avgInterval >= 24 && avgInterval <= 38
    const isWeekly = avgInterval >= 5 && avgInterval <= 9
    if (!isMonthly && !isWeekly) continue

    const amounts = sorted.map((t) => t.amount)
    const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length
    const std = Math.sqrt(amounts.reduce((a, b) => a + (b - mean) ** 2, 0) / amounts.length)
    if (Math.abs(mean) < 1 || std / Math.abs(mean) > 0.35) continue

    out.push({
      key,
      label: key,
      avgAmount: Math.round(mean * 100) / 100,
      frequency: isMonthly ? 'monthly' : 'weekly',
      occurrences: sorted.length,
      lastDate: sorted[sorted.length - 1].date_reg,
      categoryName: sorted[sorted.length - 1].category_name
    })
  }
  return out.sort((a, b) => Math.abs(b.avgAmount) - Math.abs(a.avgAmount))
}

export function forecast(year: number, adjustments: ScenarioAdjustment[]): ForecastResult {
  const db = getDb()
  const now = new Date()
  const currentMonth = year === now.getFullYear() ? now.getMonth() + 1 : 12
  const isCurrentYear = year === now.getFullYear()

  // storico: ultimi 12 mesi fino a oggi (anche a cavallo d'anno) per ricorrenze e medie
  const txs = db
    .prepare(
      `SELECT t.date_reg, t.amount, t.merchant, t.description_norm, c.name AS category_name
       FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.status = 'active' AND (c.type IS NULL OR c.type != 'transfer')
         AND t.date_reg >= date('now', '-12 months')
       ORDER BY t.date_reg`
    )
    .all() as unknown as TxRow[]

  const recurring = detectRecurring(txs)
  const recurringKeys = new Set(recurring.map((r) => r.key))
  const monthlyRecurringNet = recurring.reduce(
    (a, r) => a + (r.frequency === 'monthly' ? r.avgAmount : r.avgAmount * 4.33),
    0
  )
  const monthlyRecurringExpense = recurring
    .filter((r) => r.avgAmount < 0)
    .reduce((a, r) => a + Math.abs(r.frequency === 'monthly' ? r.avgAmount : r.avgAmount * 4.33), 0)
  const monthlyRecurringIncome = monthlyRecurringNet + monthlyRecurringExpense

  // spese/entrate variabili (non ricorrenti): media degli ultimi 3 mesi completi
  const isRecurringTx = (t: TxRow): boolean =>
    recurringKeys.has((t.merchant ?? t.description_norm).slice(0, 40))
  const variableByMonth = new Map<string, { income: number; expense: number }>()
  for (const t of txs) {
    if (isRecurringTx(t)) continue
    const ym = t.date_reg.slice(0, 7)
    const m = variableByMonth.get(ym) ?? { income: 0, expense: 0 }
    if (t.amount > 0) m.income += t.amount
    else m.expense += -t.amount
    variableByMonth.set(ym, m)
  }
  const currentYm = now.toISOString().slice(0, 7)
  const completeMonths = [...variableByMonth.entries()]
    .filter(([ym]) => ym < currentYm)
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 3)
  const avgVariableExpense =
    completeMonths.length > 0
      ? completeMonths.reduce((a, [, v]) => a + v.expense, 0) / completeMonths.length
      : 0
  const avgVariableIncome =
    completeMonths.length > 0
      ? completeMonths.reduce((a, [, v]) => a + v.income, 0) / completeMonths.length
      : 0

  // actual per mese dell'anno selezionato
  const actualRows = db
    .prepare(
      `SELECT CAST(strftime('%m', t.date_reg) AS INTEGER) AS month,
              SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END) AS income,
              SUM(CASE WHEN t.amount < 0 THEN -t.amount ELSE 0 END) AS expense
       FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.status = 'active' AND (c.type IS NULL OR c.type != 'transfer')
         AND strftime('%Y', t.date_reg) = ?
       GROUP BY month`
    )
    .all(String(year)) as unknown as { month: number; income: number; expense: number }[]

  const initial = (
    db.prepare('SELECT COALESCE(SUM(initial_balance), 0) AS b FROM accounts').get() as { b: number }
  ).b
  const beforeYear = (
    db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) AS s FROM transactions WHERE status = 'active' AND date_reg < ?`
      )
      .get(`${year}-01-01`) as { s: number }
  ).s

  let balance = initial + beforeYear
  let scenarioBalance = balance
  const months: ForecastMonth[] = []
  const projIncome = monthlyRecurringIncome + avgVariableIncome
  const projExpense = monthlyRecurringExpense + avgVariableExpense

  for (let m = 1; m <= 12; m++) {
    const actual = actualRows.find((r) => r.month === m)
    const isActual = isCurrentYear ? m <= currentMonth && !!actual : !!actual
    let income: number
    let expense: number
    if (isActual && (m < currentMonth || !isCurrentYear)) {
      income = actual?.income ?? 0
      expense = actual?.expense ?? 0
    } else if (isCurrentYear && m === currentMonth) {
      // mese corrente: actual finora + quota proiettata dei giorni restanti
      const dayOfMonth = now.getDate()
      const daysInMonth = new Date(year, m, 0).getDate()
      const remainingRatio = Math.max(0, (daysInMonth - dayOfMonth) / daysInMonth)
      income = (actual?.income ?? 0) + projIncome * remainingRatio
      expense = (actual?.expense ?? 0) + projExpense * remainingRatio
    } else {
      income = projIncome
      expense = projExpense
    }
    const isFuture = isCurrentYear && m >= currentMonth
    balance += income - expense
    let adjDelta = 0
    if (isFuture) {
      for (const a of adjustments) {
        if (m >= a.fromMonth) adjDelta += a.monthlyAmount
      }
    }
    scenarioBalance += income - expense + adjDelta

    months.push({
      month: m,
      label: MONTH_LABELS[m - 1],
      isActual: isActual && (m < currentMonth || !isCurrentYear),
      income: Math.round(income * 100) / 100,
      expense: Math.round(expense * 100) / 100,
      balance: Math.round(balance * 100) / 100,
      scenarioBalance: Math.round(scenarioBalance * 100) / 100
    })
  }

  return {
    months,
    recurring,
    avgVariableExpense: Math.round(avgVariableExpense * 100) / 100,
    avgVariableIncome: Math.round(avgVariableIncome * 100) / 100,
    yearEndBalance: months[11].balance,
    yearEndScenarioBalance: months[11].scenarioBalance
  }
}
