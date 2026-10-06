import { NextResponse } from 'next/server'
import { getTradeEvaluations } from '@/lib/db'
import { clampTradesLimit } from '@/lib/trade-views'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = clampTradesLimit(searchParams.get('limit'))
    const trades = await getTradeEvaluations(limit)
    return NextResponse.json(trades)
  } catch (error) {
    console.error('[trades]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
