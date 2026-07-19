import piggyMascot from '@/assets/piggy-bank-coins-out.gif'
import { cn } from '@/lib/utils'

export function SidebarMascot({ collapsed }: { collapsed: boolean }): JSX.Element {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'mx-auto mb-1 transition-[width,height] duration-200 ease-[var(--ease-out)]',
        collapsed ? 'size-10' : 'h-20 w-24'
      )}
    >
      <img
        src={piggyMascot}
        alt=""
        className="size-full object-contain object-center"
      />
    </div>
  )
}
