import { describe, it, expect, vi } from 'vitest'

// Replicates the new cooldown-writing decision logic added to
// enforceStopLosses() and the ghost-close handler in claude-agent.ts
// (Fase 3 — stop-loss/ghost-close cooldown wiring). Both functions are
// private/inline within runAgentCycle(), so — per this project's
// established convention (cooldown-gate-fase-1b.test.ts,
// cooldown-merge-fase-2b-c.test.ts) — the decision logic is replicated
// here rather than imported. Keep in sync when those blocks change.

// ── enforceStopLosses()'s trigger condition ─────────────────────

function isStopLossTriggered(currentPrice: number, buyPrice: number, stopLossPct: number): boolean {
  const stopPrice = buyPrice * (1 - stopLossPct)
  return currentPrice <= stopPrice
}

function syntheticPnlPct(currentPrice: number, buyPrice: number): number {
  return (currentPrice - buyPrice) / buyPrice
}

// ── shared cooldown-write decision (both new call sites) ───────

function shouldWriteStopLossCooldown(pnlPct: number): boolean {
  return pnlPct < 0
}

// ── ghost-close alreadyEvaluated branching ──────────────────────

function planGhostClose(alreadyEvaluated: boolean): {
  shouldCallEvaluateClosedTrade: boolean
  shouldRecordSelectionOutcome: boolean
  shouldInsertAgentLogEntry: boolean
  shouldRemoveOpenPositionContext: boolean
} {
  return {
    shouldCallEvaluateClosedTrade: !alreadyEvaluated,
    shouldRecordSelectionOutcome: !alreadyEvaluated,
    shouldInsertAgentLogEntry: true,
    shouldRemoveOpenPositionContext: true,
  }
}

// ── entry-time gate (unchanged, from cooldown-gate-fase-1b.test.ts) ──

type ExitReason =
  | 'Z_SCORE_EXIT' | 'TRAILING_STOP' | 'PROFIT_TARGET' | 'STOP_LOSS' | 'TIME_STOP' | 'EMA_FAILURE' | 'UNKNOWN'

function buildCooldownSymbols(exitReasons: Map<string, ExitReason>): Set<string> {
  const cooldownSymbols = new Set<string>()
  for (const [symbol, reason] of exitReasons.entries()) {
    if (reason === 'UNKNOWN') continue
    if (reason !== 'TIME_STOP') cooldownSymbols.add(symbol)
  }
  return cooldownSymbols
}

function getSkipReason(
  symbol: string,
  cooldownSymbols: Set<string>,
  exitReasons: Map<string, ExitReason>
): string | null {
  return cooldownSymbols.has(symbol) ? (exitReasons.get(symbol) ?? 'UNKNOWN') : null
}

describe('enforceStopLosses() — trigger always implies a loss', () => {
  it('a triggered stop always produces a negative synthetic pnlPct', () => {
    // Arrange
    const buyPrice = 100
    const stopLossPct = 0.05
    const currentPrice = 94.5 // below the 5% stop

    // Act
    const triggered = isStopLossTriggered(currentPrice, buyPrice, stopLossPct)
    const pnlPct = syntheticPnlPct(currentPrice, buyPrice)

    // Assert
    expect(triggered).toBe(true)
    expect(pnlPct).toBeLessThan(0)
    expect(shouldWriteStopLossCooldown(pnlPct)).toBe(true)
  })

  it('a price exactly at the stop boundary still triggers and is a loss', () => {
    // Arrange
    const buyPrice = 200
    const stopLossPct = 0.05
    const currentPrice = buyPrice * (1 - stopLossPct)

    // Act
    const triggered = isStopLossTriggered(currentPrice, buyPrice, stopLossPct)
    const pnlPct = syntheticPnlPct(currentPrice, buyPrice)

    // Assert
    expect(triggered).toBe(true)
    expect(pnlPct).toBeLessThanOrEqual(0)
  })

  it('a price above the stop does not trigger', () => {
    // Arrange
    const buyPrice = 100
    const stopLossPct = 0.05
    const currentPrice = 96

    // Act
    const triggered = isStopLossTriggered(currentPrice, buyPrice, stopLossPct)

    // Assert
    expect(triggered).toBe(false)
  })
})

