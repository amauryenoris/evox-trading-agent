import { describe, it, expect, vi } from 'vitest'

// Replicates the persistent-cooldown merge block from runAgentCycle() in claude-agent.ts.
// Keep in sync when the merge loop changes.

type PersistentCooldownRow = {
  symbol: string
  exit_reason: string
  cooldown_until: string
}

function mergePersistentCooldowns(
  cooldownSymbols: Set<string>,
  persistentCooldowns: PersistentCooldownRow[],
  logFn: (msg: string) => void = () => {}
): { inMemoryCooldownCount: number; restoredCount: number } {
  const inMemoryCooldownCount = cooldownSymbols.size
  let restoredCount = 0

  for (const row of persistentCooldowns) {
    if (cooldownSymbols.has(row.symbol)) {
      logFn(
        `[COOLDOWN_RESTORE_SKIP] symbol=${row.symbol}` +
        ` reason=${row.exit_reason}` +
        ` source=in_memory`
      )
    } else {
      cooldownSymbols.add(row.symbol)
      restoredCount++
      logFn(
        `[COOLDOWN_RESTORE] symbol=${row.symbol}` +
        ` reason=${row.exit_reason}` +
        ` until=${row.cooldown_until}`
      )
    }
  }

  return { inMemoryCooldownCount, restoredCount }
}

const FUTURE = '2099-01-01T00:00:00Z'

// ── TC-AVGO: cross-run re-entry blocked ───────────────────────

describe('TC-AVGO — cross-run re-entry blocked via DB restore', () => {
  it('AVGO from DB is added to cooldownSymbols and restoredCount=1', () => {
    // Arrange — empty in-memory state (new process, no exits this run)
    const cooldownSymbols = new Set<string>()
    const rows: PersistentCooldownRow[] = [
      { symbol: 'AVGO', exit_reason: 'Z_SCORE_EXIT', cooldown_until: FUTURE },
    ]

    // Act
    const { inMemoryCooldownCount, restoredCount } = mergePersistentCooldowns(cooldownSymbols, rows)

    // Assert
    expect(cooldownSymbols.has('AVGO')).toBe(true)
    expect(restoredCount).toBe(1)
    expect(inMemoryCooldownCount).toBe(0)
  })

  it('[COOLDOWN_RESTORE] is logged with symbol, reason, and until', () => {
    // Arrange
    const logs: string[] = []
    const cooldownSymbols = new Set<string>()
    const rows: PersistentCooldownRow[] = [
      { symbol: 'AVGO', exit_reason: 'Z_SCORE_EXIT', cooldown_until: FUTURE },
    ]

    // Act
    mergePersistentCooldowns(cooldownSymbols, rows, msg => logs.push(msg))

    // Assert
    expect(logs).toHaveLength(1)
    expect(logs[0]).toContain('[COOLDOWN_RESTORE]')
    expect(logs[0]).toContain('symbol=AVGO')
    expect(logs[0]).toContain('reason=Z_SCORE_EXIT')
    expect(logs[0]).toContain(`until=${FUTURE}`)
  })

  it('multiple DB rows: all new symbols are added, restoredCount matches', () => {
    // Arrange
    const cooldownSymbols = new Set<string>()
    const rows: PersistentCooldownRow[] = [
      { symbol: 'AVGO', exit_reason: 'Z_SCORE_EXIT', cooldown_until: FUTURE },
      { symbol: 'NVDA', exit_reason: 'STOP_LOSS',    cooldown_until: FUTURE },
    ]

    // Act
    const { restoredCount } = mergePersistentCooldowns(cooldownSymbols, rows)

    // Assert
    expect(cooldownSymbols.has('AVGO')).toBe(true)
    expect(cooldownSymbols.has('NVDA')).toBe(true)
    expect(restoredCount).toBe(2)
  })
})

// ── TC-SKIP: symbol already blocked same-run ──────────────────

