import type { AgentLogEntry } from './types'
import { insertAgentLogEntry, getAgentLogPrioritized } from './db'

export async function readAgentLog(): Promise<AgentLogEntry[]> {
  return getAgentLogPrioritized()
}

export async function appendAgentLogEntries(entries: AgentLogEntry[]): Promise<void> {
  let succeeded = 0
  let failed = 0
  for (const entry of entries) {
    try {
      await insertAgentLogEntry(entry)
      succeeded++
    } catch (err) {
      failed++
      console.error(
        `[AGENT_LOG_INSERT_FAILED] symbol=${entry.symbol} action=${entry.decision.action} ` +
        `error=${entry.decision.action === 'SELL' ? entry.decision.reasoning : '(non-exit entry)'} ` +
        `cause=${(err as Error).message ?? String(err)}`
      )
    }
  }
  if (failed > 0) {
    console.error(`[AGENT_LOG_BATCH_PARTIAL] ${succeeded} succeeded, ${failed} failed out of ${entries.length} total entries this cycle`)
  }
}
