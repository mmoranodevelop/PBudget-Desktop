import { useCallback, useEffect, useState } from 'react'
import type { Category, ImportAnalysis, Tag } from '@shared/types'
import { api } from './api'
import Dashboard from './pages/Dashboard'
import Transactions from './pages/Transactions'
import Budget from './pages/Budget'
import Forecast from './pages/Forecast'
import CategoriesRules from './pages/CategoriesRules'
import Settings from './pages/Settings'
import ImportWizard from './pages/ImportWizard'

export type Page = 'dashboard' | 'transactions' | 'budget' | 'forecast' | 'rules' | 'settings' | 'import'

const NAV: { page: Page; label: string; icon: string }[] = [
  { page: 'dashboard', label: 'Dashboard', icon: '📊' },
  { page: 'transactions', label: 'Movimenti', icon: '📋' },
  { page: 'budget', label: 'Budget', icon: '🎯' },
  { page: 'forecast', label: 'Proiezioni', icon: '📈' },
  { page: 'rules', label: 'Categorie & Regole', icon: '🏷️' },
  { page: 'settings', label: 'Impostazioni', icon: '⚙️' }
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

  const finishImport = useCallback(
    (goTo: Page) => {
      setImportAnalysis(null)
      bumpData()
      setPage(goTo)
    },
    [bumpData]
  )

  return (
    <>
      <nav className="sidebar">
        <div className="logo">💶 Budget App</div>
        {NAV.map((n) => (
          <button
            key={n.page}
            className={`nav-item ${page === n.page ? 'active' : ''}`}
            onClick={() => setPage(n.page)}
          >
            <span className="icon">{n.icon}</span> {n.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button className="btn" onClick={startImportFromDialog} style={{ margin: '0 4px' }}>
          + Importa file
        </button>
      </nav>
      <main className="main">
        {error && (
          <div className="banner error">
            {error}{' '}
            <button className="btn small secondary" onClick={() => setError(null)}>
              Chiudi
            </button>
          </div>
        )}
        {page === 'dashboard' && (
          <Dashboard
            key={dataVersion}
            categories={categories}
            onImportClick={startImportFromDialog}
            onImportFile={startImportFromFile}
            onNavigate={setPage}
          />
        )}
        {page === 'transactions' && (
          <Transactions key={dataVersion} categories={categories} tags={tags} onMetaChange={refreshMeta} />
        )}
        {page === 'budget' && <Budget key={dataVersion} categories={categories} />}
        {page === 'forecast' && <Forecast key={dataVersion} />}
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
        {page === 'settings' && <Settings />}
        {page === 'import' && importAnalysis && (
          <ImportWizard
            analysis={importAnalysis}
            categories={categories}
            onCancel={() => finishImport('dashboard')}
            onDone={() => finishImport('transactions')}
          />
        )}
      </main>
    </>
  )
}
