import { NextResponse } from 'next/server'
import { getTradeEvaluations } from '@/lib/db'
import { getAccount, getBars } from '@/lib/alpaca'

export const dynamic = 'force-dynamic'

const SPY_BASE_2026 = 585.50

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
    const expectancy = (winRate / 100 * avgWinPct) - (lossRate / 100 * Math.abs(avgLossPct))

    // Signal type stats — now includes profitFactor and expectancy
    function signalStats(trades: typeof closedTrades) {
      const w = trades.filter((t) => t.outcome === 'profit')
      const l = trades.filter((t) => t.outcome === 'loss')
      const wr = trades.length > 0 ? (w.length / trades.length) * 100 : 0
      const lr = 100 - wr
      const avgWP = w.length > 0 ? w.reduce((s, t) => s + t.pnlPct, 0) / w.length : 0
      const avgLP = l.length > 0 ? l.reduce((s, t) => s + t.pnlPct, 0) / l.length : 0
      const tw = w.reduce((s, t) => s + t.pnlUSD, 0)
      const tl = Math.abs(l.reduce((s, t) => s + t.pnlUSD, 0))
      const pf = tl > 0 ? tw / tl : tw > 0 ? 999 : 0
      const exp = (wr / 100 * avgWP) - (lr / 100 * Math.abs(avgLP))
      return {
        count: trades.length,
        winRate: wr,
        avgPnlPct: trades.length > 0 ? trades.reduce((s, t) => s + t.pnlPct, 0) / trades.length : 0,
        profitFactor: pf,
        expectancy: exp,
      }
    }

    const mrTrades = closedTrades.filter((t) => t.signal_type === 'MEAN_REVERSION')
    const trendTrades = closedTrades.filter((t) =>
      ['TREND', 'TREND_PULLBACK', 'TREND_ZLE05'].includes(t.signal_type ?? '')
    )
    const emaReclaimTrades = closedTrades.filter((t) => t.signal_type === 'EMA_RECLAIM')
    const signalTypeBreakdown = {
      meanReversion: signalStats(mrTrades),
      trend: signalStats(trendTrades),
      emaReclaim: signalStats(emaReclaimTrades),
    }

    const last10 = closedTrades
      .slice(0, 10)
      .reverse()
      .map((t, i) => ({ index: i + 1, pnlUSD: t.pnlUSD, outcome: t.outcome, symbol: t.symbol }))

    // Best and worst closed trades by pnlPct
    const sorted = [...closedTrades].sort((a, b) => b.pnlPct - a.pnlPct)
    const best = sorted.length > 0
      ? { symbol: sorted[0].symbol, pct: sorted[0].pnlPct, pnl: sorted[0].pnlUSD }
      : null
    const worst = sorted.length > 0
      ? { symbol: sorted[sorted.length - 1].symbol, pct: sorted[sorted.length - 1].pnlPct, pnl: sorted[sorted.length - 1].pnlUSD }
      : null

    const currentEquity = parseFloat(account.equity)
    const evoxYtdPct = ((currentEquity - 100000) / 100000) * 100

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
      // SPY unavailable — leave null
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
      best,
      worst,
      since: since ?? null,
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
