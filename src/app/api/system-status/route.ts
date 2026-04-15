import { NextResponse } from 'next/server'
import { getAgentLog, getTodayBuyExecutions } from '@/lib/db'
import { getClock, getPositions } from '@/lib/alpaca'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const [log, todayBuys, alpacaPositions, clock] = await Promise.all([
      getAgentLog(1),
      getTodayBuyExecutions(),
      getPositions(),
      getClock().catch(() => null),
    ])

    const lastEntry = log[0] ?? null
    const marketRegime = lastEntry?.indicators?.marketRegime ?? null
    const lastRun = lastEntry?.timestamp ?? null

    // Gates status derived from latest available data
    const marketOpen = clock?.is_open ?? false
    const positionCount = alpacaPositions.length

    const gates = {
      hours: {
        status: marketOpen ? 'open' : 'closed',
        label: marketOpen ? 'Market open' : 'Market closed',
      },
      overtrading: {
        status: todayBuys >= 3 ? 'closed' : todayBuys === 2 ? 'warning' : 'open',
        label: `${todayBuys}/3 buys today`,
      },
      positions: {
        status: positionCount >= 5 ? 'closed' : positionCount >= 4 ? 'warning' : 'open',
        label: `${positionCount}/5 positions`,
      },
    }

    return NextResponse.json({
      mode: 'LEARN',
      marketRegime,
      zScoreThreshold: -1.5,
      positionCount,
      maxPositions: 5,
      lastRun,
      gates,
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
