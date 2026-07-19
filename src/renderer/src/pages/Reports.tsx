import { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid
} from 'recharts'
import { TrendingDown, TrendingUp } from 'lucide-react'
import type { Account, YearReport } from '@shared/types'
import { api, fmtEur, MONTH_SHORT } from '@/api'
import { AccountAvatarSwitcher, CHART, CHART_TOOLTIP_STYLE } from '@/components'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

export default function Reports(): JSX.Element {
  const nowYear = new Date().getFullYear()
  const [year, setYear] = useState(nowYear)
  const [current, setCurrent] = useState<YearReport | null>(null)
  const [previous, setPrevious] = useState<YearReport | null>(null)
  const [metric, setMetric] = useState<'expense' | 'income'>('expense')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [accountId, setAccountId] = useState<number | null>(null)

  useEffect(() => {
    api.accountList().then((list) => {
      setAccounts(list)
      setAccountId((id) => id ?? list.find((a) => a.type === 'main')?.id ?? list[0]?.id ?? null)
    }).catch(() => undefined)
  }, [])

  useEffect(() => {
    if (accountId == null) return
    Promise.all([api.reportYear(year, accountId), api.reportYear(year - 1, accountId)])
      .then(([c, p]) => {
        setCurrent(c)
        setPrevious(p)
      })
      .catch(() => undefined)
  }, [year, accountId])

  if (!current || !previous) {
    return <div className="space-y-4"><Skeleton className="h-16 w-64" /><div className="grid grid-cols-3 gap-4">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-28" />)}</div><Skeleton className="h-80 w-full" /></div>
  }

  const sum = (a: number[]): number => a.reduce((x, y) => x + y, 0)
  const curSeries = metric === 'expense' ? current.expense : current.income
  const prevSeries = metric === 'expense' ? previous.expense : previous.income
  const curTotal = sum(curSeries)
  const prevTotal = sum(prevSeries)
  const deltaPct = prevTotal > 0 ? ((curTotal - prevTotal) / prevTotal) * 100 : null

  const chartData = MONTH_SHORT.map((m, i) => ({
    name: m,
    [year]: Math.round(curSeries[i] * 100) / 100,
    [year - 1]: Math.round(prevSeries[i] * 100) / 100
  }))

  // confronto per categoria (macro): unione delle categorie dei due anni
  const catMap = new Map<number, { name: string; color: string; cur: number; prev: number }>()
  for (const c of current.categories) {
    catMap.set(c.categoryId, { name: c.name, color: c.color, cur: c.total, prev: 0 })
  }
  for (const c of previous.categories) {
    const e = catMap.get(c.categoryId)
    if (e) e.prev = c.total
    else catMap.set(c.categoryId, { name: c.name, color: c.color, cur: 0, prev: c.total })
  }
  const catRows = [...catMap.values()].sort((a, b) => b.cur - a.cur)

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Report anno su anno</h1>
          <p className="text-sm text-muted-foreground">
            Confronto {year} rispetto a {year - 1} (trasferimenti esclusi)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <AccountAvatarSwitcher accounts={accounts} value={accountId} onChange={setAccountId} />
          <Tabs value={metric} onValueChange={(v) => setMetric(v as 'expense' | 'income')}>
            <TabsList>
              <TabsTrigger value="expense">Uscite</TabsTrigger>
              <TabsTrigger value="income">Entrate</TabsTrigger>
            </TabsList>
          </Tabs>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger size="sm" className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[0, 1, 2, 3].map((d) => (
                <SelectItem key={d} value={String(nowYear - d)}>
                  {nowYear - d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card className="gap-1 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Totale {year}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 text-2xl font-semibold tabular-nums">
            {fmtEur(curTotal)}
          </CardContent>
        </Card>
        <Card className="gap-1 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Totale {year - 1}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 text-2xl font-semibold tabular-nums">
            {fmtEur(prevTotal)}
          </CardContent>
        </Card>
        <Card className="gap-1 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Variazione
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            {deltaPct === null ? (
              <span className="text-2xl font-semibold text-muted-foreground">n/d</span>
            ) : (
              <span
                className={cn(
                  'flex items-center gap-1.5 text-2xl font-semibold tabular-nums',
                  // per le uscite crescere è negativo, per le entrate è positivo
                  (metric === 'expense' ? deltaPct <= 0 : deltaPct >= 0)
                    ? 'text-chart-income'
                    : 'text-chart-expense'
                )}
              >
                {deltaPct >= 0 ? <TrendingUp className="size-5" /> : <TrendingDown className="size-5" />}
                {deltaPct >= 0 ? '+' : ''}
                {deltaPct.toFixed(1)}%
              </span>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            {metric === 'expense' ? 'Uscite' : 'Entrate'} mensili: {year} vs {year - 1}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
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
              <Bar
                dataKey={String(year)}
                fill={metric === 'expense' ? CHART.expense : CHART.income}
                radius={[4, 4, 0, 0]}
                maxBarSize={20}
              />
              <Bar dataKey={String(year - 1)} fill="var(--muted-foreground)" fillOpacity={0.45} radius={[4, 4, 0, 0]} maxBarSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {metric === 'expense' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Spese per categoria: {year} vs {year - 1}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="text-right">{year}</TableHead>
                  <TableHead className="text-right">{year - 1}</TableHead>
                  <TableHead className="text-right">Differenza</TableHead>
                  <TableHead className="text-right">Variazione</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {catRows.map((c) => {
                  const diff = c.cur - c.prev
                  const pct = c.prev > 0 ? (diff / c.prev) * 100 : null
                  return (
                    <TableRow key={c.name}>
                      <TableCell>
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
                          style={{ backgroundColor: `${c.color}1f`, color: c.color }}
                        >
                          <span className="size-2 rounded-full" style={{ backgroundColor: c.color }} />
                          {c.name}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{fmtEur(c.cur)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtEur(c.prev)}</TableCell>
                      <TableCell
                        className={cn(
                          'text-right tabular-nums',
                          diff > 0 ? 'text-chart-expense' : 'text-chart-income'
                        )}
                      >
                        {diff >= 0 ? '+' : ''}
                        {fmtEur(diff)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {pct === null ? 'nuova' : `${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%`}
                      </TableCell>
                    </TableRow>
                  )
                })}
                {catRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      Nessuna spesa categorizzata nei due anni.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
