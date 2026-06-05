import { describe, it, expect } from 'vitest'

// Replicates cooldownSymbols build logic and skipReason ternary from runAgentCycle()
// in claude-agent.ts. Keep in sync with those blocks when conditions change.

type ExitReason =
  | 'Z_SCORE_EXIT'
  | 'TRAILING_STOP'
  | 'PROFIT_TARGET'
  | 'STOP_LOSS'
  | 'TIME_STOP'
  | 'EMA_FAILURE'
  | 'UNKNOWN'

function buildCooldownSymbols(
  exitReasons: Map<string, ExitReason>,
  cooldownUnknownExitReason = false
): Set<string> {
  const cooldownSymbols = new Set<string>()
  for (const [symbol, reason] of exitReasons.entries()) {
    if (reason === 'UNKNOWN') {
      if (cooldownUnknownExitReason) {
        cooldownSymbols.add(symbol)
      }
      continue
    }
    if (reason !== 'TIME_STOP') {
      cooldownSymbols.add(symbol)
    }
  }
  return cooldownSymbols
}

function getSkipReason(
  symbol: string,
  closedThisCycle: Set<string>,
  cooldownSymbols: Set<string>,
  exitReasons: Map<string, ExitReason>
): string | null {
  return (
    closedThisCycle.has(symbol) ? 'GTC_STOP' :
    cooldownSymbols.has(symbol) ? (exitReasons.get(symbol) ?? 'UNKNOWN') :
    null
  )
}

// ── TC-1: same-process re-entry ───────────────────────────────

describe('TC-1 — same-process re-entry blocked', () => {
  it('AVGO with Z_SCORE_EXIT → added to cooldownSymbols', () => {
    // Arrange
    const exitReasons = new Map<string, ExitReason>([['AVGO', 'Z_SCORE_EXIT']])

    // Act
    const cooldownSymbols = buildCooldownSymbols(exitReasons)

    // Assert
    expect(cooldownSymbols.has('AVGO')).toBe(true)
  })

  it('AVGO in cooldown → skipReason is Z_SCORE_EXIT', () => {
    // Arrange
    const exitReasons = new Map<string, ExitReason>([['AVGO', 'Z_SCORE_EXIT']])
    const cooldownSymbols = buildCooldownSymbols(exitReasons)

    // Act
    const skipReason = getSkipReason('AVGO', new Set(), cooldownSymbols, exitReasons)

    // Assert
    expect(skipReason).toBe('Z_SCORE_EXIT')
  })

  it('all non-TIME_STOP, non-UNKNOWN exit reasons are added', () => {
    // Arrange
    const reasons: ExitReason[] = [
      'Z_SCORE_EXIT', 'TRAILING_STOP', 'PROFIT_TARGET', 'STOP_LOSS', 'EMA_FAILURE',
    ]
    for (const reason of reasons) {
      const exitReasons = new Map<string, ExitReason>([['SYM', reason]])

      // Act
      const cooldownSymbols = buildCooldownSymbols(exitReasons)

      // Assert
      expect(cooldownSymbols.has('SYM'), `${reason} should be in cooldown`).toBe(true)
    }
  })
})

// ── TC-2: TIME_STOP exemption ─────────────────────────────────

describe('TC-2 — TIME_STOP exempted from cooldown', () => {
  it('NVDA with TIME_STOP → NOT added to cooldownSymbols', () => {
    // Arrange
    const exitReasons = new Map<string, ExitReason>([['NVDA', 'TIME_STOP']])

    // Act
    const cooldownSymbols = buildCooldownSymbols(exitReasons)

    // Assert
    expect(cooldownSymbols.has('NVDA')).toBe(false)
  })

  it('NVDA in TIME_STOP → skipReason is null (re-entry allowed)', () => {
    // Arrange
    const exitReasons = new Map<string, ExitReason>([['NVDA', 'TIME_STOP']])
    const cooldownSymbols = buildCooldownSymbols(exitReasons)

    // Act
    const skipReason = getSkipReason('NVDA', new Set(), cooldownSymbols, exitReasons)

    // Assert
    expect(skipReason).toBeNull()
  })
})

