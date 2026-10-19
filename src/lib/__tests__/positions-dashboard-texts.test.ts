import { describe, it, expect } from 'vitest'
import { describeProtection } from '../../components/dashboard/PositionsTable'
import { parseEntry } from '../../components/dashboard/AgentReasoningLog'
import type { PositionDisplay } from '../types'

function makePosition(overrides: Partial<PositionDisplay> = {}): PositionDisplay {
  return {
    symbol: 'SOFI',
    qty: 10,
    avgEntryPrice: 100,
    currentPrice: 104,
    marketValue: 1040,
    unrealizedPnL: 40,
    unrealizedPnLPct: 4,
    changeToday: 0,
    signalType: 'MEAN_REVERSION',
    trailingActivated: false,
    trailingStop: null,
    ...overrides,
  }
}

describe('describeProtection — MEAN_REVERSION', () => {
  it('shows the inactive profit lock with the shared +5% activation', () => {
    const status = describeProtection(makePosition())
    expect(status).toEqual({ state: 'inactive', text: 'Profit lock inactive - activates at +5%' })
  })

  it('shows the floor price and its percentage over entry when active', () => {
    const status = describeProtection(makePosition({ trailingActivated: true, trailingStop: 105.14, currentPrice: 107 }))
    expect(status).toEqual({ state: 'active', text: 'Floor $105.14 (+5.14%)' })
  })

  it('shows a calculating state when activated without a stop yet', () => {
    expect(describeProtection(makePosition({ trailingActivated: true })).state).toBe('calculating')
  })
})

describe('describeProtection — other setups keep the trail texts', () => {
  it('inactive trail text uses the shared activation table', () => {
    const status = describeProtection(makePosition({ signalType: 'TREND_PULLBACK' }))
    expect(status).toEqual({ state: 'inactive', text: 'Trail inactive · activates at +6%' })
  })

  it('falls back to the default activation for legacy positions', () => {
    expect(describeProtection(makePosition({ signalType: null })).text).toBe('Trail inactive · activates at +5%')
  })

  it('active trail text shows price and distance to the stop', () => {
    const status = describeProtection(makePosition({ signalType: 'TREND', trailingActivated: true, trailingStop: 102, currentPrice: 104 }))
    expect(status.state).toBe('active')
    expect(status.text).toBe('Trail $102.00 · 1.92% to stop')
  })
})

describe('parseEntry — profit floor reasoning', () => {
  it('parses profitFloor and signalType from the HOLD text', () => {
    const parsed = parseEntry('EXIT-RULES: no exit triggered — pnlPct=0.0550, zScore=-0.100, signalType=MEAN_REVERSION, daysOpen=3, highSinceEntry=$106.00, profitFloor=$103.00')
    expect(parsed.floor).toBe(103)
    expect(parsed.signalType).toBe('MEAN_REVERSION')
    expect(parsed.highSinceEntry).toBe(106)
  })

  it('does not report a floor when the text has none', () => {
    expect(parseEntry('EXIT-RULES: no exit triggered — signalType=TREND, highSinceEntry=$106.00').floor).toBeUndefined()
  })

  it('labels the sell as a profit floor exit', () => {
    expect(parseEntry('Exit rule: profit floor $103.00 (+3.00%) breached').exitRule).toBe('profit floor')
  })
})
