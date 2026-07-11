import { useEffect, useState } from 'react'
import type { Category, Rule, RuleField, RuleMatchType, Tag } from '@shared/types'
import { api } from '../api'
import { CategorySelect, Modal } from '../components'

const FIELD_LABEL: Record<RuleField, string> = {
  description: 'Descrizione',
  merchant: 'Esercente',
  causale: 'Causale'
}
const MATCH_LABEL: Record<RuleMatchType, string> = {
  contains: 'contiene',
  exact: 'uguale a',
  regex: 'regex'
}

export default function CategoriesRules({
  categories, tags, onChanged
}: {
  categories: Category[]
  tags: Tag[]
  onChanged: () => void
}): JSX.Element {
  const [rules, setRules] = useState<Rule[]>([])
  const [editCat, setEditCat] = useState<Partial<Category> | null>(null)
  const [deleteCat, setDeleteCat] = useState<Category | null>(null)
  const [reassignTo, setReassignTo] = useState<number | null>(null)
  const [newRule, setNewRule] = useState<{ field: RuleField; matchType: RuleMatchType; pattern: string; categoryId: number | null }>({
    field: 'merchant', matchType: 'contains', pattern: '', categoryId: null
  })
  const [testCount, setTestCount] = useState<number | null>(null)
  const [applyResult, setApplyResult] = useState<number | null>(null)

  const loadRules = (): void => {
    api.ruleList().then(setRules).catch(console.error)
  }
  useEffect(loadRules, [])

  const saveCat = async (): Promise<void> => {
    if (!editCat?.name) return
    if (editCat.id) {
      await api.catUpdate(editCat.id, editCat)
    } else {
      await api.catCreate({
        name: editCat.name,
        color: editCat.color ?? '#8884d8',
        type: editCat.type ?? 'expense',
        parentId: editCat.parentId ?? null,
        sortOrder: 999
      })
    }
    setEditCat(null)
    onChanged()
  }

  const confirmDeleteCat = async (): Promise<void> => {
    if (!deleteCat) return
    await api.catDelete(deleteCat.id, reassignTo)
    setDeleteCat(null)
    setReassignTo(null)
    onChanged()
  }

  const createRule = async (): Promise<void> => {
    if (!newRule.pattern.trim() || newRule.categoryId == null) return
    await api.ruleCreate({
      field: newRule.field,
      matchType: newRule.matchType,
      pattern: newRule.pattern.trim(),
      categoryId: newRule.categoryId,
      priority: 50,
      active: true
    })
    setNewRule((r) => ({ ...r, pattern: '' }))
    setTestCount(null)
    loadRules()
  }

  const testNewRule = async (): Promise<void> => {
    if (!newRule.pattern.trim()) return
    setTestCount(await api.ruleTest(newRule.field, newRule.matchType, newRule.pattern.trim()))
  }

  const applyAll = async (): Promise<void> => {
    const n = await api.ruleApplyAll(true)
    setApplyResult(n)
    onChanged()
  }

  const parents = categories.filter((c) => c.parentId === null)
  const catName = (id: number): string => categories.find((c) => c.id === id)?.name ?? '?'

  return (
    <div>
      <h1 className="page-title">Categorie & Regole</h1>
      <p className="page-sub">
        Personalizza il kit di categorie e le regole di categorizzazione automatica.
      </p>

      {applyResult != null && (
        <div className="banner success">
          ✓ Regole applicate: {applyResult} movimenti categorizzati.{' '}
          <button className="btn small secondary" onClick={() => setApplyResult(null)}>
            Chiudi
          </button>
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: '1fr 1.3fr' }}>
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
            <h3 style={{ margin: 0 }}>Categorie</h3>
            <button className="btn small" onClick={() => setEditCat({ type: 'expense', color: '#8884d8', parentId: null })}>
              + Nuova
            </button>
          </div>
          <div style={{ maxHeight: 'calc(100vh - 260px)', overflowY: 'auto' }}>
            {parents.map((p) => (
              <div key={p.id} style={{ marginBottom: 8 }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="badge" style={{ background: `${p.color}22`, color: p.color }}>
                    <span className="dot" style={{ background: p.color }} />
                    {p.name}
                    {p.type === 'income' && ' (entrate)'}
                    {p.type === 'transfer' && ' (trasferimenti)'}
                  </span>
                  <span className="row" style={{ gap: 4 }}>
                    <button className="btn small secondary" onClick={() => setEditCat(p)}>
                      ✎
                    </button>
                    {!p.isSystem && (
                      <button className="btn small secondary" onClick={() => setDeleteCat(p)}>
                        🗑
                      </button>
                    )}
                  </span>
                </div>
                <div style={{ paddingLeft: 18 }}>
                  {categories
                    .filter((c) => c.parentId === p.id)
                    .map((c) => (
                      <div key={c.id} className="row small" style={{ justifyContent: 'space-between', padding: '2px 0' }}>
                        <span className="muted">{c.name}</span>
                        <span className="row" style={{ gap: 4 }}>
                          <button className="btn small secondary" onClick={() => setEditCat(c)}>
                            ✎
                          </button>
                          <button className="btn small secondary" onClick={() => setDeleteCat(c)}>
                            🗑
                          </button>
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
            <h3 style={{ margin: 0 }}>Regole di categorizzazione ({rules.length})</h3>
            <button className="btn small secondary" onClick={applyAll}>
              Applica ai non categorizzati
            </button>
          </div>

          <div className="row wrap mb" style={{ background: 'var(--bg)', padding: 10, borderRadius: 8 }}>
            <select
              value={newRule.field}
              onChange={(e) => setNewRule((r) => ({ ...r, field: e.target.value as RuleField }))}
            >
              {Object.entries(FIELD_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <select
              value={newRule.matchType}
              onChange={(e) => setNewRule((r) => ({ ...r, matchType: e.target.value as RuleMatchType }))}
            >
              {Object.entries(MATCH_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <input
              placeholder="pattern (es. LIDL)"
              value={newRule.pattern}
              onChange={(e) => {
                setNewRule((r) => ({ ...r, pattern: e.target.value }))
                setTestCount(null)
              }}
              style={{ width: 140 }}
            />
            <span>→</span>
            <CategorySelect
              categories={categories}
              value={newRule.categoryId}
              onChange={(id) => setNewRule((r) => ({ ...r, categoryId: id }))}
              emptyLabel="— categoria —"
            />
            <button className="btn small secondary" onClick={testNewRule}>
              Test
            </button>
            {testCount != null && (
              <span className="small muted">→ {testCount} movimenti corrispondono</span>
            )}
            <button className="btn small" onClick={createRule} disabled={!newRule.pattern.trim() || newRule.categoryId == null}>
              Crea regola
            </button>
          </div>

          <div className="table-wrap" style={{ maxHeight: 'calc(100vh - 380px)' }}>
            <table>
              <thead>
                <tr>
                  <th>Attiva</th>
                  <th>Campo</th>
                  <th>Match</th>
                  <th>Pattern</th>
                  <th>Categoria</th>
                  <th className="num">Priorità</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id} style={{ opacity: r.active ? 1 : 0.5 }}>
                    <td>
                      <input
                        type="checkbox"
                        checked={r.active}
                        onChange={(e) => api.ruleUpdate(r.id, { active: e.target.checked }).then(loadRules)}
                      />
                    </td>
                    <td className="small">{FIELD_LABEL[r.field]}</td>
                    <td className="small muted">{MATCH_LABEL[r.matchType]}</td>
                    <td className="mono small">{r.pattern}</td>
                    <td className="small">{catName(r.categoryId)}</td>
                    <td className="num small">{r.priority}</td>
                    <td>
                      <button className="btn small secondary" onClick={() => api.ruleDelete(r.id).then(loadRules)}>
                        🗑
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {tags.length > 0 && (
        <div className="card mt">
          <h3>Tag</h3>
          <div className="row wrap">
            {tags.map((t) => (
              <span key={t.id} className="badge" style={{ background: `${t.color}22`, color: t.color }}>
                {t.name}{' '}
                <span
                  style={{ cursor: 'pointer' }}
                  onClick={() => api.tagDelete(t.id).then(onChanged)}
                  title="Elimina tag"
                >
                  ✕
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {editCat && (
        <Modal title={editCat.id ? 'Modifica categoria' : 'Nuova categoria'} onClose={() => setEditCat(null)}>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <label className="field">
              Nome
              <input value={editCat.name ?? ''} onChange={(e) => setEditCat({ ...editCat, name: e.target.value })} />
            </label>
            <label className="field">
              Colore
              <input
                type="color"
                value={editCat.color ?? '#8884d8'}
                onChange={(e) => setEditCat({ ...editCat, color: e.target.value })}
              />
            </label>
            <label className="field">
              Tipo
              <select
                value={editCat.type ?? 'expense'}
                onChange={(e) => setEditCat({ ...editCat, type: e.target.value as Category['type'] })}
              >
                <option value="expense">Spesa</option>
                <option value="income">Entrata</option>
                <option value="transfer">Trasferimento</option>
              </select>
            </label>
            <label className="field">
              Macro-categoria (vuoto = è una macro)
              <select
                value={editCat.parentId ?? ''}
                onChange={(e) =>
                  setEditCat({ ...editCat, parentId: e.target.value === '' ? null : Number(e.target.value) })
                }
              >
                <option value="">— nessuna —</option>
                {parents
                  .filter((p) => p.id !== editCat.id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <div className="actions">
            <button className="btn secondary" onClick={() => setEditCat(null)}>
              Annulla
            </button>
            <button className="btn" onClick={saveCat} disabled={!editCat.name}>
              Salva
            </button>
          </div>
        </Modal>
      )}

      {deleteCat && (
        <Modal title={`Elimina «${deleteCat.name}»`} onClose={() => setDeleteCat(null)}>
          <p>I movimenti di questa categoria verranno riassegnati a:</p>
          <CategorySelect
            categories={categories.filter((c) => c.id !== deleteCat.id)}
            value={reassignTo}
            onChange={setReassignTo}
            emptyLabel="— nessuna categoria —"
          />
          <div className="actions">
            <button className="btn secondary" onClick={() => setDeleteCat(null)}>
              Annulla
            </button>
            <button className="btn danger" onClick={confirmDeleteCat}>
              Elimina categoria
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
