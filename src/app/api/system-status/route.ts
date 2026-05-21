import { NextResponse } from 'next/server'
import { getAgentLog, getTodayBuyExecutions } from '@/lib/db'
import { getClock, getPositions } from '@/lib/alpaca'
import { ZSCORE_ENTRY_THRESHOLD } from '@/lib/config'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const [log, lastCycleBatch, todayBuys, alpacaPositions, clock] = await Promise.all([
      getAgentLog(1),
      getAgentLog(30),
      getTodayBuyExecutions(),
      getPositions(),
      getClock().catch(() => null),
    ])

    const lastEntry = log[0] ?? null
    const marketRegime = lastEntry?.indicators?.marketRegime ?? null
    const lastRun = lastEntry?.timestamp ?? null

    // Count setups detected in last cycle batch (entries within 5min of last run)
    let meanReversionSetups = 0
    let trendSetups = 0
    if (lastRun && lastCycleBatch.length > 0) {
      const lastRunMs = new Date(lastRun).getTime()
      const cycleEntries = lastCycleBatch.filter(
        (e) => Math.abs(new Date(e.timestamp).getTime() - lastRunMs) < 5 * 60 * 1000
      )
      for (const e of cycleEntries) {
        if (e.decision.signal_type === 'MEAN_REVERSION') meanReversionSetups++
        else if (e.decision.signal_type === 'TREND_FOLLOWING' || e.decision.signal_type === 'PULLBACK_EMA50') trendSetups++
      }
    }

    // Gates status derived from latest available data
    const marketOpen = clock?.is_open ?? false
    const positionCount = alpacaPositions.length

    const gates = {
      hours: {
        status: marketOpen ? 'open' : 'closed',
        label: marketOpen ? 'Market open' : 'Market closed',
      },
      overtrading: {
        status: todayBuys >= 5 ? 'closed' : todayBuys >= 4 ? 'warning' : 'open',
        label: `${todayBuys}/5 buys today`,
      },
      positions: {
        status: positionCount >= 5 ? 'closed' : positionCount >= 4 ? 'warning' : 'open',
        label: `${positionCount}/5 positions`,
      },
    }

    return NextResponse.json({
      mode: 'LEARN',
      marketRegime,
      zScoreThreshold: ZSCORE_ENTRY_THRESHOLD,
      positionCount,
      maxPositions: 5,
      lastRun,
      gates,
      setupsDetected: { meanReversion: meanReversionSetups, trend: trendSetups },
    })
  } catch (error) {
    console.error('[system-status]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
