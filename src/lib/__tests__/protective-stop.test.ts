import { describe, it, expect } from 'vitest'
import {
  PROFIT_FLOOR_CONFIG,
  computeProtectiveStop,
  roundDownToTick,
  tickFor,
  isHigherByTick,
  getProfitTargetPct,
  TRAILING_ACTIVATION_PCT,
  buildProtectiveStopSnapshot,
  type ProfitFloorConfig,
} from '../protective-stop'

const ENTRY = 100

function run(high: number, current: number, existingStop: number | null = null, setup: string | null = 'MEAN_REVERSION') {
  return computeProtectiveStop({ setup, entry: ENTRY, high, current, existingStop })
}

describe('PROFIT_FLOOR_CONFIG', () => {
  it('holds the MEAN_REVERSION design: activation 5, floor 3, ratchet 3', () => {
    expect(PROFIT_FLOOR_CONFIG).toEqual({ MEAN_REVERSION: { activationPct: 5, floorPct: 3, ratchetPp: 3 } })
  })
})

describe('computeProtectiveStop — activation', () => {
  it('is inactive below +5%', () => {
    expect(run(104.99, 104.5)).toEqual({ active: false, stopPrice: null, action: 'none' })
  })

  it('activates exactly at +5% with a +3% floor', () => {
    const r = run(105, 104)
    expect(r.active).toBe(true)
    expect(r.stopPrice).toBe(103)
  })
})

describe('computeProtectiveStop — floor and ratchet', () => {
  it.each([
    [105.5, 103],
    [106, 103],
    [107, 104],
    [108.14, 105.14],
    [112, 109],
  ])('high %s gives stop %s', (high, expected) => {
    const r = run(high, high)
    expect(r.stopPrice).toBe(expected)
    expect(r.action).toBe('place')
  })
})

describe('computeProtectiveStop — tick rounding', () => {
  it('rounds down to 0.01 at or above $1', () => {
    const r = computeProtectiveStop({ setup: 'MEAN_REVERSION', entry: 33.33, high: 36.1, current: 36, existingStop: null })
    // raw = 33.33 * (1 + max(3, 8.3...-3)/100) -> rounded down to cents
    expect(r.stopPrice).toBe(Math.floor((r.stopPrice as number) * 100 + 1e-7) / 100)
    expect(r.stopPrice as number).toBeLessThanOrEqual(33.33 * (1 + (36.1 / 33.33 - 1 - 0.03)))
  })

  it('rounds down to 0.0001 below $1', () => {
    const r = computeProtectiveStop({ setup: 'MEAN_REVERSION', entry: 0.5, high: 0.53, current: 0.529, existingStop: null })
    expect(r.stopPrice).toBe(0.5150)
  })

  it('roundDownToTick never rounds up', () => {
    expect(roundDownToTick(10.999)).toBe(10.99)
    expect(roundDownToTick(10.99)).toBe(10.99)
    expect(roundDownToTick(0.12345)).toBe(0.1234)
  })

  it('tickFor switches at $1', () => {
    expect(tickFor(1)).toBe(0.01)
    expect(tickFor(0.99)).toBe(0.0001)
  })
})

describe('computeProtectiveStop — existing stop handling', () => {
  it('never returns a stop lower than the existing stop', () => {
    const r = run(105.5, 105, 104)
    expect(r.stopPrice).toBe(104)
    expect(r.action).toBe('none')
  })

  it('replaces only when strictly higher by at least one tick', () => {
    expect(run(107, 106, 103).action).toBe('replace')
    expect(run(107, 106, 103.99).action).toBe('replace')
    expect(run(107, 106, 103.995).action).toBe('none')
  })

  it('does nothing when the stop equals the existing stop', () => {
    expect(run(106, 105, 103).action).toBe('none')
  })

  it('places when there is no existing stop', () => {
    expect(run(106, 105).action).toBe('place')
    expect(run(106, 105, undefined as unknown as null).action).toBe('place')
  })

  it('treats a non-finite existing stop as absent', () => {
    expect(run(106, 105, Number.NaN).action).toBe('place')
  })
})

