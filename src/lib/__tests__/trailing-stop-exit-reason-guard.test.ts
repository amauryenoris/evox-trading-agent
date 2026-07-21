import { describe, it, expect } from 'vitest'

// Replicates enforceExitRules()'s per-position check sequence from claude-agent.ts
// (this project's established convention — private/inline logic within runAgentCycle()
// is replicated here rather than imported; see cooldown-stop-loss-ghost-close.test.ts).
// Covers the fix-trailing-stop-exit-reason-guard fix: the trailing-stop block's final
// exitReason assignment now requires !exitReason, matching every other condition's
// "first to fire wins" pattern. Lines 242-295's state-tracking stays unconditional.

type SignalType = 'MEAN_REVERSION' | 'TREND' | 'TREND_PULLBACK' | 'TREND_ZLE05' | 'EMA_RECLAIM' | null

interface ExitCycleInput {
  pnlPct: number
  daysOpen: number
  signalType: SignalType
  zScore: number
  ema50: number | null
  currentPrice: number
  atr: number | null
  ctxHighSinceEntry: number | null
  ctxTrailingActivated: boolean
  ctxTrailingStop: number | null
  ctxBuyPrice: number
}

interface ExitCycleResult {
  exitReason: string | null
  persistCalled: boolean
  persisted: { highSinceEntry: number; trailingStop: number | null; trailingActivated: boolean } | null
}

function simulateExitCycle(input: ExitCycleInput): ExitCycleResult {
  const ACTIVATION_PCT: Record<string, number> = {
    MEAN_REVERSION: 0.05, TREND: 0.06, TREND_PULLBACK: 0.06, TREND_ZLE05: 0.03, EMA_RECLAIM: 0.04, default: 0.05,
  }
  const ATR_MULT: Record<string, number> = {
    MEAN_REVERSION: 1.2, TREND: 1.5, TREND_PULLBACK: 1.5, TREND_ZLE05: 1.0, EMA_RECLAIM: 1.0, default: 1.2,
  }
  const MIN_DISTANCE_PCT = 0.015

  let exitReason: string | null = null

  if (input.pnlPct >= 0.10) exitReason = 'Exit rule: profit target reached'
  if (!exitReason && input.daysOpen >= 20) exitReason = 'Exit rule: 20-day time stop'

  if (!exitReason && input.signalType === 'MEAN_REVERSION') {
    if (input.zScore >= -0.8 && !input.ctxTrailingActivated) {
      exitReason = 'Exit rule: z-score reverted to fair value'
    }
  }

  if (!exitReason && (input.signalType === 'TREND' || input.signalType === 'TREND_PULLBACK' || input.signalType === 'TREND_ZLE05')) {
    if (input.ema50 !== null && input.currentPrice < input.ema50) {
      exitReason = 'Exit rule: price fell below EMA50'
    }
  }

  if (!exitReason && input.signalType === 'EMA_RECLAIM') {
    if (input.ema50 !== null && input.currentPrice < input.ema50) {
      exitReason = 'Exit rule: EMA Reclaim failed'
    }
  }

  const currentPrice = input.currentPrice
  const atr = input.atr

  let highSinceEntry = input.ctxHighSinceEntry ?? currentPrice
  const madeNewHigh = currentPrice > highSinceEntry
  if (madeNewHigh) highSinceEntry = currentPrice

  let persistCalled = false
  let persisted: ExitCycleResult['persisted'] = null

  if (!atr || atr <= 0) {
    persistCalled = true
    persisted = { highSinceEntry, trailingStop: input.ctxTrailingStop ?? null, trailingActivated: input.ctxTrailingActivated }
  } else {
    const activationPct = ACTIVATION_PCT[input.signalType ?? 'default'] ?? ACTIVATION_PCT['default']
    let trailingActivated = input.ctxTrailingActivated
    let justActivated = false
    if (!trailingActivated && input.pnlPct >= activationPct) {
      trailingActivated = true
      justActivated = true
    }

    let trailingStop = input.ctxTrailingStop ?? null
    if (trailingActivated) {
      const mult = ATR_MULT[input.signalType ?? 'default'] ?? ATR_MULT['default']
      const distance = Math.max(mult * atr, highSinceEntry * MIN_DISTANCE_PCT)
      const newStop = highSinceEntry - distance
      const flooredStop = Math.max(newStop, input.ctxBuyPrice ?? 0)
      if (trailingStop !== null && trailingStop >= highSinceEntry) {
        trailingStop = flooredStop
      } else {
        trailingStop = Math.max(trailingStop ?? 0, flooredStop)
      }
    }

    persistCalled = true
    persisted = { highSinceEntry, trailingStop, trailingActivated }

    // The fix under test: !exitReason is now the first clause here.
    if (
      !exitReason &&
      trailingActivated &&
      !justActivated &&
      !madeNewHigh &&
      trailingStop !== null &&
      currentPrice <= trailingStop
    ) {
      exitReason = 'Trailing stop triggered'
    }
  }

  return { exitReason, persistCalled, persisted }
}

