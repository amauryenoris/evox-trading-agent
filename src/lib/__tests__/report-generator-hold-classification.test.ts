import { describe, it, expect } from 'vitest'

// Replicates the HOLDs Breakdown classification chain from report-generator.ts
// (generateWeeklyReport's `for (const e of nonExecuted)` loop). Keep in sync
// when that chain changes.
type Bucket =
  | 'noSetupDetected'
  | 'gate1Liquidity'
  | 'gate2Hours'
  | 'gate3Overtrading'
  | 'gate4Portfolio'
  | 'alreadyInPosition'
  | 'positionHeld'
  | 'otherHold'

function classifyHold(entry: { error?: string; reasoning?: string }): Bucket {
  const err = entry.error ?? ''
  if (err.includes('Setup gate:') || entry.reasoning?.includes('Setup gate:')) {
    return 'noSetupDetected'
  } else if (err.includes('Liquidity gate')) {
    return 'gate1Liquidity'
  } else if (err.includes('Trading hours gate')) {
    return 'gate2Hours'
  } else if (err.includes('Overtrading gate')) {
    return 'gate3Overtrading'
  } else if (err.includes('MR_RANGING_ADX_GATE')) {
    return 'noSetupDetected'
  } else if (err.includes('gate') || err.includes('Gate') || err.includes('Market closed')) {
    return 'gate4Portfolio'
  } else if (err.includes('Already in position')) {
    return 'alreadyInPosition'
  } else if (err === 'exit_rules_check' || err === 'exit_rules_skip') {
    return 'positionHeld'
  } else if (err === '') {
    const reasoning = entry.reasoning ?? ''
    if (reasoning.includes('Setup gate:') || reasoning.includes('no setup') || reasoning.includes('NO_SETUP')) {
      return 'noSetupDetected'
    }
    return 'otherHold'
  } else if (err.includes('TREND_ZGT05')) {
    return 'noSetupDetected'
  } else if (err.includes('TREND_QUALITY_FAIL')) {
    return 'noSetupDetected'
  }
  return 'otherHold'
}

describe('report-generator HOLDs classification — MR_RANGING_ADX_GATE', () => {
  it('classifies MR_RANGING_ADX_GATE error as noSetupDetected (regression fix)', () => {
    const entry = { error: 'MR_RANGING_ADX_GATE: z-score -2.298 met entry threshold -1.20, blocked — regime=RANGING, ADX=null < 18' }
    expect(classifyHold(entry)).toBe('noSetupDetected')
  })

  it('does not fall through to gate4Portfolio despite containing "GATE" (case-sensitive check)', () => {
    const entry = { error: 'MR_RANGING_ADX_GATE: z-score -1.810 met entry threshold -1.30, blocked — regime=RANGING, ADX=13.0 < 18' }
    expect(classifyHold(entry)).not.toBe('gate4Portfolio')
  })
})

describe('report-generator HOLDs classification — unchanged branches', () => {
  it('genuine no-setup entry (error undefined, reasoning "Setup gate:...") still classifies as noSetupDetected', () => {
    const entry = { error: undefined, reasoning: 'Setup gate: no mean reversion setup (z-score -0.500 > -1.30) and no trend setup (price not above EMA50)' }
    expect(classifyHold(entry)).toBe('noSetupDetected')
  })

  it('Liquidity gate entry still classifies as gate1Liquidity', () => {
    const entry = { error: 'Liquidity gate: volume too low' }
    expect(classifyHold(entry)).toBe('gate1Liquidity')
  })

  it('TREND_QUALITY_FAIL entry still classifies as noSetupDetected', () => {
    const entry = { error: 'TREND_QUALITY_FAIL: adx=12.0 slope=flat' }
    expect(classifyHold(entry)).toBe('noSetupDetected')
  })

  it('TREND_ZGT05 entry still classifies as noSetupDetected', () => {
    const entry = { error: 'TREND_ZGT05: excluded — zScore > 0.5' }
    expect(classifyHold(entry)).toBe('noSetupDetected')
  })

  it('Already in position entry still classifies as alreadyInPosition', () => {
    const entry = { error: 'Already in position' }
    expect(classifyHold(entry)).toBe('alreadyInPosition')
  })

  it('exit_rules_check entry still classifies as positionHeld', () => {
    const entry = { error: 'exit_rules_check' }
    expect(classifyHold(entry)).toBe('positionHeld')
  })
})
