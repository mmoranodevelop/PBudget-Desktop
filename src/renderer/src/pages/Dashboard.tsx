import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowDownRight, ArrowUpRight, CircleDollarSign, FileUp, Landmark, PiggyBank, Plus, Wallet } from 'lucide-react'
import type { Account, Category, DashboardStats, Transaction } from '@shared/types'
import { api, fmtDate, fmtEur, MONTH_SHORT } from '@/api'
import { Amount, CategorySelect, CHART, CHART_TOOLTIP_STYLE, ModalShell } from '@/components'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'
import type { Page } from '@/App'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/toast'

function Metric({ label, value, hint, icon: Icon, tone, onClick }: { label: string; value: string; hint?: string; icon: typeof Wallet; tone?: 'income' | 'expense'; onClick?: () => void }): JSX.Element {
  return <Card onClick={onClick} className={`metric-card gap-3 py-5 ${onClick ? 'cursor-pointer transition-[transform,box-shadow] duration-150 ease-[var(--ease-out)] hover:-translate-y-0.5 active:scale-[0.99]' : ''}`}>
    <CardHeader className="flex-row items-center justify-between px-4"><CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</CardTitle><span className={`flex size-9 items-center justify-center rounded-xl ${tone === 'income' ? 'bg-chart-income/10 text-chart-income' : tone === 'expense' ? 'bg-chart-expense/10 text-chart-expense' : 'bg-primary/10 text-primary'}`}><Icon className="size-[18px]" /></span></CardHeader>
    <CardContent className="px-4"><div className={`text-2xl font-semibold tabular-nums ${tone === 'income' ? 'text-chart-income' : tone === 'expense' ? 'text-chart-expense' : ''}`}>{value}</div>{hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}</CardContent>
  </Card>
}

