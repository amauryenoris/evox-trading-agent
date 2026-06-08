import { describe, it, expect } from 'vitest'

// Replicates emaReclaimSetup conditions from claude-agent.ts.
// Keep in sync with the detection block when conditions change.
function evalEmaReclaimSetup(p: {
  currentPrice: number
  ema50: number | null
  ema50Prev: number | null
  prevClose: number | null
  zScore: number
  momentumOk: boolean
}): boolean {
  const hasPrevData =
    p.prevClose != null &&
    p.ema50Prev != null &&
    p.ema50 != null

  return (
    hasPrevData &&
    p.currentPrice > p.ema50! &&
    p.prevClose! <= p.ema50Prev! &&
    p.zScore < 0 &&
    ((p.currentPrice - p.ema50!) / p.ema50!) > 0.002 &&
    p.momentumOk
  )
}

const BASE = {
  currentPrice: 101.5,
  ema50: 101.0,
  ema50Prev: 102.0,
  prevClose: 100.5,
  zScore: -0.4,
  momentumOk: true,
}

describe('EMA_RECLAIM null guard — null EMA50 fallback fix', () => {
  it('detects setup when all required fields are non-null and conditions pass', () => {
    expect(evalEmaReclaimSetup(BASE)).toBe(true)
  })

  it('blocks setup when ema50 is null', () => {
    expect(evalEmaReclaimSetup({ ...BASE, ema50: null })).toBe(false)
  })

  it('blocks setup when ema50Prev is null', () => {
    expect(evalEmaReclaimSetup({ ...BASE, ema50Prev: null })).toBe(false)
  })

  it('blocks setup when prevClose is null', () => {
    expect(evalEmaReclaimSetup({ ...BASE, prevClose: null })).toBe(false)
  })

  it('blocks setup when currentPrice has not crossed above ema50', () => {
    expect(evalEmaReclaimSetup({ ...BASE, currentPrice: 100.9, ema50: 101.0 })).toBe(false)
  })

  it('blocks setup when prevClose was already above ema50Prev (no cross from below)', () => {
    expect(evalEmaReclaimSetup({ ...BASE, prevClose: 103.0 })).toBe(false)
  })

  it('blocks setup when zScore is non-negative', () => {
    expect(evalEmaReclaimSetup({ ...BASE, zScore: 0 })).toBe(false)
    expect(evalEmaReclaimSetup({ ...BASE, zScore: 0.5 })).toBe(false)
  })

  it('blocks setup when distance above ema50 is less than 0.2%', () => {
    // currentPrice 0.1% above ema50: 101.0 * 1.001 = 101.101
    expect(evalEmaReclaimSetup({ ...BASE, currentPrice: 101.101, ema50: 101.0 })).toBe(false)
  })

  it('blocks setup when momentumOk is false', () => {
    expect(evalEmaReclaimSetup({ ...BASE, momentumOk: false })).toBe(false)
  })
})
