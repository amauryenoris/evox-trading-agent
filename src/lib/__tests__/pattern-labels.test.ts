import { describe, it, expect } from 'vitest'
import { tCriticalValue, confidenceInterval95, shrink, labelBucket, SHRINK_K } from '../pattern-labels'
import { MIN_BUCKET_N } from '../trade-views'

describe('tCriticalValue', () => {
  it('returns the table value for df within 1..30', () => {
    expect(tCriticalValue(1)).toBe(12.706)
    expect(tCriticalValue(30)).toBe(2.042)
  })

  it('falls back to 1.96 for df above 30', () => {
    expect(tCriticalValue(31)).toBe(1.96)
    expect(tCriticalValue(1000)).toBe(1.96)
  })

  it('clamps df below 1 to the df=1 value', () => {
    expect(tCriticalValue(0)).toBe(12.706)
  })
})

describe('confidenceInterval95', () => {
  it('returns a degenerate interval (lower=upper=mean) for n<2', () => {
    const ci = confidenceInterval95([5])

    expect(ci).toEqual({ mean: 5, lower: 5, upper: 5 })
  })

  it('computes mean +/- t-critical * standard error for n>=2', () => {
    const values = [1, 2, 3, 4, 5]
    // mean=3, sample sd=sqrt(2.5)=1.5811, se=sd/sqrt(5)=0.7071, df=4 -> t=2.776
    const ci = confidenceInterval95(values)

    expect(ci.mean).toBeCloseTo(3, 5)
    expect(ci.lower).toBeCloseTo(3 - 2.776 * (Math.sqrt(2.5) / Math.sqrt(5)), 3)
    expect(ci.upper).toBeCloseTo(3 + 2.776 * (Math.sqrt(2.5) / Math.sqrt(5)), 3)
  })

  it('uses the df>30 fallback critical value for large n', () => {
    const values = Array.from({ length: 35 }, (_, i) => i)
    const ci = confidenceInterval95(values)
    const mean = values.reduce((s, v) => s + v, 0) / values.length
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1)
    const se = Math.sqrt(variance) / Math.sqrt(values.length)

    expect(ci.upper - ci.mean).toBeCloseTo(1.96 * se, 5)
  })
})

describe('shrink', () => {
  it('matches the exact formula for a known case', () => {
    // (n*bucketAvg + K*setupAvg) / (n+K) = (10*5 + 15*1) / 25 = 65/25 = 2.6
    expect(shrink(5, 10, 1, 15)).toBeCloseTo(2.6, 10)
  })

  it('defaults SHRINK_K to 15 when not passed', () => {
    expect(shrink(5, 10, 1)).toBeCloseTo(shrink(5, 10, 1, SHRINK_K), 10)
  })

  it('pulls the bucket average toward the setup average more as n shrinks', () => {
    const smallN = shrink(10, 1, 0)
    const largeN = shrink(10, 100, 0)

    expect(Math.abs(smallN)).toBeLessThan(Math.abs(largeN))
  })
})

describe('labelBucket', () => {
  it('returns INSUFFICIENT when n < MIN_BUCKET_N regardless of the CI', () => {
    const ci = { mean: 10, lower: 9, upper: 11 }

    expect(labelBucket(ci, 0, MIN_BUCKET_N - 1)).toBe('INSUFFICIENT')
  })

  it('returns INCONCLUSIVE when the CI contains the baseline average', () => {
    const ci = { mean: 2, lower: 0, upper: 4 }

    expect(labelBucket(ci, 1, MIN_BUCKET_N)).toBe('INCONCLUSIVE')
  })

  it('returns DIFFERS_POS when the CI is entirely above the baseline average', () => {
    const ci = { mean: 10, lower: 8, upper: 12 }

    expect(labelBucket(ci, 5, MIN_BUCKET_N)).toBe('DIFFERS_POS')
  })

  it('returns DIFFERS_NEG when the CI is entirely below the baseline average', () => {
    const ci = { mean: -10, lower: -12, upper: -8 }

    expect(labelBucket(ci, 0, MIN_BUCKET_N)).toBe('DIFFERS_NEG')
  })
})
