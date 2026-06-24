import { describe, it, expect } from 'vitest'

// Replicates computeSpxSnapshot()/smaAt() from claude-agent.ts (Macro-C1).
// Keep in sync with that function when its calculation logic changes.
function computeSpxSnapshot(bars: { t: string; c: number }[]): {
  spx_price: number | null
  spx_sma50: number | null
  spx_sma200: number | null
  spx_regime: string | null
} {
  if (bars.length < 2) {
    return { spx_price: null, spx_sma50: null, spx_sma200: null, spx_regime: null }
  }

  const refIndex = bars.length - 2
  const spx_price = bars[refIndex].c

  function smaAt(arr: { c: number }[], idx: number, period: number): number | null {
    if (idx < period - 1) return null
    const slice = arr.slice(idx - period + 1, idx + 1)
    return slice.reduce((a, b) => a + b.c, 0) / period
  }

  const spx_sma50 = smaAt(bars, refIndex, 50)
  const spx_sma200 = smaAt(bars, refIndex, 200)

  if (spx_sma50 === null || spx_sma200 === null) {
    return { spx_price, spx_sma50: null, spx_sma200: null, spx_regime: null }
  }

  const spx_regime =
    spx_price > spx_sma200 ? 'BULL'
    : spx_price > spx_sma50 ? 'CAUTION'
    : 'BEAR'

  return { spx_price, spx_sma50, spx_sma200, spx_regime }
}

function makeBars(count: number): { t: string; c: number }[] {
  return Array.from({ length: count }, (_, i) => ({
    t: new Date(2025, 0, i + 1).toISOString(),
    c: 100 + i,
  }))
}

describe('computeSpxSnapshot — insufficient window (old 260-calendar-day behavior, ~180 bars)', () => {
  it('returns null for sma50/sma200/regime when only ~180 bars are available (pre-fix bug)', () => {
    const r = computeSpxSnapshot(makeBars(180))
    expect(r.spx_price).not.toBeNull()
    expect(r.spx_sma50).toBeNull()
    expect(r.spx_sma200).toBeNull()
    expect(r.spx_regime).toBeNull()
  })
})

describe('computeSpxSnapshot — sufficient window (post-fix, ~276 bars from 400-calendar-day fetch)', () => {
  it('populates sma50/sma200/regime when ~276 bars are available', () => {
    const r = computeSpxSnapshot(makeBars(276))
    expect(r.spx_price).not.toBeNull()
    expect(r.spx_sma50).not.toBeNull()
    expect(r.spx_sma200).not.toBeNull()
    expect(r.spx_regime).not.toBeNull()
  })
})

describe('computeSpxSnapshot — exact boundary', () => {
  it('201 bars (documented minimum) computes successfully', () => {
    const r = computeSpxSnapshot(makeBars(201))
    expect(r.spx_sma200).not.toBeNull()
    expect(r.spx_regime).not.toBeNull()
  })

  it('200 bars (one short of minimum) still returns null sma200 — guards the refIndex = length-2 off-by-one', () => {
    const r = computeSpxSnapshot(makeBars(200))
    expect(r.spx_sma200).toBeNull()
    expect(r.spx_regime).toBeNull()
  })
})