describe('ghost-close cooldown-write decision', () => {
  it('pnlPct=-0.0079 (XOM real value, fraction form) writes a STOP_LOSS cooldown', () => {
    // Arrange
    const pnlPct = -0.0079

    // Act + Assert
    expect(shouldWriteStopLossCooldown(pnlPct)).toBe(true)
  })

  it('pnlPct=+0.005 does not trigger a STOP_LOSS cooldown (a separate profitable-close branch handles this case — see below)', () => {
    // Arrange
    const pnlPct = 0.005

    // Act + Assert
    expect(shouldWriteStopLossCooldown(pnlPct)).toBe(false)
  })

  it('pnlPct=0 (exact breakeven) writes no cooldown', () => {
    // Arrange / Act / Assert
    expect(shouldWriteStopLossCooldown(0)).toBe(false)
  })
})

describe('ghost-close alreadyEvaluated branch — audit trail always logged', () => {
  it('alreadyEvaluated=true skips evaluateClosedTrade/recordSelectionOutcome but still logs and cleans up', () => {
    // Arrange / Act
    const plan = planGhostClose(true)

    // Assert
    expect(plan.shouldCallEvaluateClosedTrade).toBe(false)
    expect(plan.shouldRecordSelectionOutcome).toBe(false)
    expect(plan.shouldInsertAgentLogEntry).toBe(true)
    expect(plan.shouldRemoveOpenPositionContext).toBe(true)
  })

  it('alreadyEvaluated=false runs the full evaluation, logging, and cleanup', () => {
    // Arrange / Act
    const plan = planGhostClose(false)

    // Assert
    expect(plan.shouldCallEvaluateClosedTrade).toBe(true)
    expect(plan.shouldRecordSelectionOutcome).toBe(true)
    expect(plan.shouldInsertAgentLogEntry).toBe(true)
    expect(plan.shouldRemoveOpenPositionContext).toBe(true)
  })
})

describe('hoisted cooldown dates — computed once, reused by every consumer', () => {
  it('getNextTradingDay is called exactly twice regardless of how many consumers reuse the result', async () => {
    // Arrange
    const getNextTradingDay = vi.fn().mockResolvedValue(new Date('2026-07-20T00:00:00Z'))

    async function computeCooldownDatesOnce() {
      const [nextTradingDay1, nextTradingDay3] = await Promise.all([
        getNextTradingDay(new Date(), 1),
        getNextTradingDay(new Date(), 3),
      ])
      return { nextTradingDay1, nextTradingDay3 }
    }

    // Act — simulate 3 consumers (enforceExitRules block, enforceStopLosses, ghost-close)
    // all reusing the single hoisted result, as claude-agent.ts now does
    const cooldownDates = await computeCooldownDatesOnce()
    const consumers = [cooldownDates, cooldownDates, cooldownDates]

    // Assert
    expect(getNextTradingDay).toHaveBeenCalledTimes(2)
    expect(consumers.every((c) => c === cooldownDates)).toBe(true)
  })
})

describe('T-12 regression — XOM 2026-07-14-style same-day re-entry now blocked', () => {
  it('a STOP_LOSS cooldown from a ghost-close blocks same-day re-entry with skipReason=STOP_LOSS', () => {
    // Arrange — XOM closed via ghost-close/stop-loss earlier this cycle (or a restored
    // persistent cooldown), now correctly classified STOP_LOSS instead of never being recorded
    const exitReasons = new Map<string, ExitReason>([['XOM', 'STOP_LOSS']])
    const cooldownSymbols = buildCooldownSymbols(exitReasons)

    // Act — same-day re-entry attempt into XOM under any setup
    const skipReason = getSkipReason('XOM', cooldownSymbols, exitReasons)

    // Assert
    expect(skipReason).toBe('STOP_LOSS')
  })
})

// ── ghost-close overwrite prevention (fix-cooldown-ghost-close-overwrite) ──
// Replicates the new `existingCooldowns` guard added to the ghost-close
// STOP_LOSS write at claude-agent.ts — same "replicate, don't import"
// convention as the rest of this file.

function shouldWriteGhostCloseCooldown(
  pnlPct: number,
  existingCooldowns: Map<string, string>,
  symbol: string
): boolean {
  return pnlPct < 0 && !existingCooldowns.has(symbol)
}

