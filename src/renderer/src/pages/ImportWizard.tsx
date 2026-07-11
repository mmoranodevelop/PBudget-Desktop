import { useMemo, useState } from 'react'
import {
  AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Info, Loader2, ListChecks
} from 'lucide-react'
import type { Category, ColumnMapping, CommitResult, ImportAnalysis, StageResult } from '@shared/types'
import { api, fmtDate, fmtEur } from '../api'
import { Amount, CatBadge } from '../components'
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

type Step = 'mapping' | 'staging' | 'done'

const FIELD_LABELS: { key: keyof ColumnMapping; label: string; required?: boolean }[] = [
  { key: 'dateReg', label: 'Data registrazione', required: true },
  { key: 'dateVal', label: 'Data valuta' },
  { key: 'causale', label: 'Causale' },
  { key: 'description', label: 'Descrizione', required: true },
  { key: 'amount', label: 'Importo (unica colonna)' },
  { key: 'amountIn', label: 'Entrate (colonna separata)' },
  { key: 'amountOut', label: 'Uscite (colonna separata)' }
]

const NONE = '__none__'

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
  analysis, categories, onCancel, onDone
}: {
  analysis: ImportAnalysis
  categories: Category[]
  onCancel: () => void
  onDone: () => void
}): JSX.Element {
  const [step, setStep] = useState<Step>('mapping')
  const [mapping, setMapping] = useState<ColumnMapping>(analysis.suggestedMapping)
  const [staged, setStaged] = useState<StageResult | null>(null)
  const [includes, setIncludes] = useState<Set<number>>(new Set())
  const [saveProfile, setSaveProfile] = useState(analysis.matchedProfile === null)
  const [profileName, setProfileName] = useState(
    analysis.matchedProfile?.name ?? analysis.fileName.replace(/\.[^.]+$/, '')
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<CommitResult | null>(null)
  const [dupFilter, setDupFilter] = useState<'all' | 'duplicates'>('all')

  const mappingValid =
    mapping.dateReg != null &&
    mapping.description != null &&
    (mapping.amount != null || mapping.amountIn != null || mapping.amountOut != null)

  const doStage = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const res = await api.importStage(analysis.token, mapping, analysis.headerRow)
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
    setBusy(true)
    setError(null)
    try {
      const res = await api.importCommit(
        analysis.token, mapping, analysis.headerRow,
        [...includes], saveProfile ? profileName : null
      )
      setResult(res)
      setStep('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const setField = (key: keyof ColumnMapping, col: number | null): void => {
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

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Import: {analysis.fileName}</h1>
        <p className="text-sm text-muted-foreground">
          {step === 'mapping' && 'Passo 1 di 2 — Verifica il mapping delle colonne'}
          {step === 'staging' && 'Passo 2 di 2 — Controlla i movimenti e i duplicati'}
          {step === 'done' && 'Import completato'}
        </p>
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
            <Button disabled={!mappingValid || busy} onClick={doStage}>
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
    </div>
  )
}
