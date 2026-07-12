import { useEffect, useState } from 'react'
import { AlertTriangle, Loader2, Plus, Save, Trash2 } from 'lucide-react'
import type { Account } from '@shared/types'
import { api } from '@/api'
import { ACCOUNT_ICON_OPTIONS, AccountIcon } from '@/components/account-icon'
import { ModalShell } from '@/components'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

const COLORS = ['#0f766e', '#2563eb', '#7c3aed', '#d97706', '#d94645', '#db2777', '#475569']

export default function Accounts(): JSX.Element {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState<Account['type']>('secondary')
  const [color, setColor] = useState('#0f766e')
  const [icon, setIcon] = useState('landmark')

  const load = async (): Promise<void> => {
    try { setAccounts(await api.accountList()) } finally { setLoading(false) }
  }
  useEffect(() => { load().catch(() => undefined) }, [])

  const resetCreate = (): void => { setName(''); setType('secondary'); setColor('#0f766e'); setIcon('landmark') }
  const create = async (): Promise<void> => {
    if (!name.trim()) return
    setCreating(true)
    try {
      const account = await api.accountCreate({ name: name.trim(), iban: null, currency: 'EUR', type, color, icon, initialBalance: 0, initialBalanceDate: null })
      setAccounts((current) => [...current, account])
      setCreateOpen(false); resetCreate()
      toast.success(type === 'credit_card' ? 'Carta creata' : 'Conto creato', `${account.name} è pronto per i prossimi import.`)
    } finally { setCreating(false) }
  }
  const save = async (account: Account): Promise<void> => {
    setBusyId(account.id)
    try {
      const persisted = await api.accountUpdate(account.id, account)
      setAccounts((current) => current.map((item) => item.id === persisted.id ? persisted : item))
      toast.success('Modifiche salvate', `Icona, colore e dati di ${persisted.name} sono aggiornati.`)
    } finally { setBusyId(null) }
  }
  const remove = async (): Promise<void> => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const result = await api.accountDelete(deleteTarget.id)
      setAccounts((current) => current.filter((item) => item.id !== deleteTarget.id))
      toast.success('Conto eliminato', `${result.transactionsDeleted} movimenti e ${result.importsDeleted} import rimossi.`)
      setDeleteTarget(null)
    } finally { setDeleting(false) }
  }

  return <div className="mx-auto max-w-5xl space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-semibold tracking-tight">Conti e carte</h1><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Gestisci identità visiva, saldo iniziale e dati associati a ogni fonte finanziaria.</p></div>
      <Button onClick={() => setCreateOpen(true)}><Plus />Nuovo conto o carta</Button>
    </header>
    <Card>
      <CardHeader><CardTitle className="text-base">Fonti finanziarie</CardTitle><CardDescription>Il colore e l'icona scelti identificano i movimenti in tutta l'app.</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-3">
        {loading && Array.from({ length: 2 }, (_, index) => <div key={index} className="flex gap-3 rounded-xl border p-4"><Skeleton className="size-10" /><div className="flex-1"><Skeleton className="h-4 w-40" /><Skeleton className="mt-2 h-8 w-full" /></div></div>)}
        {!loading && accounts.length === 0 && <div className="py-10 text-center"><p className="font-medium">Nessun conto configurato</p><p className="mt-1 text-sm text-muted-foreground">Crea il primo conto per importare o registrare movimenti.</p></div>}
        {accounts.map((account) => <section key={account.id} className="rounded-xl border border-border/80 p-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(18rem,1fr)_10rem_10rem_auto]">
            <div className="min-w-0">
              <div className="flex items-center gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: `${account.color}1f`, color: account.color }}><AccountIcon icon={account.icon} className="size-5" /></span><div className="min-w-0 flex-1"><Input aria-label="Nome conto" value={account.name} onChange={(event) => setAccounts((items) => items.map((item) => item.id === account.id ? { ...item, name: event.target.value } : item))} /><p className="mt-1 text-xs text-muted-foreground">{account.type === 'main' ? 'Conto principale' : account.type === 'secondary' ? 'Conto secondario' : 'Carta di credito'}</p></div></div>
              <div className="mt-3 flex flex-wrap items-center gap-2">{COLORS.map((swatch) => <button key={swatch} type="button" aria-label={`Usa il colore ${swatch}`} onClick={() => setAccounts((items) => items.map((item) => item.id === account.id ? { ...item, color: swatch } : item))} className={cn('size-7 rounded-full ring-offset-2 transition-transform duration-150 ease-[var(--ease-out)] active:scale-[0.9]', account.color === swatch && 'ring-2 ring-ring')} style={{ backgroundColor: swatch }} />)}<Select value={account.icon} onValueChange={(value) => setAccounts((items) => items.map((item) => item.id === account.id ? { ...item, icon: value } : item))}><SelectTrigger size="sm" className="w-36"><SelectValue /></SelectTrigger><SelectContent>{ACCOUNT_ICON_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <label className="flex flex-col gap-1 text-xs font-medium">Data saldo<Input type="date" disabled={account.type === 'credit_card'} value={account.initialBalanceDate ?? ''} onChange={(event) => setAccounts((items) => items.map((item) => item.id === account.id ? { ...item, initialBalanceDate: event.target.value || null } : item))} /></label>
            <label className="flex flex-col gap-1 text-xs font-medium">Saldo iniziale<Input inputMode="decimal" disabled={account.type === 'credit_card'} value={String(account.initialBalance)} onChange={(event) => setAccounts((items) => items.map((item) => item.id === account.id ? { ...item, initialBalance: Number(event.target.value.replace(',', '.')) || 0 } : item))} /></label>
            <div className="flex items-end gap-1"><Button variant="outline" size="sm" disabled={busyId === account.id} onClick={() => save(account)}>{busyId === account.id ? <Loader2 className="animate-spin" /> : <Save />}Salva</Button><Button variant="ghost" size="icon-sm" aria-label={`Elimina ${account.name}`} className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setDeleteTarget(account)}><Trash2 /></Button></div>
          </div>
        </section>)}
      </CardContent>
    </Card>
    {createOpen && <ModalShell title="Nuovo conto o carta" description="Scegli un'identità riconoscibile: sarà mostrata sui movimenti." onClose={() => { setCreateOpen(false); resetCreate() }}><div className="flex flex-col gap-4"><label className="flex flex-col gap-1"><Label>Nome</Label><Input autoFocus value={name} placeholder="es. Carta Visa" onChange={(event) => setName(event.target.value)} /></label><label className="flex flex-col gap-1"><Label>Tipologia</Label><Select value={type} onValueChange={(value) => { const next = value as Account['type']; setType(next); if (next === 'credit_card' && icon === 'landmark') setIcon('card') }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="secondary">Conto secondario</SelectItem><SelectItem value="credit_card">Carta di credito</SelectItem></SelectContent></Select></label><div className="flex flex-col gap-2"><Label>Icona</Label><div className="grid grid-cols-5 gap-2">{ACCOUNT_ICON_OPTIONS.map((option) => <button key={option.value} type="button" aria-pressed={icon === option.value} onClick={() => setIcon(option.value)} className={cn('flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg border text-xs transition-[background-color,border-color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.97]', icon === option.value ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-accent')}><AccountIcon icon={option.value} className="size-4" />{option.label}</button>)}</div></div><div className="flex flex-col gap-2"><Label>Colore</Label><div className="flex flex-wrap gap-2">{COLORS.map((swatch) => <button key={swatch} type="button" aria-label={`Usa il colore ${swatch}`} aria-pressed={color === swatch} onClick={() => setColor(swatch)} className={cn('size-9 rounded-full ring-offset-2 transition-transform duration-150 ease-[var(--ease-out)] active:scale-[0.9]', color === swatch && 'ring-2 ring-ring')} style={{ backgroundColor: swatch }} />)}</div></div><div className="flex justify-end gap-2 pt-1"><Button variant="outline" onClick={() => { setCreateOpen(false); resetCreate() }}>Annulla</Button><Button onClick={create} disabled={!name.trim() || creating}>{creating ? <Loader2 className="animate-spin" /> : <Plus />}Crea</Button></div></div></ModalShell>}
    {deleteTarget && <ModalShell title="Eliminare conto e dati?" description={`Stai per eliminare definitivamente ${deleteTarget.name}.`} onClose={() => !deleting && setDeleteTarget(null)}><div className="flex gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4"><AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" /><div><p className="text-sm font-semibold">Questa azione è irreversibile</p><p className="mt-1 text-sm text-muted-foreground">Saranno eliminati il conto, tutti i movimenti, i collegamenti carta, la cronologia e i file importati associati.</p></div></div><div className="flex justify-end gap-2 pt-2"><Button variant="outline" disabled={deleting} onClick={() => setDeleteTarget(null)}>Annulla</Button><Button variant="destructive" disabled={deleting} onClick={remove}>{deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}Elimina tutto</Button></div></ModalShell>}
  </div>
}
