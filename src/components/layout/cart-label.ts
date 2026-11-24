/** Accessible name for cart entry points; includes the count when known. */
export function cartLabel(count?: number) {
  if (count === undefined || count <= 0) return 'Carrinho'
  return `Carrinho, ${count} ${count === 1 ? 'item' : 'itens'}`
}
