import { useEffect, useState, type CSSProperties } from 'react'
import { FlaskConical, Pencil, Plus, Trash2, Wand2, X } from 'lucide-react'
import type { Category, Rule, RuleField, RuleMatchType, Tag } from '@shared/types'
import { api } from '@/api'
import { CategorySelect, ModalShell } from '@/components'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table'
import { toast } from '@/components/ui/toast'

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
  categories, tags, onChanged, mode
}: {
  categories: Category[]
  tags: Tag[]
  onChanged: () => void
  mode: 'categories' | 'rules'
}): JSX.Element {
  const [rules, setRules] = useState<Rule[]>([])
  const [editCat, setEditCat] = useState<Partial<Category> | null>(null)
  const [categoryError, setCategoryError] = useState<string | null>(null)
  const [deleteCat, setDeleteCat] = useState<Category | null>(null)
  const [reassignTo, setReassignTo] = useState<number | null>(null)
  const [newRule, setNewRule] = useState<{
    field: RuleField
    matchType: RuleMatchType
    pattern: string
    categoryId: number | null
  }>({ field: 'merchant', matchType: 'contains', pattern: '', categoryId: null })
  const [testCount, setTestCount] = useState<number | null>(null)
  const [ruleOpen, setRuleOpen] = useState(false)
  const [applyResult, setApplyResult] = useState<number | null>(null)

  const loadRules = (): void => {
    api.ruleList().then(setRules).catch(() => undefined)
  }
  useEffect(loadRules, [])

  const saveCat = async (): Promise<void> => {
    if (!editCat?.name) return
    const name = editCat.name.trim()
    const duplicate = categories.some((category) =>
      category.id !== editCat.id &&
      category.parentId === (editCat.parentId ?? null) &&
      category.name.trim().localeCompare(name, undefined, { sensitivity: 'accent' }) === 0
    )
    if (duplicate) {
      setCategoryError('Esiste già una categoria con questo nome nello stesso livello.')
      return
    }
    try {
      if (editCat.id) {
        await api.catUpdate(editCat.id, { ...editCat, name })
      } else {
        await api.catCreate({
          name,
          color: editCat.color ?? '#3987e5',
          type: editCat.type ?? 'expense',
          parentId: editCat.parentId ?? null,
          sortOrder: 999
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Impossibile salvare la categoria.'
      setCategoryError(message)
      toast.error('Categoria non salvata', message)
      return
    }
    setEditCat(null)
    onChanged()
    toast.success(editCat.id ? 'Categoria aggiornata' : 'Categoria creata', editCat.name)
  }

  const confirmDeleteCat = async (): Promise<void> => {
    if (!deleteCat) return
    await api.catDelete(deleteCat.id, reassignTo)
    setDeleteCat(null)
    setReassignTo(null)
    onChanged()
    toast.success('Categoria eliminata', deleteCat.name)
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
    setRuleOpen(false)
    loadRules()
    toast.success('Regola creata')
  }

  const testNewRule = async (): Promise<void> => {
    if (!newRule.pattern.trim()) return
    setTestCount(await api.ruleTest(newRule.field, newRule.matchType, newRule.pattern.trim()))
  }

  const applyAll = async (): Promise<void> => {
    const n = await api.ruleApplyAll(true)
    setApplyResult(n)
    onChanged()
    toast.success('Regole applicate', `${n} movimenti categorizzati.`)
  }

  const parents = categories.filter((c) => c.parentId === null)
  const catName = (id: number): string => categories.find((c) => c.id === id)?.name ?? '?'

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{mode === 'categories' ? 'Categorie' : 'Regole'}</h1>
        <p className="text-sm text-muted-foreground">
          {mode === 'categories' ? 'Organizza categorie e tag per dare struttura ai movimenti.' : 'Automatizza la categorizzazione dei movimenti importati.'}
        </p>
      </div>

      {applyResult != null && (
        <Alert className="border-chart-income/40">
          <AlertDescription className="flex items-center justify-between">
            <span>Regole applicate: {applyResult} movimenti categorizzati.</span>
            <Button variant="ghost" size="icon-sm" onClick={() => setApplyResult(null)}>
              <X className="size-4" />
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4">
        <section className={mode === 'rules' ? 'hidden' : ''} aria-label="Categorie">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-base font-semibold">Le tue categorie</h2><p className="text-sm text-muted-foreground">Gestisci macro-categorie e sottocategorie dalle loro card.</p></div>
            <Button size="sm" onClick={() => { setCategoryError(null); setEditCat({ type: 'expense', color: '#3987e5', parentId: null }) }}><Plus className="size-4" />Nuova categoria</Button>
          </div>
          <div className="category-grid max-h-[calc(100vh-270px)] overflow-y-auto pr-1">
            {parents.map((parent) => {
              const children = categories.filter((category) => category.parentId === parent.id)
              const typeLabel = parent.type === 'income' ? 'Entrata' : parent.type === 'transfer' ? 'Trasferimento' : 'Spesa'
              return <article key={parent.id} className="category-card" style={{ '--category-color': parent.color } as CSSProperties}>
                <div className="category-card__top"><span className="category-card__swatch"><span /></span><div className="min-w-0 flex-1"><h3 className="truncate text-base font-semibold">{parent.name}</h3><p>{typeLabel}{children.length > 0 && ` · ${children.length} sotto-categorie`}</p></div><div className="flex shrink-0 gap-1"><Button variant="ghost" size="icon-sm" onClick={() => setEditCat(parent)} aria-label={`Modifica ${parent.name}`}><Pencil className="size-3.5" /></Button>{!parent.isSystem && <Button variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteCat(parent)} aria-label={`Elimina ${parent.name}`}><Trash2 className="size-3.5" /></Button>}</div></div>
                <div className="category-card__children">{children.length === 0 ? <p className="category-card__empty">Nessuna sottocategoria</p> : children.map((child) => <div key={child.id} className="category-card__child"><span className="truncate">{child.name}</span><span className="flex shrink-0 gap-0.5"><Button variant="ghost" size="icon-xs" onClick={() => setEditCat(child)} aria-label={`Modifica ${child.name}`}><Pencil className="size-3" /></Button><Button variant="ghost" size="icon-xs" className="text-destructive hover:text-destructive" onClick={() => setDeleteCat(child)} aria-label={`Elimina ${child.name}`}><Trash2 className="size-3" /></Button></span></div>)}</div>
                <Button variant="ghost" size="sm" className="mt-2 w-full justify-start text-muted-foreground" onClick={() => setEditCat({ type: parent.type, color: parent.color, parentId: parent.id })}><Plus className="size-3.5" />Aggiungi sottocategoria</Button>
              </article>
            })}
          </div>
        </section>
        <Card className="hidden">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-sm">Categorie</CardTitle>
            <Button
              size="sm"
              onClick={() => setEditCat({ type: 'expense', color: '#3987e5', parentId: null })}
            >
              <Plus className="size-4" />
              Nuova
            </Button>
          </CardHeader>
          <CardContent>
            <div className="max-h-[calc(100vh-280px)] space-y-3 overflow-y-auto pr-1">
              {parents.map((p) => (
                <div key={p.id}>
                  <div className="flex items-center justify-between">
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
                      style={{ backgroundColor: `${p.color}1f`, color: p.color }}
                    >
                      <span className="size-2 rounded-full" style={{ backgroundColor: p.color }} />
                      {p.name}
                      {p.type === 'income' && ' · entrate'}
                      {p.type === 'transfer' && ' · trasferimenti'}
                    </span>
                    <span className="flex gap-1">
                      <Button variant="ghost" size="icon-sm" onClick={() => setEditCat(p)}>
                        <Pencil className="size-3.5" />
                      </Button>
                      {!p.isSystem && (
                        <Button variant="ghost" size="icon-sm" onClick={() => setDeleteCat(p)}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      )}
                    </span>
                  </div>
                  <div className="ml-4 border-l pl-3">
                    {categories
                      .filter((c) => c.parentId === p.id)
                      .map((c) => (
                        <div key={c.id} className="flex items-center justify-between py-0.5">
                          <span className="text-sm text-muted-foreground">{c.name}</span>
                          <span className="flex gap-1">
                            <Button variant="ghost" size="icon-sm" onClick={() => setEditCat(c)}>
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon-sm" onClick={() => setDeleteCat(c)}>
                              <Trash2 className="size-3.5" />
                            </Button>
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className={mode === 'categories' ? 'hidden' : ''}>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-sm">Regole di categorizzazione ({rules.length})</CardTitle>
            <div className="flex gap-2"><Button size="sm" onClick={() => setRuleOpen(true)}><Plus className="size-4" />Nuova regola</Button><Button variant="outline" size="sm" onClick={applyAll}><Wand2 className="size-4" />Applica ai non categorizzati</Button></div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="hidden">
              <Select
                value={newRule.field}
                onValueChange={(v) => setNewRule((r) => ({ ...r, field: v as RuleField }))}
              >
                <SelectTrigger size="sm" className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(FIELD_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={newRule.matchType}
                onValueChange={(v) => setNewRule((r) => ({ ...r, matchType: v as RuleMatchType }))}
              >
                <SelectTrigger size="sm" className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(MATCH_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="pattern (es. LIDL)"
                className="h-8 w-36"
                value={newRule.pattern}
                onChange={(e) => {
                  setNewRule((r) => ({ ...r, pattern: e.target.value }))
                  setTestCount(null)
                }}
              />
              <CategorySelect
                categories={categories}
                value={newRule.categoryId}
                onChange={(id) => setNewRule((r) => ({ ...r, categoryId: id }))}
                emptyLabel="Categoria"
              />
              <Button variant="outline" size="sm" onClick={testNewRule}>
                <FlaskConical className="size-4" />
                Verifica
              </Button>
              {testCount != null && (
                <span className="text-xs text-muted-foreground">{testCount} movimenti corrispondono</span>
              )}
              <Button
                size="sm"
                onClick={createRule}
                disabled={!newRule.pattern.trim() || newRule.categoryId == null}
              >
                <Plus className="size-4" />
                Crea
              </Button>
            </div>

            <div className="max-h-[calc(100vh-400px)] overflow-auto rounded-md border">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow>
                    <TableHead>Attiva</TableHead>
                    <TableHead>Campo</TableHead>
                    <TableHead>Match</TableHead>
                    <TableHead>Pattern</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead className="text-right">Priorità</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.map((r) => (
                    <TableRow key={r.id} className={r.active ? '' : 'opacity-50'}>
                      <TableCell>
                        <Switch
                          checked={r.active}
                          onCheckedChange={(v) => api.ruleUpdate(r.id, { active: v }).then(loadRules)}
                        />
                      </TableCell>
                      <TableCell className="text-sm">{FIELD_LABEL[r.field]}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {MATCH_LABEL[r.matchType]}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{r.pattern}</TableCell>
                      <TableCell className="text-sm">{catName(r.categoryId)}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{r.priority}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => api.ruleDelete(r.id).then(() => { loadRules(); toast.success('Regola eliminata') })}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {mode === 'categories' && tags.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Tag</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {tags.map((t) => (
              <button
                key={t.id}
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
                style={{ backgroundColor: `${t.color}1f`, color: t.color }}
                title="Elimina tag"
                onClick={() => api.tagDelete(t.id).then(() => { onChanged(); toast.success('Tag eliminato', t.name) })}
              >
                {t.name}
                <X className="size-3" />
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {editCat && (
        <ModalShell
          title={editCat.id ? 'Modifica categoria' : 'Nuova categoria'}
          onClose={() => { setCategoryError(null); setEditCat(null) }}
          className="category-editor-modal w-[min(94vw,48rem)] sm:max-w-2xl"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Nome</Label>
              <Input
                value={editCat.name ?? ''}
                onChange={(e) => { setCategoryError(null); setEditCat({ ...editCat, name: e.target.value }) }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Colore</Label>
              <Input
                type="color"
                className="h-9 w-20 p-1"
                value={editCat.color ?? '#3987e5'}
                onChange={(e) => setEditCat({ ...editCat, color: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select
                value={editCat.type ?? 'expense'}
                onValueChange={(v) => setEditCat({ ...editCat, type: v as Category['type'] })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="expense">Spesa</SelectItem>
                  <SelectItem value="income">Entrata</SelectItem>
                  <SelectItem value="transfer">Trasferimento</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Macro-categoria (vuoto = è una macro)</Label>
              <Select
                value={editCat.parentId != null ? String(editCat.parentId) : '__none__'}
                onValueChange={(v) => {
                  setCategoryError(null)
                  setEditCat({ ...editCat, parentId: v === '__none__' ? null : Number(v) })
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nessuna</SelectItem>
                  {parents
                    .filter((p) => p.id !== editCat.id)
                    .map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {categoryError && <p className="text-sm text-destructive" role="alert">{categoryError}</p>}
          <div className="flex justify-end gap-2 pt-3">
            <Button variant="outline" onClick={() => { setCategoryError(null); setEditCat(null) }}>
              Annulla
            </Button>
            <Button onClick={saveCat} disabled={!editCat.name}>
              Salva
            </Button>
          </div>
        </ModalShell>
      )}

      {deleteCat && (
        <ModalShell
          title={`Elimina "${deleteCat.name}"`}
          description="I movimenti di questa categoria verranno riassegnati alla categoria scelta."
          onClose={() => setDeleteCat(null)}
        >
          <CategorySelect
            categories={categories.filter((c) => c.id !== deleteCat.id)}
            value={reassignTo}
            onChange={setReassignTo}
            emptyLabel="Nessuna categoria"
            className="w-full"
          />
          <div className="flex justify-end gap-2 pt-3">
            <Button variant="outline" onClick={() => setDeleteCat(null)}>
              Annulla
            </Button>
            <Button variant="destructive" onClick={confirmDeleteCat}>
              <Trash2 className="size-4" />
              Elimina categoria
            </Button>
          </div>
        </ModalShell>
      )}
      {ruleOpen && (
        <ModalShell title="Nuova regola" description="Crea una regola per categorizzare automaticamente i movimenti." onClose={() => setRuleOpen(false)}>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Campo</Label><Select value={newRule.field} onValueChange={(v) => setNewRule((r) => ({ ...r, field: v as RuleField }))}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(FIELD_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label>Condizione</Label><Select value={newRule.matchType} onValueChange={(v) => setNewRule((r) => ({ ...r, matchType: v as RuleMatchType }))}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(MATCH_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div className="space-y-1.5"><Label>Pattern</Label><Input autoFocus placeholder="Es. LIDL" value={newRule.pattern} onChange={(e) => { setNewRule((r) => ({ ...r, pattern: e.target.value })); setTestCount(null) }} /></div>
            <div className="space-y-1.5"><Label>Categoria</Label><CategorySelect categories={categories} value={newRule.categoryId} onChange={(id) => setNewRule((r) => ({ ...r, categoryId: id }))} emptyLabel="Scegli categoria" className="w-full" /></div>
            <div className="flex items-center justify-between gap-2"><div>{testCount != null && <span className="text-xs text-muted-foreground">{testCount} movimenti corrispondono</span>}</div><Button variant="outline" size="sm" onClick={testNewRule} disabled={!newRule.pattern.trim()}><FlaskConical className="size-4" />Verifica</Button></div>
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setRuleOpen(false)}>Annulla</Button><Button onClick={createRule} disabled={!newRule.pattern.trim() || newRule.categoryId == null}>Crea regola</Button></div>
          </div>
        </ModalShell>
      )}
    </div>
  )
}
