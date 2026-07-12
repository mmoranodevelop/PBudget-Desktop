import { useEffect, useState } from 'react'
import { CloudDownload, DatabaseBackup, HardDrive, Link2, Link2Off, Loader2, Save, Trash2 } from 'lucide-react'
import type { Account, DataInfo, GDriveStatus, MappingProfile } from '@shared/types'
import { api } from '@/api'
import { ModalShell } from '@/components'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'
import { toast } from '@/components/ui/toast'

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

const PENDING_BACKUP_DELETION = 'budget:pending-backup-deletion'

export default function Settings(): JSX.Element {
  const [info, setInfo] = useState<DataInfo | null>(null)
  const [profiles, setProfiles] = useState<MappingProfile[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [gdrive, setGdrive] = useState<GDriveStatus | null>(null)
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [wipeOpen, setWipeOpen] = useState(false)
  const [backupToDelete, setBackupToDelete] = useState<DataInfo['backups'][number] | null>(null)

  const load = (): void => {
    api.dataInfo().then(setInfo).catch(() => undefined)
    api.profileList().then(setProfiles).catch(() => undefined)
    api.accountList().then(setAccounts).catch(() => undefined)
    api.gdriveStatus().then(setGdrive).catch(() => undefined)
  }
  useEffect(load, [])
  useEffect(() => {
    if (!info) return
    const pendingFile = sessionStorage.getItem(PENDING_BACKUP_DELETION)
    if (!pendingFile) return
    sessionStorage.removeItem(PENDING_BACKUP_DELETION)
    const pendingBackup = info.backups.find((item) => item.file === pendingFile)
    if (pendingBackup && typeof window.budgetApi.deleteBackup === 'function') setBackupToDelete(pendingBackup)
  }, [info])

  const backup = async (): Promise<void> => {
    setBusy('backup')
    try {
      const path = await api.backupNow()
      toast.success('Backup creato', path)
      load()
    } finally {
      setBusy(null)
    }
  }
  const deleteBackup = async (): Promise<void> => {
    if (!backupToDelete) return
    // Il renderer può aggiornarsi prima del preload durante lo sviluppo: ricarica il bridge e riprende l'azione.
    if (typeof window.budgetApi.deleteBackup !== 'function') {
      sessionStorage.setItem(PENDING_BACKUP_DELETION, backupToDelete.file)
      window.location.reload()
      return
    }
    setBusy('delete-backup')
    try {
      await window.budgetApi.deleteBackup(backupToDelete.file)
      toast.success('Backup eliminato', backupToDelete.file)
      setBackupToDelete(null)
      load()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes("No handler registered for 'settings:deleteBackup'")) {
        toast.error('Riavvio dell’app richiesto', 'Chiudi e riapri Budget App per attivare la nuova funzione di eliminazione backup.')
      } else {
        toast.error('Impossibile eliminare il backup', message)
      }
    } finally {
      setBusy(null)
    }
  }
  const saveDrive = async (): Promise<void> => {
    if (!clientId.trim()) return
    setBusy('drive-config')
    try {
      await api.gdriveConfigure(clientId, clientSecret)
      toast.success('Configurazione Google salvata')
      load()
    } finally {
      setBusy(null)
    }
  }
  const connectDrive = async (): Promise<void> => {
    setBusy('drive-connect')
    try {
      setGdrive(await api.gdriveConnect())
      toast.success('Google Drive connesso')
    } catch {
      // Il client API visualizza l'errore.
    } finally {
      setBusy(null)
    }
  }
  const disconnectDrive = async (): Promise<void> => {
    await api.gdriveDisconnect()
    toast.success('Google Drive disconnesso')
    load()
  }
  const deleteProfile = async (profile: MappingProfile): Promise<void> => {
    await api.profileDelete(profile.id)
    setProfiles((current) => current.filter((item) => item.id !== profile.id))
    toast.success('Profilo eliminato', profile.name)
  }
  const wipeData = async (): Promise<void> => {
    setBusy('wipe')
    try {
      await api.wipeFinancialData()
      setWipeOpen(false)
      toast.success('Dati finanziari eliminati', 'Categorie, regole e profili sono stati conservati.')
      load()
    } finally {
      setBusy(null)
    }
  }

  return <div className="space-y-5">
    <header>
      <h1 className="text-2xl font-semibold tracking-tight">Impostazioni</h1>
      <p className="mt-1 text-sm text-muted-foreground">Dati locali, backup, Google Drive e profili di import.</p>
    </header>
    <div className="grid gap-4 xl:grid-cols-2">
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm"><HardDrive className="size-4" />Dati locali</CardTitle>
            <CardDescription>I dati restano sul computer e vengono protetti con backup automatici.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {info ? <>
              <div>
                <p className="break-all font-mono text-xs text-muted-foreground">{info.dbPath}</p>
                <p className="mt-2 text-sm">{fmtBytes(info.dbSizeBytes)} · {info.transactionCount} movimenti · {info.importCount} import</p>
              </div>
              <Button className="w-fit" onClick={backup} disabled={busy === 'backup'}>
                {busy === 'backup' ? <Loader2 className="animate-spin" /> : <DatabaseBackup />}Crea backup
              </Button>
              <Separator />
              <div>
                <p className="mb-2 text-sm font-medium">Backup disponibili</p>
                {info.backups.length ? <Table><TableBody>
                  {info.backups.slice(0, 8).map((item) => <TableRow key={item.file}>
                    <TableCell className="font-mono text-xs">{item.file}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{item.date.slice(0, 16).replace('T', ' ')}</TableCell>
                    <TableCell className="text-right text-xs">{fmtBytes(item.sizeBytes)}</TableCell>
                    <TableCell className="w-10"><Button variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive" aria-label={`Elimina ${item.file}`} onClick={() => setBackupToDelete(item)}><Trash2 /></Button></TableCell>
                  </TableRow>)}
                </TableBody></Table> : <p className="text-sm text-muted-foreground">Nessun backup disponibile.</p>}
              </div>
            </> : <><Skeleton className="h-4 w-3/4" /><Skeleton className="h-10 w-36" /><Skeleton className="h-32 w-full" /></>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm"><Save className="size-4" />Profili di import</CardTitle>
            <CardDescription>Mapping riutilizzati automaticamente per formati già riconosciuti.</CardDescription>
          </CardHeader>
          <CardContent>
            {profiles.length ? <Table><TableBody>{profiles.map((profile) => <TableRow key={profile.id}>
              <TableCell className="font-medium">{profile.name}</TableCell>
              <TableCell className="max-w-52 truncate text-xs text-muted-foreground" title={profile.fingerprint}>{profile.fingerprint}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{accounts.find((account) => account.id === profile.accountId)?.name ?? 'Qualsiasi conto'}</TableCell>
              <TableCell className="w-10"><Button variant="ghost" size="icon-sm" aria-label={`Elimina ${profile.name}`} onClick={() => deleteProfile(profile)}><Trash2 /></Button></TableCell>
            </TableRow>)}</TableBody></Table> : <p className="py-4 text-sm text-muted-foreground">I profili verranno creati durante gli import.</p>}
          </CardContent>
        </Card>
      </div>
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm"><CloudDownload className="size-4" />Google Drive {gdrive?.connected && <Badge variant="outline" className="border-chart-income/40 text-chart-income">Connesso</Badge>}</CardTitle>
            <CardDescription>Importa CSV ed Excel direttamente da un Drive collegato.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <label className="flex flex-col gap-1"><Label>Client ID</Label><Input value={clientId} onChange={(event) => setClientId(event.target.value)} placeholder={gdrive?.configured ? 'Configurato — incolla per sostituire' : 'xxxx.apps.googleusercontent.com'} /></label>
            <label className="flex flex-col gap-1"><Label>Client secret</Label><Input type="password" value={clientSecret} onChange={(event) => setClientSecret(event.target.value)} placeholder="GOCSPX-…" /></label>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={saveDrive} disabled={!clientId.trim() || busy === 'drive-config'}>{busy === 'drive-config' ? <Loader2 className="animate-spin" /> : <Save />}Salva configurazione</Button>
              {gdrive?.configured && !gdrive.connected && <Button onClick={connectDrive} disabled={busy === 'drive-connect'}>{busy === 'drive-connect' ? <Loader2 className="animate-spin" /> : <Link2 />}Connetti Drive</Button>}
              {gdrive?.connected && <Button variant="outline" onClick={disconnectDrive}><Link2Off />Disconnetti</Button>}
            </div>
          </CardContent>
        </Card>
        <Card className="border-destructive/35 bg-destructive/[0.025]">
          <CardHeader><CardTitle className="text-sm text-destructive">Danger zone</CardTitle><CardDescription>Operazioni irreversibili sui dati finanziari.</CardDescription></CardHeader>
          <CardContent><div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-destructive/30 bg-background/70 p-4"><div className="max-w-md"><p className="font-medium">Elimina tutti i dati finanziari</p><p className="mt-1 text-sm text-muted-foreground">Rimuove movimenti, budget, tag, cronologia e file importati. Categorie, regole e profili restano disponibili.</p></div><Button variant="destructive" onClick={() => setWipeOpen(true)}><Trash2 />Elimina dati</Button></div></CardContent>
        </Card>
      </div>
    </div>
    {wipeOpen && <ModalShell title="Eliminare tutti i dati?" description="L'operazione è irreversibile: cancellerà movimenti, budget e file importati." onClose={() => busy !== 'wipe' && setWipeOpen(false)}><p className="text-sm text-muted-foreground">Categorie, regole e profili di import saranno mantenuti.</p><div className="flex justify-end gap-2 pt-3"><Button variant="outline" disabled={busy === 'wipe'} onClick={() => setWipeOpen(false)}>Annulla</Button><Button variant="destructive" disabled={busy === 'wipe'} onClick={wipeData}>{busy === 'wipe' ? <Loader2 className="animate-spin" /> : <Trash2 />}Elimina definitivamente</Button></div></ModalShell>}
    {backupToDelete && <ModalShell title="Eliminare questo backup?" description="Il file di backup verrà rimosso definitivamente dal computer." onClose={() => busy !== 'delete-backup' && setBackupToDelete(null)}><p className="break-all rounded-lg bg-muted px-3 py-2 font-mono text-xs text-muted-foreground">{backupToDelete.file}</p><div className="flex justify-end gap-2 pt-3"><Button variant="outline" disabled={busy === 'delete-backup'} onClick={() => setBackupToDelete(null)}>Annulla</Button><Button variant="destructive" disabled={busy === 'delete-backup'} onClick={deleteBackup}>{busy === 'delete-backup' ? <Loader2 className="animate-spin" /> : <Trash2 />}Elimina backup</Button></div></ModalShell>}
  </div>
}
