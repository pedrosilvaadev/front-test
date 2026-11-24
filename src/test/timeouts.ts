/**
 * Timeouts for integration tests that render the full app (`renderApp()`).
 *
 * The home route renders the hero, the featured query, promos, the journal
 * and the catalog; its route chunk is imported lazily on the first render of
 * each test file. Under a loaded CPU (parallel workers) the first paint can
 * take several seconds, so the default 1s `findBy*` and 5s test timeouts are
 * too tight. These only bound waits; assertions are unchanged.
 */

/** Upper bound for `findBy*` / `waitFor` waiting on data rendered from MSW. */
export const APP_READY_TIMEOUT = 10_000

/** Per-test timeout for suites that render the full app (several app waits per test). */
export const APP_TEST_TIMEOUT = 30_000
