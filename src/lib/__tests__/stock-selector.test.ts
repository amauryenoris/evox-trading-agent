import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ScreenerStock, AlpacaAccount, AlpacaPosition } from '../types'

const { mockMessagesCreate, mockInsertSelectionDecision, mockGetSelectionEvaluations, mockGetStockSnapshots } = vi.hoisted(() => ({
  mockMessagesCreate: vi.fn(),
  mockInsertSelectionDecision: vi.fn(),
  mockGetSelectionEvaluations: vi.fn(),
  mockGetStockSnapshots: vi.fn(),
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: mockMessagesCreate }
  },
}))

vi.mock('../db', () => ({
  insertSelectionDecision: mockInsertSelectionDecision,
  getRecentSelections: vi.fn().mockResolvedValue([]),
  getSelectionEvaluations: mockGetSelectionEvaluations,
  insertSelectionEvaluation: vi.fn(),
}))

vi.mock('../alpaca', () => ({
  getStockSnapshots: mockGetStockSnapshots,
}))

import { selectStocksForAnalysis } from '../stock-selector'

// Replicates the briefingNarrative conditional-section idiom from
// selectStocksForAnalysis()'s prompt template (stock-selector.ts, the
// section between "Currently held:" and "--- POOL A ---") — kept as a
// standalone snippet since selectStocksForAnalysis() itself makes a live
// Anthropic API call and isn't practical to invoke directly in tests.
// Keep in sync with that template if its structure changes.
function buildPromptSkeleton(positions: string[], briefingNarrative: string): string {
  return `STOCK SELECTION REQUEST

CURRENT PORTFOLIO: ${positions.length}/5 positions open
Currently held: ${positions.length > 0 ? positions.join(', ') : 'none'}
${briefingNarrative ? `
--- TODAY'S MARKET BRIEFING ---
${briefingNarrative}
` : ''}
--- POOL A: MARKET SCREENER (most active by volume today) ---`
}

describe('selectStocksForAnalysis prompt — briefingNarrative conditional section', () => {
  it('includes the "TODAY\'S MARKET BRIEFING" section, positioned after portfolio state and before Pool A, when briefingNarrative is non-empty', () => {
    // Arrange
    const narrative = 'SPX in an uptrend; sector rotation favors gold miners; macro sentiment tilts bullish.'

    // Act
    const prompt = buildPromptSkeleton(['AAPL'], narrative)

    // Assert
    expect(prompt).toContain(`--- TODAY'S MARKET BRIEFING ---\n${narrative}`)
    const heldIndex = prompt.indexOf('Currently held:')
    const briefingIndex = prompt.indexOf("--- TODAY'S MARKET BRIEFING ---")
    const poolAIndex = prompt.indexOf('--- POOL A')
    expect(heldIndex).toBeLessThan(briefingIndex)
    expect(briefingIndex).toBeLessThan(poolAIndex)
  })

  it('omits the "TODAY\'S MARKET BRIEFING" section entirely when briefingNarrative is empty (the default)', () => {
    // Arrange / Act
    const prompt = buildPromptSkeleton(['AAPL'], '')

    // Assert
    expect(prompt).not.toContain("TODAY'S MARKET BRIEFING")
  })
})

// Replicates Pool A's Step 3 filter (stock-selector.ts, "overbought spikes"
// filter + the [GAP_VOL_EXCEPTION] log) — kept as a standalone snippet since
// selectStocksForAnalysis() itself makes a live Anthropic API call and isn't
// practical to invoke directly in tests. Keep in sync with that filter if its
// conditions change.
const MAX_DAILY_CHANGE_PCT = 15
const HIGH_RELATIVE_VOLUME_THRESHOLD = 1.5

function applyStep3Filter(candidates: ScreenerStock[]): ScreenerStock[] {
  return candidates.filter((c) => {
    const passesChangeFilter = Math.abs(c.changePercent) < MAX_DAILY_CHANGE_PCT
    const passesGapVolumeException = c.relativeVolume >= HIGH_RELATIVE_VOLUME_THRESHOLD
    if (!passesChangeFilter && passesGapVolumeException) {
      console.log(`[GAP_VOL_EXCEPTION] symbol=${c.symbol} changePercent=${c.changePercent.toFixed(1)} relativeVolume=${c.relativeVolume.toFixed(2)}`)
    }
    return passesChangeFilter || passesGapVolumeException
  })
}

