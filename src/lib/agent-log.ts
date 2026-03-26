import type { AgentLogEntry } from './types'
import { insertAgentLogEntry, getAgentLog } from './db'

export async function readAgentLog(): Promise<AgentLogEntry[]> {
  return getAgentLog(500)
}

export async function appendAgentLogEntries(entries: AgentLogEntry[]): Promise<void> {
  for (const entry of entries) {
    await insertAgentLogEntry(entry)
  }
}
