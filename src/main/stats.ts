import { getDb } from './db'
import type { BudgetLine, BudgetVsActual, DashboardStats } from '@shared/types'

// Nei KPI entrate/uscite sono esclusi i trasferimenti
const NOT_TRANSFER = `(t.category_id IS NULL OR c.type != 'transfer')`

export function dashboardStats(year: number): DashboardStats {
  const db = getDb()
  const now = new Date()
  const currentMonth = year === now.getFullYear() ? now.getMonth() + 1 : 12

  const monthly = db
    .prepare(
      `SELECT CAST(strftime('%m', t.date_reg) AS INTEGER) AS month,
              SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END) AS income,
              SUM(CASE WHEN t.amount < 0 THEN -t.amount ELSE 0 END) AS expense
       FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.status = 'active' AND strftime('%Y', t.date_reg) = ? AND ${NOT_TRANSFER}
       GROUP BY month ORDER BY month`
    )
    .all(String(year)) as unknown as { month: number; income: number; expense: number }[]

  const monthlySeries = Array.from({ length: 12 }, (_, i) => {
    const m = monthly.find((r) => r.month === i + 1)
    return { month: i + 1, income: m?.income ?? 0, expense: m?.expense ?? 0 }
  })

  const cur = monthlySeries[currentMonth - 1]
  const ytdIncome = monthlySeries.slice(0, currentMonth).reduce((a, m) => a + m.income, 0)
  const ytdExpense = monthlySeries.slice(0, currentMonth).reduce((a, m) => a + m.expense, 0)

  const initial = (
    db.prepare("SELECT COALESCE(SUM(initial_balance), 0) AS b FROM accounts WHERE type != 'credit_card'").get() as { b: number }
  ).b
  const startingBalanceDate = (
    db.prepare("SELECT MIN(initial_balance_date) AS d FROM accounts WHERE type != 'credit_card' AND initial_balance_date IS NOT NULL").get() as { d: string | null }
  ).d
  const totalAll = (
    db
      .prepare(
        `SELECT COALESCE(SUM(t.amount), 0) AS s FROM transactions t JOIN accounts a ON a.id = t.account_id
         WHERE t.status = 'active' AND a.type != 'credit_card'
           AND t.date_reg >= COALESCE(a.initial_balance_date, '0001-01-01')`
      )
      .get() as { s: number }
  ).s
  const balance = initial + totalAll

  // serie saldo giornaliera nell'anno selezionato
  const beforeYear = (
    db
      .prepare(
        `SELECT COALESCE(SUM(t.amount), 0) AS s FROM transactions t JOIN accounts a ON a.id = t.account_id
         WHERE t.status = 'active' AND a.type != 'credit_card' AND t.date_reg < ?
           AND t.date_reg >= COALESCE(a.initial_balance_date, '0001-01-01')`
      )
      .get(`${year}-01-01`) as { s: number }
  ).s
  const daily = db
    .prepare(
      `SELECT t.date_reg AS date, SUM(t.amount) AS delta FROM transactions t JOIN accounts a ON a.id = t.account_id
       WHERE t.status = 'active' AND a.type != 'credit_card' AND strftime('%Y', t.date_reg) = ?
         AND t.date_reg >= COALESCE(a.initial_balance_date, '0001-01-01')
       GROUP BY t.date_reg ORDER BY t.date_reg`
    )
    .all(String(year)) as unknown as { date: string; delta: number }[]
  let running = initial + beforeYear
  const balanceSeries = daily.map((d) => {
    running += d.delta
    return { date: d.date, balance: Math.round(running * 100) / 100 }
  })

  const topCategories = db
    .prepare(
      `SELECT c.id AS categoryId, c.name, c.color, SUM(-t.amount) AS amount
       FROM transactions t JOIN categories c ON c.id = t.category_id
       WHERE t.status = 'active' AND t.amount < 0 AND c.type = 'expense'
         AND strftime('%Y', t.date_reg) = ?
       GROUP BY c.id ORDER BY amount DESC LIMIT 6`
    )
    .all(String(year)) as unknown as DashboardStats['topCategories']

  const budgetAlerts = budgetVsActual(year, currentMonth)
    .filter((b) => b.budgetMonth > 0 && b.actualMonth > b.budgetMonth)
    .map((b) => ({ categoryName: b.categoryName, budget: b.budgetMonth, actual: b.actualMonth }))

  const uncategorizedCount = (
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM transactions WHERE status = 'active' AND category_id IS NULL`
      )
      .get() as { c: number }
  ).c
  const pendingDuplicates = (
    db
      .prepare(`SELECT COUNT(*) AS c FROM transactions WHERE status = 'duplicate_ignored'`)
      .get() as { c: number }
  ).c

  return {
    year,
    currentMonth,
    monthIncome: cur.income,
    monthExpense: cur.expense,
    ytdIncome,
    ytdExpense,
    savingsRate: ytdIncome > 0 ? (ytdIncome - ytdExpense) / ytdIncome : 0,
    balance: Math.round(balance * 100) / 100,
    startingBalance: Math.round(initial * 100) / 100,
    startingBalanceDate,
    monthlySeries,
    balanceSeries,
    topCategories,
    budgetAlerts,
    uncategorizedCount,
    pendingDuplicates
  }
}

// ---------- Budget ----------

export function budgetGet(year: number): BudgetLine[] {
  return getDb()
    .prepare(
      'SELECT id, year, category_id AS categoryId, month, amount FROM budget_lines WHERE year = ?'
    )
    .all(year) as unknown as BudgetLine[]
}

export function budgetSet(year: number, categoryId: number, month: number | null, amount: number): void {
  const db = getDb()
  if (amount === 0) {
    if (month === null) {
      db.prepare('DELETE FROM budget_lines WHERE year = ? AND category_id = ? AND month IS NULL').run(
        year, categoryId
      )
    } else {
      db.prepare('DELETE FROM budget_lines WHERE year = ? AND category_id = ? AND month = ?').run(
        year, categoryId, month
      )
    }
    return
  }
  db.prepare(
    `INSERT INTO budget_lines (year, category_id, month, amount) VALUES (?, ?, ?, ?)
     ON CONFLICT(year, category_id, month) DO UPDATE SET amount = excluded.amount`
  ).run(year, categoryId, month, amount)
}

/**
 * Confronto budget vs actual. Il budget su una categoria padre funge da "cluster":
 * aggrega gli actual di tutte le sottocategorie.
 */
export function budgetVsActual(year: number, month: number): BudgetVsActual[] {
  const db = getDb()
  const lines = budgetGet(year)
  const cats = db
    .prepare('SELECT id, name, color, parent_id AS parentId FROM categories')
    .all() as unknown as { id: number; name: string; color: string; parentId: number | null }[]
  const catById = new Map(cats.map((c) => [c.id, c]))

  // actual per categoria per mese (spese in valore assoluto)
  const actualRows = db
    .prepare(
      `SELECT t.category_id AS catId, CAST(strftime('%m', t.date_reg) AS INTEGER) AS month,
              SUM(-t.amount) AS spent
       FROM transactions t
       WHERE t.status = 'active' AND t.amount < 0 AND t.category_id IS NOT NULL
         AND strftime('%Y', t.date_reg) = ?
       GROUP BY t.category_id, month`
    )
    .all(String(year)) as unknown as { catId: number; month: number; spent: number }[]

  const actualFor = (categoryId: number, m: number): number => {
    let sum = 0
    for (const r of actualRows) {
      if (r.month !== m) continue
      const cat = catById.get(r.catId)
      if (r.catId === categoryId || cat?.parentId === categoryId) sum += r.spent
    }
    return Math.round(sum * 100) / 100
  }

  const byCat = new Map<number, BudgetLine[]>()
  for (const l of lines) {
    const list = byCat.get(l.categoryId) ?? []
    list.push(l)
    byCat.set(l.categoryId, list)
  }

  const out: BudgetVsActual[] = []
  for (const [categoryId, catLines] of byCat) {
    const cat = catById.get(categoryId)
    if (!cat) continue
    const annual = catLines.find((l) => l.month === null)?.amount ?? 0
    const monthBudget = (m: number): number =>
      catLines.find((l) => l.month === m)?.amount ?? annual / 12

    const monthlyData = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      budget: Math.round(monthBudget(i + 1) * 100) / 100,
      actual: actualFor(categoryId, i + 1)
    }))
    const budgetYear = monthlyData.reduce((a, m) => a + m.budget, 0)
    const actualYear = monthlyData.reduce((a, m) => a + m.actual, 0)

    out.push({
      categoryId,
      categoryName: cat.name,
      color: cat.color,
      budgetYear: Math.round(budgetYear * 100) / 100,
      budgetMonth: monthlyData[month - 1].budget,
      actualYear: Math.round(actualYear * 100) / 100,
      actualMonth: monthlyData[month - 1].actual,
      monthly: monthlyData
    })
  }
  return out.sort((a, b) => b.budgetYear - a.budgetYear)
}

export function budgetCopyFromActual(year: number, sourceYear: number): number {
  const db = getDb()
  // budget annuale per categoria padre (o categoria senza padre) = actual dell'anno sorgente
  const rows = db
    .prepare(
      `SELECT COALESCE(c.parent_id, c.id) AS catId, SUM(-t.amount) AS spent
       FROM transactions t JOIN categories c ON c.id = t.category_id
       WHERE t.status = 'active' AND t.amount < 0 AND c.type = 'expense'
         AND strftime('%Y', t.date_reg) = ?
       GROUP BY COALESCE(c.parent_id, c.id)`
    )
    .all(String(sourceYear)) as unknown as { catId: number; spent: number }[]
  let n = 0
  for (const r of rows) {
    if (r.spent > 0) {
      budgetSet(year, r.catId, null, Math.round(r.spent))
      n++
    }
  }
  return n
}
