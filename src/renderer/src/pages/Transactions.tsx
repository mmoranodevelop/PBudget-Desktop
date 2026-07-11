import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, RotateCcw, Search,
  StickyNote, Tag as TagIcon, X, Wand2
} from 'lucide-react'
import type { Category, Tag, Transaction, TransactionFilter, TransactionListResult } from '@shared/types'
import { api, fmtDate, fmtEur } from '../api'
import { Amount, CategorySelect, ModalShell } from '../components'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 100
const ALL = '__all__'

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
  const [noteTx, setNoteTx] = useState<Transaction | null>(null)
  const [noteText, setNoteText] = useState('')
  const [exportMsg, setExportMsg] = useState<string | null>(null)
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
    if (categoryId != null) {
      const similar = await api.txSimilar(tx.id)
      const relevant = similar.filter((s) => s.categoryId !== categoryId)
      if (relevant.length > 0) setSimilarPrompt({ source: tx, categoryId, similar: relevant })
    }
  }

  const applySimilar = async (createRule: boolean): Promise<void> => {
    if (!similarPrompt) return
    await api.txBulkCategorize(similarPrompt.similar.map((s) => s.id), similarPrompt.categoryId)
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
    const tag = await api.tagCreate(name, '#9085e9')
    setNewTagName('')
    onMetaChange()
    if (selected.size > 0) await bulkTag(tag.id)
  }

  const saveNote = async (): Promise<void> => {
    if (!noteTx) return
    await api.txUpdate(noteTx.id, { notes: noteText.trim() || null })
    setNoteTx(null)
    refresh()
  }

  const doExport = async (format: 'csv' | 'xlsx'): Promise<void> => {
    const path = await api.txExport(filter, format)
    if (path) setExportMsg(`Esportato in ${path}`)
  }

  const toggleSort = (col: NonNullable<TransactionFilter['sortBy']>): void => {
    patchFilter({
      sortBy: col,
      sortDir: filter.sortBy === col && filter.sortDir === 'desc' ? 'asc' : 'desc'
    })
  }

  const SortHead = ({
    col, children, className
  }: {
    col: NonNullable<TransactionFilter['sortBy']>
    children: React.ReactNode
    className?: string
  }): JSX.Element => (
    <TableHead
      className={cn('cursor-pointer select-none whitespace-nowrap', className)}
      onClick={() => toggleSort(col)}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {filter.sortBy === col &&
          (filter.sortDir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
      </span>
    </TableHead>
  )

  const rows = data?.rows ?? []
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id))
  const page = Math.floor((filter.offset ?? 0) / PAGE_SIZE)
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

  const catName = useMemo(
    () => (id: number | null) => categories.find((c) => c.id === id)?.name ?? '',
    [categories]
  )

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Movimenti</h1>
          <p className="text-sm text-muted-foreground">
            {data
              ? `${data.total} movimenti — entrate ${fmtEur(data.sumIncome)} · uscite ${fmtEur(data.sumExpense)}`
              : 'Caricamento…'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => doExport('csv')}>
            <Download className="size-4" />
            CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => doExport('xlsx')}>
            <Download className="size-4" />
            Excel
          </Button>
        </div>
      </div>

      {exportMsg && (
        <div className="flex items-center justify-between rounded-md border border-chart-income/40 bg-chart-income/5 px-3 py-2 text-sm">
          <span>{exportMsg}</span>
          <Button variant="ghost" size="icon-sm" onClick={() => setExportMsg(null)}>
            <X className="size-4" />
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Cerca descrizione, esercente, note"
            className="h-8 w-64 pl-8"
            value={filter.search ?? ''}
            onChange={(e) => patchFilter({ search: e.target.value || undefined })}
          />
        </div>
        <Input
          type="date"
          className="h-8 w-36"
          value={filter.from ?? ''}
          onChange={(e) => patchFilter({ from: e.target.value || undefined })}
        />
        <Input
          type="date"
          className="h-8 w-36"
          value={filter.to ?? ''}
          onChange={(e) => patchFilter({ to: e.target.value || undefined })}
        />
        <CategorySelect
          categories={categories}
          value={filter.categoryIds?.[0] ?? null}
          onChange={(id) => patchFilter({ categoryIds: id != null ? [id] : undefined })}
          emptyLabel="Tutte le categorie"
        />
        <Select
          value={filter.type ?? ALL}
          onValueChange={(v) =>
            patchFilter({ type: v === ALL ? undefined : (v as TransactionFilter['type']) })
          }
        >
          <SelectTrigger size="sm" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Entrate e uscite</SelectItem>
            <SelectItem value="expense">Solo uscite</SelectItem>
            <SelectItem value="income">Solo entrate</SelectItem>
          </SelectContent>
        </Select>
        <label className="flex items-center gap-1.5 text-sm">
          <Checkbox
            checked={filter.uncategorized ?? false}
            onCheckedChange={(v) => patchFilter({ uncategorized: v === true || undefined })}
          />
          Da categorizzare
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          <Checkbox
            checked={filter.includeIgnored ?? false}
            onCheckedChange={(v) => patchFilter({ includeIgnored: v === true || undefined })}
          />
          Duplicati ignorati
        </label>
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-accent/40 px-3 py-2">
          <span className="text-sm font-medium">{selected.size} selezionati</span>
          <CategorySelect
            categories={categories}
            value={bulkCat}
            onChange={setBulkCat}
            emptyLabel="Categoria"
          />
          <Button size="sm" onClick={bulkApply}>
            Applica categoria
          </Button>
          {tags.length > 0 && (
            <Select value="" onValueChange={(v) => v && bulkTag(Number(v))}>
              <SelectTrigger size="sm" className="w-32">
                <SelectValue placeholder="Aggiungi tag" />
              </SelectTrigger>
              <SelectContent>
                {tags.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Input
            placeholder="nuovo tag"
            className="h-8 w-28"
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createAndApplyTag()}
          />
          <Button variant="outline" size="sm" onClick={createAndApplyTag}>
            <TagIcon className="size-4" />
            Crea tag
          </Button>
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
            <X className="size-4" />
            Deseleziona
          </Button>
        </div>
      )}

      <div className="max-h-[calc(100vh-320px)] overflow-auto rounded-md border">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow>
              <TableHead className="w-8">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(v) =>
                    setSelected(v === true ? new Set(rows.map((r) => r.id)) : new Set())
                  }
                />
              </TableHead>
              <SortHead col="dateReg">Data</SortHead>
              <SortHead col="description">Descrizione</SortHead>
              <SortHead col="amount" className="text-right">
                Importo
              </SortHead>
              <SortHead col="categoryId">Categoria</SortHead>
              <TableHead>Tag</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((tx) => (
              <TableRow key={tx.id} className={cn(selected.has(tx.id) && 'bg-accent/40')}>
                <TableCell>
                  <Checkbox
                    checked={selected.has(tx.id)}
                    onCheckedChange={(v) => {
                      const next = new Set(selected)
                      if (v === true) next.add(tx.id)
                      else next.delete(tx.id)
                      setSelected(next)
                    }}
                  />
                </TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">{fmtDate(tx.dateReg)}</TableCell>
                <TableCell className="max-w-96">
                  <div className="flex items-center gap-2">
                    {tx.status === 'duplicate_ignored' && (
                      <Badge variant="outline" className="border-chart-expense/40 text-chart-expense">
                        ignorato
                      </Badge>
                    )}
                    <span className="truncate" title={tx.description}>
                      {tx.description}
                    </span>
                  </div>
                  {tx.merchant && <div className="text-xs text-muted-foreground">{tx.merchant}</div>}
                  {tx.notes && (
                    <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <StickyNote className="size-3" />
                      {tx.notes}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Amount value={tx.amount} />
                </TableCell>
                <TableCell>
                  {tx.status === 'duplicate_ignored' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => api.txRestoreDuplicate(tx.id).then(refresh)}
                    >
                      <RotateCcw className="size-3.5" />
                      Ripristina
                    </Button>
                  ) : (
                    <CategorySelect
                      categories={categories}
                      value={tx.categoryId}
                      onChange={(id) => setCategory(tx, id)}
                      emptyLabel="Nessuna"
                      className="max-w-48"
                    />
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {tx.tags.map((t) => (
                      <button
                        key={t.id}
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                        style={{ backgroundColor: `${t.color}1f`, color: t.color }}
                        title="Rimuovi tag"
                        onClick={() => api.txRemoveTag(tx.id, t.id).then(refresh)}
                      >
                        {t.name}
                        <X className="size-3" />
                      </button>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Note"
                    onClick={() => {
                      setNoteTx(tx)
                      setNoteText(tx.notes ?? '')
                    }}
                  >
                    <StickyNote className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  Nessun movimento trovato. Importa un estratto conto dalla dashboard.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          disabled={page === 0}
          onClick={() => setFilter((f) => ({ ...f, offset: Math.max(0, (f.offset ?? 0) - PAGE_SIZE) }))}
        >
          <ChevronLeft className="size-4" />
          Precedente
        </Button>
        <span className="text-sm text-muted-foreground">
          Pagina {page + 1} di {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page + 1 >= totalPages}
          onClick={() => setFilter((f) => ({ ...f, offset: (f.offset ?? 0) + PAGE_SIZE }))}
        >
          Successiva
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {similarPrompt && (
        <ModalShell
          title="Movimenti simili trovati"
          description={`${similarPrompt.similar.length} movimenti simili a "${
            similarPrompt.source.merchant ?? similarPrompt.source.description.slice(0, 50)
          }". Applicare la categoria ${catName(similarPrompt.categoryId)} a tutti?`}
          onClose={() => setSimilarPrompt(null)}
          wide
        >
          <div className="max-h-56 overflow-y-auto rounded-md border">
            <Table>
              <TableBody>
                {similarPrompt.similar.slice(0, 30).map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="whitespace-nowrap tabular-nums">{fmtDate(s.dateReg)}</TableCell>
                    <TableCell className="max-w-72 truncate">{s.description}</TableCell>
                    <TableCell className="text-right">
                      <Amount value={s.amount} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setSimilarPrompt(null)}>
              No, solo questo
            </Button>
            {similarPrompt.source.merchant && (
              <Button variant="secondary" onClick={() => applySimilar(true)}>
                <Wand2 className="size-4" />
                Applica e crea regola
              </Button>
            )}
            <Button onClick={() => applySimilar(false)}>Applica a tutti</Button>
          </div>
        </ModalShell>
      )}

      {noteTx && (
        <ModalShell
          title="Note sul movimento"
          description={`${fmtDate(noteTx.dateReg)} · ${noteTx.description.slice(0, 70)}`}
          onClose={() => setNoteTx(null)}
        >
          <Textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Aggiungi una nota…"
            rows={4}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setNoteTx(null)}>
              Annulla
            </Button>
            <Button onClick={saveNote}>Salva nota</Button>
          </div>
        </ModalShell>
      )}
    </div>
  )
}
