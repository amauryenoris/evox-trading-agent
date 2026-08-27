import { describe, it, expect } from 'vitest'

// Replicates trendPullback3DaySetup conditions from claude-agent.ts.
// Keep in sync with the detection block when conditions change.
function evalTrendPullback3DaySetup(p: {
  prevClose: number | null
  sma200: number | null
  closeMinus2: number | null
  closeMinus3: number | null
  closeMinus4: number | null
}): boolean {
  const uptrendOk =
    p.prevClose != null && p.sma200 != null && p.prevClose > p.sma200

  const streakOk =
    p.prevClose != null &&
    p.closeMinus2 != null &&
    p.closeMinus3 != null &&
    p.closeMinus4 != null &&
    p.prevClose < p.closeMinus2 &&
    p.closeMinus2 < p.closeMinus3 &&
    p.closeMinus3 < p.closeMinus4

  return uptrendOk && streakOk
}

const BASE = {
  prevClose: 97,
  sma200: 90,
  closeMinus2: 98,
  closeMinus3: 99,
  closeMinus4: 100,
}

describe('TREND_PULLBACK_3DAY setup detection', () => {
  it('accepts uptrend + 3 consecutive down-closes', () => {
    // Arrange / Act / Assert
    expect(evalTrendPullback3DaySetup(BASE)).toBe(true)
  })

  it('rejects prevClose at or below sma200 (no uptrend)', () => {
    expect(evalTrendPullback3DaySetup({ ...BASE, prevClose: 90 })).toBe(false)
  })

  it('rejects prevClose below sma200', () => {
    expect(evalTrendPullback3DaySetup({ ...BASE, prevClose: 85 })).toBe(false)
  })

  it('rejects when prevClose is not below closeMinus2 (streak broken on day 1)', () => {
    expect(evalTrendPullback3DaySetup({ ...BASE, prevClose: 98 })).toBe(false)
  })

  it('rejects when closeMinus2 is not below closeMinus3 (streak broken on day 2)', () => {
    expect(evalTrendPullback3DaySetup({ ...BASE, closeMinus2: 99 })).toBe(false)
  })

  it('rejects when closeMinus3 is not below closeMinus4 (streak broken on day 3)', () => {
    expect(evalTrendPullback3DaySetup({ ...BASE, closeMinus3: 100 })).toBe(false)
  })

  it('rejects null prevClose', () => {
    expect(evalTrendPullback3DaySetup({ ...BASE, prevClose: null })).toBe(false)
  })

  it('rejects null sma200', () => {
    expect(evalTrendPullback3DaySetup({ ...BASE, sma200: null })).toBe(false)
  })

  it('rejects null closeMinus2', () => {
    expect(evalTrendPullback3DaySetup({ ...BASE, closeMinus2: null })).toBe(false)
  })

  it('rejects null closeMinus3', () => {
    expect(evalTrendPullback3DaySetup({ ...BASE, closeMinus3: null })).toBe(false)
  })

  it('rejects null closeMinus4', () => {
    expect(evalTrendPullback3DaySetup({ ...BASE, closeMinus4: null })).toBe(false)
  })
})
