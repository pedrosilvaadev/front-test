/** `0x7a42…19e8`-style shortening for contract addresses (full value kept in a title). */
export function shortenAddress(address: string, head = 6, tail = 4): string {
  if (address.length <= head + tail + 3) return address
  return `${address.slice(0, head)}...${address.slice(-tail)}`
}

/** Filled stars (0–5) for a rating average such as "4.8" (display only, rounded half up). */
export function filledStars(average: string): number {
  const [int = '0', frac = '0'] = average.split('.')
  const whole = Number(int) + (Number(frac[0] ?? '0') >= 5 ? 1 : 0)
  return Math.min(5, Math.max(0, whole))
}

export function reviewsLabel(count: number): string {
  return count === 1 ? '1 avaliação de colecionador' : `${String(count)} avaliações de colecionadores`
}
