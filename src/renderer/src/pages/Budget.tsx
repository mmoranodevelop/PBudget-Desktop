import { useCallback, useEffect, useState } from 'react'
import type { BudgetVsActual, Category } from '@shared/types'
import { api, fmtEur, MONTH_NAMES, MONTH_SHORT } from '../api'
import { CategorySelect, Modal } from '../components'

export default function Budget({ categories }: { categories: Category[] }): JSX.Element {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [rows, setRows] = useState<BudgetVsActual[]>([])
  const [addCat, setAddCat] = useState<number | null>(null)
  const [addAmount, setAddAmount] = useState('')
  const [detail, setDetail] = useState<BudgetVsActual | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    api.budgetVsActual(year, month).then(setRows).catch(console.error)
  }, [year, month])

  useEffect(() => {
    load()
  }, [load])

  const addLine = async (): Promise<void> => {
    const amount = Number(addAmount.replace(',', '.'))
    if (addCat == null || !isFinite(amount) || amount <= 0) return
    await api.budgetSet(year, addCat, null, amount)
    setAddCat(null)
    setAddAmount('')
    load()
  }

  const copyFromActual = async (): Promise<void> => {
    setBusy(true)
    try {
      await api.budgetCopyFromActual(year, year - 1)
      load()
    } finally {
      setBusy(false)
    }
  }

  const setMonthly = async (categoryId: number, m: number, value: string): Promise<void> => {
    const amount = Number(value.replace(',', '.'))
    if (!isFinite(amount) || amount < 0) return
    await api.budgetSet(year, categoryId, m, amount)
    load()
    if (detail) {
      const updated = await api.budgetVsActual(year, month)
      setRows(updated)
      setDetail(updated.find((r) => r.categoryId === detail.categoryId) ?? null)
    }
  }

  const removeLine = async (categoryId: number): Promise<void> => {
    await api.budgetSet(year, categoryId, null, 0)
    for (let m = 1; m <= 12; m++) await api.budgetSet(year, categoryId, m, 0)
    setDetail(null)
    load()
  }

  const totalBudget = rows.reduce((a, r) => a + r.budgetYear, 0)
  const totalActual = rows.reduce((a, r) => a + r.actualYear, 0)

  const bar = (actual: number, budget: number): JSX.Element => {
    const pct = budget > 0 ? Math.min(130, (actual / budget) * 100) : 0
    const color = pct > 100 ? 'var(--red)' : pct > 80 ? 'var(--yellow)' : 'var(--green)'
    return (
      <div className="progress" style={{ width: 140 }}>
        <div style={{ width: `${Math.min(100, pct)}%`, background: color }} />
      </div>
    )
  }

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">Budget {year}</h1>
          <p className="page-sub">
            Budget annuale con dettaglio mensile. Il budget su una macro-categoria aggrega le sottocategorie
            (cluster).
          </p>
        </div>
        <div className="row">
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {MONTH_NAMES.map((m, i) => (
              <option key={i} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {[1, 0, -1].map((d) => {
              const y = now.getFullYear() + d
              return (
                <option key={y} value={y}>
                  {y}
                </option>
              )
            })}
          </select>
        </div>
      </div>

      <div className="grid kpi-row mb">
        <div className="card kpi">
          <div className="label">Budget annuale totale</div>
          <div className="value">{fmtEur(totalBudget)}</div>
        </div>
        <div className="card kpi">
          <div className="label">Speso finora (categorie a budget)</div>
          <div className={`value ${totalActual > totalBudget ? 'neg' : ''}`}>{fmtEur(totalActual)}</div>
        </div>
        <div className="card kpi">
          <div className="label">Residuo</div>
          <div className={`value ${totalBudget - totalActual >= 0 ? 'pos' : 'neg'}`}>
            {fmtEur(totalBudget - totalActual)}
          </div>
        </div>
      </div>

      <div className="toolbar">
        <CategorySelect
          categories={categories.filter((c) => c.type === 'expense')}
          value={addCat}
          onChange={setAddCat}
          emptyLabel="— scegli categoria o cluster —"
        />
        <input
          placeholder="Budget annuale €"
          style={{ width: 130 }}
          value={addAmount}
          onChange={(e) => setAddAmount(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addLine()}
        />
        <button className="btn" onClick={addLine} disabled={addCat == null || !addAmount}>
          + Aggiungi budget
        </button>
        <div className="spacer" />
        <button className="btn secondary" onClick={copyFromActual} disabled={busy}>
          Copia da spese {year - 1}
        </button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Categoria / Cluster</th>
              <th className="num">Budget {MONTH_SHORT[month - 1]}</th>
              <th className="num">Speso {MONTH_SHORT[month - 1]}</th>
              <th>Avanzamento mese</th>
              <th className="num">Budget anno</th>
              <th className="num">Speso anno</th>
              <th>Avanzamento anno</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.categoryId}>
                <td>
                  <span className="badge" style={{ background: `${r.color}22`, color: r.color }}>
                    <span className="dot" style={{ background: r.color }} />
                    {r.categoryName}
                  </span>
                </td>
                <td className="num">{fmtEur(r.budgetMonth)}</td>
                <td className={`num ${r.actualMonth > r.budgetMonth && r.budgetMonth > 0 ? 'neg' : ''}`}>
                  {fmtEur(r.actualMonth)}
                </td>
                <td>{bar(r.actualMonth, r.budgetMonth)}</td>
                <td className="num">{fmtEur(r.budgetYear)}</td>
                <td className={`num ${r.actualYear > r.budgetYear ? 'neg' : ''}`}>{fmtEur(r.actualYear)}</td>
                <td>{bar(r.actualYear, r.budgetYear)}</td>
                <td>
                  <button className="btn small secondary" onClick={() => setDetail(r)}>
                    Mensilizza
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="muted" style={{ textAlign: 'center', padding: 24 }}>
                  Nessun budget definito per il {year}. Aggiungi una categoria qui sopra, oppure copia dalle
                  spese dell'anno precedente.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {detail && (
        <Modal title={`Budget mensile — ${detail.categoryName} (${year})`} onClose={() => setDetail(null)}>
          <p className="small muted">
            Lascia il valore proposto (budget annuale ÷ 12) o personalizza i singoli mesi.
          </p>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            {detail.monthly.map((m) => (
              <label key={m.month} className="field">
                {MONTH_NAMES[m.month - 1]}
                <input
                  defaultValue={m.budget.toFixed(2)}
                  onBlur={(e) => setMonthly(detail.categoryId, m.month, e.target.value)}
                />
                <span className="small muted">speso: {fmtEur(m.actual)}</span>
              </label>
            ))}
          </div>
          <div className="actions">
            <button className="btn danger" onClick={() => removeLine(detail.categoryId)}>
              Rimuovi budget
            </button>
            <button className="btn" onClick={() => setDetail(null)}>
              Chiudi
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
