import { useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { Popover as PopoverPrimitive } from 'radix-ui'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const MONTHS = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre']
const WEEKDAYS = ['L', 'M', 'M', 'G', 'V', 'S', 'D']

function fromIso(value: string): Date | null {
  const [year, month, day] = value.split('-').map(Number)
  return year && month && day ? new Date(year, month - 1, day) : null
}
function toIso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function DatePicker({ value, onChange, disabled = false, placeholder = 'Seleziona data', className }: { value: string; onChange: (value: string) => void; disabled?: boolean; placeholder?: string; className?: string }): JSX.Element {
  const selected = fromIso(value)
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(() => selected ?? new Date())
  const days = useMemo(() => {
    const first = new Date(view.getFullYear(), view.getMonth(), 1)
    const offset = (first.getDay() + 6) % 7
    const count = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate()
    return Array.from({ length: offset + count }, (_, index) => index < offset ? null : new Date(view.getFullYear(), view.getMonth(), index - offset + 1))
  }, [view])
  const label = selected ? selected.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' }) : placeholder
  return <PopoverPrimitive.Root open={open} onOpenChange={setOpen}><PopoverPrimitive.Trigger type="button" disabled={disabled} className={cn(buttonVariants({ variant: 'outline' }), 'w-full justify-start font-normal tabular-nums', !selected && 'text-muted-foreground', className)}><CalendarDays className="size-4" />{label}</PopoverPrimitive.Trigger><PopoverPrimitive.Portal><PopoverPrimitive.Content sideOffset={8} align="start" className="z-50 w-72 rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-xl shadow-emerald-950/10 outline-none" style={{ transformOrigin: 'var(--radix-popover-content-transform-origin)' }}><div className="mb-3 flex items-center justify-between"><Button type="button" variant="ghost" size="icon-xs" aria-label="Mese precedente" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}><ChevronLeft /></Button><span className="text-sm font-semibold">{MONTHS[view.getMonth()]} {view.getFullYear()}</span><Button type="button" variant="ghost" size="icon-xs" aria-label="Mese successivo" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}><ChevronRight /></Button></div><div className="grid grid-cols-7 gap-1 text-center">{WEEKDAYS.map((day, index) => <span key={`${day}-${index}`} className="py-1 text-[11px] font-medium text-muted-foreground">{day}</span>)}{days.map((day, index) => day ? <button key={toIso(day)} type="button" onClick={() => { onChange(toIso(day)); setOpen(false) }} className={cn('flex size-8 items-center justify-center rounded-md text-sm transition-[background-color,color,transform] duration-150 ease-[var(--ease-out)] hover:bg-accent active:scale-[0.94]', selected && toIso(day) === toIso(selected) && 'bg-primary font-semibold text-primary-foreground hover:bg-primary')}>{day.getDate()}</button> : <span key={`empty-${index}`} className="size-8" />)}</div><div className="mt-3 flex items-center justify-between border-t pt-2"><Button type="button" variant="ghost" size="xs" onClick={() => { onChange(''); setOpen(false) }} disabled={!value}>Cancella</Button><Button type="button" variant="ghost" size="xs" onClick={() => { const today = new Date(); setView(today); onChange(toIso(today)); setOpen(false) }}>Oggi</Button></div></PopoverPrimitive.Content></PopoverPrimitive.Portal></PopoverPrimitive.Root>
}
