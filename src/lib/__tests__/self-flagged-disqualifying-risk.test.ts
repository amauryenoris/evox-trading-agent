import { describe, it, expect } from 'vitest'
import type { AgentDecision } from '../types'

// Replicates the exact guard + conditional-spread logic from claude-agent.ts's
// indicatorsWithLearning construction (runAgentCycle) — decoupled per this
// project's pattern (see CLAUDE.md Test Patterns) to avoid importing the
// full 2000+ line function and its heavy dependency graph.
function buildSelfFlaggedRiskField(decision: Pick<AgentDecision, 'self_flagged_disqualifying_risk'>) {
  const selfFlaggedRisk =
    typeof decision.self_flagged_disqualifying_risk === 'boolean'
      ? decision.self_flagged_disqualifying_risk
      : undefined
  return {
    ...(selfFlaggedRisk !== undefined && { self_flagged_disqualifying_risk: selfFlaggedRisk }),
  }
}

describe('self_flagged_disqualifying_risk persistence guard', () => {
  it('persists true when the field is true', () => {
    // Arrange
    const decision = { self_flagged_disqualifying_risk: true } as AgentDecision

    // Act
    const result = buildSelfFlaggedRiskField(decision)

    // Assert
    expect(result).toEqual({ self_flagged_disqualifying_risk: true })
  })

  it('persists false when the field is false (not omitted — false is distinct from absent)', () => {
    // Arrange
    const decision = { self_flagged_disqualifying_risk: false } as AgentDecision

    // Act
    const result = buildSelfFlaggedRiskField(decision)

    // Assert
    expect(result).toEqual({ self_flagged_disqualifying_risk: false })
    expect('self_flagged_disqualifying_risk' in result).toBe(true)
  })

  it('does not add the key when the field is omitted entirely', () => {
    // Arrange
    const decision = {} as AgentDecision

    // Act
    const result = buildSelfFlaggedRiskField(decision)

    // Assert
    expect(result).toEqual({})
    expect('self_flagged_disqualifying_risk' in result).toBe(false)
  })

  it.each([
    ['string "true"', 'true' as unknown as boolean],
    ['number 1', 1 as unknown as boolean],
    ['null', null as unknown as boolean],
  ])('does not add the key when the field is a non-boolean value (%s)', (_label, value) => {
    // Arrange
    const decision = { self_flagged_disqualifying_risk: value } as AgentDecision

    // Act
    const result = buildSelfFlaggedRiskField(decision)

    // Assert — falls through the typeof guard, matching omitted-field behavior
    expect(result).toEqual({})
    expect('self_flagged_disqualifying_risk' in result).toBe(false)
  })
})

describe('decision.action HOLD override is independent of self_flagged_disqualifying_risk', () => {
  // Replicates claude-agent.ts:1652's unconditional override — this test
  // documents that the override is a plain assignment with no branching on
  // any decision field, so a new field cannot influence it.
  function forceHold(decision: AgentDecision): AgentDecision {
    return { ...decision, action: 'HOLD' }
  }

  it.each([true, false, undefined])(
    'action is forced to HOLD regardless of self_flagged_disqualifying_risk=%s',
    (riskValue) => {
      // Arrange
      const decision = {
        action: 'BUY',
        symbol: 'TEST',
        quantity: 10,
        reasoning: 'test',
        confidence: 0.8,
        self_flagged_disqualifying_risk: riskValue,
      } as AgentDecision

      // Act
      const result = forceHold(decision)

      // Assert
      expect(result.action).toBe('HOLD')
    }
  )
})
