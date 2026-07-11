import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Category, Tag, Transaction, TransactionFilter, TransactionListResult } from '@shared/types'
import { api, fmtDate, fmtEur } from '../api'
import { Amount, CategorySelect, Modal } from '../components'

const PAGE_SIZE = 100

interface SimilarPrompt {
  source: Transaction
  categoryId: number
  similar: Transaction[]
}

export default function Transactions({
  categories, tags, onMetaChange
}: {
  categories: Category[]
  tags: Tag[]
  onMetaChange: () => void
}): JSX.Element {
  const [filter, setFilter] = useState<TransactionFilter>({
    sortBy: 'dateReg',
    sortDir: 'desc',
    limit: PAGE_SIZE,
    offset: 0
  })
  const [data, setData] = useState<TransactionListResult | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [similarPrompt, setSimilarPrompt] = useState<SimilarPrompt | null>(null)
  const [bulkCat, setBulkCat] = useState<number | null>(null)
  const [newTagName, setNewTagName] = useState('')
  const [version, setVersion] = useState(0)

  const load = useCallback(() => {
    api.txList(filter).then(setData).catch(console.error)
  }, [filter])

  useEffect(() => {
    load()
  }, [load, version])

  const patchFilter = (p: Partial<TransactionFilter>): void => {
    setFilter((f) => ({ ...f, ...p, offset: p.offset ?? 0 }))
    setSelected(new Set())
  }

  const refresh = (): void => setVersion((v) => v + 1)

  const setCategory = async (tx: Transaction, categoryId: number | null): Promise<void> => {
    await api.txUpdate(tx.id, { categoryId })
    refresh()
    // suggerisci la categorizzazione massiva dei movimenti simili
    if (categoryId != null) {
      const similar = await api.txSimilar(tx.id)
      const relevant = similar.filter((s) => s.categoryId !== categoryId)
      if (relevant.length > 0) {
        setSimilarPrompt({ source: tx, categoryId, similar: relevant })
      }
    }
  }

  const applySimilar = async (createRule: boolean): Promise<void> => {
    if (!similarPrompt) return
    await api.txBulkCategorize(
      similarPrompt.similar.map((s) => s.id),
      similarPrompt.categoryId
    )
    if (createRule && similarPrompt.source.merchant) {
      await api.ruleCreate({
        field: 'merchant',
        matchType: 'contains',
        pattern: similarPrompt.source.merchant,
        categoryId: similarPrompt.categoryId,
        priority: 50,
        active: true
      })
    }
    setSimilarPrompt(null)
    refresh()
  }

  const bulkApply = async (): Promise<void> => {
    if (selected.size === 0) return
    await api.txBulkCategorize([...selected], bulkCat)
    setSelected(new Set())
    refresh()
  }

  const bulkTag = async (tagId: number): Promise<void> => {
    if (selected.size === 0) return
    await api.txAddTag([...selected], tagId)
    setSelected(new Set())
    refresh()
  }

  const createAndApplyTag = async (): Promise<void> => {
    const name = newTagName.trim()
    if (!name) return
    const tag = await api.tagCreate(name, '#818cf8')
    setNewTagName('')
    onMetaChange()
    if (selected.size > 0) await bulkTag(tag.id)
  }

  const toggleSort = (col: NonNullable<TransactionFilter['sortBy']>): void => {
    patchFilter({
      sortBy: col,
      sortDir: filter.sortBy === col && filter.sortDir === 'desc' ? 'asc' : 'desc'
    })
  }

  const sortArrow = (col: string): string =>
    filter.sortBy === col ? (filter.sortDir === 'asc' ? ' ↑' : ' ↓') : ''

  const rows = data?.rows ?? []
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id))
  const page = Math.floor((filter.offset ?? 0) / PAGE_SIZE)
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

  const catName = useMemo(
    () => (id: number | null) => categories.find((c) => c.id === id)?.name ?? '',
    [categories]
  )

  return (
    <div>
      <h1 className="page-title">Movimenti</h1>
      <p className="page-sub">
        {data
          ? `${data.total} movimenti — entrate ${fmtEur(data.sumIncome)} · uscite ${fmtEur(data.sumExpense)}`
          : 'Caricamento…'}
      </p>

      <div className="toolbar">
        <input
          placeholder="🔍 Cerca descrizione, esercente, note…"
          style={{ width: 260 }}
          value={filter.search ?? ''}
          onChange={(e) => patchFilter({ search: e.target.value || undefined })}
        />
        <input
          type="date"
          value={filter.from ?? ''}
          onChange={(e) => patchFilter({ from: e.target.value || undefined })}
        />
        <input
          type="date"
          value={filter.to ?? ''}
          onChange={(e) => patchFilter({ to: e.target.value || undefined })}
        />
        <CategorySelect
          categories={categories}
          value={filter.categoryIds?.[0] ?? null}
          onChange={(id) => patchFilter({ categoryIds: id != null ? [id] : undefined })}
          emptyLabel="Tutte le categorie"
        />
        <select
          value={filter.type ?? ''}
          onChange={(e) =>
            patchFilter({ type: (e.target.value || undefined) as TransactionFilter['type'] })
          }
        >
          <option value="">Entrate + Uscite</option>
          <option value="expense">Solo uscite</option>
          <option value="income">Solo entrate</option>
        </select>
        <label className="row small">
          <input
            type="checkbox"
            checked={filter.uncategorized ?? false}
            onChange={(e) => patchFilter({ uncategorized: e.target.checked || undefined })}
          />
          Da categorizzare
        </label>
        <label className="row small">
          <input
            type="checkbox"
            checked={filter.includeIgnored ?? false}
            onChange={(e) => patchFilter({ includeIgnored: e.target.checked || undefined })}
          />
          Mostra duplicati ignorati
        </label>
      </div>

      {selected.size > 0 && (
        <div className="banner info row wrap">
          <b>{selected.size} selezionati</b>
          <CategorySelect categories={categories} value={bulkCat} onChange={setBulkCat} emptyLabel="— categoria —" />
          <button className="btn small" onClick={bulkApply}>
            Applica categoria
          </button>
          {tags.length > 0 && (
            <select
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) bulkTag(Number(e.target.value))
                e.target.value = ''
              }}
            >
              <option value="">+ tag…</option>
              {tags.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
          <input
            placeholder="nuovo tag"
            style={{ width: 110 }}
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createAndApplyTag()}
          />
          <button className="btn small secondary" onClick={createAndApplyTag}>
            Crea tag
          </button>
          <div className="spacer" />
          <button className="btn small secondary" onClick={() => setSelected(new Set())}>
            Deseleziona
          </button>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) =>
                    setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())
                  }
                />
              </th>
              <th onClick={() => toggleSort('dateReg')}>Data{sortArrow('dateReg')}</th>
              <th onClick={() => toggleSort('description')}>Descrizione{sortArrow('description')}</th>
              <th className="num" onClick={() => toggleSort('amount')}>
                Importo{sortArrow('amount')}
              </th>
              <th onClick={() => toggleSort('categoryId')}>Categoria{sortArrow('categoryId')}</th>
              <th>Tag</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((tx) => (
              <tr key={tx.id} className={selected.has(tx.id) ? 'selected' : ''}>
                <td>
                  <input
                    type="checkbox"
                    checked={selected.has(tx.id)}
                    onChange={(e) => {
                      const next = new Set(selected)
                      if (e.target.checked) next.add(tx.id)
                      else next.delete(tx.id)
                      setSelected(next)
                    }}
                  />
                </td>
                <td className="mono">{fmtDate(tx.dateReg)}</td>
                <td className="desc-cell" title={tx.description}>
                  {tx.status === 'duplicate_ignored' && (
                    <span className="badge status-duplicate" style={{ marginRight: 6 }}>
                      ignorato
                    </span>
                  )}
                  {tx.description}
                  {tx.merchant && <div className="small muted">{tx.merchant}</div>}
                </td>
                <td className="num">
                  <Amount value={tx.amount} />
                </td>
                <td>
                  {tx.status === 'duplicate_ignored' ? (
                    <button className="btn small secondary" onClick={() => api.txRestoreDuplicate(tx.id).then(refresh)}>
                      Ripristina
                    </button>
                  ) : (
                    <CategorySelect
                      categories={categories}
                      value={tx.categoryId}
                      onChange={(id) => setCategory(tx, id)}
                      emptyLabel="—"
                      style={{ maxWidth: 190 }}
                    />
                  )}
                </td>
                <td>
                  {tx.tags.map((t) => (
                    <span
                      key={t.id}
                      className="badge"
                      style={{ background: `${t.color}22`, color: t.color, marginRight: 4, cursor: 'pointer' }}
                      title="Clicca per rimuovere"
                      onClick={() => api.txRemoveTag(tx.id, t.id).then(refresh)}
                    >
                      {t.name} ✕
                    </span>
                  ))}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 24 }}>
                  Nessun movimento trovato. Importa un estratto conto dalla dashboard.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="row mt">
        <button
          className="btn small secondary"
          disabled={page === 0}
          onClick={() => setFilter((f) => ({ ...f, offset: Math.max(0, (f.offset ?? 0) - PAGE_SIZE) }))}
        >
          ← Precedente
        </button>
        <span className="small muted">
          Pagina {page + 1} di {totalPages}
        </span>
        <button
          className="btn small secondary"
          disabled={page + 1 >= totalPages}
          onClick={() => setFilter((f) => ({ ...f, offset: (f.offset ?? 0) + PAGE_SIZE }))}
        >
          Successiva →
        </button>
      </div>

      {similarPrompt && (
        <Modal title="Movimenti simili trovati" onClose={() => setSimilarPrompt(null)}>
          <p>
            Ci sono <b>{similarPrompt.similar.length}</b> movimenti simili a{' '}
            <i>«{similarPrompt.source.merchant ?? similarPrompt.source.description.slice(0, 50)}»</i>.
            <br />
            Applicare la categoria <b>{catName(similarPrompt.categoryId)}</b> a tutti?
          </p>
          <div className="table-wrap" style={{ maxHeight: 220 }}>
            <table>
              <tbody>
                {similarPrompt.similar.slice(0, 30).map((s) => (
                  <tr key={s.id}>
                    <td className="mono">{fmtDate(s.dateReg)}</td>
                    <td className="desc-cell" style={{ maxWidth: 300 }}>{s.description}</td>
                    <td className="num">
                      <Amount value={s.amount} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="actions">
            <button className="btn secondary" onClick={() => setSimilarPrompt(null)}>
              No, solo questo
            </button>
            {similarPrompt.source.merchant && (
              <button className="btn secondary" onClick={() => applySimilar(true)}>
                Sì + crea regola
              </button>
            )}
            <button className="btn" onClick={() => applySimilar(false)}>
              Sì, applica a tutti
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
