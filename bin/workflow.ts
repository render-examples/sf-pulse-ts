/**
 * Render Workflow entry — registers all tasks and starts the task server.
 *
 * Deploy as a Render worker service. Tasks are invoked by the Render
 * runtime when triggered via the SDK or dashboard.
 *
 * The SDK auto-starts the task server via setImmediate when
 * RENDER_SDK_SOCKET_PATH is set (always true in the Render environment).
 * Set RENDER_SDK_AUTO_START=false in the service env vars to disable
 * auto-start and rely solely on the explicit startTaskServer() call below,
 * which prevents two concurrent task servers from racing on the same queue.
 */
import './workflow/fetch-eater-sf.js'
import './workflow/fetch-sfist.js'
import './workflow/fetch-michelin.js'
import './workflow/search-restaurants.js'
import './workflow/fetch-funcheap.js'
import './workflow/fetch-famsf.js'
import './workflow/fetch-cal-academy.js'
import './workflow/search-events.js'
import './workflow/apply-discovered-items.js'
import './workflow/daily-refresh.js'
import { startTaskServer } from '@renderinc/sdk/workflows'
