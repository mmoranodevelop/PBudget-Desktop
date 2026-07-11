import { useEffect, useMemo, useState } from 'react'
import type { Category, ColumnMapping, CommitResult, ImportAnalysis, StageResult } from '@shared/types'
import { api, fmtDate, fmtEur } from '../api'
import { Amount, CatBadge } from '../components'

type Step = 'mapping' | 'staging' | 'done'

const FIELD_LABELS: { key: keyof ColumnMapping; label: string; required?: boolean }[] = [
  { key: 'dateReg', label: 'Data registrazione', required: true },
  { key: 'dateVal', label: 'Data valuta' },
  { key: 'causale', label: 'Causale' },
  { key: 'description', label: 'Descrizione', required: true },
  { key: 'amount', label: 'Importo (unica colonna ±)' },
  { key: 'amountIn', label: 'Entrate (colonna separata)' },
  { key: 'amountOut', label: 'Uscite (colonna separata)' }
]

const STATUS_LABEL: Record<string, string> = {
  new: 'Nuovo',
  duplicate: 'Duplicato',
  probable_duplicate: 'Possibile duplicato',
  error: 'Errore'
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
      // una colonna può essere assegnata a un solo campo
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
    <div>
      <h1 className="page-title">Import: {analysis.fileName}</h1>
      <p className="page-sub">
        {step === 'mapping' && 'Passo 1 di 2 — Verifica il mapping delle colonne'}
        {step === 'staging' && 'Passo 2 di 2 — Controlla i movimenti e i duplicati'}
        {step === 'done' && 'Import completato'}
      </p>

      {error && <div className="banner error">{error}</div>}

      {step === 'mapping' && (
        <>
          {analysis.matchedProfile && (
            <div className="banner success">
              ✓ Formato riconosciuto: profilo «{analysis.matchedProfile.name}» applicato automaticamente.
            </div>
          )}
          {analysis.preamble.length > 0 && (
            <div className="banner info small">
              Intestazione file: {analysis.preamble.join(' — ')}
            </div>
          )}

          <div className="card mb">
            <h3>Mapping colonne → campi ({analysis.totalRows} righe rilevate)</h3>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              {FIELD_LABELS.map((f) => (
                <label key={f.key} className="field">
                  {f.label} {f.required && <span className="warn">*</span>}
                  <select
                    value={mapping[f.key] ?? ''}
                    onChange={(e) => setField(f.key, e.target.value === '' ? null : Number(e.target.value))}
                  >
                    <option value="">— non presente —</option>
                    {analysis.columns.map((c, i) => (
                      <option key={i} value={i}>
                        {c || `Colonna ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            {!mappingValid && (
              <p className="small warn mt">
                Servono almeno: Data registrazione, Descrizione e una colonna Importo (o Entrate/Uscite).
              </p>
            )}
          </div>

          <div className="card mb">
            <h3>Anteprima dati</h3>
            <div className="table-wrap" style={{ maxHeight: 260 }}>
              <table>
                <thead>
                  <tr>
                    {analysis.columns.map((c, i) => (
                      <th key={i}>{c || `Col. ${i + 1}`}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {analysis.sampleRows.map((r, i) => (
                    <tr key={i}>
                      {analysis.columns.map((_, j) => (
                        <td key={j} className="desc-cell" style={{ maxWidth: 260 }}>
                          {r[j] ?? ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="row">
            <label className="row small">
              <input type="checkbox" checked={saveProfile} onChange={(e) => setSaveProfile(e.target.checked)} />
              Salva come profilo per import futuri
            </label>
            {saveProfile && (
              <input value={profileName} onChange={(e) => setProfileName(e.target.value)} placeholder="Nome profilo" />
            )}
            <div className="spacer" style={{ flex: 1 }} />
            <button className="btn secondary" onClick={onCancel}>
              Annulla
            </button>
            <button className="btn" disabled={!mappingValid || busy} onClick={doStage}>
              {busy ? 'Analisi…' : 'Continua →'}
            </button>
          </div>
        </>
      )}

      {step === 'staging' && staged && (
        <>
          {staged.stats.duplicates + staged.stats.probableDuplicates > 0 ? (
            <div className="banner warn">
              ⚠️ Rilevati <b>{staged.stats.duplicates} duplicati</b>
              {staged.stats.probableDuplicates > 0 && (
                <> e <b>{staged.stats.probableDuplicates} possibili duplicati</b></>
              )}
              {staged.stats.overlapFrom && (
                <>
                  {' '}(periodo sovrapposto: {fmtDate(staged.stats.overlapFrom)} –{' '}
                  {fmtDate(staged.stats.overlapTo)})
                </>
              )}
              . I duplicati sono esclusi automaticamente: puoi reincluderli riga per riga.
            </div>
          ) : (
            <div className="banner success">✓ Nessun duplicato rilevato.</div>
          )}

          <div className="toolbar">
            <span className="small muted">
              {staged.stats.new} nuovi · {staged.stats.duplicates} duplicati ·{' '}
              {staged.stats.probableDuplicates} probabili · {staged.stats.errors} errori —{' '}
              <b>{includes.size} da importare</b>
            </span>
            <div className="spacer" />
            <select value={dupFilter} onChange={(e) => setDupFilter(e.target.value as 'all' | 'duplicates')}>
              <option value="all">Tutte le righe</option>
              <option value="duplicates">Solo duplicati</option>
            </select>
            <button
              className="btn small secondary"
              onClick={() => setIncludes(new Set(staged.rows.filter((r) => r.status !== 'error').map((r) => r.index)))}
            >
              Includi tutto
            </button>
            <button
              className="btn small secondary"
              onClick={() => setIncludes(new Set(staged.rows.filter((r) => r.status === 'new').map((r) => r.index)))}
            >
              Solo nuovi
            </button>
          </div>

          <div className="table-wrap mb" style={{ maxHeight: 'calc(100vh - 360px)' }}>
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>Stato</th>
                  <th>Data</th>
                  <th>Descrizione</th>
                  <th className="num">Importo</th>
                  <th>Categoria proposta</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r) => (
                  <tr key={r.index}>
                    <td>
                      <input
                        type="checkbox"
                        disabled={r.status === 'error'}
                        checked={includes.has(r.index)}
                        onChange={(e) => {
                          const next = new Set(includes)
                          if (e.target.checked) next.add(r.index)
                          else next.delete(r.index)
                          setIncludes(next)
                        }}
                      />
                    </td>
                    <td>
                      <span className={`badge status-${r.status}`}>{STATUS_LABEL[r.status]}</span>
                      {r.existing && (
                        <div className="small muted" style={{ marginTop: 3 }}>
                          già presente: {fmtDate(r.existing.dateReg)} · {fmtEur(r.existing.amount)}
                        </div>
                      )}
                      {r.error && <div className="small muted">{r.error}</div>}
                    </td>
                    <td className="mono">{fmtDate(r.dateReg)}</td>
                    <td className="desc-cell" title={r.description}>
                      {r.description}
                    </td>
                    <td className="num">
                      <Amount value={r.amount} />
                    </td>
                    <td>
                      <CatBadge category={r.suggestedCategoryId} categories={categories} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="row">
            <button className="btn secondary" onClick={() => setStep('mapping')}>
              ← Mapping
            </button>
            <div className="spacer" style={{ flex: 1 }} />
            <button className="btn secondary" onClick={onCancel}>
              Annulla
            </button>
            <button className="btn" disabled={includes.size === 0 || busy} onClick={doCommit}>
              {busy ? 'Import in corso…' : `Importa ${includes.size} movimenti`}
            </button>
          </div>
        </>
      )}

      {step === 'done' && result && (
        <div className="card" style={{ maxWidth: 520 }}>
          <h3>✓ Import completato</h3>
          <p>
            <b>{result.imported}</b> movimenti importati
            {result.skippedDuplicates > 0 && <>, {result.skippedDuplicates} esclusi (duplicati)</>}
            .<br />
            <b>{result.categorized}</b> categorizzati automaticamente dalle regole.
          </p>
          <div className="row mt">
            <button className="btn" onClick={onDone}>
              Vai ai movimenti
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
