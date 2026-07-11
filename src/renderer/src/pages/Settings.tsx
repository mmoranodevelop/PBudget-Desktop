import { useEffect, useState } from 'react'
import type { DataInfo, MappingProfile } from '@shared/types'
import { api } from '../api'

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export default function Settings(): JSX.Element {
  const [info, setInfo] = useState<DataInfo | null>(null)
  const [profiles, setProfiles] = useState<MappingProfile[]>([])
  const [message, setMessage] = useState<string | null>(null)

  const load = (): void => {
    api.dataInfo().then(setInfo).catch(console.error)
    api.profileList().then(setProfiles).catch(console.error)
  }
  useEffect(load, [])

  const backup = async (): Promise<void> => {
    const path = await api.backupNow()
    setMessage(`Backup creato: ${path}`)
    load()
  }

  return (
    <div>
      <h1 className="page-title">Impostazioni</h1>
      <p className="page-sub">Dati locali, backup e profili di import.</p>

      {message && (
        <div className="banner success">
          {message}{' '}
          <button className="btn small secondary" onClick={() => setMessage(null)}>
            Chiudi
          </button>
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="card">
          <h3>Dati locali</h3>
          {info ? (
            <>
              <p className="small">
                <b>Database:</b> <span className="mono muted">{info.dbPath}</span>
                <br />
                <b>Dimensione:</b> {fmtBytes(info.dbSizeBytes)} — {info.transactionCount} movimenti,{' '}
                {info.importCount} import
              </p>
              <p className="small muted">
                Tutti i dati restano sul tuo computer. A ogni chiusura dell'app viene creato un backup
                automatico (vengono conservati gli ultimi 10).
              </p>
              <button className="btn" onClick={backup}>
                Backup manuale adesso
              </button>
              <h3 className="mt">Backup disponibili</h3>
              {info.backups.length === 0 ? (
                <p className="muted small">Nessun backup ancora.</p>
              ) : (
                <table>
                  <tbody>
                    {info.backups.slice(0, 8).map((b) => (
                      <tr key={b.file}>
                        <td className="small mono">{b.file}</td>
                        <td className="small muted">{b.date.slice(0, 16).replace('T', ' ')}</td>
                        <td className="num small">{fmtBytes(b.sizeBytes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          ) : (
            <p className="muted">Caricamento…</p>
          )}
        </div>

        <div>
          <div className="card mb">
            <h3>Profili di import salvati</h3>
            {profiles.length === 0 ? (
              <p className="muted small">Nessun profilo. Verranno creati automaticamente durante gli import.</p>
            ) : (
              <table>
                <tbody>
                  {profiles.map((p) => (
                    <tr key={p.id}>
                      <td>{p.name}</td>
                      <td className="small muted desc-cell" style={{ maxWidth: 220 }} title={p.fingerprint}>
                        {p.fingerprint}
                      </td>
                      <td>
                        <button
                          className="btn small secondary"
                          onClick={() => api.profileDelete(p.id).then(load)}
                        >
                          🗑
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card">
            <h3>Google Drive</h3>
            <p className="small muted">
              L'integrazione Google Drive (import diretto degli estratti conto dal tuo Drive) è prevista
              dalla roadmap (Fase 5) e richiede la configurazione di un OAuth Client ID Google. Nel
              frattempo puoi scaricare i file da Drive e importarli con il pulsante «Importa file» o con il
              drag &amp; drop sulla dashboard.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
