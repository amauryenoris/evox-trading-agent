/**
 * Standalone runner for the trading agent cycle.
 * Used by GitHub Actions cron — env vars injected from GitHub Secrets.
 * For local testing: tsx --env-file=.env.local scripts/run-cycle.ts
 *
 * Uses relative imports (not @/) since this runs outside Next.js bundler.
 */

import { runAgentCycle } from '../src/lib/claude-agent.js'

async function main() {
  console.log(`[cycle] Starting agent cycle at ${new Date().toISOString()}`)

  const result = await runAgentCycle()

  console.log(`[cycle] Completed:`, JSON.stringify(result, null, 2))
  process.exit(0)
}

main().catch((err) => {
  console.error('[cycle] Fatal error:', err)
  process.exit(1)
})
