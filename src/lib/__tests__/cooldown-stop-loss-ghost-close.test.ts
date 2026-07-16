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

  it('pnlPct=+0.005 writes no cooldown', () => {
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

  it('a non-negative pnlPct still writes nothing regardless of existing cooldown state', () => {
    // Arrange / Act / Assert
    expect(shouldWriteGhostCloseCooldown(0, new Map(), 'XOM')).toBe(false)
    expect(shouldWriteGhostCloseCooldown(0.01, new Map(), 'XOM')).toBe(false)
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