// ── TC-3: UNKNOWN with flag=false ────────────────────────────

describe('TC-3 — UNKNOWN with COOLDOWN_UNKNOWN_EXIT_REASON=false', () => {
  it('MSFT with UNKNOWN → NOT added when flag is false', () => {
    // Arrange
    const exitReasons = new Map<string, ExitReason>([['MSFT', 'UNKNOWN']])

    // Act
    const cooldownSymbols = buildCooldownSymbols(exitReasons, false)

    // Assert
    expect(cooldownSymbols.has('MSFT')).toBe(false)
  })

  it('MSFT with UNKNOWN, flag=false → skipReason is null', () => {
    // Arrange
    const exitReasons = new Map<string, ExitReason>([['MSFT', 'UNKNOWN']])
    const cooldownSymbols = buildCooldownSymbols(exitReasons, false)

    // Act
    const skipReason = getSkipReason('MSFT', new Set(), cooldownSymbols, exitReasons)

    // Assert
    expect(skipReason).toBeNull()
  })
})

// ── TC-4: UNKNOWN with flag=true ─────────────────────────────

describe('TC-4 — UNKNOWN with COOLDOWN_UNKNOWN_EXIT_REASON=true', () => {
  it('MSFT with UNKNOWN → added when flag is true', () => {
    // Arrange
    const exitReasons = new Map<string, ExitReason>([['MSFT', 'UNKNOWN']])

    // Act
    const cooldownSymbols = buildCooldownSymbols(exitReasons, true)

    // Assert
    expect(cooldownSymbols.has('MSFT')).toBe(true)
  })
})

// ── TC-5: GTC_STOP takes priority ────────────────────────────

describe('TC-5 — closedThisCycle takes priority over cooldownSymbols', () => {
  it('symbol in both closedThisCycle and cooldownSymbols → skipReason is GTC_STOP', () => {
    // Arrange
    const exitReasons = new Map<string, ExitReason>([['AAPL', 'Z_SCORE_EXIT']])
    const cooldownSymbols = buildCooldownSymbols(exitReasons)
    const closedThisCycle = new Set(['AAPL'])

    // Act
    const skipReason = getSkipReason('AAPL', closedThisCycle, cooldownSymbols, exitReasons)

    // Assert
    expect(skipReason).toBe('GTC_STOP')
  })

  it('symbol only in closedThisCycle (not in exitReasons) → skipReason is GTC_STOP', () => {
    // Arrange
    const exitReasons = new Map<string, ExitReason>()
    const cooldownSymbols = buildCooldownSymbols(exitReasons)
    const closedThisCycle = new Set(['TSLA'])

    // Act
    const skipReason = getSkipReason('TSLA', closedThisCycle, cooldownSymbols, exitReasons)

    // Assert
    expect(skipReason).toBe('GTC_STOP')
  })

  it('unrelated symbol → skipReason is null', () => {
    // Arrange
    const exitReasons = new Map<string, ExitReason>([['AVGO', 'Z_SCORE_EXIT']])
    const cooldownSymbols = buildCooldownSymbols(exitReasons)

    // Act
    const skipReason = getSkipReason('AMZN', new Set(), cooldownSymbols, exitReasons)

    // Assert
    expect(skipReason).toBeNull()
  })
})

// ── TC-6: empty exitReasons ───────────────────────────────────

describe('TC-6 — empty exitReasons produces empty cooldownSymbols', () => {
  it('no exits → cooldownSymbols is empty', () => {
    // Arrange / Act
    const cooldownSymbols = buildCooldownSymbols(new Map())

    // Assert
    expect(cooldownSymbols.size).toBe(0)
  })
})
