/**
 * Duck-typed reading of `ApiError` (name/code/details) so account pages do
 * not import `src/api/errors` (Axios) statically.
 */
export function apiErrorCode(error: unknown): string | undefined {
  if (!(error instanceof Error) || error.name !== 'ApiError') return undefined
  const code: unknown = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : undefined
}

/** Field paths present in `details.fieldErrors` of a 409/422 `ApiError`. */
export function apiFieldErrorKeys(error: unknown): string[] {
  if (apiErrorCode(error) === undefined) return []
  const details: unknown = (error as { details?: unknown }).details
  if (typeof details !== 'object' || details === null || !('fieldErrors' in details)) return []
  const fieldErrors: unknown = details.fieldErrors
  if (typeof fieldErrors !== 'object' || fieldErrors === null) return []
  return Object.keys(fieldErrors)
}

/** Generic pt-BR message for failures without a field mapping. */
export function genericErrorMessage(error: unknown): string {
  const kind: unknown = error instanceof Error ? (error as { kind?: unknown }).kind : undefined
  if (kind === 'network' || kind === 'timeout') return 'Sem conexão com o servidor. Verifique sua internet e tente novamente.'
  if (kind === 'unauthorized') return 'Sua sessão terminou. Entre novamente.'
  return 'Não foi possível salvar. Tente novamente.'
}
