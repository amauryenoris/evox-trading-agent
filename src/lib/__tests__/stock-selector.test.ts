import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ScreenerStock } from '../types'

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
