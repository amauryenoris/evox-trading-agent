import { describe, it, expect } from 'vitest'
import { SCHEMA, SCHEMA_FROZEN_AT, RULE_VERSION_BOUNDARIES, filterDiagnostic, MULTIPLE_COMPARISONS_NOTE } from '../pattern-schema'

describe('SCHEMA_FROZEN_AT', () => {
  it('is frozen at the agreed date', () => {
    expect(SCHEMA_FROZEN_AT).toBe('2026-10-08T00:00:00-04:00')
  })
})

describe('SCHEMA', () => {
  it('tags confidence_bucket as diagnostic on every setup', () => {
    for (const dimensions of Object.values(SCHEMA)) {
      const confidence = dimensions.find((d) => d.dimension === 'confidence_bucket')
      expect(confidence?.kind).toBe('diagnostic')
    }
  })

  it('never includes spx_regime, sector RS, or relative volume as a dimension', () => {
    const forbidden = ['spx_regime', 'sector_rs', 'relative_volume', 'sectorRotation', 'relativeVolume']
    for (const dimensions of Object.values(SCHEMA)) {
      for (const d of dimensions) {
        expect(forbidden).not.toContain(d.dimension)
      }
    }
  })

  it('marks TREND_PULLBACK_3DAY dimensions as exploratory only (its gate reads no z/ADX/MACD)', () => {
    const nonDiagnostic = SCHEMA.TREND_PULLBACK_3DAY.filter((d) => d.kind !== 'diagnostic')
    expect(nonDiagnostic.every((d) => d.kind === 'exploratory')).toBe(true)
    expect(nonDiagnostic.map((d) => d.dimension)).toEqual(['drop3d_bucket', 'reentry_bucket'])
  })

  it('marks EMA_RECLAIM with only z_bucket as confirmatory', () => {
    const confirmatory = SCHEMA.EMA_RECLAIM.filter((d) => d.kind === 'confirmatory')
    expect(confirmatory.map((d) => d.dimension)).toEqual(['z_bucket'])
  })

  it('marks adx/macd/z as confirmatory for TREND_PULLBACK and TREND_ZLE05', () => {
    for (const setup of ['TREND_PULLBACK', 'TREND_ZLE05'] as const) {
      const confirmatory = SCHEMA[setup].filter((d) => d.kind === 'confirmatory').map((d) => d.dimension)
      expect(confirmatory.sort()).toEqual(['adx_bucket', 'macd_bucket', 'z_bucket'].sort())
    }
  })
})

describe('filterDiagnostic', () => {
  it('removes only diagnostic-kind entries', () => {
    const filtered = filterDiagnostic(SCHEMA.MEAN_REVERSION)

    expect(filtered.some((d) => d.dimension === 'confidence_bucket')).toBe(false)
    expect(filtered.length).toBe(SCHEMA.MEAN_REVERSION.length - 1)
    expect(filtered.some((d) => d.dimension === 'adx_bucket')).toBe(true)
  })
})

describe('RULE_VERSION_BOUNDARIES', () => {
  it('gives TREND_ZLE05 two boundaries on independent axes', () => {
    const boundaries = RULE_VERSION_BOUNDARIES.TREND_ZLE05

    expect(boundaries).toHaveLength(2)
    expect(boundaries.find((b) => b.appliesTo === 'buy')?.effectiveDate).toBe('2026-06-04')
    expect(boundaries.find((b) => b.appliesTo === 'sell')?.effectiveDate).toBe('2026-10-05')
  })

  it('gives TREND_PULLBACK_3DAY and EMA_RECLAIM no boundaries', () => {
    expect(RULE_VERSION_BOUNDARIES.TREND_PULLBACK_3DAY).toEqual([])
    expect(RULE_VERSION_BOUNDARIES.EMA_RECLAIM).toEqual([])
  })
})

describe('MULTIPLE_COMPARISONS_NOTE', () => {
  it('is a non-empty disclaimer string', () => {
    expect(typeof MULTIPLE_COMPARISONS_NOTE).toBe('string')
    expect(MULTIPLE_COMPARISONS_NOTE.length).toBeGreaterThan(10)
  })
})
