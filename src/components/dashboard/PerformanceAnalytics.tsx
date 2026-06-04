'use client'

import { useEffect, useState } from 'react'
import { Card, Badge, SignalBadge, Progress } from './ui'
import type { BadgeTone } from './ui'

const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ')

const fmtPct  = (n: number, dp = 2) => (n >= 0 ? '+' : '') + n.toFixed(dp) + '%'
const fmtUSD  = (n: number, dp = 2) =>
  (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })
const fmtSgn  = (n: number, dp = 2) =>
  (n >= 0 ? '+' : '') + n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })

// ─── Local sub-components (not in ui.tsx — defined inline per Components.jsx) ───

function Metric({ label, value, tone = 'neutral', sub }: {
  label: string; value: string; tone?: 'green' | 'red' | 'neutral'; sub?: string
}) {
  const tones = { green: 'text-green', red: 'text-red', neutral: 'text-text' }
  return (
    <div className="px-5 py-4">
      <div className="text-[10px] tracking-[0.14em] uppercase text-muted">{label}</div>
      <div className={cx('num text-xl font-semibold mt-1', tones[tone])}>{value}</div>
      {sub && <div className="text-[10.5px] text-muted mt-1">{sub}</div>}
    </div>
  )
}

function KVMini({ label, value, tone = 'neutral' }: {
  label: string; value: string; tone?: 'green' | 'red' | 'amber' | 'neutral'
}) {
  const tones = { green: 'text-green', red: 'text-red', amber: 'text-amber', neutral: 'text-text' }
  return (
    <div>
      <div className="text-[9.5px] uppercase tracking-wider text-muted">{label}</div>
      <div className={cx('num font-semibold mt-0.5', tones[tone])}>{value}</div>
    </div>
  )
}

// ADAPTED: data is last10Trades[].pnlUSD array, not a flat number[] — extracted inline
function Waterfall({ data }: { data: number[] }) {
  const W = 380, H = 70
  const max = Math.max(...data.map(Math.abs), 1)
  const mid = H / 2
  const bw  = W / data.length
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full block">
      <line x1="0" x2={W} y1={mid} y2={mid} stroke="#1E1E2E" />
      {data.map((v, i) => {
        const h    = (Math.abs(v) / max) * (H / 2 - 4)
        const x    = i * bw + bw * 0.18
        const w    = bw * 0.64
        const y    = v >= 0 ? mid - h : mid
        const fill = v >= 0 ? '#00B386' : '#FF4444'
        return <rect key={i} x={x} y={y} width={w} height={h} fill={fill} opacity="0.85" rx="2" />
      })}
    </svg>
  )
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface SignalStat {
  count: number
  winRate: number
  avgPnlPct: number
  profitFactor: number
  expectancy: number
}

interface PerformanceData {
  total: number
  winCount: number
  lossCount: number
  winRate: number
  profitFactor: number
  avgWinUSD: number
  avgWinPct: number
  avgLossUSD: number
  avgLossPct: number
  expectancy: number
  last10Trades: { index: number; pnlUSD: number; outcome: string; symbol: string }[]
  evoxYtdPct: number
  spyYtdPct: number | null
  signalTypeBreakdown?: {
    meanReversion: SignalStat
    trend: SignalStat
    trendPullback?: SignalStat
    trendZLE05?: SignalStat
    emaReclaim: SignalStat
  }
  best?: { symbol: string; pct: number; pnl: number } | null
  worst?: { symbol: string; pct: number; pnl: number } | null
  since: string | null
}

type Scope = 'NEW' | 'ALL'
const NEW_SYSTEM_DATE = '2026-04-20'

// ─── Component ───────────────────────────────────────────────────────────────

