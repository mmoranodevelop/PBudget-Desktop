import { useEffect, useState } from 'react'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend, CartesianGrid
} from 'recharts'
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, CloudDownload, FileUp, PiggyBank,
  Tags, Upload, Wallet, Loader2, FileSpreadsheet
} from 'lucide-react'
import type { DashboardStats, GDriveFile, ImportAnalysis, ImportFileInfo } from '@shared/types'
import { api, fmtEur, MONTH_SHORT } from '../api'
import { CHART, CHART_TOOLTIP_STYLE, ModalShell } from '../components'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import type { Page } from '../App'

function KpiCard({
  label, value, sub, icon: Icon, tone
}: {
  label: string
  value: string
  sub?: string
  icon: React.ComponentType<{ className?: string }>
  tone?: 'income' | 'expense' | 'neutral'
}): JSX.Element {
  return (
    <Card className="gap-2 py-4">
      <CardHeader className="flex-row items-center justify-between px-4">
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </CardTitle>
        <Icon className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="px-4">
        <div
          className={cn(
            'text-2xl font-semibold tabular-nums',
            tone === 'income' && 'text-chart-income',
            tone === 'expense' && 'text-chart-expense'
          )}
        >
          {value}
        </div>
        {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  )
}

export default function Dashboard({
  onImportClick, onImportFile, onImportAnalysis, onNavigate, onError
}: {
  onImportClick: () => void
  onImportFile: (f: File) => void
  onImportAnalysis: (a: ImportAnalysis) => void
  onNavigate: (p: Page) => void
  onError: (msg: string) => void
}): JSX.Element {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [history, setHistory] = useState<ImportFileInfo[]>([])
  const [year, setYear] = useState(new Date().getFullYear())
  const [dragOver, setDragOver] = useState(false)
  const [drivePicker, setDrivePicker] = useState<GDriveFile[] | null>(null)
  const [driveBusy, setDriveBusy] = useState(false)

  useEffect(() => {
    api.dashboard(year).then(setStats).catch(console.error)
    api.importHistory().then(setHistory).catch(console.error)
  }, [year])

  const openDrive = async (): Promise<void> => {
    setDriveBusy(true)
    try {
      const status = await api.gdriveStatus()
      if (!status.configured) {
        onError('Google Drive non configurato: vai in Impostazioni e inserisci il Client ID Google.')
        return
      }
      if (!status.connected) {
        await api.gdriveConnect()
      }
      setDrivePicker(await api.gdriveListFiles())
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e))
    } finally {
      setDriveBusy(false)
    }
  }

  const pickDriveFile = async (f: GDriveFile): Promise<void> => {
    setDriveBusy(true)
    try {
      const analysis = await api.gdriveImport(f.id, f.name)
      setDrivePicker(null)
      onImportAnalysis(analysis)
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e))
    } finally {
      setDriveBusy(false)
    }
  }

  if (!stats) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Caricamento…
      </div>
    )
  }

  const monthName = MONTH_SHORT[stats.currentMonth - 1]
  const chartData = stats.monthlySeries.map((m) => ({
    name: MONTH_SHORT[m.month - 1],
    Entrate: Math.round(m.income * 100) / 100,
    Uscite: Math.round(m.expense * 100) / 100
  }))
  const savings = stats.ytdIncome - stats.ytdExpense

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Panoramica dell'anno {year}</p>
        </div>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger size="sm" className="w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[0, 1, 2, 3].map((d) => {
              const y = new Date().getFullYear() - d
              return (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>
      </div>

      {stats.budgetAlerts.length > 0 && (
        <Alert className="border-chart-scenario/40 [&>svg]:text-chart-scenario">
          <AlertTriangle />
          <AlertTitle>Budget superato a {monthName}</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-2">
            <span>
              {stats.budgetAlerts
                .map((a) => `${a.categoryName} (${fmtEur(a.actual)} su ${fmtEur(a.budget)})`)
                .join(' · ')}
            </span>
            <Button variant="outline" size="sm" onClick={() => onNavigate('budget')}>
              Vai al budget
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {stats.uncategorizedCount > 0 && (
        <Alert>
          <Tags />
          <AlertDescription className="flex flex-wrap items-center gap-2">
            <span>{stats.uncategorizedCount} movimenti da categorizzare.</span>
            <Button variant="outline" size="sm" onClick={() => onNavigate('transactions')}>
              Categorizza
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <KpiCard label="Saldo" value={fmtEur(stats.balance)} icon={Wallet} />
        <KpiCard
          label={`Entrate ${monthName}`}
          value={fmtEur(stats.monthIncome)}
          sub={`YTD ${fmtEur(stats.ytdIncome)}`}
          icon={ArrowUpRight}
          tone="income"
        />
        <KpiCard
          label={`Uscite ${monthName}`}
          value={fmtEur(stats.monthExpense)}
          sub={`YTD ${fmtEur(stats.ytdExpense)}`}
          icon={ArrowDownRight}
          tone="expense"
        />
        <KpiCard
          label="Risparmio YTD"
          value={fmtEur(savings)}
          sub={`${Math.round(stats.savingsRate * 100)}% delle entrate`}
          icon={PiggyBank}
          tone={savings >= 0 ? 'income' : 'expense'}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">Entrate e uscite mensili</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartData} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
                <XAxis dataKey="name" stroke={CHART.axis} fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke={CHART.axis} fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  formatter={(v: number) => fmtEur(v)}
                  contentStyle={CHART_TOOLTIP_STYLE}
                  cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Entrate" fill={CHART.income} radius={[4, 4, 0, 0]} maxBarSize={22} />
                <Bar dataKey="Uscite" fill={CHART.expense} radius={[4, 4, 0, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Top categorie di spesa {year}</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.topCategories.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nessuna spesa categorizzata.</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={stats.topCategories}
                    dataKey="amount"
                    nameKey="name"
                    innerRadius={52}
                    outerRadius={84}
                    paddingAngle={2}
                    stroke="var(--card)"
                    strokeWidth={2}
                  >
                    {stats.topCategories.map((c) => (
                      <Cell key={c.categoryId} fill={c.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => fmtEur(v)} contentStyle={CHART_TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Andamento saldo {year}</CardTitle>
        </CardHeader>
        <CardContent>
          {stats.balanceSeries.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessun movimento nell'anno selezionato.</p>
          ) : (
            <ResponsiveContainer width="100%" height={190}>
              <LineChart data={stats.balanceSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke={CHART.axis}
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`}
                />
                <YAxis stroke={CHART.axis} fontSize={11} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
                <Tooltip formatter={(v: number) => fmtEur(v)} contentStyle={CHART_TOOLTIP_STYLE} />
                <Line
                  type="monotone"
                  dataKey="balance"
                  name="Saldo"
                  stroke={CHART.balance}
                  dot={false}
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card
          className={cn(
            'border-dashed transition-colors',
            dragOver && 'border-ring bg-accent/40'
          )}
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
          <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <Upload className="size-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              Trascina qui un estratto conto (CSV, XLS, XLSX)
            </p>
            <div className="flex gap-2">
              <Button onClick={onImportClick}>
                <FileUp className="size-4" />
                Scegli file
              </Button>
              <Button variant="outline" onClick={openDrive} disabled={driveBusy}>
                {driveBusy ? <Loader2 className="size-4 animate-spin" /> : <CloudDownload className="size-4" />}
                Da Google Drive
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Ultimi import</CardTitle>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nessun import ancora effettuato.</p>
            ) : (
              <Table>
                <TableBody>
                  {history.slice(0, 6).map((h) => (
                    <TableRow key={h.id}>
                      <TableCell className="max-w-52 truncate font-medium">{h.filename}</TableCell>
                      <TableCell className="text-muted-foreground">{h.importedAt.slice(0, 10)}</TableCell>
                      <TableCell className="text-right text-xs">
                        <span className="text-chart-income">{h.rowsImported} importate</span>
                        {h.rowsSkipped > 0 && (
                          <span className="text-muted-foreground"> · {h.rowsSkipped} saltate</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {drivePicker && (
        <ModalShell
          title="Importa da Google Drive"
          description="File CSV/Excel più recenti nel tuo Drive"
          onClose={() => setDrivePicker(null)}
          wide
        >
          {drivePicker.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessun file CSV/Excel trovato su Drive.</p>
          ) : (
            <div className="max-h-80 overflow-y-auto rounded-md border">
              <Table>
                <TableBody>
                  {drivePicker.map((f) => (
                    <TableRow
                      key={f.id}
                      className="cursor-pointer"
                      onClick={() => !driveBusy && pickDriveFile(f)}
                    >
                      <TableCell>
                        <span className="flex items-center gap-2">
                          <FileSpreadsheet className="size-4 text-muted-foreground" />
                          <span className="max-w-72 truncate font-medium">{f.name}</span>
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {f.modifiedTime.slice(0, 10)}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {f.size > 0 ? `${Math.max(1, Math.round(f.size / 1024))} KB` : ''}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </ModalShell>
      )}
    </div>
  )
}
