import { describe, it, expect } from 'vitest'

// Replicates enforceExitRules()'s per-position check sequence from claude-agent.ts
// (this project's established convention — private/inline logic is replicated here
// rather than imported; see trailing-stop-exit-reason-guard.test.ts).
// Covers the trend-zle05-exit-rules-trial change: TREND_ZLE05 no longer exits via the
// EMA50-break rule, instead exits when z-score reaches the 1.25 entry ceiling; profit
// target is now per-signal-type (TREND_ZLE05: 5%, everyone else: 10%).

type SignalType = 'MEAN_REVERSION' | 'TREND' | 'TREND_PULLBACK' | 'TREND_ZLE05' | 'EMA_RECLAIM' | 'TREND_PULLBACK_3DAY' | null

interface ExitCycleInput {
  pnlPct: number
  daysOpen: number
  signalType: SignalType
  zScore: number
  kalmanSignal?: 'MEAN_REVERSION_LONG' | 'EXIT_LONG' | 'NEUTRAL'
  ema50: number | null
  sma5?: number | null
  currentPrice: number
}

function simulateExitCycle(input: ExitCycleInput): { exitReason: string | null } {
  const PROFIT_TARGET_PCT: Record<string, number> = {
    TREND_ZLE05: 0.05,
    default: 0.10,
  }
  const TREND_ZLE05_Z_EXIT = 1.25

  let exitReason: string | null = null

  const profitTargetPct = PROFIT_TARGET_PCT[input.signalType ?? 'default'] ?? PROFIT_TARGET_PCT['default']
  if (input.pnlPct >= profitTargetPct) {
    exitReason = `Exit rule: profit target reached (${(input.pnlPct * 100).toFixed(1)}% >= ${(profitTargetPct * 100).toFixed(0)}%)`
  }
  if (!exitReason && input.daysOpen >= 20) {
    exitReason = `Exit rule: 20-day time stop (${input.daysOpen} trading days open)`
  }

  if (!exitReason && input.signalType === 'MEAN_REVERSION') {
    if (input.kalmanSignal === 'EXIT_LONG') {
      exitReason = `Exit rule: z-score reverted to fair value`
    }
  }

  if (!exitReason && (input.signalType === 'TREND' || input.signalType === 'TREND_PULLBACK')) {
    if (input.ema50 !== null && input.currentPrice < input.ema50) {
      exitReason = `Exit rule: price fell below EMA50`
    }
  }

  if (!exitReason && input.signalType === 'TREND_ZLE05') {
    if (Number.isFinite(input.zScore) && input.zScore >= TREND_ZLE05_Z_EXIT) {
      exitReason = `Exit rule: z-score ${input.zScore.toFixed(2)} reached 1.25 (entry ceiling) — move exhausted`
    }
  }

  if (!exitReason && input.signalType === 'EMA_RECLAIM') {
    if (input.ema50 !== null && input.currentPrice < input.ema50) {
      exitReason = `Exit rule: EMA Reclaim failed`
    }
  }

  if (!exitReason && input.signalType === 'TREND_PULLBACK_3DAY') {
    const sma5 = input.sma5 ?? null
    if (sma5 != null && input.currentPrice > sma5) {
      exitReason = `Exit rule: price closed above SMA5`
    }
  }

  return { exitReason }
}

const BASE: ExitCycleInput = {
  pnlPct: 0.01,
  daysOpen: 1,
  signalType: 'TREND_ZLE05',
  zScore: 0.5,
  ema50: 100,
  currentPrice: 105,
}

describe('TREND_ZLE05 z-score exhaustion exit', () => {
  it('triggers when zScore >= 1.25 (finite) for TREND_ZLE05', () => {
    // Arrange
    const input: ExitCycleInput = { ...BASE, zScore: 1.25, pnlPct: 0.02, daysOpen: 1 }

    // Act
    const result = simulateExitCycle(input)

    // Assert
    expect(result.exitReason).toBe('Exit rule: z-score 1.25 reached 1.25 (entry ceiling) — move exhausted')
  })

  it('does not trigger when zScore is just below 1.25', () => {
    // Arrange
    const input: ExitCycleInput = { ...BASE, zScore: 1.24, pnlPct: 0.02, daysOpen: 1 }

    // Act
    const result = simulateExitCycle(input)

    // Assert
    expect(result.exitReason).toBeNull()
  })

  it('does not trigger when zScore is NaN', () => {
    // Arrange
    const input: ExitCycleInput = { ...BASE, zScore: NaN, pnlPct: 0.02, daysOpen: 1 }

    // Act
    const result = simulateExitCycle(input)

    // Assert
    expect(result.exitReason).toBeNull()
  })

  it('does not trigger for a non-TREND_ZLE05 signal type even with zScore >= 1.25', () => {
    // Arrange — TREND_PULLBACK has no z-score exhaustion rule at all
    const input: ExitCycleInput = { ...BASE, signalType: 'TREND_PULLBACK', zScore: 1.30, pnlPct: 0.02, daysOpen: 1, ema50: 100, currentPrice: 105 }

    // Act
    const result = simulateExitCycle(input)

    // Assert — no exit (price above EMA50, below both profit target and time stop)
    expect(result.exitReason).toBeNull()
  })
})

