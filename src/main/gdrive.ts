// Integrazione Google Drive: OAuth 2.0 PKCE con redirect su loopback,
// token cifrati con safeStorage, elenco e download file per l'import.
import { shell, safeStorage } from 'electron'
import { createServer } from 'http'
import { createHash, randomBytes } from 'crypto'
import { getDb } from './db'

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SCOPE = 'https://www.googleapis.com/auth/drive.readonly'

interface StoredToken {
  access_token: string
  refresh_token: string | null
  expires_at: number // epoch ms
}

function settingGet(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value ?? null
}

function settingSet(key: string, value: string | null): void {
  if (value === null) {
    getDb().prepare('DELETE FROM settings WHERE key = ?').run(key)
    return
  }
  getDb()
    .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, value)
}

function saveToken(token: StoredToken): void {
  const json = JSON.stringify(token)
  const value = safeStorage.isEncryptionAvailable()
    ? 'enc:' + safeStorage.encryptString(json).toString('base64')
    : 'plain:' + Buffer.from(json).toString('base64')
  settingSet('gdrive_token', value)
}

function loadToken(): StoredToken | null {
  const raw = settingGet('gdrive_token')
  if (!raw) return null
  try {
    const [kind, b64] = raw.split(':', 2)
    const json =
      kind === 'enc'
        ? safeStorage.decryptString(Buffer.from(b64, 'base64'))
        : Buffer.from(b64, 'base64').toString('utf8')
    return JSON.parse(json) as StoredToken
  } catch {
    return null
  }
}

export function gdriveStatus(): { configured: boolean; connected: boolean } {
  return {
    configured: !!settingGet('gdrive_client_id'),
    connected: loadToken() !== null
  }
}

export function gdriveConfigure(clientId: string, clientSecret: string): void {
  settingSet('gdrive_client_id', clientId.trim())
  settingSet('gdrive_client_secret', clientSecret.trim())
}

export function gdriveDisconnect(): void {
  settingSet('gdrive_token', null)
}

export async function gdriveConnect(): Promise<{ configured: boolean; connected: boolean }> {
  const clientId = settingGet('gdrive_client_id')
  if (!clientId) throw new Error('Configura prima il Client ID Google nelle Impostazioni')
  const clientSecret = settingGet('gdrive_client_secret') ?? ''

  const verifier = randomBytes(48).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')

  const code = await new Promise<string>((resolvePromise, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      const authCode = url.searchParams.get('code')
      const err = url.searchParams.get('error')
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(
        `<html><body style="font-family:sans-serif;background:#171717;color:#eee;display:flex;align-items:center;justify-content:center;height:100vh"><div>${
          authCode ? 'Autorizzazione completata. Puoi chiudere questa finestra e tornare a Budget App.' : 'Autorizzazione negata.'
        }</div></body></html>`
      )
      if (authCode) {
        resolvePromise(authCode)
      } else {
        reject(new Error(`Autorizzazione negata: ${err ?? 'nessun codice ricevuto'}`))
      }
      setImmediate(() => server.close())
    })
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        reject(new Error('Impossibile avviare il server locale per OAuth'))
        return
      }
      const redirectUri = `http://127.0.0.1:${address.port}`
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: SCOPE,
        access_type: 'offline',
        prompt: 'consent',
        code_challenge: challenge,
        code_challenge_method: 'S256'
      })
      settingSet('gdrive_redirect_uri', redirectUri)
      shell.openExternal(`${AUTH_URL}?${params.toString()}`)
    })
    // timeout dopo 3 minuti
    setTimeout(() => {
      reject(new Error('Timeout autorizzazione Google (3 minuti)'))
      server.close()
    }, 180000).unref()
  })

  const redirectUri = settingGet('gdrive_redirect_uri') ?? ''
  const body = new URLSearchParams({
    client_id: clientId,
    code,
    code_verifier: verifier,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri
  })
  if (clientSecret) body.set('client_secret', clientSecret)

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  })
  if (!res.ok) {
    throw new Error(`Scambio token fallito (${res.status}): ${(await res.text()).slice(0, 300)}`)
  }
  const data = (await res.json()) as {
    access_token: string
    refresh_token?: string
    expires_in: number
  }
  saveToken({
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? null,
    expires_at: Date.now() + (data.expires_in - 60) * 1000
  })
  return gdriveStatus()
}

async function getAccessToken(): Promise<string> {
  const token = loadToken()
  if (!token) throw new Error('Google Drive non connesso')
  if (Date.now() < token.expires_at) return token.access_token
  if (!token.refresh_token) throw new Error('Sessione Google scaduta: riconnetti Google Drive')

  const clientId = settingGet('gdrive_client_id') ?? ''
  const clientSecret = settingGet('gdrive_client_secret') ?? ''
  const body = new URLSearchParams({
    client_id: clientId,
    refresh_token: token.refresh_token,
    grant_type: 'refresh_token'
  })
  if (clientSecret) body.set('client_secret', clientSecret)
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  })
  if (!res.ok) {
    gdriveDisconnect()
    throw new Error('Refresh token Google fallito: riconnetti Google Drive')
  }
  const data = (await res.json()) as { access_token: string; expires_in: number }
  saveToken({
    access_token: data.access_token,
    refresh_token: token.refresh_token,
    expires_at: Date.now() + (data.expires_in - 60) * 1000
  })
  return data.access_token
}

export async function gdriveListFiles(): Promise<
  { id: string; name: string; size: number; modifiedTime: string; mimeType: string }[]
> {
  const accessToken = await getAccessToken()
  const q = encodeURIComponent(
    "trashed=false and (mimeType='text/csv' or mimeType='application/vnd.ms-excel' or mimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' or name contains '.csv' or name contains '.xls')"
  )
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=modifiedTime%20desc&pageSize=40&fields=files(id,name,size,modifiedTime,mimeType)`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) throw new Error(`Errore Drive (${res.status}): ${(await res.text()).slice(0, 200)}`)
  const data = (await res.json()) as {
    files: { id: string; name: string; size?: string; modifiedTime: string; mimeType: string }[]
  }
  return data.files.map((f) => ({
    id: f.id,
    name: f.name,
    size: Number(f.size ?? 0),
    modifiedTime: f.modifiedTime,
    mimeType: f.mimeType
  }))
}

export async function gdriveDownload(fileId: string): Promise<Buffer> {
  const accessToken = await getAccessToken()
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  if (!res.ok) throw new Error(`Download da Drive fallito (${res.status})`)
  return Buffer.from(await res.arrayBuffer())
}