describe('computeProtectiveStop — sell_now', () => {
  it('sells when current is below the stop', () => {
    const r = run(106, 102.5)
    expect(r.action).toBe('sell_now')
    expect(r.stopPrice).toBe(103)
  })

  it('sells when current equals the stop', () => {
    expect(run(106, 103).action).toBe('sell_now')
  })

  it('compares against the never-lower stop', () => {
    expect(run(105.5, 103.5, 104).action).toBe('sell_now')
  })
})

describe('computeProtectiveStop — guards', () => {
  it('leaves a setup that is not in the config unchanged', () => {
    expect(run(110, 109, null, 'TREND_PULLBACK')).toEqual({ active: false, stopPrice: null, action: 'none' })
    expect(run(110, 109, null, null)).toEqual({ active: false, stopPrice: null, action: 'none' })
  })

  it('is inert for every setup when the config is empty', () => {
    const empty: ProfitFloorConfig = {}
    const r = computeProtectiveStop({ setup: 'MEAN_REVERSION', entry: ENTRY, high: 110, current: 109, existingStop: null }, empty)
    expect(r).toEqual({ active: false, stopPrice: null, action: 'none' })
  })

  it.each([
    [Number.NaN, 106, 105],
    [0, 106, 105],
    [-1, 106, 105],
    [100, Number.POSITIVE_INFINITY, 105],
    [100, 106, Number.NaN],
  ])('is inactive for invalid inputs entry=%s high=%s current=%s', (entry, high, current) => {
    const r = computeProtectiveStop({ setup: 'MEAN_REVERSION', entry, high, current, existingStop: null })
    expect(r).toEqual({ active: false, stopPrice: null, action: 'none' })
  })

  it('does not mutate its inputs or the config', () => {
    const input = Object.freeze({ setup: 'MEAN_REVERSION', entry: ENTRY, high: 107, current: 106, existingStop: 103 })
    const before = JSON.stringify(PROFIT_FLOOR_CONFIG)
    computeProtectiveStop(input)
    expect(JSON.stringify(PROFIT_FLOOR_CONFIG)).toBe(before)
    expect(input).toEqual({ setup: 'MEAN_REVERSION', entry: ENTRY, high: 107, current: 106, existingStop: 103 })
  })
})

describe('isHigherByTick', () => {
  it('requires a full tick', () => {
    expect(isHigherByTick(104.01, 104)).toBe(true)
    expect(isHigherByTick(104.005, 104)).toBe(false)
    expect(isHigherByTick(104, 104)).toBe(false)
  })
})

describe('profit target and shared tables', () => {
  it('uses 10% by default and 5% for TREND_ZLE05', () => {
    expect(getProfitTargetPct('MEAN_REVERSION')).toBe(0.10)
    expect(getProfitTargetPct(null)).toBe(0.10)
    expect(getProfitTargetPct(undefined)).toBe(0.10)
    expect(getProfitTargetPct('TREND_ZLE05')).toBe(0.05)
  })

  it('keeps the trailing activation values of the other setups', () => {
    expect(TRAILING_ACTIVATION_PCT).toEqual({
      TREND: 0.06,
      TREND_PULLBACK: 0.06,
      TREND_ZLE05: 0.03,
      EMA_RECLAIM: 0.04,
      TREND_PULLBACK_3DAY: 0.06,
      default: 0.05,
    })
  })
})

describe('buildProtectiveStopSnapshot', () => {
  it('builds the persisted shape with design R', () => {
    const snap = buildProtectiveStopSnapshot({
      setup: 'MEAN_REVERSION',
      entry: 100,
      high: 108.14,
      stopPrice: 105.14,
      stopOrderId: 'ord-1',
      activatedAt: '2026-10-20T14:00:00.000Z',
    })
    expect(snap).toEqual({
      design: 'R',
      activationPct: 5,
      floorPct: 3,
      ratchetPp: 3,
      activatedAt: '2026-10-20T14:00:00.000Z',
      highPct: expect.closeTo(8.14, 6),
      stopPrice: 105.14,
      stopOrderId: 'ord-1',
    })
  })

  it('returns null when the setup is not configured', () => {
    expect(buildProtectiveStopSnapshot({
      setup: 'TREND', entry: 100, high: 108, stopPrice: 105, stopOrderId: null, activatedAt: 'x',
    })).toBeNull()
  })
})
