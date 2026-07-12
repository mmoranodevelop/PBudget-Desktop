import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

type ToastKind = 'success' | 'error' | 'info'
interface ToastPayload { id?: number; kind: ToastKind; title: string; description?: string }
interface ToastItem { id: number; kind: ToastKind; title: string; description?: string }
const EVENT = 'budget:toast'
let sequence = 0

function emit(payload: Omit<ToastPayload, 'id'>): void {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { ...payload, id: ++sequence } }))
}

export const toast = {
  success: (title: string, description?: string): void => emit({ kind: 'success', title, description }),
  error: (title: string, description?: string): void => emit({ kind: 'error', title, description }),
  info: (title: string, description?: string): void => emit({ kind: 'info', title, description })
}

export function ToastViewport(): JSX.Element {
  const [items, setItems] = useState<ToastItem[]>([])
  useEffect(() => {
    let lastError = ''
    let lastErrorAt = 0
    const push = (payload: ToastPayload): void => {
      if (payload.kind === 'error' && payload.title === lastError && Date.now() - lastErrorAt < 1200) return
      if (payload.kind === 'error') { lastError = payload.title; lastErrorAt = Date.now() }
      const item: ToastItem = { ...payload, id: payload.id ?? ++sequence }
      setItems((current) => [...current.slice(-3), item])
      window.setTimeout(() => setItems((current) => current.filter((toastItem) => toastItem.id !== item.id)), 4800)
    }
    const onToast = (event: Event): void => push((event as CustomEvent<ToastPayload>).detail)
    const onApiError = (event: Event): void => push({ kind: 'error', title: (event as CustomEvent<string>).detail || 'Operazione non riuscita' })
    const onUnhandled = (event: PromiseRejectionEvent): void => {
      event.preventDefault()
      const reason = event.reason
      push({ kind: 'error', title: reason instanceof Error ? reason.message : String(reason || 'Errore imprevisto') })
    }
    const onWindowError = (event: ErrorEvent): void => push({ kind: 'error', title: event.error instanceof Error ? event.error.message : event.message || 'Errore imprevisto' })
    window.addEventListener(EVENT, onToast)
    window.addEventListener('budget:api-error', onApiError)
    window.addEventListener('unhandledrejection', onUnhandled)
    window.addEventListener('error', onWindowError)
    return () => { window.removeEventListener(EVENT, onToast); window.removeEventListener('budget:api-error', onApiError); window.removeEventListener('unhandledrejection', onUnhandled); window.removeEventListener('error', onWindowError) }
  }, [])
  return <div aria-live="polite" aria-relevant="additions" className="pointer-events-none fixed right-5 bottom-5 flex w-[min(24rem,calc(100vw-2.5rem))] flex-col gap-2" style={{ zIndex: 'var(--z-toast)' }}>{items.map((item) => { const Icon = item.kind === 'success' ? CheckCircle2 : item.kind === 'error' ? AlertCircle : Info; return <div key={item.id} role={item.kind === 'error' ? 'alert' : 'status'} className="toast-enter pointer-events-auto flex items-start gap-3 rounded-xl border bg-popover p-3.5 text-popover-foreground shadow-lg shadow-emerald-950/10"><Icon className={`mt-0.5 size-4 shrink-0 ${item.kind === 'success' ? 'text-chart-income' : item.kind === 'error' ? 'text-destructive' : 'text-primary'}`} /><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{item.title}</p>{item.description && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{item.description}</p>}</div><Button variant="ghost" size="icon-xs" aria-label="Chiudi notifica" onClick={() => setItems((current) => current.filter((toastItem) => toastItem.id !== item.id))}><X /></Button></div> })}</div>
}
