import { useEffect, useState } from 'react'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend, CartesianGrid
} from 'recharts'
import type { Category, DashboardStats, ImportFileInfo } from '@shared/types'
import { api, fmtEur, MONTH_SHORT } from '../api'
import type { Page } from '../App'

export default function Dashboard({
  categories, onImportClick, onImportFile, onNavigate
}: {
  categories: Category[]
  onImportClick: () => void
  onImportFile: (f: File) => void
  onNavigate: (p: Page) => void
}): JSX.Element {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [history, setHistory] = useState<ImportFileInfo[]>([])
  const [year, setYear] = useState(new Date().getFullYear())
  const [dragOver, setDragOver] = useState(false)

  useEffect(() => {
    api.dashboard(year).then(setStats).catch(console.error)
    api.importHistory().then(setHistory).catch(console.error)
  }, [year])

  if (!stats) return <p className="muted">Caricamento…</p>

  const monthName = MONTH_SHORT[stats.currentMonth - 1]
  const chartData = stats.monthlySeries.map((m) => ({
    name: MONTH_SHORT[m.month - 1],
    Entrate: Math.round(m.income * 100) / 100,
    Uscite: Math.round(m.expense * 100) / 100
  }))

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-sub">Panoramica dell'anno {year}</p>
        </div>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {[0, 1, 2, 3].map((d) => {
            const y = new Date().getFullYear() - d
            return (
              <option key={y} value={y}>
                {y}
              </option>
            )
          })}
        </select>
      </div>

      {stats.budgetAlerts.length > 0 && (
        <div className="banner warn">
          ⚠️ <b>Budget superato a {monthName}:</b>{' '}
          {stats.budgetAlerts
            .map((a) => `${a.categoryName} (${fmtEur(a.actual)} su ${fmtEur(a.budget)})`)
            .join(' · ')}{' '}
          <button className="btn small secondary" onClick={() => onNavigate('budget')}>
            Vai al budget
          </button>
        </div>
      )}
      {stats.uncategorizedCount > 0 && (
        <div className="banner info">
          🏷️ {stats.uncategorizedCount} movimenti da categorizzare.{' '}
          <button className="btn small secondary" onClick={() => onNavigate('transactions')}>
            Categorizza
          </button>
        </div>
      )}

      <div className="grid kpi-row mb">
        <div className="card kpi">
          <div className="label">Saldo</div>
          <div className="value">{fmtEur(stats.balance)}</div>
        </div>
        <div className="card kpi">
          <div className="label">Entrate {monthName}</div>
          <div className="value pos">{fmtEur(stats.monthIncome)}</div>
          <div className="delta">YTD {fmtEur(stats.ytdIncome)}</div>
        </div>
        <div className="card kpi">
          <div className="label">Uscite {monthName}</div>
          <div className="value neg">{fmtEur(stats.monthExpense)}</div>
          <div className="delta">YTD {fmtEur(stats.ytdExpense)}</div>
        </div>
        <div className="card kpi">
          <div className="label">Risparmio YTD</div>
          <div className={`value ${stats.ytdIncome - stats.ytdExpense >= 0 ? 'pos' : 'neg'}`}>
            {fmtEur(stats.ytdIncome - stats.ytdExpense)}
          </div>
          <div className="delta">{Math.round(stats.savingsRate * 100)}% delle entrate</div>
        </div>
      </div>

      <div className="grid mb" style={{ gridTemplateColumns: '2fr 1fr' }}>
        <div className="card">
          <h3>Entrate e uscite mensili</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
              <YAxis stroke="#94a3b8" fontSize={12} />
              <Tooltip
                formatter={(v: number) => fmtEur(v)}
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
              />
              <Legend />
              <Bar dataKey="Entrate" fill="#34d399" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Uscite" fill="#f87171" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <h3>Top categorie di spesa {year}</h3>
          {stats.topCategories.length === 0 ? (
            <p className="muted small">Nessuna spesa categorizzata.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={stats.topCategories}
                  dataKey="amount"
                  nameKey="name"
                  innerRadius={50}
                  outerRadius={85}
                  paddingAngle={2}
                >
                  {stats.topCategories.map((c) => (
                    <Cell key={c.categoryId} fill={c.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number) => fmtEur(v)}
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="card mb">
        <h3>Andamento saldo {year}</h3>
        {stats.balanceSeries.length === 0 ? (
          <p className="muted small">Nessun movimento nell'anno selezionato.</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={stats.balanceSeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis
                dataKey="date"
                stroke="#94a3b8"
                fontSize={11}
                tickFormatter={(d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`}
              />
              <YAxis stroke="#94a3b8" fontSize={12} domain={['auto', 'auto']} />
              <Tooltip
                formatter={(v: number) => fmtEur(v)}
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
              />
              <Line type="monotone" dataKey="balance" name="Saldo" stroke="#38bdf8" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div
          className={`card dropzone ${dragOver ? 'over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            const f = e.dataTransfer.files[0]
            if (f) onImportFile(f)
          }}
        >
          <p style={{ fontSize: 28, margin: '0 0 6px' }}>📥</p>
          <p style={{ margin: '0 0 10px' }}>
            Trascina qui un estratto conto (CSV / XLS / XLSX) oppure
          </p>
          <button className="btn" onClick={onImportClick}>
            Scegli file…
          </button>
        </div>
        <div className="card">
          <h3>Ultimi import</h3>
          {history.length === 0 ? (
            <p className="muted small">Nessun import ancora effettuato.</p>
          ) : (
            <table>
              <tbody>
                {history.slice(0, 6).map((h) => (
                  <tr key={h.id}>
                    <td className="desc-cell" style={{ maxWidth: 220 }}>{h.filename}</td>
                    <td className="muted small">{h.importedAt.slice(0, 10)}</td>
                    <td className="num small">
                      <span className="pos">{h.rowsImported}</span> importate
                      {h.rowsSkipped > 0 && <span className="muted"> · {h.rowsSkipped} saltate</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
