import * as React from "react"
import { cn } from "@/lib/utils"
import { RadioGroup as RadioGroupPrimitive } from "radix-ui"

function RadioGroup({ className, ...props }: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return <RadioGroupPrimitive.Root data-slot="radio-group" className={cn("grid gap-2", className)} {...props} />
}

/**
 * Pill-shaped radio (Figma edition chips "1/1", "1/10", "1/50", "ABERTA").
 * The label is the visible content; there is no separate indicator dot.
 */
function RadioGroupChip({ className, ...props }: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-chip"
      className={cn(
        "inline-flex h-7 min-w-11 items-center justify-center rounded-full border border-border-accent px-2.5 text-xs tracking-[0.04em] text-muted-foreground outline-none transition-colors",
        "hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "data-[state=checked]:border-2 data-[state=checked]:border-primary data-[state=checked]:font-bold data-[state=checked]:text-brand",
        "disabled:cursor-not-allowed disabled:line-through disabled:opacity-45",
        className
      )}
      {...props}
    />
  )
}

export { RadioGroup, RadioGroupChip }
