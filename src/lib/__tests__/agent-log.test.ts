import { describe, it, expect, beforeEach, vi } from 'vitest'
import { appendAgentLogEntries } from '../agent-log'
import type { AgentLogEntry } from '../types'

const { mockInsertAgentLogEntry } = vi.hoisted(() => ({
  mockInsertAgentLogEntry: vi.fn(),
}))

vi.mock('../db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../db')>()
  return {
    ...actual,
    insertAgentLogEntry: mockInsertAgentLogEntry,
  }
})

function makeEntry(overrides: Partial<AgentLogEntry> = {}): AgentLogEntry {
  return {
    id: 'entry-1',
    timestamp: '2026-09-04T17:07:47.690Z',
    symbol: 'MSFT',
    decision: {
      action: 'HOLD',
      symbol: 'MSFT',
      quantity: 0,
      reasoning: 'exit_rules_check',
      confidence: 1.0,
    },
    indicators: {} as AgentLogEntry['indicators'],
    portfolioSnapshot: { equity: '100000', cash: '50000', positionCount: 1 },
    orderExecuted: false,
    ...overrides,
  }
}

describe('appendAgentLogEntries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('inserts every entry when all succeed', async () => {
    // Arrange
    const entries = [makeEntry({ id: 'a', symbol: 'CVX' }), makeEntry({ id: 'b', symbol: 'XOM' })]
    mockInsertAgentLogEntry.mockResolvedValue(undefined)

    // Act
    await appendAgentLogEntries(entries)

    // Assert
    expect(mockInsertAgentLogEntry).toHaveBeenCalledTimes(2)
    expect(mockInsertAgentLogEntry).toHaveBeenNthCalledWith(1, entries[0])
    expect(mockInsertAgentLogEntry).toHaveBeenNthCalledWith(2, entries[1])
  })

  it('does not log a batch summary when every entry succeeds', async () => {
    // Arrange
    const entries = [makeEntry({ id: 'a' }), makeEntry({ id: 'b' })]
    mockInsertAgentLogEntry.mockResolvedValue(undefined)

    // Act
    await appendAgentLogEntries(entries)

    // Assert
    expect(console.error).not.toHaveBeenCalled()
  })

  it('still attempts subsequent entries after an earlier entry fails', async () => {
    // Arrange
    const entries = [
      makeEntry({ id: 'a', symbol: 'MSFT', decision: { action: 'SELL', symbol: 'MSFT', quantity: 10, reasoning: 'SMA5 exit', confidence: 1 } }),
      makeEntry({ id: 'b', symbol: 'CVX' }),
      makeEntry({ id: 'c', symbol: 'XOM' }),
    ]
    mockInsertAgentLogEntry
      .mockRejectedValueOnce(new Error('duplicate key value violates unique constraint'))
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)

    // Act
    await appendAgentLogEntries(entries)

    // Assert
    expect(mockInsertAgentLogEntry).toHaveBeenCalledTimes(3)
    expect(mockInsertAgentLogEntry).toHaveBeenNthCalledWith(2, entries[1])
    expect(mockInsertAgentLogEntry).toHaveBeenNthCalledWith(3, entries[2])
  })

  it('resolves without throwing when one or more entries fail', async () => {
    // Arrange
    const entries = [makeEntry({ id: 'a' }), makeEntry({ id: 'b' })]
    mockInsertAgentLogEntry.mockRejectedValue(new Error('insert failed'))

    // Act & Assert
    await expect(appendAgentLogEntries(entries)).resolves.toBeUndefined()
  })

  it('logs the failing entry symbol, action, and underlying error message', async () => {
    // Arrange
    const failingEntry = makeEntry({
      id: 'a',
      symbol: 'MSFT',
      decision: { action: 'SELL', symbol: 'MSFT', quantity: 10, reasoning: 'SMA5 exit', confidence: 1 },
    })
    mockInsertAgentLogEntry.mockRejectedValueOnce(new Error('Failed to insert agent log: duplicate key'))

    // Act
    await appendAgentLogEntries([failingEntry])

    // Assert
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('[AGENT_LOG_INSERT_FAILED] symbol=MSFT action=SELL')
    )
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('cause=Failed to insert agent log: duplicate key')
    )
  })

  it('logs a batch-partial summary with correct counts when some entries fail', async () => {
    // Arrange
    const entries = [makeEntry({ id: 'a' }), makeEntry({ id: 'b' }), makeEntry({ id: 'c' })]
    mockInsertAgentLogEntry
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('insert failed'))
      .mockResolvedValueOnce(undefined)

    // Act
    await appendAgentLogEntries(entries)

    // Assert
    expect(console.error).toHaveBeenCalledWith('[AGENT_LOG_BATCH_PARTIAL] 2 succeeded, 1 failed out of 3 total entries this cycle')
  })
})
