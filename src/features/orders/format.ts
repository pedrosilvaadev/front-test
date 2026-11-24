/** Receipt formatting helpers (P4-02). */
const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'] as const

/** "29 Jul, 2026" (Figma), in the visitor's time zone. */
export function formatOrderDate(iso: string): string {
  const date = new Date(iso)
  return `${String(date.getDate())} ${MONTHS[date.getMonth()] ?? ''}, ${String(date.getFullYear())}`
}

export function shortHash(hash: string): string {
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`.toUpperCase().replace('0X', '0x')
}

