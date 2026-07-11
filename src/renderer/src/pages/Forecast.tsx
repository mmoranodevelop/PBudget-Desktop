import { useCallback, useEffect, useState } from 'react'
import {
  ComposedChart, Line, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
  ReferenceLine
} from 'recharts'
import type { ForecastResult, ScenarioAdjustment } from '@shared/types'
import { api, fmtEur, fmtDate, MONTH_NAMES } from '../api'

export default function Forecast(): JSX.Element {
  const now = new Date()
  const [year] = useState(now.getFullYear())
  const [adjustments, setAdjustments] = useState<ScenarioAdjustment[]>([])
  const [data, setData] = useState<ForecastResult | null>(null)
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')
  const [fromMonth, setFromMonth] = useState(now.getMonth() + 1)

  const load = useCallback(() => {
    api.forecast(year, adjustments).then(setData).catch(console.error)
  }, [year, adjustments])

  useEffect(() => {
    load()
  }, [load])

  const addAdjustment = (): void => {
    const n = Number(amount.replace(',', '.'))
    if (!label.trim() || !isFinite(n) || n === 0) return
    setAdjustments((a) => [
      ...a,
      { id: String(Date.now()), label: label.trim(), monthlyAmount: n, fromMonth }
    ])
    setLabel('')
    setAmount('')
  }

  if (!data) return <p className="muted">Caricamento…</p>

  const chartData = data.months.map((m) => ({
    name: m.label,
    Entrate: m.income,
    Uscite: m.expense,
    Saldo: m.balance,
    Scenario: m.scenarioBalance,
    actual: m.isActual
  }))
  const lastActualIdx = data.months.reduce((a, m, i) => (m.isActual ? i : a), -1)
  const hasScenario = adjustments.length > 0

  return (
    <div>
      <h1 className="page-title">Proiezioni & Scenari {year}</h1>
      <p className="page-sub">
        Proiezione basata sui movimenti ricorrenti rilevati e sulla media delle spese variabili degli ultimi
        3 mesi.
      </p>

      <div className="grid kpi-row mb">
        <div className="card kpi">
          <div className="label">Saldo previsto a fine anno</div>
          <div className="value">{fmtEur(data.yearEndBalance)}</div>
        </div>
        {hasScenario && (
          <div className="card kpi">
            <div className="label">Fine anno con scenario</div>
            <div
              className={`value ${data.yearEndScenarioBalance >= data.yearEndBalance ? 'pos' : 'neg'}`}
            >
              {fmtEur(data.yearEndScenarioBalance)}
            </div>
            <div className="delta">
              {data.yearEndScenarioBalance >= data.yearEndBalance ? '+' : ''}
              {fmtEur(data.yearEndScenarioBalance - data.yearEndBalance)} vs base
            </div>
          </div>
        )}
        <div className="card kpi">
          <div className="label">Spese variabili medie / mese</div>
          <div className="value neg">{fmtEur(data.avgVariableExpense)}</div>
        </div>
        <div className="card kpi">
          <div className="label">Ricorrenze rilevate</div>
          <div className="value">{data.recurring.length}</div>
        </div>
      </div>

      <div className="card mb">
        <h3>Proiezione saldo e flussi mensili (tratteggiato = proiezione)</h3>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
            <YAxis stroke="#94a3b8" fontSize={12} />
            <Tooltip
              formatter={(v: number) => fmtEur(v)}
              contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
            />
            <Legend />
            <Bar dataKey="Entrate" fill="#34d39955" radius={[3, 3, 0, 0]} />
            <Bar dataKey="Uscite" fill="#f8717155" radius={[3, 3, 0, 0]} />
            <Line type="monotone" dataKey="Saldo" stroke="#38bdf8" strokeWidth={2.5} dot={{ r: 3 }} />
            {hasScenario && (
              <Line
                type="monotone"
                dataKey="Scenario"
                stroke="#fbbf24"
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={false}
              />
            )}
            {lastActualIdx >= 0 && lastActualIdx < 11 && (
              <ReferenceLine
                x={chartData[lastActualIdx].name}
                stroke="#94a3b8"
                strokeDasharray="4 4"
                label={{ value: 'oggi', fill: '#94a3b8', fontSize: 11 }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="grid mb" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="card">
          <h3>Simula uno scenario</h3>
          <p className="small muted">
            Aggiungi variazioni mensili: es. «-200» per una nuova spesa fissa, «+150» per un'entrata extra.
          </p>
          <div className="row wrap">
            <input
              placeholder="Descrizione (es. Rata auto)"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              style={{ width: 170 }}
            />
            <input
              placeholder="€/mese (±)"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              style={{ width: 90 }}
            />
            <select value={fromMonth} onChange={(e) => setFromMonth(Number(e.target.value))}>
              {MONTH_NAMES.map((m, i) => (
                <option key={i} value={i + 1}>
                  da {m}
                </option>
              ))}
            </select>
            <button className="btn small" onClick={addAdjustment}>
              Aggiungi
            </button>
          </div>
          {adjustments.length > 0 && (
            <table className="mt">
              <tbody>
                {adjustments.map((a) => (
                  <tr key={a.id}>
                    <td>{a.label}</td>
                    <td className="num">
                      <span className={a.monthlyAmount >= 0 ? 'pos' : 'neg'}>
                        {fmtEur(a.monthlyAmount)}/mese
                      </span>
                    </td>
                    <td className="muted small">da {MONTH_NAMES[a.fromMonth - 1]}</td>
                    <td>
                      <button
                        className="btn small secondary"
                        onClick={() => setAdjustments((list) => list.filter((x) => x.id !== a.id))}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h3>Movimenti ricorrenti rilevati (abbonamenti, stipendio, canoni)</h3>
          {data.recurring.length === 0 ? (
            <p className="muted small">
              Servono almeno 3 mesi di storico per rilevare le ricorrenze.
            </p>
          ) : (
            <div className="table-wrap" style={{ maxHeight: 300 }}>
              <table>
                <thead>
                  <tr>
                    <th>Voce</th>
                    <th className="num">Importo medio</th>
                    <th>Frequenza</th>
                    <th>Ultimo</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recurring.map((r) => (
                    <tr key={r.key}>
                      <td className="desc-cell" style={{ maxWidth: 220 }}>
                        {r.label}
                        {r.categoryName && <div className="small muted">{r.categoryName}</div>}
                      </td>
                      <td className={`num ${r.avgAmount >= 0 ? 'pos' : 'neg'}`}>{fmtEur(r.avgAmount)}</td>
                      <td className="small">{r.frequency === 'monthly' ? 'mensile' : 'settimanale'} · {r.occurrences}×</td>
                      <td className="mono small">{fmtDate(r.lastDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
