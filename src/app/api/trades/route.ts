import { NextResponse } from 'next/server'
import { getTradeEvaluations } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const trades = await getTradeEvaluations(50)
    return NextResponse.json(trades)
  } catch (error) {
    console.error('[trades]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
