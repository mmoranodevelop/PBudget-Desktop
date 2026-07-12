import * as React from "react"

import { cn } from "@/lib/utils"
import { DatePicker } from "@/components/ui/date-picker"

function Input({ className, type, value, onChange, ...props }: React.ComponentProps<"input">) {
  if (type === "date") {
    return (
      <DatePicker
        value={typeof value === "string" ? value : ""}
        onChange={(nextValue) => onChange?.({ target: { value: nextValue } } as React.ChangeEvent<HTMLInputElement>)}
        disabled={props.disabled}
        placeholder={props.placeholder}
        className={className}
      />
    )
  }
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-10 w-full min-w-0 rounded-xl border border-input bg-card/75 px-3 py-1 text-base shadow-sm shadow-emerald-950/[0.02] transition-[color,box-shadow,border-color] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "hover:border-primary/25 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20",
        className
      )}
      value={value}
      onChange={onChange}
      {...props}
    />
  )
}

export { Input }
