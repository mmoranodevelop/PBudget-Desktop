import { useCallback, useEffect, useState } from 'react'
import { CalendarRange, Copy, Plus, Trash2 } from 'lucide-react'
import type { BudgetVsActual, Category } from '@shared/types'
import { api, fmtEur, MONTH_NAMES, MONTH_SHORT } from '@/api'
import { BudgetBar, CategorySelect, ModalShell } from '@/components'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/toast'
import { Skeleton } from '@/components/ui/skeleton'

export default function Budget({ categories }: { categories: Category[] }): JSX.Element {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [rows, setRows] = useState<BudgetVsActual[]>([])
  const [addCat, setAddCat] = useState<number | null>(null)
  const [addAmount, setAddAmount] = useState('')
  const [detail, setDetail] = useState<BudgetVsActual | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    api.budgetVsActual(year, month).then((result) => { setRows(result); setLoading(false) }).catch(() => undefined)
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
    toast.success('Budget aggiunto')
  }

  const copyFromActual = async (): Promise<void> => {
    setBusy(true)
    try {
      await api.budgetCopyFromActual(year, year - 1)
      load()
      toast.success('Budget copiato', `Valori ricavati dai movimenti del ${year - 1}.`)
    } finally {
      setBusy(false)
    }
  }

  const setMonthly = async (categoryId: number, m: number, value: string): Promise<void> => {
    const amount = Number(value.replace(',', '.'))
    if (!isFinite(amount) || amount < 0) return
    await api.budgetSet(year, categoryId, m, amount)
    const updated = await api.budgetVsActual(year, month)
    setRows(updated)
    if (detail) setDetail(updated.find((r) => r.categoryId === detail.categoryId) ?? null)
  }

  const removeLine = async (categoryId: number): Promise<void> => {
    await api.budgetSet(year, categoryId, null, 0)
    for (let m = 1; m <= 12; m++) await api.budgetSet(year, categoryId, m, 0)
    setDetail(null)
    load()
    toast.success('Budget eliminato')
  }

  if (loading) return <div className="space-y-4"><Skeleton className="h-16 w-72" /><div className="grid grid-cols-3 gap-4"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div><Skeleton className="h-80 w-full" /></div>

  const totalBudget = rows.reduce((a, r) => a + r.budgetYear, 0)
  const totalActual = rows.reduce((a, r) => a + r.actualYear, 0)

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Budget {year}</h1>
          <p className="text-sm text-muted-foreground">
            Budget annuale con dettaglio mensile. Il budget su una macro-categoria aggrega le
            sottocategorie (cluster).
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger size="sm" className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTH_NAMES.map((m, i) => (
                <SelectItem key={i} value={String(i + 1)}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger size="sm" className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 0, -1].map((d) => {
                const y = now.getFullYear() + d
                return (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card className="gap-1 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Budget annuale totale
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 text-2xl font-semibold tabular-nums">
            {fmtEur(totalBudget)}
          </CardContent>
        </Card>
        <Card className="gap-1 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Speso finora
            </CardTitle>
          </CardHeader>
          <CardContent
            className={cn(
              'px-4 text-2xl font-semibold tabular-nums',
              totalActual > totalBudget && 'text-chart-expense'
            )}
          >
            {fmtEur(totalActual)}
          </CardContent>
        </Card>
        <Card className="gap-1 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Residuo
            </CardTitle>
          </CardHeader>
          <CardContent
            className={cn(
              'px-4 text-2xl font-semibold tabular-nums',
              totalBudget - totalActual >= 0 ? 'text-chart-income' : 'text-chart-expense'
            )}
          >
            {fmtEur(totalBudget - totalActual)}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <CategorySelect
          categories={categories.filter((c) => c.type === 'expense')}
          value={addCat}
          onChange={setAddCat}
          emptyLabel="Scegli categoria o cluster"
        />
        <Input
          placeholder="Budget annuale €"
          className="h-8 w-36"
          value={addAmount}
          onChange={(e) => setAddAmount(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addLine()}
        />
        <Button size="sm" onClick={addLine} disabled={addCat == null || !addAmount}>
          <Plus className="size-4" />
          Aggiungi budget
        </Button>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={copyFromActual} disabled={busy}>
          <Copy className="size-4" />
          Copia da spese {year - 1}
        </Button>
      </div>

      <div className="overflow-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Categoria / Cluster</TableHead>
              <TableHead className="text-right">Budget {MONTH_SHORT[month - 1]}</TableHead>
              <TableHead className="text-right">Speso {MONTH_SHORT[month - 1]}</TableHead>
              <TableHead>Mese</TableHead>
              <TableHead className="text-right">Budget anno</TableHead>
              <TableHead className="text-right">Speso anno</TableHead>
              <TableHead>Anno</TableHead>
              <TableHead className="w-28" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.categoryId}>
                <TableCell>
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
                    style={{ backgroundColor: `${r.color}1f`, color: r.color }}
                  >
                    <span className="size-2 rounded-full" style={{ backgroundColor: r.color }} />
                    {r.categoryName}
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums">{fmtEur(r.budgetMonth)}</TableCell>
                <TableCell
                  className={cn(
                    'text-right tabular-nums',
                    r.actualMonth > r.budgetMonth && r.budgetMonth > 0 && 'text-chart-expense'
                  )}
                >
                  {fmtEur(r.actualMonth)}
                </TableCell>
                <TableCell>
                  <BudgetBar actual={r.actualMonth} budget={r.budgetMonth} />
                </TableCell>
                <TableCell className="text-right tabular-nums">{fmtEur(r.budgetYear)}</TableCell>
                <TableCell
                  className={cn(
                    'text-right tabular-nums',
                    r.actualYear > r.budgetYear && 'text-chart-expense'
                  )}
                >
                  {fmtEur(r.actualYear)}
                </TableCell>
                <TableCell>
                  <BudgetBar actual={r.actualYear} budget={r.budgetYear} />
                </TableCell>
                <TableCell>
                  <Button variant="outline" size="sm" onClick={() => setDetail(r)}>
                    <CalendarRange className="size-3.5" />
                    Mensilizza
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  Nessun budget definito per il {year}. Aggiungi una categoria qui sopra, oppure copia
                  dalle spese dell'anno precedente.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {detail && (
        <ModalShell
          title={`Budget mensile — ${detail.categoryName} (${year})`}
          description="Lascia il valore proposto (budget annuale diviso 12) o personalizza i singoli mesi."
          onClose={() => setDetail(null)}
          wide
        >
          <div className="grid grid-cols-3 gap-3">
            {detail.monthly.map((m) => (
              <div key={m.month} className="space-y-1">
                <Label className="text-xs text-muted-foreground">{MONTH_NAMES[m.month - 1]}</Label>
                <Input
                  className="h-8"
                  defaultValue={m.budget.toFixed(2)}
                  onBlur={(e) => setMonthly(detail.categoryId, m.month, e.target.value)}
                />
                <p className="text-xs text-muted-foreground">speso: {fmtEur(m.actual)}</p>
              </div>
            ))}
          </div>
          <div className="flex justify-between pt-2">
            <Button variant="destructive" onClick={() => removeLine(detail.categoryId)}>
              <Trash2 className="size-4" />
              Rimuovi budget
            </Button>
            <Button onClick={() => setDetail(null)}>Chiudi</Button>
          </div>
        </ModalShell>
      )}
    </div>
  )
}
