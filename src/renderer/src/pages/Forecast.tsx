import { useCallback, useEffect, useState } from 'react'
import {
  ComposedChart, Line, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
  ReferenceLine
} from 'recharts'
import { CalendarClock, Plus, Repeat, X } from 'lucide-react'
import type { ForecastResult, ScenarioAdjustment } from '@shared/types'
import { api, fmtEur, fmtDate, MONTH_NAMES } from '@/api'
import { CHART, CHART_TOOLTIP_STYLE } from '@/components'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

export default function Forecast(): JSX.Element {
  const now = new Date()
  const [year] = useState(now.getFullYear())
  const [adjustments, setAdjustments] = useState<ScenarioAdjustment[]>([])
  const [data, setData] = useState<ForecastResult | null>(null)
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')
  const [fromMonth, setFromMonth] = useState(now.getMonth() + 1)

  const load = useCallback(() => {
    api.forecast(year, adjustments).then(setData).catch(() => undefined)
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

  if (!data) {
    return <div className="space-y-4"><Skeleton className="h-16 w-72" /><div className="grid grid-cols-2 gap-4 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-28" />)}</div><Skeleton className="h-80 w-full" /></div>
  }

  const chartData = data.months.map((m) => ({
    name: m.label,
    Entrate: m.income,
    Uscite: m.expense,
    Saldo: m.balance,
    Scenario: m.scenarioBalance
  }))
  const lastActualIdx = data.months.reduce((a, m, i) => (m.isActual ? i : a), -1)
  const hasScenario = adjustments.length > 0
  const delta = data.yearEndScenarioBalance - data.yearEndBalance

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Proiezioni e Scenari {year}</h1>
        <p className="text-sm text-muted-foreground">
          Proiezione basata sui movimenti ricorrenti rilevati e sulla media delle spese variabili degli
          ultimi 3 mesi.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Card className="gap-1 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Saldo previsto a fine anno
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 text-2xl font-semibold tabular-nums">
            {fmtEur(data.yearEndBalance)}
          </CardContent>
        </Card>
        {hasScenario && (
          <Card className="gap-1 py-4">
            <CardHeader className="px-4">
              <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Fine anno con scenario
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4">
              <div
                className={cn(
                  'text-2xl font-semibold tabular-nums',
                  delta >= 0 ? 'text-chart-income' : 'text-chart-expense'
                )}
              >
                {fmtEur(data.yearEndScenarioBalance)}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {delta >= 0 ? '+' : ''}
                {fmtEur(delta)} rispetto al caso base
              </p>
            </CardContent>
          </Card>
        )}
        <Card className="gap-1 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Spese variabili medie al mese
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 text-2xl font-semibold tabular-nums text-chart-expense">
            {fmtEur(data.avgVariableExpense)}
          </CardContent>
        </Card>
        <Card className="gap-1 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Ricorrenze rilevate
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 text-2xl font-semibold tabular-nums">
            {data.recurring.length}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            Proiezione saldo e flussi mensili (tratteggiato = scenario)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={chartData} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="name" stroke={CHART.axis} fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke={CHART.axis} fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip formatter={(v: number) => fmtEur(v)} contentStyle={CHART_TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Entrate" fill={CHART.income} fillOpacity={0.4} radius={[4, 4, 0, 0]} maxBarSize={20} />
              <Bar dataKey="Uscite" fill={CHART.expense} fillOpacity={0.4} radius={[4, 4, 0, 0]} maxBarSize={20} />
              <Line type="monotone" dataKey="Saldo" stroke={CHART.balance} strokeWidth={2.5} dot={{ r: 3 }} />
              {hasScenario && (
                <Line
                  type="monotone"
                  dataKey="Scenario"
                  stroke={CHART.scenario}
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={false}
                />
              )}
              {lastActualIdx >= 0 && lastActualIdx < 11 && (
                <ReferenceLine
                  x={chartData[lastActualIdx].name}
                  stroke={CHART.axis}
                  strokeDasharray="4 4"
                  label={{ value: 'oggi', fill: CHART.axis, fontSize: 11 }}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <CalendarClock className="size-4" />
              Simula uno scenario
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Aggiungi variazioni mensili: ad esempio -200 per una nuova spesa fissa, +150 per
              un'entrata extra.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                placeholder="Descrizione (es. Rata auto)"
                className="h-8 w-44"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
              <Input
                placeholder="€/mese"
                className="h-8 w-24"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <Select value={String(fromMonth)} onValueChange={(v) => setFromMonth(Number(v))}>
                <SelectTrigger size="sm" className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTH_NAMES.map((m, i) => (
                    <SelectItem key={i} value={String(i + 1)}>
                      da {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" onClick={addAdjustment}>
                <Plus className="size-4" />
                Aggiungi
              </Button>
            </div>
            {adjustments.length > 0 && (
              <Table>
                <TableBody>
                  {adjustments.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>{a.label}</TableCell>
                      <TableCell
                        className={cn(
                          'text-right tabular-nums',
                          a.monthlyAmount >= 0 ? 'text-chart-income' : 'text-chart-expense'
                        )}
                      >
                        {fmtEur(a.monthlyAmount)}/mese
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        da {MONTH_NAMES[a.fromMonth - 1]}
                      </TableCell>
                      <TableCell className="w-10">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setAdjustments((list) => list.filter((x) => x.id !== a.id))}
                        >
                          <X className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Repeat className="size-4" />
              Movimenti ricorrenti rilevati
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.recurring.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Servono almeno 3 mesi di storico per rilevare le ricorrenze.
              </p>
            ) : (
              <div className="max-h-72 overflow-y-auto rounded-md border">
                <Table>
                  <TableHeader className="sticky top-0 bg-card">
                    <TableRow>
                      <TableHead>Voce</TableHead>
                      <TableHead className="text-right">Importo medio</TableHead>
                      <TableHead>Frequenza</TableHead>
                      <TableHead>Ultimo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.recurring.map((r) => (
                      <TableRow key={r.key}>
                        <TableCell className="max-w-52">
                          <div className="truncate font-medium">{r.label}</div>
                          {r.categoryName && (
                            <div className="text-xs text-muted-foreground">{r.categoryName}</div>
                          )}
                        </TableCell>
                        <TableCell
                          className={cn(
                            'text-right tabular-nums',
                            r.avgAmount >= 0 ? 'text-chart-income' : 'text-chart-expense'
                          )}
                        >
                          {fmtEur(r.avgAmount)}
                        </TableCell>
                        <TableCell className="text-xs">
                          {r.frequency === 'monthly' ? 'mensile' : 'settimanale'} · {r.occurrences} volte
                        </TableCell>
                        <TableCell className="text-xs tabular-nums">{fmtDate(r.lastDate)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