describe('ghost-close STOP_LOSS write — existing active cooldown is not overwritten', () => {
  it('a loss with no existing cooldown for the symbol still writes STOP_LOSS (no regression)', () => {
    // Arrange
    const pnlPct = -0.0079
    const existingCooldowns = new Map<string, string>()

    // Act
    const shouldWrite = shouldWriteGhostCloseCooldown(pnlPct, existingCooldowns, 'XOM')

    // Assert
    expect(shouldWrite).toBe(true)
  })

  it('a loss with an existing active cooldown for the symbol (any reason) skips the write', () => {
    // Arrange — symbol already has a Z_SCORE_EXIT cooldown from enforceExitRules() earlier
    // this cycle; the ghost-close path must defer to it instead of overwriting with STOP_LOSS
    const pnlPct = -0.0079
    const existingCooldowns = new Map<string, string>([['XOM', 'Z_SCORE_EXIT']])

    // Act
    const shouldWrite = shouldWriteGhostCloseCooldown(pnlPct, existingCooldowns, 'XOM')

    // Assert
    expect(shouldWrite).toBe(false)
  })

  it('an existing cooldown for a different symbol does not block this symbol\'s write', () => {
    // Arrange
    const pnlPct = -0.0079
    const existingCooldowns = new Map<string, string>([['AAPL', 'TRAILING_STOP']])

    // Act
    const shouldWrite = shouldWriteGhostCloseCooldown(pnlPct, existingCooldowns, 'XOM')

    // Assert
    expect(shouldWrite).toBe(true)
  })

  it('a non-negative pnlPct never triggers this STOP_LOSS-scoped write (a separate profitable-close branch handles it — see below)', () => {
    // Arrange / Act / Assert
    expect(shouldWriteGhostCloseCooldown(0, new Map(), 'XOM')).toBe(false)
    expect(shouldWriteGhostCloseCooldown(0.01, new Map(), 'XOM')).toBe(false)
  })
})

// ── Part 1: Block A cooldown-persistence failure isolation ──────
// Replicates the try/catch wrap added around the cooldown-persistence
// Promise.all in claude-agent.ts (lines 1306-1335) — a failure anywhere
// inside is caught, logged, and does not abort the rest of runAgentCycle().

async function persistCooldownsSafely(
  exitReasons: Map<string, ExitReason>,
  cooldownUntilFor: (reason: ExitReason) => Date | null,
  upsertFn: (symbol: string, reason: ExitReason, until: Date) => Promise<void>,
  logError: (msg: string, err: unknown) => void
): Promise<boolean> {
  try {
    await Promise.all(
      [...exitReasons.entries()].map(async ([symbol, reason]) => {
        const cooldownUntil = cooldownUntilFor(reason)
        if (cooldownUntil !== null) {
          await upsertFn(symbol, reason, cooldownUntil)
        }
      })
    )
    return true
  } catch (err) {
    logError('[COOLDOWN_PERSIST_ERROR] cooldown-persistence block failed:', err)
    return false
  }
}

describe('Block A guard — cooldown-persistence failure is caught, not propagated', () => {
  it('a rejected upsert for one symbol is caught, logged, and the call resolves (does not throw)', async () => {
    // Arrange
    const exitReasons = new Map<string, ExitReason>([['XOM', 'PROFIT_TARGET']])
    const upsertFn = vi.fn().mockRejectedValue(new Error('Supabase RPC failed'))
    const logError = vi.fn()

    // Act
    const succeeded = await persistCooldownsSafely(
      exitReasons,
      () => new Date('2026-09-14T21:00:00Z'),
      upsertFn,
      logError
    )

    // Assert
    expect(succeeded).toBe(false)
    expect(logError).toHaveBeenCalledWith('[COOLDOWN_PERSIST_ERROR] cooldown-persistence block failed:', expect.any(Error))
  })

  it('no failure means no error is logged and the write succeeds', async () => {
    // Arrange
    const exitReasons = new Map<string, ExitReason>([['AAPL', 'TRAILING_STOP']])
    const upsertFn = vi.fn().mockResolvedValue(undefined)
    const logError = vi.fn()

    // Act
    const succeeded = await persistCooldownsSafely(
      exitReasons,
      () => new Date('2026-09-15T00:00:00Z'),
      upsertFn,
      logError
    )

    // Assert
    expect(succeeded).toBe(true)
    expect(upsertFn).toHaveBeenCalledTimes(1)
    expect(logError).not.toHaveBeenCalled()
  })
})

// ── Block B guard: detectClosedPositions() failure isolation ────
// Replicates the try/catch wrap added around detectClosedPositions() in
// claude-agent.ts (lines 1339-1351) — a failure defaults closedContexts
// to [] instead of aborting the rest of runAgentCycle(). Unlike Block A,
// this default is a plain assignment (no boolean return needed) since
// no caller inspects whether the detection itself "succeeded" —
// downstream code only ever consumes the resulting array.

