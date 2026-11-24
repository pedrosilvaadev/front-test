import { cn } from "@/lib/utils"

/**
 * Loading placeholder with a moving-gradient shimmer (README §8). The base
 * colour comes from `bg-*` (overridable per use); the highlight is a
 * background-image band animated by `animate-shimmer` (keyframes in
 * index.css). Under `prefers-reduced-motion: reduce` the global rule cuts the
 * animation to a single 0.01ms iteration, so the placeholder is static.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "animate-shimmer rounded-md bg-accent bg-[linear-gradient(100deg,transparent_30%,rgb(245_241_235/0.08)_50%,transparent_70%)] bg-size-[200%_100%] bg-no-repeat",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
