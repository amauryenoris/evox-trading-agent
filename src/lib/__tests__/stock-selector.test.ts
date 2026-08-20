import { describe, it, expect } from 'vitest'

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
