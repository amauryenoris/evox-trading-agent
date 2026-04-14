import { NextResponse } from 'next/server'
import { getTradeEvaluations } from '@/lib/db'
import { getAccount } from '@/lib/alpaca'

export const dynamic = 'force-dynamic'

const SPY_JAN1_2026 = 585.50

export async function GET() {
  try {
    const [evaluations, account] = await Promise.all([
      getTradeEvaluations(200),
      getAccount(),
    ])

    const closedTrades = evaluations.filter((t) => t.outcome !== undefined)

    const wins = closedTrades.filter((t) => t.outcome === 'profit')
    const losses = closedTrades.filter((t) => t.outcome === 'loss')
    const total = closedTrades.length

    const winRate = total > 0 ? (wins.length / total) * 100 : 0

    const totalWinPnL = wins.reduce((sum, t) => sum + t.pnlUSD, 0)
    const totalLossPnL = Math.abs(losses.reduce((sum, t) => sum + t.pnlUSD, 0))
    const profitFactor = totalLossPnL > 0 ? totalWinPnL / totalLossPnL : totalWinPnL > 0 ? Infinity : 0

    const avgWinUSD = wins.length > 0 ? totalWinPnL / wins.length : 0
    const avgWinPct = wins.length > 0 ? wins.reduce((s, t) => s + t.pnlPct, 0) / wins.length : 0
    const avgLossUSD = losses.length > 0 ? losses.reduce((s, t) => s + t.pnlUSD, 0) / losses.length : 0
    const avgLossPct = losses.length > 0 ? losses.reduce((s, t) => s + t.pnlPct, 0) / losses.length : 0

    // Last 10 trades for bar chart
    const last10 = [...closedTrades]
      .sort((a, b) => new Date(b.sellTimestamp).getTime() - new Date(a.sellTimestamp).getTime())
      .slice(0, 10)
      .reverse()
      .map((t, i) => ({ index: i + 1, pnlUSD: t.pnlUSD, outcome: t.outcome, symbol: t.symbol }))

    // EVOX vs S&P 500 YTD
    const currentEquity = parseFloat(account.equity)
    const evoxYtdPct = ((currentEquity - 100000) / 100000) * 100

    // Fetch SPY current price from Alpaca (best effort)
    let spyYtdPct: number | null = null
    try {
      const { getBars } = await import('@/lib/alpaca')
      const spyBars = await getBars('SPY', '1Day', 2)
      const latestBar = spyBars[spyBars.length - 1]
      if (latestBar) {
        spyYtdPct = ((latestBar.c - SPY_JAN1_2026) / SPY_JAN1_2026) * 100
      }
    } catch {
      // SPY price unavailable — leave null
    }

    return NextResponse.json({
      total,
      winCount: wins.length,
      lossCount: losses.length,
      winRate,
      profitFactor: isFinite(profitFactor) ? profitFactor : 999,
      avgWinUSD,
      avgWinPct,
      avgLossUSD,
      avgLossPct,
      last10Trades: last10,
      evoxYtdPct,
      spyYtdPct,
      currentEquity,
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
