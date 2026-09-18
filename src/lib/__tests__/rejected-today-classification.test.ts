import { describe, it, expect } from 'vitest'

// Replicates the per-row classification logic in
// src/app/api/rejected-today/route.ts — the error-prefix -> kind/reason
// mapping widened from 2 to 4 categories (TREND_ZGT05 -> TREND_ZGT125
// fixed, SPREAD_GATE and MR_RANGING_ADX_GATE added). Per this project's
// established convention, the decision logic is replicated here rather
// than imported (route.ts's GET handler isn't unit-testable in isolation
// without a live Supabase client).

type Kind = 'TREND_ZGT125' | 'TREND_QUALITY_FAIL' | 'SPREAD_GATE' | 'MR_RANGING_ADX_GATE'

function classify(err: string): Kind {
  const upperErr = err.toUpperCase()
  return upperErr.startsWith('TREND_QUALITY_FAIL') ? 'TREND_QUALITY_FAIL'
    : upperErr.startsWith('SPREAD GATE') ? 'SPREAD_GATE'
    : upperErr.startsWith('MR_RANGING_ADX_GATE') ? 'MR_RANGING_ADX_GATE'
    : 'TREND_ZGT125'
}

function buildReason(kind: Kind, err: string, z: number | null, adx: number | null): string {
  return kind === 'TREND_ZGT125' ? `z-score ${z != null ? z.toFixed(3) : '—'} > 1.25 threshold`
    : kind === 'TREND_QUALITY_FAIL' ? `ADX ${adx != null ? adx.toFixed(1) : '—'} < 20 — trend not confirmed`
    : kind === 'MR_RANGING_ADX_GATE' ? `z-score ${z != null ? z.toFixed(3) : '—'} met threshold but ADX ${adx != null ? adx.toFixed(1) : '—'} too low — RANGING regime`
    : err.replace(/^Spread gate:\s*/i, '')
}

describe('rejected-today classification — 4-way error-prefix mapping', () => {
  it('TREND_ZGT125 (the current gate, replacing the stale TREND_ZGT05 filter) classifies correctly', () => {
    // Arrange
    const err = 'TREND_ZGT125: excluded — zScore > 1.25'

    // Act
    const kind = classify(err)

    // Assert
    expect(kind).toBe('TREND_ZGT125')
  })

  it('TREND_QUALITY_FAIL classifies correctly (already-working category, unchanged)', () => {
    // Arrange
    const err = 'TREND_QUALITY_FAIL: adx=17.4 slope=ok'

    // Act
    const kind = classify(err)

    // Assert
    expect(kind).toBe('TREND_QUALITY_FAIL')
  })

  it('Spread gate classifies as SPREAD_GATE (new category)', () => {
    // Arrange
    const err = 'Spread gate: 333bps > 100bps max'

    // Act
    const kind = classify(err)

    // Assert
    expect(kind).toBe('SPREAD_GATE')
  })

  it('MR_RANGING_ADX_GATE classifies correctly (new category)', () => {
    // Arrange
    const err = 'MR_RANGING_ADX_GATE: z-score -1.202 met entry threshold -1.20, blocked — regime=RANGING, ADX=7.0 < 18'

    // Act
    const kind = classify(err)

    // Assert
    expect(kind).toBe('MR_RANGING_ADX_GATE')
  })

  it('a stale TREND_ZGT05-prefixed error (should no longer occur live, but the classifier must not crash) falls through to TREND_ZGT125', () => {
    // Arrange
    const err = 'TREND_ZGT05: excluded — zScore > 0.5'

    // Act
    const kind = classify(err)

    // Assert — falls through to the default branch; harmless since this prefix no longer appears live
    expect(kind).toBe('TREND_ZGT125')
  })
})

describe('rejected-today reason strings — one per kind, matching existing detail level', () => {
  it('TREND_ZGT125 reason includes the z-score with 3 decimals and the 1.25 threshold', () => {
    // Arrange / Act
    const reason = buildReason('TREND_ZGT125', 'TREND_ZGT125: excluded — zScore > 1.25', 1.437, null)

    // Assert
    expect(reason).toBe('z-score 1.437 > 1.25 threshold')
  })

  it('TREND_QUALITY_FAIL reason includes ADX with 1 decimal', () => {
    // Arrange / Act
    const reason = buildReason('TREND_QUALITY_FAIL', 'TREND_QUALITY_FAIL: adx=17.4 slope=ok', null, 17.4)

    // Assert
    expect(reason).toBe('ADX 17.4 < 20 — trend not confirmed')
  })

  it('MR_RANGING_ADX_GATE reason includes both z-score and ADX', () => {
    // Arrange / Act
    const reason = buildReason(
      'MR_RANGING_ADX_GATE',
      'MR_RANGING_ADX_GATE: z-score -1.202 met entry threshold -1.20, blocked — regime=RANGING, ADX=7.0 < 18',
      -1.202,
      7.0
    )

    // Assert
    expect(reason).toBe('z-score -1.202 met threshold but ADX 7.0 too low — RANGING regime')
  })

  it('SPREAD_GATE reason strips the "Spread gate: " prefix, preserving the exact bps values', () => {
    // Arrange / Act
    const reason = buildReason('SPREAD_GATE', 'Spread gate: 333bps > 100bps max', null, null)

    // Assert
    expect(reason).toBe('333bps > 100bps max')
  })

  it('SPREAD_GATE reason handles the generic no-quote/stale-quote variants without a bps value', () => {
    // Arrange / Act
    const noQuote = buildReason('SPREAD_GATE', 'Spread gate: no quote available', null, null)
    const stale = buildReason('SPREAD_GATE', 'Spread gate: stale quote', null, null)

    // Assert
    expect(noQuote).toBe('no quote available')
    expect(stale).toBe('stale quote')
  })

  it('missing z/adx values render as an em dash, matching the existing kinds\' null-handling', () => {
    // Arrange / Act
    const trendReason = buildReason('TREND_ZGT125', '', null, null)
    const qualityReason = buildReason('TREND_QUALITY_FAIL', '', null, null)

    // Assert
    expect(trendReason).toBe('z-score — > 1.25 threshold')
    expect(qualityReason).toBe('ADX — < 20 — trend not confirmed')
  })
})
