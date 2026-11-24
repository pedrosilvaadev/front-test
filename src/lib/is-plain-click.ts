import type { MouseEvent } from 'react'

/**
 * Primary-button click without modifiers. Ctrl/Cmd/Shift/Alt and middle
 * clicks keep the browser behaviour (new tab/window), so custom handlers
 * (scroll to catalog, ...) must only run for plain clicks.
 */
export function isPlainClick(event: MouseEvent<HTMLElement>): boolean {
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  )
}
