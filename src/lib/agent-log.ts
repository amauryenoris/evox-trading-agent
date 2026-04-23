import type { AgentLogEntry } from './types'
import { insertAgentLogEntry, getAgentLogPrioritized } from './db'

export async function readAgentLog(): Promise<AgentLogEntry[]> {
  return getAgentLogPrioritized()
}

export async function appendAgentLogEntries(entries: AgentLogEntry[]): Promise<void> {
  for (const entry of entries) {
    await insertAgentLogEntry(entry)
  }
}
