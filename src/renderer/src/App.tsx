import { useCallback, useEffect, useState } from 'react'
import {
  LayoutDashboard, List, Target, TrendingUp, BarChart3, Tags, Settings as SettingsIcon,
  FileUp, Wallet, X, type LucideIcon
} from 'lucide-react'
import type { Category, ImportAnalysis, Tag } from '@shared/types'
import { api } from './api'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { cn } from '@/lib/utils'
import Dashboard from './pages/Dashboard'
import Transactions from './pages/Transactions'
import Budget from './pages/Budget'
import Forecast from './pages/Forecast'
import Reports from './pages/Reports'
import CategoriesRules from './pages/CategoriesRules'
import Settings from './pages/Settings'
import ImportWizard from './pages/ImportWizard'

export type Page =
  | 'dashboard' | 'transactions' | 'budget' | 'forecast' | 'reports' | 'rules' | 'settings' | 'import'

const NAV: { page: Page; label: string; icon: LucideIcon }[] = [
  { page: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { page: 'transactions', label: 'Movimenti', icon: List },
  { page: 'budget', label: 'Budget', icon: Target },
  { page: 'forecast', label: 'Proiezioni', icon: TrendingUp },
  { page: 'reports', label: 'Report', icon: BarChart3 },
  { page: 'rules', label: 'Categorie e Regole', icon: Tags },
  { page: 'settings', label: 'Impostazioni', icon: SettingsIcon }
]

export default function App(): JSX.Element {
  const [page, setPage] = useState<Page>('dashboard')
  const [categories, setCategories] = useState<Category[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [importAnalysis, setImportAnalysis] = useState<ImportAnalysis | null>(null)
  const [dataVersion, setDataVersion] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const refreshMeta = useCallback(async () => {
    const [cats, tgs] = await Promise.all([api.catList(), api.tagList()])
    setCategories(cats)
    setTags(tgs)
  }, [])

  useEffect(() => {
    refreshMeta().catch((e) => setError(String(e.message ?? e)))
  }, [refreshMeta])

  const bumpData = useCallback(() => setDataVersion((v) => v + 1), [])

  const startImportFromDialog = useCallback(async () => {
    try {
      setError(null)
      const analysis = await api.importPickFile()
      if (analysis) {
        setImportAnalysis(analysis)
        setPage('import')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  const startImportFromFile = useCallback(async (file: File) => {
    try {
      setError(null)
      const buf = await file.arrayBuffer()
      const analysis = await api.importAnalyzeBuffer(file.name, buf)
      setImportAnalysis(analysis)
      setPage('import')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  const startImportFromAnalysis = useCallback((analysis: ImportAnalysis) => {
    setImportAnalysis(analysis)
    setPage('import')
  }, [])

  const finishImport = useCallback(
    (goTo: Page) => {
      setImportAnalysis(null)
      bumpData()
      setPage(goTo)
    },
    [bumpData]
  )

  return (
    <div className="app-shell flex h-screen overflow-hidden">
      <nav aria-label="Navigazione principale" className="flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar/85 p-4 backdrop-blur-xl">
        <div className="mb-8 flex items-center gap-3 px-2 pt-1">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-emerald-900/15">
            <Wallet className="size-5" />
          </div>
          <div>
            <span className="block text-base font-bold tracking-tight">Budget</span>
            <span className="block text-[11px] font-medium tracking-wide text-muted-foreground">GESTIONE PERSONALE</span>
          </div>
        </div>

        <p className="mb-2 px-3 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground">PANORAMICA</p>
        <div className="space-y-1">
          {NAV.map((n) => {
            const Icon = n.icon
            const active = page === n.page
            return (
              <button
                key={n.page}
                aria-current={active ? 'page' : undefined}
                onClick={() => setPage(n.page)}
                className={cn(
                  'group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-[background-color,color,box-shadow,transform] duration-150 ease-[var(--ease-out)] focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 active:scale-[0.985]',
                  active
                    ? 'bg-sidebar-accent font-semibold text-sidebar-accent-foreground shadow-sm before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-primary'
                    : 'text-muted-foreground hover:bg-sidebar-accent/65 hover:text-sidebar-foreground'
                )}
              >
                <Icon className={cn('size-[18px] transition-transform duration-150 ease-[var(--ease-out)] group-hover:scale-105', active && 'text-primary')} />
                {n.label}
              </button>
            )
          })}
        </div>

        <div className="flex-1" />
        <div className="rounded-2xl border border-sidebar-border bg-card/70 p-3 shadow-sm">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Hai un nuovo estratto conto?</p>
          <Button onClick={startImportFromDialog} className="w-full">
            <FileUp className="size-4" />
            Importa file
          </Button>
        </div>
      </nav>

      <main id="main-content" className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto min-h-full max-w-[1600px] px-6 py-7 xl:px-10 xl:py-9">
          <div key={page} className="page-enter">
            {error && (
              <Alert variant="destructive" className="mb-5">
                <AlertDescription className="flex items-center justify-between gap-3">
                  <span>{error}</span>
                  <Button aria-label="Chiudi avviso" variant="ghost" size="icon-sm" onClick={() => setError(null)}>
                    <X className="size-4" />
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            {page === 'dashboard' && (
              <Dashboard
                key={dataVersion}
                onImportClick={startImportFromDialog}
                onImportFile={startImportFromFile}
                onImportAnalysis={startImportFromAnalysis}
                onNavigate={setPage}
                onError={setError}
              />
            )}
            {page === 'transactions' && (
              <Transactions key={dataVersion} categories={categories} tags={tags} onMetaChange={refreshMeta} />
            )}
            {page === 'budget' && <Budget key={dataVersion} categories={categories} />}
            {page === 'forecast' && <Forecast key={dataVersion} />}
            {page === 'reports' && <Reports key={dataVersion} />}
            {page === 'rules' && (
              <CategoriesRules
                categories={categories}
                tags={tags}
                onChanged={() => {
                  refreshMeta()
                  bumpData()
                }}
              />
            )}
            {page === 'settings' && <Settings onError={setError} />}
            {page === 'import' && importAnalysis && (
              <ImportWizard
                analysis={importAnalysis}
                categories={categories}
                onCancel={() => finishImport('dashboard')}
                onDone={() => finishImport('transactions')}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
