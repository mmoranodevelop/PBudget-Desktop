import type { BudgetApi } from '@shared/types'

declare global {
  interface Window {
    budgetApi: BudgetApi
  }
}

const rawApi = window.budgetApi
export const api = new Proxy({} as typeof rawApi, {
  get(_target, property) {
    const value = Reflect.get(rawApi, property)
    if (typeof value !== 'function') return value
    return (...args: unknown[]) => Promise.resolve(value.apply(rawApi, args)).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      if (error instanceof Error) Object.defineProperty(error, '__budgetApiNotified', { value: true, configurable: true })
      window.dispatchEvent(new CustomEvent('budget:api-error', { detail: message }))
      throw error
    })
  }
}) as typeof rawApi

export function fmtEur(n: number): string {
  return n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })
}

export function fmtDate(iso: string | null): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export const MONTH_NAMES = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
]

export const MONTH_SHORT = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic']
