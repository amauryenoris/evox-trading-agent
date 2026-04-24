import { NextResponse } from 'next/server'
import { getTradeEvaluations } from '@/lib/db'
import { getAccount, getBars } from '@/lib/alpaca'

export const dynamic = 'force-dynamic'

const SPY_BASE_2026 = 585.50 // SPY close Jan 2, 2026 (first trading day of 2026)

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const since = searchParams.get('since') ?? undefined

    const [evaluations, account] = await Promise.all([
      getTradeEvaluations(200, since),
      getAccount(),
    ])

    const closedTrades = evaluations.filter((t) => t.outcome !== undefined)

    const wins = closedTrades.filter((t) => t.outcome === 'profit')
    const losses = closedTrades.filter((t) => t.outcome === 'loss')
    const total = closedTrades.length

    const winRate = total > 0 ? (wins.length / total) * 100 : 0
    const lossRate = 100 - winRate

    const totalWinPnL = wins.reduce((sum, t) => sum + t.pnlUSD, 0)
    const totalLossPnL = Math.abs(losses.reduce((sum, t) => sum + t.pnlUSD, 0))
    const profitFactor = totalLossPnL > 0 ? totalWinPnL / totalLossPnL : totalWinPnL > 0 ? Infinity : 0

    const avgWinUSD = wins.length > 0 ? totalWinPnL / wins.length : 0
    const avgWinPct = wins.length > 0 ? wins.reduce((s, t) => s + t.pnlPct, 0) / wins.length : 0
    const avgLossUSD = losses.length > 0 ? losses.reduce((s, t) => s + t.pnlUSD, 0) / losses.length : 0
    const avgLossPct = losses.length > 0 ? losses.reduce((s, t) => s + t.pnlPct, 0) / losses.length : 0

    // Expectancy: expected % return per trade
    const expectancy = (winRate / 100 * avgWinPct) - (lossRate / 100 * Math.abs(avgLossPct))

    // Signal type breakdown
    function signalStats(trades: typeof closedTrades) {
      const w = trades.filter((t) => t.outcome === 'profit')
      const l = trades.filter((t) => t.outcome === 'loss')
      return {
        count: trades.length,
        winRate: trades.length > 0 ? (w.length / trades.length) * 100 : 0,
        avgPnlPct: trades.length > 0 ? trades.reduce((s, t) => s + t.pnlPct, 0) / trades.length : 0,
      }
    }
    const mrTrades = closedTrades.filter((t) => t.signal_type === 'MEAN_REVERSION')
    const trendTrades = closedTrades.filter((t) => t.signal_type === 'TREND')
    const signalTypeBreakdown = {
      meanReversion: signalStats(mrTrades),
      trend: signalStats(trendTrades),
    }

    // Last 10 trades for bar chart — already ordered by sell_timestamp DESC from db
    const last10 = closedTrades
      .slice(0, 10)
      .reverse()
      .map((t, i) => ({ index: i + 1, pnlUSD: t.pnlUSD, outcome: t.outcome, symbol: t.symbol }))

    // EVOX YTD — always all-time, not filtered
    const currentEquity = parseFloat(account.equity)
    const evoxYtdPct = ((currentEquity - 100000) / 100000) * 100

    // S&P 500 YTD — use previous day close to avoid partial-day distortion
    let spyYtdPct: number | null = null
    try {
      const spyBars = await getBars('SPY', '1Day', 2)
      const spyClose = spyBars.length >= 2
        ? spyBars[spyBars.length - 2].c
        : spyBars[spyBars.length - 1]?.c ?? null
      if (spyClose !== null) {
        spyYtdPct = ((spyClose - SPY_BASE_2026) / SPY_BASE_2026) * 100
        console.log('[YTD] SPY close:', spyClose)
        console.log('[YTD] SPY YTD:', spyYtdPct.toFixed(2) + '%')
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
      expectancy,
      last10Trades: last10,
      evoxYtdPct,
      spyYtdPct,
      currentEquity,
      signalTypeBreakdown,
      since: since ?? null,
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
