import { describe, it, expect } from 'vitest'

// Replicates the relevant subset of detectKind()'s error-regex chain from
// AgentReasoningLog.tsx (action==='HOLD' branch only). Keep in sync with that
// function's regex order when it changes.
type EntryKind = 'TREND_REJECTED' | 'GATE_BLOCKED' | 'NO_SETUP' | 'HOLDING'

function detectKindForHold(error: string | undefined): EntryKind {
  const err = error ?? ''
  if (/trend_zgt05|trend_quality_fail/i.test(err))             return 'TREND_REJECTED'
  if (/mr_ranging_adx_gate/i.test(err))                        return 'GATE_BLOCKED'
  if (/setup\s*gate|no[\s_-]?setup/i.test(err))                return 'NO_SETUP'
  if (/exit_rules_check|exit_rules_skip/i.test(err))           return 'HOLDING'
  if (/correlation\s*gate|cooldown|spread|max[\s_]buys|max[\s_]positions|risk[\s_]check/i.test(err)) return 'GATE_BLOCKED'
  if (err.length > 0)                                          return 'GATE_BLOCKED'
  return 'NO_SETUP'
}

describe('detectKind — MR_RANGING_ADX_GATE classification', () => {
  it('classifies MR_RANGING_ADX_GATE error as GATE_BLOCKED, not NO_SETUP', () => {
    const error = 'MR_RANGING_ADX_GATE: z-score -1.810 met entry threshold -1.30, blocked — regime=RANGING, ADX=13.0 < 18'
    expect(detectKindForHold(error)).toBe('GATE_BLOCKED')
  })

  it('genuine no-setup (undefined error) still classifies as NO_SETUP — unchanged', () => {
    expect(detectKindForHold(undefined)).toBe('NO_SETUP')
  })

  it('does not get caught by the "no setup" regex (reasoning text is separate from error)', () => {
    const error = 'MR_RANGING_ADX_GATE: z-score -1.570 met entry threshold -1.30, blocked — regime=RANGING, ADX=15.2 < 18'
    expect(detectKindForHold(error)).not.toBe('NO_SETUP')
  })

  it('existing gates (correlation/cooldown/spread) still classify as GATE_BLOCKED — unchanged', () => {
    expect(detectKindForHold('correlation_gate: blocked')).toBe('GATE_BLOCKED')
  })

  it('existing trend rejections still classify as TREND_REJECTED — unchanged', () => {
    expect(detectKindForHold('TREND_QUALITY_FAIL: adx=12.0 slope=flat')).toBe('TREND_REJECTED')
  })
})
