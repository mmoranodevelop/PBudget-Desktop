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
    <div className="flex h-screen">
      <nav className="flex w-56 shrink-0 flex-col gap-1 border-r border-sidebar-border bg-sidebar p-3">
        <div className="mb-4 flex items-center gap-2 px-2 pt-1">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Wallet className="size-4.5" />
          </div>
          <span className="text-base font-semibold tracking-tight">Budget App</span>
        </div>
        {NAV.map((n) => {
          const Icon = n.icon
          const active = page === n.page
          return (
            <button
              key={n.page}
              onClick={() => setPage(n.page)}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
                active
                  ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                  : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'
              )}
            >
              <Icon className="size-4" />
              {n.label}
            </button>
          )
        })}
        <div className="flex-1" />
        <Button onClick={startImportFromDialog} className="mx-1">
          <FileUp className="size-4" />
          Importa file
        </Button>
      </nav>

      <main className="flex-1 overflow-y-auto p-7">
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription className="flex items-center justify-between gap-3">
              <span>{error}</span>
              <Button variant="ghost" size="icon-sm" onClick={() => setError(null)}>
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
      </main>
    </div>
  )
}
