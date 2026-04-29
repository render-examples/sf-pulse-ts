/**
 * Render Cron trigger — lightweight script that starts the daily-refresh
 * workflow task via the Render API, then exits.
 */
import { Render } from '@renderinc/sdk'

const token = process.env.RENDER_API_KEY
if (!token) {
  console.error('[cron] RENDER_API_KEY is required')
  process.exit(1)
}

const slug = process.env.SF_PULSE_WORKFLOW_SLUG
if (!slug) {
  console.error('[cron] SF_PULSE_WORKFLOW_SLUG is required')
  process.exit(1)
}

const render = new Render({ token })

const TERMINAL = new Set(['completed', 'succeeded', 'failed', 'canceled'])
const POLL_MS = 15_000       // 15 s between polls
const MAX_WAIT_MS = 900_000  // 15 min ceiling (task timeout is 10 min)

async function main() {
  console.info(`[cron] triggering workflow ${slug}/daily-refresh...`)
  try {
    const result = await render.workflows.startTask(`${slug}/daily-refresh`, [])
    const { taskRunId } = result
    console.info(`[cron] task run started: ${taskRunId}`)

    const deadline = Date.now() + MAX_WAIT_MS
    while (true) {
      await new Promise(r => setTimeout(r, POLL_MS))

      if (Date.now() > deadline) {
        console.error(`[cron] timed out waiting for task run ${taskRunId}`)
        process.exitCode = 1
        return
      }

      const run = await render.workflows.getTaskRun(taskRunId)
      console.info(`[cron] status: ${run.status}`)

      if (TERMINAL.has(run.status)) {
        if (run.status === 'failed' || run.status === 'canceled') {
          console.error('[cron] workflow failed:', JSON.stringify(run))
          process.exitCode = 1
        } else {
          console.info('[cron] workflow completed:', JSON.stringify(run))
        }
        return
      }
    }
  } catch (error) {
    console.error('[cron] workflow failed:', error)
    process.exitCode = 1
  }
}

main()
