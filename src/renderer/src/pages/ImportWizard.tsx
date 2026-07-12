import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, ArrowLeft, ArrowRight, CalendarDays, CheckCircle2, CloudDownload, CreditCard, FileUp, Info, Landmark, Loader2, ListChecks, Plus, Upload
} from 'lucide-react'
import type { Account, AccountInput, Category, ColumnMapping, CommitResult, GDriveFile, ImportAnalysis, StageResult } from '@shared/types'
import { api, fmtDate, fmtEur } from '@/api'
import { Amount, CatBadge, ModalShell } from '@/components'
import { ACCOUNT_ICON_OPTIONS, AccountIcon } from '@/components/account-icon'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

type Step = 'upload' | 'mapping' | 'staging' | 'done'

type MappedColumn = Exclude<keyof ColumnMapping, 'amountMultiplier' | 'dateFormat'>

const FIELD_LABELS: { key: MappedColumn; label: string; required?: boolean }[] = [
  { key: 'dateReg', label: 'Data registrazione', required: true },
  { key: 'dateVal', label: 'Data valuta' },
  { key: 'causale', label: 'Causale' },
  { key: 'description', label: 'Descrizione', required: true },
  { key: 'amount', label: 'Importo (unica colonna)' },
  { key: 'amountIn', label: 'Entrate (colonna separata)' },
  { key: 'amountOut', label: 'Uscite (colonna separata)' }
]

const NONE = '__none__'
const NEW_ACCOUNT = '__new_account__'
const ACCOUNT_COLORS = ['#0f766e', '#2563eb', '#7c3aed', '#d97706', '#d94645', '#db2777', '#475569']

function blankAccountDraft(): AccountInput {
  return { name: '', iban: null, currency: 'EUR', type: 'secondary', color: '#0f766e', icon: 'landmark', initialBalance: 0, initialBalanceDate: null }
}

function StatusBadge({ status }: { status: string }): JSX.Element {
  switch (status) {
    case 'new':
      return (
        <Badge variant="outline" className="border-chart-income/40 text-chart-income">
          Nuovo
        </Badge>
      )
    case 'duplicate':
      return (
        <Badge variant="outline" className="border-chart-expense/40 text-chart-expense">
          Duplicato
        </Badge>
      )
    case 'probable_duplicate':
      return (
        <Badge variant="outline" className="border-chart-scenario/40 text-chart-scenario">
          Possibile duplicato
        </Badge>
      )
    default:
      return <Badge variant="outline">Errore</Badge>
  }
}

