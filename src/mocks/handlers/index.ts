import { scenarioHandler } from '../scenario'
import { authHandlers } from './auth'
import { cartHandlers } from './cart'
import { devHandlers } from './dev'
import { favoriteHandlers } from './favorites'
import { healthHandlers } from './health'
import { nftHandlers } from './nfts'
import { orderHandlers } from './orders'
import { profileHandlers } from './profile'
import { quoteHandlers } from './quote'
import { realtimeHandlers } from '../realtime-server'
import { walletHandlers } from './wallets'

/**
 * Ordered handler list shared by the browser worker and the node server.
 * The scenario middleware must stay first. Add one module per resource
 * (auth, nfts, cart, orders, ...) and spread it after the infra handlers.
 * Note: `server.use()` / `worker.use()` overrides are prepended and
 * therefore bypass the scenario middleware.
 */
export const handlers = [scenarioHandler, ...devHandlers, ...healthHandlers, ...authHandlers, ...nftHandlers, ...cartHandlers, ...quoteHandlers, ...walletHandlers, ...orderHandlers, ...favoriteHandlers, ...profileHandlers, ...realtimeHandlers]