export default function Dashboard({ categories, onNavigate, onDataChange }: { categories: Category[]; onNavigate: (p: Page) => void; onDataChange: () => void }): JSX.Element {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [recent, setRecent] = useState<Transaction[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [year, setYear] = useState(new Date().getFullYear())
  const [transactionOpen, setTransactionOpen] = useState(false)
  const [balanceOpen, setBalanceOpen] = useState(false)
  const [type, setType] = useState<'expense' | 'income'>('expense')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [accountId, setAccountId] = useState<number | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [newAccountName, setNewAccountName] = useState('')
  const [newAccountType, setNewAccountType] = useState<Account['type']>('secondary')

  const load = (): void => {
    api.dashboard(year).then(setStats).catch(() => undefined)
    api.txList({ sortBy: 'dateReg', sortDir: 'desc', limit: 8 }).then((r) => setRecent(r.rows)).catch(() => undefined)
    api.accountList().then((r) => { setAccounts(r); setAccountId((id) => id ?? r.find((a) => a.type !== 'credit_card')?.id ?? null) }).catch(() => undefined)
  }
  useEffect(load, [year])

  const addTransaction = async (): Promise<void> => {
    const parsed = Number(amount.replace(',', '.'))
    if (!accountId || !date || !description.trim() || !Number.isFinite(parsed) || parsed <= 0) { setFormError('Inserisci conto, data, descrizione e un importo valido.'); return }
    await api.txCreate({ accountId, dateReg: date, description, amount: type === 'expense' ? -parsed : parsed, categoryId, notes: notes.trim() || null })
    setTransactionOpen(false); setDescription(''); setAmount(''); setNotes(''); setCategoryId(null); setFormError(null); load(); onDataChange(); toast.success('Movimento aggiunto', description.trim())
  }
  const saveBalances = async (): Promise<void> => { await Promise.all(accounts.map((a) => api.accountUpdate(a.id, { initialBalance: a.initialBalance, initialBalanceDate: a.initialBalanceDate }))); setBalanceOpen(false); load(); onDataChange(); toast.success('Saldi iniziali aggiornati') }
  const createAccount = async (): Promise<void> => {
    if (!newAccountName.trim()) return
    const account = await api.accountCreate({ name: newAccountName.trim(), iban: null, currency: 'EUR', type: newAccountType, color: '#0f766e', icon: newAccountType === 'credit_card' ? 'card' : 'landmark', initialBalance: 0, initialBalanceDate: null })
    setAccounts((xs) => [...xs, account]); setNewAccountName(''); toast.success('Fonte finanziaria creata', account.name)
  }
  if (!stats) return <div className="space-y-5"><Skeleton className="h-28 w-full" /><div className="grid grid-cols-2 gap-4 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-32" />)}</div><div className="grid gap-4 xl:grid-cols-2"><Skeleton className="h-80" /><Skeleton className="h-80" /></div></div>

  const month = MONTH_SHORT[stats.currentMonth - 1]
  const chart = stats.monthlySeries.map((m) => ({ name: MONTH_SHORT[m.month - 1], Entrate: m.income, Uscite: m.expense }))
  const saving = stats.ytdIncome - stats.ytdExpense
  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-border/80 bg-card/70 p-5 shadow-sm">
      <div><h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1><p className="mt-1 text-sm text-muted-foreground">La tua situazione finanziaria per l'anno {year}.</p></div>
      <div className="flex flex-wrap items-center gap-2"><Select value={String(year)} onValueChange={(v) => setYear(Number(v))}><SelectTrigger size="sm" className="w-24"><SelectValue /></SelectTrigger><SelectContent>{[0, 1, 2, 3].map((d) => { const value = new Date().getFullYear() - d; return <SelectItem key={value} value={String(value)}>{value}</SelectItem> })}</SelectContent></Select><Button variant="outline" size="sm" onClick={() => onNavigate('import')}><FileUp className="size-4" />Importa</Button><Button size="sm" onClick={() => setTransactionOpen(true)}><Plus className="size-4" />Aggiungi movimento</Button></div>
    </div>
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4"><Metric label="Saldo disponibile" value={fmtEur(stats.balance)} hint={stats.startingBalanceDate ? `Base ${fmtDate(stats.startingBalanceDate)} · modifica` : 'Imposta saldo iniziale'} icon={Wallet} onClick={() => setBalanceOpen(true)} /><Metric label={`Entrate ${month}`} value={fmtEur(stats.monthIncome)} hint={`YTD ${fmtEur(stats.ytdIncome)}`} icon={ArrowUpRight} tone="income" /><Metric label={`Uscite ${month}`} value={fmtEur(stats.monthExpense)} hint={`YTD ${fmtEur(stats.ytdExpense)}`} icon={ArrowDownRight} tone="expense" /><Metric label="Risparmio YTD" value={fmtEur(saving)} hint={`${Math.round(stats.savingsRate * 100)}% delle entrate`} icon={PiggyBank} tone={saving >= 0 ? 'income' : 'expense'} /></div>
    <div className="grid gap-4 xl:grid-cols-2"><Card><CardHeader><CardTitle className="text-sm">Entrate e uscite mensili</CardTitle></CardHeader><CardContent><ResponsiveContainer width="100%" height={250}><BarChart data={chart}><CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} /><XAxis dataKey="name" stroke={CHART.axis} fontSize={11} tickLine={false} axisLine={false} /><YAxis stroke={CHART.axis} fontSize={11} tickLine={false} axisLine={false} /><Tooltip formatter={(v: number) => fmtEur(v)} contentStyle={CHART_TOOLTIP_STYLE} /><Bar dataKey="Entrate" fill={CHART.income} radius={[4, 4, 0, 0]} /><Bar dataKey="Uscite" fill={CHART.expense} radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></CardContent></Card><Card><CardHeader><CardTitle className="text-sm">Andamento saldo {year}</CardTitle></CardHeader><CardContent>{stats.balanceSeries.length ? <ResponsiveContainer width="100%" height={250}><LineChart data={stats.balanceSeries}><CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} /><XAxis dataKey="date" tickFormatter={(v: string) => `${v.slice(8, 10)}/${v.slice(5, 7)}`} stroke={CHART.axis} fontSize={11} tickLine={false} axisLine={false} /><YAxis stroke={CHART.axis} fontSize={11} tickLine={false} axisLine={false} /><Tooltip formatter={(v: number) => fmtEur(v)} contentStyle={CHART_TOOLTIP_STYLE} /><Line dataKey="balance" stroke={CHART.balance} strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer> : <p className="py-20 text-center text-sm text-muted-foreground">Imposta un saldo iniziale o importa movimenti per vedere l'andamento.</p>}</CardContent></Card></div>
    <Card><CardHeader className="flex-row items-center justify-between"><CardTitle className="text-sm">Movimenti recenti</CardTitle><Button variant="ghost" size="sm" onClick={() => onNavigate('transactions')}>Vedi tutti</Button></CardHeader><CardContent>{recent.length ? <Table><TableBody>{recent.map((tx) => <TableRow key={tx.id}><TableCell className="w-28 whitespace-nowrap text-muted-foreground">{fmtDate(tx.dateReg)}</TableCell><TableCell className="max-w-96 truncate font-medium">{tx.description}</TableCell><TableCell className="text-right"><Amount value={tx.amount} /></TableCell></TableRow>)}</TableBody></Table> : <p className="py-5 text-sm text-muted-foreground">Ancora nessun movimento. Aggiungine uno o avvia il primo import.</p>}</CardContent></Card>
    {transactionOpen && <ModalShell title="Aggiungi movimento" description="Registra manualmente un'entrata o un'uscita." onClose={() => { setTransactionOpen(false); setFormError(null) }}><div className="grid grid-cols-2 gap-2 rounded-xl bg-muted p-1"><Button variant={type === 'expense' ? 'secondary' : 'ghost'} onClick={() => setType('expense')}>Uscita</Button><Button variant={type === 'income' ? 'secondary' : 'ghost'} onClick={() => setType('income')}>Entrata</Button></div><div className="grid grid-cols-2 gap-3"><label className="space-y-1 text-sm font-medium">Data<Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label><label className="space-y-1 text-sm font-medium">Importo<Input inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} /></label></div><label className="block space-y-1 text-sm font-medium">Descrizione<Input placeholder="es. Supermercato" value={description} onChange={(e) => setDescription(e.target.value)} /></label><label className="block space-y-1 text-sm font-medium">Conto<Select value={accountId != null ? String(accountId) : ''} onValueChange={(v) => setAccountId(Number(v))}><SelectTrigger><SelectValue placeholder="Scegli conto" /></SelectTrigger><SelectContent>{accounts.filter((a) => a.type !== 'credit_card').map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}</SelectContent></Select></label><label className="block space-y-1 text-sm font-medium">Categoria<CategorySelect categories={categories} value={categoryId} onChange={setCategoryId} emptyLabel="Facoltativa" className="w-full" /></label><label className="block space-y-1 text-sm font-medium">Note<Input placeholder="Facoltative" value={notes} onChange={(e) => setNotes(e.target.value)} /></label>{formError && <p className="text-sm text-destructive">{formError}</p>}<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setTransactionOpen(false)}>Annulla</Button><Button onClick={addTransaction}><Plus className="size-4" />Salva movimento</Button></div></ModalShell>}
    {balanceOpen && <ModalShell title="Conti e saldo iniziale" description="Imposta il saldo reale a una data e aggiungi conti o carte per i prossimi import." onClose={() => setBalanceOpen(false)} wide><div className="space-y-3">{accounts.filter((a) => a.type !== 'credit_card').map((account) => <div key={account.id} className="grid gap-2 rounded-xl border p-3 sm:grid-cols-[1fr_10rem_10rem]"><div><p className="font-medium">{account.name}</p><p className="text-xs text-muted-foreground">{account.type === 'main' ? 'Conto principale' : 'Conto secondario'}</p></div><Input type="date" value={account.initialBalanceDate ?? ''} onChange={(e) => setAccounts((xs) => xs.map((a) => a.id === account.id ? { ...a, initialBalanceDate: e.target.value || null } : a))} /><Input inputMode="decimal" value={String(account.initialBalance)} onChange={(e) => setAccounts((xs) => xs.map((a) => a.id === account.id ? { ...a, initialBalance: Number(e.target.value.replace(',', '.')) || 0 } : a))} /></div>)}</div><div className="mt-4 grid gap-2 rounded-xl border border-dashed p-3 sm:grid-cols-[1fr_12rem_auto]"><Input value={newAccountName} placeholder="Nome conto o carta" onChange={(e) => setNewAccountName(e.target.value)} /><Select value={newAccountType} onValueChange={(v) => setNewAccountType(v as Account['type'])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="secondary">Conto secondario</SelectItem><SelectItem value="credit_card">Carta di credito</SelectItem></SelectContent></Select><Button variant="outline" onClick={createAccount}><Landmark className="size-4" />Aggiungi</Button></div><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setBalanceOpen(false)}>Annulla</Button><Button onClick={saveBalances}><CircleDollarSign className="size-4" />Salva saldo iniziale</Button></div></ModalShell>}
  </div>
}
