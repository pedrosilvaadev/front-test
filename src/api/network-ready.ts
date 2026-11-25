/**
 * Gate for outgoing API traffic (P6-02). In the demo build the app renders
 * immediately while MSW starts; requests (and the realtime socket) wait for
 * `whenNetworkReady()` so nothing leaves before the worker controls the page.
 * Resolves immediately when no gate was set (tests, mocks disabled). A failed
 * start must resolve too: requests then surface real network errors.
 */
let ready: Promise<void> = Promise.resolve()

export function setNetworkReady(gate: Promise<void>): void {
  ready = gate
}

export function whenNetworkReady(): Promise<void> {
  return ready
}
