import { describe, it, expect } from 'vitest'
import {
  isSma5ExitConditionMet,
  evaluateSma5EntryGate,
  buildTrend3DayAboveSma5Reason,
  TREND_3DAY_ABOVE_SMA5_PREFIX,
} from '../sma5-exit'

// The exit rule is "price closed above SMA5": strictly greater. Equality does NOT fire the exit,
// so the entry gate (its negation) allows equality.
export const SMA5_PAIRS: ReadonlyArray<readonly [number, number, boolean]> = [
  [99, 100, false],
  [99.99, 100, false],
  [100, 100, false],
  [100.01, 100, true],
  [105, 100, true],
]

describe('isSma5ExitConditionMet — strict operator (price > SMA5)', () => {
  it.each(SMA5_PAIRS)('price %s vs SMA5 %s → %s', (price, sma5, expected) => {
    expect(isSma5ExitConditionMet(price, sma5)).toBe(expected)
  })

  it('is false for a missing SMA5', () => {
    expect(isSma5ExitConditionMet(100, null)).toBe(false)
    expect(isSma5ExitConditionMet(100, undefined)).toBe(false)
  })

  it('is false for NaN and +Infinity', () => {
    expect(isSma5ExitConditionMet(100, Number.NaN)).toBe(false)
    expect(isSma5ExitConditionMet(100, Number.POSITIVE_INFINITY)).toBe(false)
  })
})

describe('evaluateSma5EntryGate — negation of the exit condition', () => {
  it('allows a price below the SMA5', () => {
    expect(evaluateSma5EntryGate(99, 100)).toBe('allowed')
  })

  it('allows a price equal to the SMA5 because the exit (strict >) would not fire', () => {
    expect(evaluateSma5EntryGate(100, 100)).toBe('allowed')
  })

  it('blocks a price above the SMA5', () => {
    expect(evaluateSma5EntryGate(100.01, 100)).toBe('blocked')
  })

  it.each(SMA5_PAIRS)('gate is blocked exactly when the exit would fire: price %s SMA5 %s', (price, sma5, exitFires) => {
    expect(evaluateSma5EntryGate(price, sma5) === 'blocked').toBe(exitFires)
  })

  it.each([null, undefined, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'does not block and flags an unusable SMA5 (%s)',
    (sma5) => {
      expect(evaluateSma5EntryGate(100, sma5)).toBe('sma5_unusable')
    }
  )
})

describe('buildTrend3DayAboveSma5Reason', () => {
  it('starts with the prefix and carries both numbers at two decimals', () => {
    const reason = buildTrend3DayAboveSma5Reason(71.0649, 70.5)

    expect(reason.startsWith(TREND_3DAY_ABOVE_SMA5_PREFIX)).toBe(true)
    expect(reason).toBe('TREND_3DAY_ABOVE_SMA5: price $71.06 >= SMA5 $70.50 (3DAY exit would fire immediately)')
  })

  it('prints NA when the SMA5 is missing', () => {
    expect(buildTrend3DayAboveSma5Reason(71, null)).toContain('SMA5 $NA')
  })

  it('exposes the prefix constant', () => {
    expect(TREND_3DAY_ABOVE_SMA5_PREFIX).toBe('TREND_3DAY_ABOVE_SMA5')
  })
})