describe('EMA50-break rule — TREND_ZLE05 excluded, TREND/TREND_PULLBACK unchanged', () => {
  it('TREND_ZLE05 with price below EMA50 no longer exits via the EMA50-break rule', () => {
    // Arrange — price below EMA50, zScore below the exhaustion ceiling, nothing else triggers
    const input: ExitCycleInput = { ...BASE, zScore: 0.5, pnlPct: 0.01, daysOpen: 1, ema50: 110, currentPrice: 105 }

    // Act
    const result = simulateExitCycle(input)

    // Assert — no exit at all (the old EMA50 rule would have fired here)
    expect(result.exitReason).toBeNull()
  })

  it('TREND still exits via the EMA50-break rule (unchanged)', () => {
    // Arrange
    const input: ExitCycleInput = { ...BASE, signalType: 'TREND', ema50: 110, currentPrice: 105, pnlPct: 0.01, daysOpen: 1 }

    // Act
    const result = simulateExitCycle(input)

    // Assert
    expect(result.exitReason).toBe('Exit rule: price fell below EMA50')
  })

  it('TREND_PULLBACK still exits via the EMA50-break rule (unchanged)', () => {
    // Arrange
    const input: ExitCycleInput = { ...BASE, signalType: 'TREND_PULLBACK', ema50: 110, currentPrice: 105, pnlPct: 0.01, daysOpen: 1 }

    // Act
    const result = simulateExitCycle(input)

    // Assert
    expect(result.exitReason).toBe('Exit rule: price fell below EMA50')
  })
})

describe('per-signal-type profit target', () => {
  it('TREND_ZLE05 triggers the profit target exit at pnlPct >= 0.05', () => {
    // Arrange
    const input: ExitCycleInput = { ...BASE, pnlPct: 0.05, daysOpen: 1, zScore: 0.5 }

    // Act
    const result = simulateExitCycle(input)

    // Assert
    expect(result.exitReason).toBe('Exit rule: profit target reached (5.0% >= 5%)')
  })

  it('TREND_ZLE05 does not trigger the profit target exit just below 0.05', () => {
    // Arrange
    const input: ExitCycleInput = { ...BASE, pnlPct: 0.0499, daysOpen: 1, zScore: 0.5, ema50: 100, currentPrice: 105 }

    // Act
    const result = simulateExitCycle(input)

    // Assert
    expect(result.exitReason).toBeNull()
  })

  it.each<SignalType>(['MEAN_REVERSION', 'TREND', 'TREND_PULLBACK', 'TREND_PULLBACK_3DAY', 'EMA_RECLAIM', null])(
    '%s still requires pnlPct >= 0.10 for the profit target exit (default unchanged)',
    (signalType) => {
      // Arrange — just below 10% should not exit; at 10% should exit.
      // ema50/sma5 chosen so no OTHER rule (EMA50 break, EMA reclaim, SMA5 reclaim) fires first.
      const belowTen: ExitCycleInput = { ...BASE, signalType, pnlPct: 0.0999, daysOpen: 1, ema50: 10, currentPrice: 50, sma5: 100 }
      const atTen: ExitCycleInput = { ...BASE, signalType, pnlPct: 0.10, daysOpen: 1, ema50: 10, currentPrice: 50, sma5: 100 }

      // Act
      const belowResult = simulateExitCycle(belowTen)
      const atResult = simulateExitCycle(atTen)

      // Assert
      expect(belowResult.exitReason).toBeNull()
      expect(atResult.exitReason).toBe('Exit rule: profit target reached (10.0% >= 10%)')
    }
  )
})

describe('first-match evaluation order unchanged', () => {
  it('TREND_ZLE05: profit target and time stop both satisfied — profit target wins', () => {
    // Arrange
    const input: ExitCycleInput = { ...BASE, pnlPct: 0.06, daysOpen: 25, zScore: 0.5 }

    // Act
    const result = simulateExitCycle(input)

    // Assert
    expect(result.exitReason).toBe('Exit rule: profit target reached (6.0% >= 5%)')
  })

  it('TREND_ZLE05: time stop and z-score exhaustion both satisfied — time stop wins', () => {
    // Arrange — pnl below 5% so profit target does not fire first
    const input: ExitCycleInput = { ...BASE, pnlPct: 0.02, daysOpen: 25, zScore: 1.30 }

    // Act
    const result = simulateExitCycle(input)

    // Assert
    expect(result.exitReason).toBe('Exit rule: 20-day time stop (25 trading days open)')
  })
})
