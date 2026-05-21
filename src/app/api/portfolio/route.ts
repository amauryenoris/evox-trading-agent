import { NextResponse } from 'next/server'
import { getAccount } from '@/lib/alpaca'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const account = await getAccount()
    const equity = parseFloat(account.equity)
    const lastEquity = parseFloat(account.last_equity)
    const initialEquity = 100_000 // Alpaca paper account starts with $100k

    return NextResponse.json({
      equity,
      cash: parseFloat(account.cash),
      buyingPower: parseFloat(account.buying_power),
      totalPnL: equity - initialEquity,
      todayPnL: equity - lastEquity,
      totalPnLPct: ((equity - initialEquity) / initialEquity) * 100,
      todayPnLPct: lastEquity !== 0 ? ((equity - lastEquity) / lastEquity) * 100 : 0,
    })
  } catch (error) {
    console.error('[portfolio]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
