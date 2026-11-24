import * as React from "react"
import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-10 w-full min-w-0 rounded-sm border border-border bg-transparent px-4 text-sm text-foreground transition-colors outline-none",
        "placeholder:text-subtle-foreground disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/40",
        "aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