describe('TC-SKIP — symbol already in cooldownSymbols is skipped', () => {
  it('AVGO in both in-memory and DB → [COOLDOWN_RESTORE_SKIP], restoredCount=0', () => {
    // Arrange — AVGO exited in this same run
    const cooldownSymbols = new Set<string>(['AVGO'])
    const rows: PersistentCooldownRow[] = [
      { symbol: 'AVGO', exit_reason: 'Z_SCORE_EXIT', cooldown_until: FUTURE },
    ]

    // Act
    const { restoredCount } = mergePersistentCooldowns(cooldownSymbols, rows)

    // Assert — set size unchanged, restoredCount unchanged
    expect(cooldownSymbols.size).toBe(1)
    expect(restoredCount).toBe(0)
  })

  it('[COOLDOWN_RESTORE_SKIP] is logged with symbol, reason, source=in_memory', () => {
    // Arrange
    const logs: string[] = []
    const cooldownSymbols = new Set<string>(['AVGO'])
    const rows: PersistentCooldownRow[] = [
      { symbol: 'AVGO', exit_reason: 'Z_SCORE_EXIT', cooldown_until: FUTURE },
    ]

    // Act
    mergePersistentCooldowns(cooldownSymbols, rows, msg => logs.push(msg))

    // Assert
    expect(logs).toHaveLength(1)
    expect(logs[0]).toContain('[COOLDOWN_RESTORE_SKIP]')
    expect(logs[0]).toContain('symbol=AVGO')
    expect(logs[0]).toContain('source=in_memory')
  })

  it('inMemoryCooldownCount snapshot captured before any merge', () => {
    // Arrange — 2 symbols already in-memory
    const cooldownSymbols = new Set<string>(['AVGO', 'TSLA'])
    const rows: PersistentCooldownRow[] = []

    // Act
    const { inMemoryCooldownCount } = mergePersistentCooldowns(cooldownSymbols, rows)

    // Assert — snapshot must equal pre-merge size
    expect(inMemoryCooldownCount).toBe(2)
    expect(cooldownSymbols.size).toBe(2)
  })
})

// ── TC-DB-FAIL: getActiveCooldowns returns [] ─────────────────

describe('TC-DB-FAIL — empty DB response (error or no rows)', () => {
  it('empty rows → cooldownSymbols unchanged, restoredCount=0', () => {
    // Arrange — some in-memory exits
    const cooldownSymbols = new Set<string>(['AAPL'])

    // Act
    const { restoredCount } = mergePersistentCooldowns(cooldownSymbols, [])

    // Assert
    expect(cooldownSymbols.has('AAPL')).toBe(true)
    expect(cooldownSymbols.size).toBe(1)
    expect(restoredCount).toBe(0)
  })

  it('empty rows, empty in-memory → total=0, no [COOLDOWN_RESTORE] emitted', () => {
    // Arrange
    const logs: string[] = []
    const cooldownSymbols = new Set<string>()

    // Act
    const { restoredCount } = mergePersistentCooldowns(cooldownSymbols, [], msg => logs.push(msg))

    // Assert
    expect(restoredCount).toBe(0)
    expect(logs).toHaveLength(0)
  })
})

// ── TC-CLEAN: cleanExpiredCooldowns try/catch ─────────────────

describe('TC-CLEAN — cleanExpiredCooldowns error swallowed by try/catch', () => {
  it('[COOLDOWN_CLEAN_FATAL] is logged and the function does not rethrow', async () => {
    // Arrange
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const error = new Error('DB gone')
    const cleanExpiredCooldowns = vi.fn().mockRejectedValue(error)

    // Act — replicate the try/catch block from claude-agent.ts
    await expect(async () => {
      try {
        await cleanExpiredCooldowns()
      } catch (err) {
        console.error('[COOLDOWN_CLEAN_FATAL]', err)
      }
    }).not.toThrow()

    // Assert
    expect(consoleSpy).toHaveBeenCalledWith('[COOLDOWN_CLEAN_FATAL]', error)
    consoleSpy.mockRestore()
  })
})
