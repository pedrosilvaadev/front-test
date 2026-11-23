import { scenarioHandler } from '../scenario'
import { devHandlers } from './dev'
import { healthHandlers } from './health'
import { nftHandlers } from './nfts'

/**
 * Ordered handler list shared by the browser worker and the node server.
 * The scenario middleware must stay first. Add one module per resource
 * (auth, nfts, cart, orders, ...) and spread it after the infra handlers.
 * Note: `server.use()` / `worker.use()` overrides are prepended and
 * therefore bypass the scenario middleware.
 */
export const handlers = [scenarioHandler, ...devHandlers, ...healthHandlers, ...nftHandlers]