async function detectClosedContextsSafely<T>(
  detectFn: () => Promise<T[]>,
  logError: (msg: string, err: unknown) => void
): Promise<T[]> {
  try {
    return await detectFn()
  } catch (err) {
    logError(
      '[GHOST_CLOSE_ERROR] detectClosedPositions() failed — ghost-close ' +
      'detection skipped this cycle. Same-cycle GTC_STOP re-entry ' +
      'protection is unavailable this cycle only; any actually-closed ' +
      'position will be correctly detected and processed on the next ' +
      'cycle (detectClosedPositions is stateless/idempotent):',
      err
    )
    return []
  }
}

describe('Block B guard — detectClosedPositions() failure is caught, not propagated', () => {
  it('a rejected detectClosedPositions() call is caught, logged with the exact consequence message, and defaults to []', async () => {
    // Arrange
    const detectFn = vi.fn().mockRejectedValue(new Error('Failed to fetch position contexts: network error'))
    const logError = vi.fn()

    // Act
    const closedContexts = await detectClosedContextsSafely(detectFn, logError)

    // Assert
    expect(closedContexts).toEqual([])
    expect(logError).toHaveBeenCalledWith(
      '[GHOST_CLOSE_ERROR] detectClosedPositions() failed — ghost-close ' +
      'detection skipped this cycle. Same-cycle GTC_STOP re-entry ' +
      'protection is unavailable this cycle only; any actually-closed ' +
      'position will be correctly detected and processed on the next ' +
      'cycle (detectClosedPositions is stateless/idempotent):',
      expect.any(Error)
    )
  })

  it('no failure means closedContexts receives the real return value and no error is logged', async () => {
    // Arrange
    const realClosedContexts = [{ symbol: 'XOM' }, { symbol: 'AAPL' }]
    const detectFn = vi.fn().mockResolvedValue(realClosedContexts)
    const logError = vi.fn()

    // Act
    const closedContexts = await detectClosedContextsSafely(detectFn, logError)

    // Assert
    expect(closedContexts).toBe(realClosedContexts)
    expect(logError).not.toHaveBeenCalled()
  })

  it('an empty closedContexts (from either a genuine zero-closures cycle or a caught failure) drives zero ghost-close loop iterations, matching each other exactly', () => {
    // Arrange
    const closedContextsFromFailure: Array<{ symbol: string }> = []
    const closedContextsFromZeroClosures: Array<{ symbol: string }> = []

    // Act
    let failureIterations = 0
    for (const _ctx of closedContextsFromFailure) failureIterations++
    let zeroClosureIterations = 0
    for (const _ctx of closedContextsFromZeroClosures) zeroClosureIterations++
    const closedThisCycleFromFailure = new Set(closedContextsFromFailure.map((c) => c.symbol))

    // Assert — no crash, no special-casing, identical to a genuinely quiet cycle
    expect(failureIterations).toBe(0)
    expect(zeroClosureIterations).toBe(0)
    expect(closedThisCycleFromFailure.size).toBe(0)
  })
})

// ── Part 2: profitable ghost-close cooldown branch ───────────────
// Replicates the two new else-if branches added after the existing
// pnlPct < 0 branches in claude-agent.ts (lines 1414-1438) — a
// profitable ghost-close now writes TRAILING_STOP (confirmed order-id
// match) or GHOST_CLOSE_PROFIT (no match) instead of writing nothing.

function isConfirmedTrailingStopFill(
  sellOrderId: string | null | undefined,
  trailingStopOrderId: string | null | undefined
): boolean {
  return sellOrderId != null && trailingStopOrderId != null && sellOrderId === trailingStopOrderId
}

function shouldWriteProfitableGhostCloseCooldown(
  pnlPct: number,
  existingCooldowns: Map<string, string>,
  symbol: string
): boolean {
  return pnlPct >= 0 && !existingCooldowns.has(symbol)
}

function decideProfitableGhostCloseCooldownReason(
  sellOrderId: string | null | undefined,
  trailingStopOrderId: string | null | undefined
): 'TRAILING_STOP' | 'GHOST_CLOSE_PROFIT' {
  return isConfirmedTrailingStopFill(sellOrderId, trailingStopOrderId) ? 'TRAILING_STOP' : 'GHOST_CLOSE_PROFIT'
}

