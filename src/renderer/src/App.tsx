import { useCallback, useEffect, useState } from 'react'
import {
  LayoutDashboard, List, Target, TrendingUp, BarChart3, Tags, Settings as SettingsIcon, Landmark, Wand2,
  FileUp, PanelLeftClose, PanelLeftOpen, Wallet, type LucideIcon
} from 'lucide-react'
import type { Category, ImportAnalysis, Tag } from '@shared/types'
import { api } from './api'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { SidebarMascot } from '@/components/sidebar-mascot'
import { ToastViewport } from '@/components/ui/toast'
import Dashboard from './pages/Dashboard'
import Transactions from './pages/Transactions'
import Budget from './pages/Budget'
import Forecast from './pages/Forecast'
import Reports from './pages/Reports'
import CategoriesRules from './pages/CategoriesRules'
import Settings from './pages/Settings'
import ImportWizard from './pages/ImportWizard'
import Accounts from './pages/Accounts'

export type Page =
  | 'dashboard' | 'transactions' | 'budget' | 'forecast' | 'reports' | 'categories' | 'rules' | 'accounts' | 'settings' | 'import'

const NAV: { page: Page; label: string; icon: LucideIcon }[] = [
  { page: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { page: 'transactions', label: 'Movimenti', icon: List },
  { page: 'budget', label: 'Budget', icon: Target },
  { page: 'forecast', label: 'Proiezioni', icon: TrendingUp },
  { page: 'reports', label: 'Report', icon: BarChart3 },
  { page: 'categories', label: 'Categorie', icon: Tags },
  { page: 'rules', label: 'Regole', icon: Wand2 },
  { page: 'accounts', label: 'Conti e carte', icon: Landmark },
  { page: 'settings', label: 'Impostazioni', icon: SettingsIcon }
]

export default function App(): JSX.Element {
  const [page, setPage] = useState<Page>('dashboard')
  const [categories, setCategories] = useState<Category[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [importAnalysis, setImportAnalysis] = useState<ImportAnalysis | null>(null)
  const [dataVersion, setDataVersion] = useState(0)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const refreshMeta = useCallback(async () => {
    const [cats, tgs] = await Promise.all([api.catList(), api.tagList()])
    setCategories(cats)
    setTags(tgs)
  }, [])

  useEffect(() => {
    refreshMeta().catch(() => undefined)
  }, [refreshMeta])

  const bumpData = useCallback(() => setDataVersion((v) => v + 1), [])

  const startImportFromDialog = useCallback(() => { setImportAnalysis(null); setPage('import') }, [])

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
      <nav aria-label="Navigazione principale" className={cn('flex shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-4 transition-[width] duration-200 ease-[var(--ease-out)]', sidebarCollapsed ? 'w-20' : 'w-64')}>
        <div className={cn('mb-8 flex items-center px-2 pt-1', sidebarCollapsed ? 'justify-center' : 'gap-3')}>
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-emerald-900/15">
            <Wallet className="size-5" />
          </div>
          {!sidebarCollapsed && <div>
            <span className="block text-base font-bold tracking-tight">Budget</span>
            <span className="block text-[11px] font-medium tracking-wide text-muted-foreground">GESTIONE PERSONALE</span>
          </div>}
        </div>

        {!sidebarCollapsed && <p className="mb-2 px-3 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground">PANORAMICA</p>}
        <div className="space-y-1">
          {NAV.map((n) => {
            const Icon = n.icon
            const active = page === n.page
            return (
              <button
                key={n.page}
                aria-current={active ? 'page' : undefined}
                title={sidebarCollapsed ? n.label : undefined}
                onClick={() => setPage(n.page)}
                className={cn(
                  'group relative flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm transition-[background-color,color,box-shadow,transform] duration-150 ease-[var(--ease-out)] focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 active:scale-[0.985]',
                  sidebarCollapsed ? 'justify-center' : 'gap-3',
                  active
                    ? 'bg-sidebar-accent font-semibold text-sidebar-accent-foreground shadow-sm before:absolute before:inset-y-2 before:left-0 before:rounded-full before:bg-primary'
                    : 'text-muted-foreground hover:bg-sidebar-accent/65 hover:text-sidebar-foreground'
                )}
              >
                <Icon className={cn('size-[18px] transition-transform duration-150 ease-[var(--ease-out)] group-hover:scale-105', active && 'text-primary')} />
                {!sidebarCollapsed && n.label}
              </button>
            )
          })}
        </div>

        <div className="flex-1" />
        <div className={cn('flex flex-col items-center rounded-xl border border-sidebar-border bg-card/70 p-3 text-center', sidebarCollapsed && 'border-0 bg-transparent p-0')}>
          <SidebarMascot collapsed={sidebarCollapsed} />
          {!sidebarCollapsed && <p className="mb-2 text-xs font-medium text-muted-foreground">Hai un nuovo estratto conto?</p>}
          <Button onClick={startImportFromDialog} className="w-full" title="Importa file">
            <FileUp className="size-4" />
            {!sidebarCollapsed && 'Importa file'}
          </Button>
        </div>
        <Button variant="ghost" size="icon" className="mt-3 self-center" onClick={() => setSidebarCollapsed((v) => !v)} title={sidebarCollapsed ? 'Espandi barra laterale' : 'Riduci barra laterale'}>{sidebarCollapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}</Button>
      </nav>

      <main id="main-content" className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto min-h-full max-w-[1600px] px-6 py-7 xl:px-10 xl:py-9">
          <div key={page} className="page-enter">
            {page === 'dashboard' && (
              <Dashboard
                key={dataVersion}
                categories={categories}
                onNavigate={setPage}
                onDataChange={bumpData}
              />
            )}
            {page === 'transactions' && (
              <Transactions key={dataVersion} categories={categories} tags={tags} onMetaChange={refreshMeta} />
            )}
            {page === 'budget' && <Budget key={dataVersion} categories={categories} />}
            {page === 'forecast' && <Forecast key={dataVersion} />}
            {page === 'reports' && <Reports key={dataVersion} />}
            {page === 'categories' && (
              <CategoriesRules
                categories={categories}
                tags={tags}
                mode="categories"
                onChanged={() => {
                  refreshMeta()
                  bumpData()
                }}
              />
            )}
            {page === 'rules' && (
              <CategoriesRules
                categories={categories}
                tags={tags}
                mode="rules"
                onChanged={() => {
                  refreshMeta()
                  bumpData()
                }}
              />
            )}
            {page === 'accounts' && <Accounts />}
            {page === 'settings' && <Settings />}
            {page === 'import' && (
              <ImportWizard
                initialAnalysis={importAnalysis}
                categories={categories}
                onCancel={() => finishImport('dashboard')}
                onDone={() => finishImport('transactions')}
              />
            )}
          </div>
        </div>
      </main>
      <ToastViewport />
    </div>
  )
}
