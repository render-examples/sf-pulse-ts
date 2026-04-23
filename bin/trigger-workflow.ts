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

async function main() {
  console.info(`[cron] triggering workflow ${slug}/daily-refresh...`)
  try {
    const result = await render.workflows.runTask(`${slug}/daily-refresh`, [])
    console.info('[cron] workflow completed:', JSON.stringify(result))
  } catch (error) {
    console.error('[cron] workflow failed:', error)
    process.exitCode = 1
  }
}

main()