describe('profitable ghost-close — trailing-stop-order-id match', () => {
  it('sellOrder.id === ctx.trailingStopOrderId (both non-null) resolves to TRAILING_STOP', () => {
    // Arrange
    const sellOrderId = 'order-abc-123'
    const trailingStopOrderId = 'order-abc-123'

    // Act
    const confirmed = isConfirmedTrailingStopFill(sellOrderId, trailingStopOrderId)
    const reason = decideProfitableGhostCloseCooldownReason(sellOrderId, trailingStopOrderId)

    // Assert
    expect(confirmed).toBe(true)
    expect(reason).toBe('TRAILING_STOP')
  })

  it('a mismatched order id resolves to GHOST_CLOSE_PROFIT, not TRAILING_STOP', () => {
    // Arrange
    const sellOrderId = 'order-xyz-999'
    const trailingStopOrderId = 'order-abc-123'

    // Act
    const confirmed = isConfirmedTrailingStopFill(sellOrderId, trailingStopOrderId)
    const reason = decideProfitableGhostCloseCooldownReason(sellOrderId, trailingStopOrderId)

    // Assert
    expect(confirmed).toBe(false)
    expect(reason).toBe('GHOST_CLOSE_PROFIT')
  })

  it('a null/undefined ctx.trailingStopOrderId resolves to GHOST_CLOSE_PROFIT', () => {
    // Arrange / Act / Assert
    expect(decideProfitableGhostCloseCooldownReason('order-abc-123', null)).toBe('GHOST_CLOSE_PROFIT')
    expect(decideProfitableGhostCloseCooldownReason('order-abc-123', undefined)).toBe('GHOST_CLOSE_PROFIT')
  })

  it('a null sellOrder.id resolves to GHOST_CLOSE_PROFIT', () => {
    // Arrange / Act / Assert
    expect(decideProfitableGhostCloseCooldownReason(null, 'order-abc-123')).toBe('GHOST_CLOSE_PROFIT')
    expect(decideProfitableGhostCloseCooldownReason(undefined, 'order-abc-123')).toBe('GHOST_CLOSE_PROFIT')
  })
})

describe('profitable ghost-close cooldown-write decision', () => {
  it('a profitable close with no existing cooldown for the symbol writes a cooldown', () => {
    // Arrange
    const pnlPct = 0.0237 // XOM real value
    const existingCooldowns = new Map<string, string>()

    // Act
    const shouldWrite = shouldWriteProfitableGhostCloseCooldown(pnlPct, existingCooldowns, 'XOM')

    // Assert
    expect(shouldWrite).toBe(true)
  })

  it('breakeven (pnlPct=0) is treated as profitable — writes a cooldown, not STOP_LOSS', () => {
    // Arrange / Act / Assert
    expect(shouldWriteProfitableGhostCloseCooldown(0, new Map(), 'XOM')).toBe(true)
    expect(shouldWriteStopLossCooldown(0)).toBe(false)
  })

  it('a profitable close with an existing active cooldown for the symbol skips the write', () => {
    // Arrange — symbol already has a cooldown from earlier this cycle
    const pnlPct = 0.0237
    const existingCooldowns = new Map<string, string>([['XOM', 'Z_SCORE_EXIT']])

    // Act
    const shouldWrite = shouldWriteProfitableGhostCloseCooldown(pnlPct, existingCooldowns, 'XOM')

    // Assert
    expect(shouldWrite).toBe(false)
  })

  it('a loss (pnlPct < 0) is never handled by the profitable-close gate', () => {
    // Arrange / Act / Assert
    expect(shouldWriteProfitableGhostCloseCooldown(-0.0079, new Map(), 'XOM')).toBe(false)
  })
})

describe('hoisted existing-cooldowns lookup — queried once, reused for every closed position', () => {
  it('getActiveCooldowns is called exactly once per cycle regardless of closedContexts size', async () => {
    // Arrange
    const getActiveCooldowns = vi.fn().mockResolvedValue([
      { symbol: 'XOM', exit_reason: 'Z_SCORE_EXIT', cooldown_until: '2026-07-20T00:00:00Z' },
    ])
    const closedContexts = [{ symbol: 'XOM' }, { symbol: 'AAPL' }, { symbol: 'MSFT' }]

    async function buildExistingCooldownsOnce(): Promise<Map<string, string>> {
      const rows: Array<{ symbol: string; exit_reason: string }> = await getActiveCooldowns()
      return new Map(rows.map((row) => [row.symbol, row.exit_reason]))
    }

    // Act — simulate the hoist: one call before the loop, reused for every closed position
    const existingCooldowns = await buildExistingCooldownsOnce()
    for (const ctx of closedContexts) {
      shouldWriteGhostCloseCooldown(-0.01, existingCooldowns, ctx.symbol)
    }

    // Assert
    expect(getActiveCooldowns).toHaveBeenCalledTimes(1)
  })
})
