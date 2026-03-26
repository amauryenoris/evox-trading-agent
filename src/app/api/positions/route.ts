import { NextResponse } from 'next/server'
import { getPositions } from '@/lib/alpaca'
import type { PositionDisplay } from '@/lib/types'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const positions = await getPositions()
    const display: PositionDisplay[] = positions.map((p) => ({
      symbol: p.symbol,
      qty: parseFloat(p.qty),
      avgEntryPrice: parseFloat(p.avg_entry_price),
      currentPrice: parseFloat(p.current_price),
      marketValue: parseFloat(p.market_value),
      unrealizedPnL: parseFloat(p.unrealized_pl),
      unrealizedPnLPct: parseFloat(p.unrealized_plpc) * 100,
      changeToday: parseFloat(p.change_today) * 100,
    }))
    return NextResponse.json(display)
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
