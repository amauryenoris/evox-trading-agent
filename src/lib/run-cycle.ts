import { getAccount, getPositions, getBars, getClock } from './alpaca'
import { calculateAllIndicators } from './indicators'
import { getOpenPositionContexts } from './db'
import { enforceExitRules } from './claude-agent'
import type { TechnicalIndicators } from './types'

export async function runExitOnly(): Promise<void> {
  console.log('[EXIT-ONLY] Starting exit evaluation')

  const clock = await getClock()
  if (!clock.is_open) {
    console.log('[EXIT-ONLY] Market closed — skipping')
    return
  }

  const account = await getAccount()
  const positions = await getPositions()

  if (positions.length === 0) {
    console.log('[EXIT-ONLY] No open positions — skipping')
    return
  }

  console.log(`[EXIT-ONLY] ${positions.length} positions to evaluate`)

  const indicatorsCache = new Map<string, TechnicalIndicators>()

  for (const position of positions) {
    const bars = await getBars(position.symbol, '1Day', 300, 300)
    if (bars && bars.length > 0) {
      const ind = calculateAllIndicators(bars)
      if (ind) indicatorsCache.set(position.symbol, ind)
    }
  }

  const openContexts = await getOpenPositionContexts()

  const { decisions: _exitDecisions } = await enforceExitRules(positions, indicatorsCache, openContexts, account)

  console.log('[EXIT-ONLY] Complete')
}
