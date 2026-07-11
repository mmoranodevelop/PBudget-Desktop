import { ReactNode, useMemo } from 'react'
import type { Category } from '@shared/types'
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue
} from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export function ModalShell({
  title, description, children, onClose, wide
}: {
  title: string
  description?: string
  children: ReactNode
  onClose: () => void
  wide?: boolean
}): JSX.Element {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={cn(wide && 'sm:max-w-2xl')}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}

export function CatBadge({
  category, categories
}: {
  category: number | null
  categories: Category[]
}): JSX.Element {
  const cat = categories.find((c) => c.id === category)
  if (!cat) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
        da categorizzare
      </span>
    )
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap"
      style={{ backgroundColor: `${cat.color}1f`, color: cat.color }}
    >
      <span className="size-2 rounded-full" style={{ backgroundColor: cat.color }} />
      {cat.name}
    </span>
  )
}

const NONE = '__none__'

/** Select con categorie raggruppate per macro-categoria */
export function CategorySelect({
  categories, value, onChange, allowEmpty = true, emptyLabel = 'Nessuna categoria', placeholder,
  className
}: {
  categories: Category[]
  value: number | null
  onChange: (id: number | null) => void
  allowEmpty?: boolean
  emptyLabel?: string
  placeholder?: string
  className?: string
}): JSX.Element {
  const groups = useMemo(() => {
    const parents = categories.filter((c) => c.parentId === null)
    return parents.map((p) => ({
      parent: p,
      children: categories.filter((c) => c.parentId === p.id)
    }))
  }, [categories])

  return (
    <Select
      value={value != null ? String(value) : NONE}
      onValueChange={(v) => onChange(v === NONE ? null : Number(v))}
    >
      <SelectTrigger size="sm" className={cn('min-w-36', className)}>
        <SelectValue placeholder={placeholder ?? emptyLabel} />
      </SelectTrigger>
      <SelectContent>
        {allowEmpty && (
          <SelectItem value={NONE}>
            <span className="text-muted-foreground">{emptyLabel}</span>
          </SelectItem>
        )}
        {groups.map(({ parent, children }) => (
          <SelectGroup key={parent.id}>
            <SelectLabel className="flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ backgroundColor: parent.color }} />
              {parent.name}
            </SelectLabel>
            <SelectItem value={String(parent.id)}>
              {parent.name}
              {children.length > 0 && <span className="text-muted-foreground"> (generale)</span>}
            </SelectItem>
            {children.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.name}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  )
}

export function Amount({ value, className }: { value: number; className?: string }): JSX.Element {
  return (
    <span
      className={cn(
        'tabular-nums font-medium',
        value >= 0 ? 'text-chart-income' : 'text-chart-expense',
        className
      )}
    >
      {value.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}
    </span>
  )
}

/** Barra di avanzamento budget con soglie colore */
export function BudgetBar({ actual, budget }: { actual: number; budget: number }): JSX.Element {
  const pct = budget > 0 ? (actual / budget) * 100 : 0
  const color =
    pct > 100 ? 'var(--chart-expense)' : pct > 80 ? 'var(--chart-scenario)' : 'var(--chart-income)'
  return (
    <div className="h-2 w-36 overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${Math.min(100, pct)}%`, backgroundColor: color }}
      />
    </div>
  )
}

export const CHART_TOOLTIP_STYLE = {
  backgroundColor: 'var(--popover)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  color: 'var(--popover-foreground)',
  fontSize: 12
} as const

export const CHART = {
  income: 'var(--chart-income)',
  expense: 'var(--chart-expense)',
  balance: 'var(--chart-balance)',
  scenario: 'var(--chart-scenario)',
  grid: 'var(--border)',
  axis: 'var(--muted-foreground)'
} as const
