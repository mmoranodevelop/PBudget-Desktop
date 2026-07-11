import { ReactNode, useMemo } from 'react'
import type { Category } from '@shared/types'

export function Modal({
  title, children, onClose
}: {
  title: string
  children: ReactNode
  onClose: () => void
}): JSX.Element {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
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
      <span className="badge" style={{ background: 'rgba(148,163,184,0.15)', color: 'var(--text-dim)' }}>
        — da categorizzare
      </span>
    )
  }
  return (
    <span className="badge" style={{ background: `${cat.color}22`, color: cat.color }}>
      <span className="dot" style={{ background: cat.color }} />
      {cat.name}
    </span>
  )
}

/** Select con categorie raggruppate per macro-categoria */
export function CategorySelect({
  categories, value, onChange, allowEmpty = true, emptyLabel = '— nessuna —', style
}: {
  categories: Category[]
  value: number | null
  onChange: (id: number | null) => void
  allowEmpty?: boolean
  emptyLabel?: string
  style?: React.CSSProperties
}): JSX.Element {
  const groups = useMemo(() => {
    const parents = categories.filter((c) => c.parentId === null)
    return parents.map((p) => ({
      parent: p,
      children: categories.filter((c) => c.parentId === p.id)
    }))
  }, [categories])

  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      style={style}
    >
      {allowEmpty && <option value="">{emptyLabel}</option>}
      {groups.map(({ parent, children }) =>
        children.length === 0 ? (
          <option key={parent.id} value={parent.id}>
            {parent.name}
          </option>
        ) : (
          <optgroup key={parent.id} label={parent.name}>
            <option value={parent.id}>{parent.name} (generale)</option>
            {children.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </optgroup>
        )
      )}
    </select>
  )
}

export function Amount({ value }: { value: number }): JSX.Element {
  return (
    <span className={`mono ${value >= 0 ? 'pos' : 'neg'}`}>
      {value.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}
    </span>
  )
}