export default function ImportWizard({
  initialAnalysis, categories, onCancel, onDone
}: {
  initialAnalysis?: ImportAnalysis | null
  categories: Category[]
  onCancel: () => void
  onDone: () => void
}): JSX.Element {
  const [activeAnalysis, setActiveAnalysis] = useState<ImportAnalysis | null>(initialAnalysis ?? null)
  const [step, setStep] = useState<Step>(initialAnalysis ? 'mapping' : 'upload')
  const [mapping, setMapping] = useState<ColumnMapping>(initialAnalysis?.suggestedMapping ?? {
    dateReg: null, dateVal: null, causale: null, description: null, amount: null, amountIn: null, amountOut: null
  })
  const [accounts, setAccounts] = useState<Account[]>([])
  const [accountId, setAccountId] = useState<number | null>(null)
  const [newAccount, setNewAccount] = useState<AccountInput | null>(null)
  const [accountDialogOpen, setAccountDialogOpen] = useState(false)
  const [accountDraft, setAccountDraft] = useState<AccountInput>(blankAccountDraft)
  const [staged, setStaged] = useState<StageResult | null>(null)
  const [includes, setIncludes] = useState<Set<number>>(new Set())
  const [saveProfile, setSaveProfile] = useState(initialAnalysis?.matchedProfile === null)
  const [profileName, setProfileName] = useState(initialAnalysis?.matchedProfile?.name ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<CommitResult | null>(null)
  const [dupFilter, setDupFilter] = useState<'all' | 'duplicates'>('all')
  const [driveFiles, setDriveFiles] = useState<GDriveFile[] | null>(null)

  useEffect(() => {
    api.accountList().then((rows) => {
      setAccounts(rows)
      if (!accountId && rows[0]) setAccountId(rows[0].id)
    }).catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  const beginAnalysis = (next: ImportAnalysis): void => {
    setActiveAnalysis(next)
    setMapping(next.suggestedMapping)
    setSaveProfile(next.matchedProfile === null)
    setProfileName(next.matchedProfile?.name ?? next.fileName.replace(/\.[^.]+$/, ''))
    setStep('mapping')
  }

  const pickFile = async (): Promise<void> => {
    setBusy(true); setError(null)
    try { const next = await api.importPickFile(); if (next) beginAnalysis(next) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  const openDrive = async (): Promise<void> => {
    setBusy(true); setError(null)
    try {
      const status = await api.gdriveStatus()
      if (!status.configured) throw new Error('Configura Google Drive in Impostazioni prima di importare.')
      if (!status.connected) await api.gdriveConnect()
      setDriveFiles(await api.gdriveListFiles())
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  const pickDriveFile = async (file: GDriveFile): Promise<void> => {
    setBusy(true); setError(null)
    try { beginAnalysis(await api.gdriveImport(file.id, file.name)); setDriveFiles(null) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  const mappingValid =
    mapping.dateReg != null &&
    mapping.description != null &&
    (mapping.amount != null || mapping.amountIn != null || mapping.amountOut != null)
  const selectedAccount = newAccount ?? accounts.find((account) => account.id === accountId) ?? null
  const importTargetReady = selectedAccount != null

  const doStage = async (): Promise<void> => {
    if (!activeAnalysis || !importTargetReady) return
    setBusy(true)
    setError(null)
    try {
      const res = await api.importStage(activeAnalysis.token, mapping, activeAnalysis.headerRow, newAccount ? null : accountId)
      setStaged(res)
      setIncludes(new Set(res.rows.filter((r) => r.include).map((r) => r.index)))
      setStep('staging')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const doCommit = async (): Promise<void> => {
    if (!activeAnalysis || !importTargetReady) return
    setBusy(true)
    setError(null)
    try {
      const res = await api.importCommit(
        activeAnalysis.token, mapping, activeAnalysis.headerRow,
        [...includes], saveProfile ? profileName : null, newAccount ? null : accountId, newAccount
      )
      setResult(res)
      setStep('done')
      toast.success('Import completato', `${res.imported} movimenti aggiunti, ${res.categorized} categorizzati.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const setField = (key: MappedColumn, col: number | null): void => {
    setMapping((m) => {
      const next = { ...m, [key]: col }
      if (col != null) {
        for (const f of FIELD_LABELS) {
          if (f.key !== key && next[f.key] === col) next[f.key] = null
        }
      }
      return next
    })
  }

  const visibleRows = useMemo(() => {
    if (!staged) return []
    if (dupFilter === 'duplicates') {
      return staged.rows.filter((r) => r.status === 'duplicate' || r.status === 'probable_duplicate')
    }
    return staged.rows
  }, [staged, dupFilter])

  if (!activeAnalysis) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Importa movimenti</h1>
          <p className="mt-1 text-sm text-muted-foreground">Carica un estratto, riconosci le colonne e rivedi ogni movimento prima del salvataggio.</p>
        </div>
        {error && <Alert variant="destructive"><AlertTriangle /><AlertDescription>{error}</AlertDescription></Alert>}
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="border-dashed"><CardContent className="flex min-h-64 flex-col items-center justify-center gap-4 p-8 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Upload className="size-6" /></span>
            <div><h2 className="font-semibold">Estratto conto locale</h2><p className="mt-1 text-sm text-muted-foreground">CSV, XLS o XLSX dal tuo conto o dalla carta.</p></div>
            <Button onClick={pickFile} disabled={busy}><FileUp className="size-4" />Seleziona file</Button>
          </CardContent></Card>
          <Card><CardContent className="flex min-h-64 flex-col items-center justify-center gap-4 p-8 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground"><CloudDownload className="size-6" /></span>
            <div><h2 className="font-semibold">Google Drive</h2><p className="mt-1 text-sm text-muted-foreground">Scegli un estratto dal Drive collegato.</p></div>
            <Button variant="outline" onClick={openDrive} disabled={busy}><CloudDownload className="size-4" />Sfoglia Drive</Button>
          </CardContent></Card>
        </div>
        {driveFiles && <Card><CardHeader><CardTitle className="text-base">File disponibili</CardTitle></CardHeader><CardContent className="space-y-2">
          {driveFiles.length ? driveFiles.map((file) => <button key={file.id} onClick={() => pickDriveFile(file)} className="flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-[background-color,transform] duration-150 ease-[var(--ease-out)] hover:bg-accent active:scale-[0.99]"><span className="font-medium">{file.name}</span><span className="text-xs text-muted-foreground">{file.modifiedTime.slice(0, 10)}</span></button>) : <p className="text-sm text-muted-foreground">Nessun CSV o Excel trovato.</p>}
        </CardContent></Card>}
      </div>
    )
  }

  const analysis = activeAnalysis

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Importa dati</h1>
        <p className="text-sm text-muted-foreground">
          {step === 'mapping' && 'Passo 1 di 2 — Verifica il mapping delle colonne'}
          {step === 'staging' && 'Passo 2 di 2 — Controlla i movimenti e i duplicati'}
          {step === 'done' && 'Import completato'}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center text-xs font-medium">
        {[['1', 'Carica'], ['2', 'Mappa colonne'], ['3', 'Rivedi']].map(([n, label]) => {
          const current = step === 'mapping' ? 2 : step === 'staging' || step === 'done' ? 3 : 1
          const active = Number(n) <= current
          return <div key={n} className="flex flex-col items-center gap-2"><span className={`flex size-7 items-center justify-center rounded-full ${active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{Number(n) < current ? '✓' : n}</span><span className={active ? 'text-foreground' : 'text-muted-foreground'}>{label}</span></div>
        })}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {step === 'mapping' && (
        <>
          {analysis.matchedProfile && (
            <Alert className="border-chart-income/40 [&>svg]:text-chart-income">
              <CheckCircle2 />
              <AlertDescription>
                Formato riconosciuto: profilo "{analysis.matchedProfile.name}" applicato automaticamente.
              </AlertDescription>
            </Alert>
          )}
          {analysis.preamble.length > 0 && (
            <Alert>
              <Info />
              <AlertDescription>{analysis.preamble.join(' — ')}</AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">
                Mapping colonne ({analysis.totalRows} righe rilevate)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-5 grid gap-3 rounded-xl border bg-muted/30 p-3 md:grid-cols-[minmax(0,1fr)_minmax(13rem,1fr)_auto]">
                <div><p className="text-sm font-medium">Destinazione dell'import</p><p className="mt-0.5 text-xs text-muted-foreground">Il conto scelto determina i duplicati e il tipo di movimento.</p></div>
                <Select value={newAccount ? '' : accountId != null ? String(accountId) : ''} onValueChange={(v) => { setNewAccount(null); setAccountId(Number(v)) }}>
                  <SelectTrigger><SelectValue placeholder={newAccount ? `${newAccount.name} · da creare` : 'Scegli un conto'} /></SelectTrigger>
                  <SelectContent>{accounts.map((account) => <SelectItem key={account.id} value={String(account.id)}><span className="flex items-center gap-2"><Landmark className="size-3.5" />{account.name} <span className="text-muted-foreground">· {account.type === 'credit_card' ? 'Carta di credito' : account.type === 'secondary' ? 'Conto secondario' : 'Conto principale'}</span></span></SelectItem>)}</SelectContent>
                </Select>
                <Button variant="outline" onClick={() => { setAccountDraft(newAccount ?? blankAccountDraft()); setAccountDialogOpen(true) }}><Plus />{newAccount ? 'Modifica' : 'Nuovo'}</Button>
              </div>
              <div className="mb-5 flex flex-wrap items-center gap-3 border-t pt-4"><span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><CalendarDays className="size-4" /></span><div className="min-w-52 flex-1"><p className="text-sm font-medium">Formato delle date del file</p><p className="text-xs text-muted-foreground">Si applica sia alla data registrazione sia alla data valuta.</p></div><Select value={mapping.dateFormat ?? 'auto'} onValueChange={(value) => setMapping((current) => ({ ...current, dateFormat: value as 'auto' | 'dmy' | 'mdy' | 'ymd' }))}><SelectTrigger className="w-full sm:w-72"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="auto">Automatico (rileva dal file)</SelectItem><SelectItem value="dmy">Giorno / mese / anno · dd/mm/yyyy</SelectItem><SelectItem value="mdy">Mese / giorno / anno · mm/dd/yyyy</SelectItem><SelectItem value="ymd">Anno / mese / giorno · yyyy-mm-dd</SelectItem></SelectContent></Select></div>
              {selectedAccount?.type === 'credit_card' && <div className="mb-5 flex flex-wrap items-center gap-3 border-t pt-4"><span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><CreditCard className="size-4" /></span><div className="min-w-52 flex-1"><p className="text-sm font-medium">Segno degli importi della carta</p><p className="text-xs text-muted-foreground">Scegli come interpretare i valori prima del controllo dei movimenti.</p></div><Select value={String(mapping.amountMultiplier ?? 1)} onValueChange={(value) => setMapping((current) => ({ ...current, amountMultiplier: Number(value) as 1 | -1 }))}><SelectTrigger className="w-full sm:w-72"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1">Mantieni il segno del file</SelectItem><SelectItem value="-1">Inverti: acquisti positivi → uscite</SelectItem></SelectContent></Select></div>}
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {FIELD_LABELS.map((f) => (
                  <div key={f.key} className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      {f.label}
                      {f.required && <span className="text-chart-expense"> *</span>}
                    </Label>
                    <Select
                      value={mapping[f.key] != null ? String(mapping[f.key]) : NONE}
                      onValueChange={(v) => setField(f.key, v === NONE ? null : Number(v))}
                    >
                      <SelectTrigger size="sm" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>
                          <span className="text-muted-foreground">non presente</span>
                        </SelectItem>
                        {analysis.columns.map((c, i) => (
                          <SelectItem key={i} value={String(i)}>
                            {c || `Colonna ${i + 1}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              {!mappingValid && (
                <p className="mt-3 text-xs text-chart-scenario">
                  Servono almeno: Data registrazione, Descrizione e una colonna Importo (o Entrate/Uscite).
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Anteprima dati</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-64 overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {analysis.columns.map((c, i) => (
                        <TableHead key={i}>{c || `Col. ${i + 1}`}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analysis.sampleRows.map((r, i) => (
                      <TableRow key={i}>
                        {analysis.columns.map((_, j) => (
                          <TableCell key={j} className="max-w-64 truncate">
                            {r[j] ?? ''}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={saveProfile}
                onCheckedChange={(v) => setSaveProfile(v === true)}
              />
              Salva come profilo per import futuri
            </label>
            {saveProfile && (
              <Input
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                placeholder="Nome profilo"
                className="h-8 w-56"
              />
            )}
            <div className="flex-1" />
            <Button variant="outline" onClick={onCancel}>
              Annulla
            </Button>
            <Button disabled={!mappingValid || busy || !importTargetReady} onClick={doStage}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
              Continua
            </Button>
          </div>
        </>
      )}

      {step === 'staging' && staged && (
        <>
          {staged.stats.duplicates + staged.stats.probableDuplicates > 0 ? (
            <Alert className="border-chart-scenario/40 [&>svg]:text-chart-scenario">
              <AlertTriangle />
              <AlertTitle>
                Rilevati {staged.stats.duplicates} duplicati
                {staged.stats.probableDuplicates > 0 && ` e ${staged.stats.probableDuplicates} possibili duplicati`}
              </AlertTitle>
              <AlertDescription>
                {staged.stats.overlapFrom && (
                  <>
                    Periodo sovrapposto: {fmtDate(staged.stats.overlapFrom)} – {fmtDate(staged.stats.overlapTo)}.{' '}
                  </>
                )}
                I duplicati sono esclusi automaticamente: puoi reincluderli riga per riga.
              </AlertDescription>
            </Alert>
          ) : (
            <Alert className="border-chart-income/40 [&>svg]:text-chart-income">
              <CheckCircle2 />
              <AlertDescription>Nessun duplicato rilevato.</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>
              {staged.stats.new} nuovi · {staged.stats.duplicates} duplicati ·{' '}
              {staged.stats.probableDuplicates} probabili · {staged.stats.errors} errori —{' '}
              <span className="font-medium text-foreground">{includes.size} da importare</span>
            </span>
            <div className="flex-1" />
            <Select value={dupFilter} onValueChange={(v) => setDupFilter(v as 'all' | 'duplicates')}>
              <SelectTrigger size="sm" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutte le righe</SelectItem>
                <SelectItem value="duplicates">Solo duplicati</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setIncludes(new Set(staged.rows.filter((r) => r.status !== 'error').map((r) => r.index)))
              }
            >
              Includi tutto
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setIncludes(new Set(staged.rows.filter((r) => r.status === 'new').map((r) => r.index)))
              }
            >
              Solo nuovi
            </Button>
          </div>

          <div className="max-h-[calc(100vh-380px)] overflow-auto rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Stato</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Descrizione</TableHead>
                  <TableHead className="text-right">Importo</TableHead>
                  <TableHead>Categoria proposta</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRows.map((r) => (
                  <TableRow key={r.index}>
                    <TableCell>
                      <Checkbox
                        disabled={r.status === 'error'}
                        checked={includes.has(r.index)}
                        onCheckedChange={(v) => {
                          const next = new Set(includes)
                          if (v === true) next.add(r.index)
                          else next.delete(r.index)
                          setIncludes(next)
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} />
                      {r.existing && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          già presente: {fmtDate(r.existing.dateReg)} · {fmtEur(r.existing.amount)}
                        </div>
                      )}
                      {r.error && <div className="mt-1 text-xs text-muted-foreground">{r.error}</div>}
                    </TableCell>
                    <TableCell className="tabular-nums">{fmtDate(r.dateReg)}</TableCell>
                    <TableCell className="max-w-96 truncate" title={r.description}>
                      {r.description}
                    </TableCell>
                    <TableCell className="text-right">
                      <Amount value={r.amount} />
                    </TableCell>
                    <TableCell>
                      <CatBadge category={r.suggestedCategoryId} categories={categories} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setStep('mapping')}>
              <ArrowLeft className="size-4" />
              Mapping
            </Button>
            <div className="flex-1" />
            <Button variant="outline" onClick={onCancel}>
              Annulla
            </Button>
            <Button disabled={includes.size === 0 || busy} onClick={doCommit}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <ListChecks className="size-4" />}
              Importa {includes.size} movimenti
            </Button>
          </div>
        </>
      )}

      {step === 'done' && result && (
        <Card className="max-w-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="size-5 text-chart-income" />
              Import completato
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm">
              <span className="font-semibold">{result.imported}</span> movimenti importati
              {result.skippedDuplicates > 0 && <>, {result.skippedDuplicates} esclusi (duplicati)</>}.
              <br />
              <span className="font-semibold">{result.categorized}</span> categorizzati automaticamente
              dalle regole.
            </p>
            <Button onClick={onDone}>Vai ai movimenti</Button>
          </CardContent>
        </Card>
      )}
      {accountDialogOpen && <ModalShell title={newAccount ? 'Modifica conto o carta' : 'Nuovo conto o carta'} description="Sarà creato solo quando confermi l’import finale." onClose={() => setAccountDialogOpen(false)}><div className="flex flex-col gap-4"><label className="flex flex-col gap-1"><Label>Nome</Label><Input autoFocus value={accountDraft.name} placeholder="es. Carta Visa" onChange={(event) => setAccountDraft((current) => ({ ...current, name: event.target.value }))} /></label><label className="flex flex-col gap-1"><Label>Tipologia</Label><Select value={accountDraft.type} onValueChange={(value) => setAccountDraft((current) => ({ ...current, type: value as Account['type'], icon: value === 'credit_card' && current.icon === 'landmark' ? 'card' : current.icon }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="secondary">Conto secondario</SelectItem><SelectItem value="credit_card">Carta di credito</SelectItem></SelectContent></Select></label><div className="flex flex-col gap-2"><Label>Icona</Label><div className="grid grid-cols-5 gap-2">{ACCOUNT_ICON_OPTIONS.map((option) => <button key={option.value} type="button" aria-pressed={accountDraft.icon === option.value} onClick={() => setAccountDraft((current) => ({ ...current, icon: option.value }))} className={cn('flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg border text-xs transition-[background-color,border-color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.97]', accountDraft.icon === option.value ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-accent')}><AccountIcon icon={option.value} className="size-4" />{option.label}</button>)}</div></div><div className="flex flex-col gap-2"><Label>Colore</Label><div className="flex flex-wrap gap-2">{ACCOUNT_COLORS.map((swatch) => <button key={swatch} type="button" aria-label={`Usa il colore ${swatch}`} aria-pressed={accountDraft.color === swatch} onClick={() => setAccountDraft((current) => ({ ...current, color: swatch }))} className={cn('size-9 rounded-full ring-offset-2 transition-transform duration-150 ease-[var(--ease-out)] active:scale-[0.9]', accountDraft.color === swatch && 'ring-2 ring-ring')} style={{ backgroundColor: swatch }} />)}</div></div><p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">Nessun conto verrà creato se annulli l’import o torni indietro.</p><div className="flex justify-end gap-2 pt-1"><Button variant="outline" onClick={() => setAccountDialogOpen(false)}>Annulla</Button><Button disabled={!accountDraft.name.trim()} onClick={() => { setNewAccount({ ...accountDraft, name: accountDraft.name.trim() }); setAccountId(null); setAccountDialogOpen(false) }}><Plus />Usa per questo import</Button></div></div></ModalShell>}
    </div>
  )
}
