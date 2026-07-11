import { useEffect, useState } from 'react'
import {
  CloudDownload, DatabaseBackup, HardDrive, Link2, Link2Off, Save, Trash2, X
} from 'lucide-react'
import type { DataInfo, GDriveStatus, MappingProfile } from '@shared/types'
import { api } from '../api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export default function Settings({ onError }: { onError: (msg: string) => void }): JSX.Element {
  const [info, setInfo] = useState<DataInfo | null>(null)
  const [profiles, setProfiles] = useState<MappingProfile[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [gdrive, setGdrive] = useState<GDriveStatus | null>(null)
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [busy, setBusy] = useState(false)

  const load = (): void => {
    api.dataInfo().then(setInfo).catch(console.error)
    api.profileList().then(setProfiles).catch(console.error)
    api.gdriveStatus().then(setGdrive).catch(console.error)
  }
  useEffect(load, [])

  const backup = async (): Promise<void> => {
    const path = await api.backupNow()
    setMessage(`Backup creato: ${path}`)
    load()
  }

  const saveGdriveConfig = async (): Promise<void> => {
    if (!clientId.trim()) return
    await api.gdriveConfigure(clientId, clientSecret)
    setMessage('Configurazione Google salvata.')
    load()
  }

  const connectDrive = async (): Promise<void> => {
    setBusy(true)
    try {
      const status = await api.gdriveConnect()
      setGdrive(status)
      setMessage('Google Drive connesso.')
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const disconnectDrive = async (): Promise<void> => {
    await api.gdriveDisconnect()
    load()
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Impostazioni</h1>
        <p className="text-sm text-muted-foreground">Dati locali, backup, Google Drive e profili di import.</p>
      </div>

      {message && (
        <Alert className="border-chart-income/40">
          <AlertDescription className="flex items-center justify-between gap-2">
            <span className="break-all">{message}</span>
            <Button variant="ghost" size="icon-sm" onClick={() => setMessage(null)}>
              <X className="size-4" />
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <HardDrive className="size-4" />
                Dati locali
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {info ? (
                <>
                  <div className="text-sm">
                    <p className="break-all font-mono text-xs text-muted-foreground">{info.dbPath}</p>
                    <p className="mt-2">
                      {fmtBytes(info.dbSizeBytes)} — {info.transactionCount} movimenti, {info.importCount}{' '}
                      import
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Tutti i dati restano sul tuo computer. A ogni chiusura dell'app viene creato un backup
                    automatico (vengono conservati gli ultimi 10).
                  </p>
                  <Button onClick={backup}>
                    <DatabaseBackup className="size-4" />
                    Backup manuale adesso
                  </Button>
                  <Separator />
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Backup disponibili
                  </p>
                  {info.backups.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nessun backup ancora.</p>
                  ) : (
                    <Table>
                      <TableBody>
                        {info.backups.slice(0, 8).map((b) => (
                          <TableRow key={b.file}>
                            <TableCell className="font-mono text-xs">{b.file}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {b.date.slice(0, 16).replace('T', ' ')}
                            </TableCell>
                            <TableCell className="text-right text-xs">{fmtBytes(b.sizeBytes)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Caricamento…</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Save className="size-4" />
                Profili di import salvati
              </CardTitle>
            </CardHeader>
            <CardContent>
              {profiles.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nessun profilo. Verranno creati automaticamente durante gli import.
                </p>
              ) : (
                <Table>
                  <TableBody>
                    {profiles.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell
                          className="max-w-56 truncate text-xs text-muted-foreground"
                          title={p.fingerprint}
                        >
                          {p.fingerprint}
                        </TableCell>
                        <TableCell className="w-10">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => api.profileDelete(p.id).then(load)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <CloudDownload className="size-4" />
              Google Drive
              {gdrive?.connected && (
                <Badge variant="outline" className="border-chart-income/40 text-chart-income">
                  connesso
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Per importare gli estratti conto direttamente dal tuo Drive serve un OAuth Client ID di tipo
              "Applicazione desktop": creane uno gratuito su console.cloud.google.com (API Google Drive
              abilitata, scope in sola lettura). L'autorizzazione avviene nel browser; i token restano
              cifrati sul tuo computer.
            </p>
            <div className="space-y-1.5">
              <Label>Client ID</Label>
              <Input
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder={gdrive?.configured ? 'configurato — incolla per sostituire' : 'xxxx.apps.googleusercontent.com'}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Client secret</Label>
              <Input
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder="GOCSPX-…"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={saveGdriveConfig} disabled={!clientId.trim()}>
                <Save className="size-4" />
                Salva configurazione
              </Button>
              {gdrive?.configured && !gdrive.connected && (
                <Button onClick={connectDrive} disabled={busy}>
                  <Link2 className="size-4" />
                  Connetti Google Drive
                </Button>
              )}
              {gdrive?.connected && (
                <Button variant="outline" onClick={disconnectDrive}>
                  <Link2Off className="size-4" />
                  Disconnetti
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Una volta connesso, trovi "Da Google Drive" nella zona di import della dashboard.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