export function PerformanceAnalytics() {
  const [data, setData]       = useState<PerformanceData | null>(null)
  const [error, setError]     = useState<string | null>(null)
  const [scope, setScope]     = useState<Scope>('NEW')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    setData(null)
    const url = scope === 'NEW' ? `/api/performance?since=${NEW_SYSTEM_DATE}` : '/api/performance'
    fetch(url)
      .then((r) => r.json())
      .then((d: PerformanceData) => { setData(d); setLoading(false) })
      .catch((e) => { setError(String(e)); setLoading(false) })
  }, [scope])

  if (error) {
    return (
      <Card>
        <p className="text-xs text-red">Performance data unavailable: {error}</p>
      </Card>
    )
  }

  if (loading || !data) {
    return (
      <Card padded={false}>
        <div className="animate-pulse px-6 py-5 space-y-3">
          <div className="grid grid-cols-5 gap-3">
            {[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-white/[0.04] rounded-lg" />)}
          </div>
          <div className="h-24 bg-white/[0.04] rounded-lg" />
        </div>
      </Card>
    )
  }

  const g = {
    ...data,
    total:        data.total        ?? 0,
    winRate:      data.winRate      ?? 0,
    profitFactor: data.profitFactor ?? 0,
    avgWinUSD:    data.avgWinUSD    ?? 0,
    avgWinPct:    data.avgWinPct    ?? 0,
    avgLossUSD:   data.avgLossUSD   ?? 0,
    avgLossPct:   data.avgLossPct   ?? 0,
    expectancy:   data.expectancy   ?? 0,
    last10Trades: data.last10Trades ?? [],
    evoxYtdPct:   data.evoxYtdPct   ?? 0,
    spyYtdPct:    data.spyYtdPct    ?? null,
  }

  // Build sigs array from signalTypeBreakdown
  type SigColor = 'blue' | 'green' | 'amber' | 'purple'
  interface Sig {
    type: string; label: string; trades: number
    winRate: number; avgPnL: number; profitFactor: number; expectancy: number; color: SigColor
  }
  const sigs: Sig[] = data.signalTypeBreakdown ? [
    {
      type: 'MR', label: 'Mean Reversion',
      trades: data.signalTypeBreakdown.meanReversion.count,
      winRate: data.signalTypeBreakdown.meanReversion.winRate,
      avgPnL: data.signalTypeBreakdown.meanReversion.avgPnlPct,
      profitFactor: data.signalTypeBreakdown.meanReversion.profitFactor,
      expectancy: data.signalTypeBreakdown.meanReversion.expectancy,
      color: 'blue' as SigColor,
    },
    {
      type: 'TREND_PULLBACK', label: 'Trend PB',
      trades:       data.signalTypeBreakdown.trendPullback?.count        ?? 0,
      winRate:      data.signalTypeBreakdown.trendPullback?.winRate      ?? 0,
      avgPnL:       data.signalTypeBreakdown.trendPullback?.avgPnlPct    ?? 0,
      profitFactor: data.signalTypeBreakdown.trendPullback?.profitFactor ?? 0,
      expectancy:   data.signalTypeBreakdown.trendPullback?.expectancy   ?? 0,
      color: 'green' as SigColor,
    },
    {
      type: 'TREND_ZLE05', label: 'Trend ZLE',
      trades:       data.signalTypeBreakdown.trendZLE05?.count        ?? 0,
      winRate:      data.signalTypeBreakdown.trendZLE05?.winRate      ?? 0,
      avgPnL:       data.signalTypeBreakdown.trendZLE05?.avgPnlPct    ?? 0,
      profitFactor: data.signalTypeBreakdown.trendZLE05?.profitFactor ?? 0,
      expectancy:   data.signalTypeBreakdown.trendZLE05?.expectancy   ?? 0,
      color: 'green' as SigColor,
    },
    ...(data.signalTypeBreakdown.emaReclaim.count > 0 ? [{
      type: 'EMA_RECLAIM', label: 'EMA Reclaim',
      trades: data.signalTypeBreakdown.emaReclaim.count,
      winRate: data.signalTypeBreakdown.emaReclaim.winRate,
      avgPnL: data.signalTypeBreakdown.emaReclaim.avgPnlPct,
      profitFactor: data.signalTypeBreakdown.emaReclaim.profitFactor,
      expectancy: data.signalTypeBreakdown.emaReclaim.expectancy,
      color: 'purple' as SigColor,
    }] : []),
  ].filter((s) => s.trades > 0) : []

  const last10Pnl = g.last10Trades.map((t) => t.pnlUSD)
  const wrc = g.winRate     >= 50 ? 'green' : 'red'     as const
  const pfc = g.profitFactor >= 2  ? 'green' : 'neutral' as const
  const exc = g.expectancy  >= 0  ? 'green' : 'red'     as const

  return (
    <Card padded={false}>
      {/* Header + scope toggle */}
      <div className="flex items-baseline justify-between px-6 pt-5 pb-3">
        <div className="flex items-baseline gap-3">
          <h3 className="text-sm font-semibold tracking-[0.18em] uppercase">Performance Analytics</h3>
          <span className="text-[11px] text-muted">{g.total} trades · win {g.winRate.toFixed(0)}%</span>
        </div>
        <div className="flex p-0.5 rounded-md bg-white/[0.04] border border-border text-[10.5px]">
          <button onClick={() => setScope('NEW')}
            className={cx('px-2.5 py-1 rounded transition tracking-wide',
              scope === 'NEW' ? 'bg-purple text-white' : 'text-muted hover:text-text')}>
            New System · Apr 20+
          </button>
          <button onClick={() => setScope('ALL')}
            className={cx('px-2.5 py-1 rounded transition tracking-wide',
              scope === 'ALL' ? 'bg-purple text-white' : 'text-muted hover:text-text')}>
            All Time
          </button>
        </div>
      </div>

      {/* Global metrics row */}
      <div className="grid grid-cols-2 md:grid-cols-5 divide-y md:divide-y-0 md:divide-x divide-border border-y border-border">
        <Metric label="Win Rate"      value={g.winRate.toFixed(0) + '%'}                     tone={wrc} sub="target 50%" />
        <Metric label="Profit Factor" value={g.profitFactor >= 999 ? '∞' : g.profitFactor.toFixed(2)} tone={pfc} sub="2.0+ target" />
        <Metric label="Avg Win"       value={fmtUSD(g.avgWinUSD)}  tone="green" sub={'+' + g.avgWinPct.toFixed(2) + '%'} />
        <Metric label="Avg Loss"      value={fmtUSD(g.avgLossUSD)} tone="red"   sub={g.avgLossPct.toFixed(2) + '%'} />
        <Metric label="Expectancy"    value={fmtSgn(g.expectancy) + '%'} tone={exc} sub="per trade" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 px-6 py-6">
        {/* Left: signal breakdown */}
        <div>
          <div className="text-[10px] tracking-[0.14em] uppercase text-muted mb-3">By Signal Type</div>
          {sigs.length === 0 ? (
            <p className="text-sm text-muted">No closed trades yet</p>
          ) : (
            <div className="space-y-2.5">
              {sigs.map((s) => (
                <div key={s.type} className="bg-surface2 border border-border rounded-lg p-3.5">
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-2.5">
                      <SignalBadge signal={s.type} />
                      <span className="text-[11px] text-mute2">{s.label}</span>
                    </div>
                    <span className="text-[10.5px] text-muted num">{s.trades} trades</span>
                  </div>
                  <div className="grid grid-cols-4 gap-3 text-[11px]">
                    <KVMini label="Win"   value={s.winRate.toFixed(0) + '%'}       tone={s.winRate >= 50 ? 'green' : 'red'} />
                    <KVMini label="Avg P&L" value={fmtPct(s.avgPnL, 2)}           tone={s.avgPnL >= 0 ? 'green' : 'red'} />
                    <KVMini label="PF"    value={s.profitFactor >= 999 ? '∞' : s.profitFactor.toFixed(2)} tone={s.profitFactor >= 1.5 ? 'green' : s.profitFactor >= 1 ? 'amber' : 'red'} />
                    <KVMini label="Exp"   value={fmtPct(s.expectancy, 2)}         tone={s.expectancy >= 0 ? 'green' : 'red'} />
                  </div>
                  <div className="mt-2.5">
                    <Progress value={s.winRate / 100} tone={s.color as 'green' | 'blue' | 'purple'} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: best/worst + waterfall + YTD */}
        <div className="space-y-4">
          {/* Best / Worst */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-surface2 border border-border rounded-lg p-3.5">
              <div className="text-[10px] tracking-[0.14em] uppercase text-muted mb-1">Best Trade</div>
              {data.best ? (
                <>
                  <div className="text-sm font-semibold">{data.best.symbol}</div>
                  <div className="num text-green text-lg mt-0.5">{fmtPct(data.best.pct, 1)}</div>
                  <div className="num text-[11px] text-mute2">{fmtUSD(data.best.pnl)} realized</div>
                </>
              ) : (
                <div className="text-sm text-muted mt-2">—</div>
              )}
            </div>
            <div className="bg-surface2 border border-border rounded-lg p-3.5">
              <div className="text-[10px] tracking-[0.14em] uppercase text-muted mb-1">Worst Trade</div>
              {data.worst ? (
                <>
                  <div className="text-sm font-semibold">{data.worst.symbol}</div>
                  <div className="num text-red text-lg mt-0.5">{fmtPct(data.worst.pct, 1)}</div>
                  <div className="num text-[11px] text-mute2">{fmtUSD(data.worst.pnl)} realized</div>
                </>
              ) : (
                <div className="text-sm text-muted mt-2">—</div>
              )}
            </div>
          </div>

          {/* Waterfall — last 10 P&L */}
          <div className="bg-surface2 border border-border rounded-lg p-3.5">
            <div className="text-[10px] tracking-[0.14em] uppercase text-muted mb-3">
              P&L Per Trade · last {last10Pnl.length}
            </div>
            {last10Pnl.length > 0
              ? <Waterfall data={last10Pnl} />
              : <p className="text-xs text-muted text-center py-4">No closed trades yet</p>
            }
          </div>

          {/* YTD vs Benchmark */}
          <div className="bg-surface2 border border-border rounded-lg p-3.5">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] tracking-[0.14em] uppercase text-muted">YTD vs Benchmark</div>
              <div className="text-[10.5px] text-muted">2026 YTD</div>
            </div>
            <div className="flex items-end gap-4">
              <div className="flex-1">
                <div className="text-[11px] text-muted">PAQUITO</div>
                <div className={cx('num text-2xl font-semibold', g.evoxYtdPct >= 0 ? 'text-green' : 'text-red')}>
                  {fmtPct(g.evoxYtdPct)}
                </div>
              </div>
              <div className="w-px self-stretch bg-border" />
              <div className="flex-1">
                <div className="text-[11px] text-muted">S&P 500</div>
                {g.spyYtdPct !== null ? (
                  <div className={cx('num text-2xl font-semibold', g.spyYtdPct >= 0 ? 'text-green' : 'text-red')}>
                    {fmtPct(g.spyYtdPct)}
                  </div>
                ) : (
                  <div className="num text-2xl font-semibold text-mute2">—</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}