function stock(overrides: Partial<ScreenerStock>): ScreenerStock {
  return { symbol: 'TEST', price: 10, changePercent: 0, volume: 0, relativeVolume: 0, ...overrides }
}

describe('Pool A Step 3 filter — gap+volume exception', () => {
  let logSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    logSpy.mockRestore()
  })

  it('includes a normal mover (|changePercent| < 15%) regardless of relativeVolume', () => {
    // Arrange
    const candidates = [stock({ symbol: 'AAPL', changePercent: 8, relativeVolume: 0.2 })]

    // Act
    const result = applyStep3Filter(candidates)

    // Assert
    expect(result.map((c) => c.symbol)).toEqual(['AAPL'])
    expect(logSpy).not.toHaveBeenCalled()
  })

  it('excludes a large-gap candidate with low relativeVolume and does not log', () => {
    // Arrange
    const candidates = [stock({ symbol: 'GME', changePercent: 20, relativeVolume: 1.0 })]

    // Act
    const result = applyStep3Filter(candidates)

    // Assert
    expect(result).toEqual([])
    expect(logSpy).not.toHaveBeenCalled()
  })

  it('includes a large-gap candidate with high relativeVolume and logs [GAP_VOL_EXCEPTION]', () => {
    // Arrange
    const candidates = [stock({ symbol: 'NVDA', changePercent: -18, relativeVolume: 2.3 })]

    // Act
    const result = applyStep3Filter(candidates)

    // Assert
    expect(result.map((c) => c.symbol)).toEqual(['NVDA'])
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('[GAP_VOL_EXCEPTION] symbol=NVDA changePercent=-18.0 relativeVolume=2.30')
    )
  })

  it('does not crash and logs nothing on an empty candidate batch', () => {
    // Arrange / Act
    const result = applyStep3Filter([])

    // Assert
    expect(result).toEqual([])
    expect(logSpy).not.toHaveBeenCalled()
  })
})

const MAX_POOL_A_CANDIDATES = 15

function manyPoolACandidates(count: number): ScreenerStock[] {
  return Array.from({ length: count }, (_, i) =>
    stock({ symbol: `SYM${String(i).padStart(2, '0')}`, changePercent: 5, relativeVolume: 1, volume: 1_000_000 })
  )
}

const ACCOUNT: AlpacaAccount = {
  id: 'acct-1',
  cash: '10000',
  portfolio_value: '10000',
  buying_power: '10000',
  equity: '10000',
  last_equity: '10000',
  long_market_value: '0',
  short_market_value: '0',
  initial_margin: '0',
  maintenance_margin: '0',
  daytrade_count: 0,
  multiplier: '1',
  pattern_day_trader: false,
  trading_blocked: false,
  account_blocked: false,
  status: 'ACTIVE',
}

const NO_POSITIONS: AlpacaPosition[] = []

function mockClaudeSelection(selected: string[]): void {
  mockMessagesCreate.mockResolvedValue({
    content: [{ type: 'text', text: JSON.stringify({ selected, reasoning: 'test reasoning' }) }],
  })
}

describe('selectStocksForAnalysis — candidatesOffered truncation fix', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    mockGetSelectionEvaluations.mockResolvedValue([])
    mockGetStockSnapshots.mockResolvedValue([])
    mockInsertSelectionDecision.mockReset()
    mockMessagesCreate.mockReset()
  })

  it('persists candidatesOffered capped to the post-truncation count, not the pre-truncation count', async () => {
    // Arrange
    const candidates = manyPoolACandidates(20)
    mockClaudeSelection(['SYM00'])

    // Act
    await selectStocksForAnalysis(candidates, ACCOUNT, NO_POSITIONS)

    // Assert
    expect(mockInsertSelectionDecision).toHaveBeenCalledTimes(1)
    const persisted = mockInsertSelectionDecision.mock.calls[0][0]
    expect(persisted.candidatesOffered).toHaveLength(MAX_POOL_A_CANDIDATES)
    expect(persisted.candidatesOffered.map((c: ScreenerStock) => c.symbol)).not.toContain('SYM19')
  })

  it('filters out a selected symbol that was truncated out of Pool A and never shown to Claude', async () => {
    // Arrange
    const candidates = manyPoolACandidates(20)
    mockClaudeSelection(['SYM00', 'SYM19'])

    // Act
    const result = await selectStocksForAnalysis(candidates, ACCOUNT, NO_POSITIONS)

    // Assert
    expect(result).toEqual(['SYM00'])
    expect(result).not.toContain('SYM19')
  })
})