describe('trailing-stop exit reason no longer overwrites an already-set exit reason', () => {
  it('TREND_PULLBACK: EMA50 breach AND trailing condition both true — EMA50 breach message wins, not overwritten', () => {
    // Arrange — price has fallen below both EMA50 and the trailing stop in the same cycle
    const input: ExitCycleInput = {
      pnlPct: 0.05,
      daysOpen: 5,
      signalType: 'TREND_PULLBACK',
      zScore: 0.5,
      ema50: 108,
      currentPrice: 105,
      atr: 1,
      ctxHighSinceEntry: 120,
      ctxTrailingActivated: true,
      ctxTrailingStop: 110,
      ctxBuyPrice: 100,
    }

    // Act
    const result = simulateExitCycle(input)

    // Assert
    expect(result.exitReason).toBe('Exit rule: price fell below EMA50')
  })

  it('TREND_PULLBACK: EMA50 breach false, trailing condition true — trailing message fires normally (no regression)', () => {
    // Arrange — identical to the above except EMA50 is now below current price (no breach)
    const input: ExitCycleInput = {
      pnlPct: 0.05,
      daysOpen: 5,
      signalType: 'TREND_PULLBACK',
      zScore: 0.5,
      ema50: 95,
      currentPrice: 105,
      atr: 1,
      ctxHighSinceEntry: 120,
      ctxTrailingActivated: true,
      ctxTrailingStop: 110,
      ctxBuyPrice: 100,
    }

    // Act
    const result = simulateExitCycle(input)

    // Assert
    expect(result.exitReason).toBe('Trailing stop triggered')
  })

  it('MEAN_REVERSION with trailing already activated — behavior unchanged (already structurally immune)', () => {
    // Arrange — z-score exit condition is blocked by !ctx.trailingActivated regardless of this fix;
    // trailing's own condition independently fires
    const input: ExitCycleInput = {
      pnlPct: 0.06,
      daysOpen: 5,
      signalType: 'MEAN_REVERSION',
      zScore: -0.5, // >= -0.8, would trigger z-score exit if trailing were not already active
      ema50: null,
      currentPrice: 105,
      atr: 1,
      ctxHighSinceEntry: 120,
      ctxTrailingActivated: true,
      ctxTrailingStop: 110,
      ctxBuyPrice: 100,
    }

    // Act
    const result = simulateExitCycle(input)

    // Assert — z-score exit never fires (trailingActivated=true blocks it), trailing fires instead
    expect(result.exitReason).toBe('Trailing stop triggered')
  })

  it('state-tracking (highSinceEntry/trailingStop/trailingActivated) still persists even when exitReason was already set', () => {
    // Arrange — same overwrite scenario as the first test
    const input: ExitCycleInput = {
      pnlPct: 0.05,
      daysOpen: 5,
      signalType: 'TREND_PULLBACK',
      zScore: 0.5,
      ema50: 108,
      currentPrice: 105,
      atr: 1,
      ctxHighSinceEntry: 120,
      ctxTrailingActivated: true,
      ctxTrailingStop: 110,
      ctxBuyPrice: 100,
    }

    // Act
    const result = simulateExitCycle(input)

    // Assert — persistence still happened despite exitReason being set by an earlier check
    expect(result.persistCalled).toBe(true)
    expect(result.persisted).not.toBeNull()
    expect(result.persisted?.trailingActivated).toBe(true)
    expect(result.persisted?.highSinceEntry).toBe(120)
    expect(result.persisted?.trailingStop).not.toBeNull()
  })

  it('historical replay — FCX 2026-05-14 real values (price still above EMA50) — trailing still fires, unaffected by the new guard', () => {
    // Arrange — real production values from the diagnostic: price $65.43, ema50 $61.75 (no breach)
    const input: ExitCycleInput = {
      pnlPct: 0.06,
      daysOpen: 8,
      signalType: 'TREND',
      zScore: 0.3,
      ema50: 61.75,
      currentPrice: 65.43,
      atr: 1.2,
      ctxHighSinceEntry: 68.35,
      ctxTrailingActivated: true,
      ctxTrailingStop: 65.7,
      ctxBuyPrice: 60,
    }

    // Act
    const result = simulateExitCycle(input)

    // Assert — no earlier condition could have set exitReason (price above EMA50), trailing fires as it did in production
    expect(result.exitReason).toBe('Trailing stop triggered')
  })
})
