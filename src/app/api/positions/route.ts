import { NextResponse } from 'next/server'
import { getPositions } from '@/lib/alpaca'
import { getAllOpenPositionContexts } from '@/lib/db'
import type { PositionDisplay } from '@/lib/types'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const [positions, contexts] = await Promise.all([
      getPositions(),
      getAllOpenPositionContexts().catch(() => []),
    ])

    const display: PositionDisplay[] = positions.map((p) => {
      const ctx = contexts.find((c) => c.symbol === p.symbol)
      return {
        symbol: p.symbol,
        qty: parseFloat(p.qty),
        avgEntryPrice: parseFloat(p.avg_entry_price),
        currentPrice: parseFloat(p.current_price),
        marketValue: parseFloat(p.market_value),
        unrealizedPnL: parseFloat(p.unrealized_pl),
        unrealizedPnLPct: parseFloat(p.unrealized_plpc) * 100,
        changeToday: parseFloat(p.change_today) * 100,
        signalType: ctx?.signalType ?? null,
        trailingActivated: ctx?.trailingActivated ?? false,
        trailingStop: ctx?.trailingStop ?? null,
        highSinceEntry: ctx?.highSinceEntry ?? null,
        buyPrice: ctx?.buyPrice ?? parseFloat(p.avg_entry_price),
      }
    })
    return NextResponse.json(display)
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
