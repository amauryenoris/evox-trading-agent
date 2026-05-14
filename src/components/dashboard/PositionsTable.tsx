import type { PositionDisplay } from '@/lib/types'
import { Card, SignalBadge, Dot, Progress } from './ui'

const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ')

// ADAPTED: mirrors claude-agent.ts ACTIVATION_PCT — same values, kept in sync manually
const ACTIVATION_PCT: Record<string, number> = {
  MEAN_REVERSION: 0.05,
  TREND:          0.06,
  TREND_PULLBACK: 0.06,
  TREND_ZLE05:    0.03,
  EMA_RECLAIM:    0.04,
}

// ADAPTED: MEAN_REVERSION → 'MR' because ui.tsx SignalBadge map uses shortcodes
const toSignalCode = (s?: string | null) => s === 'MEAN_REVERSION' ? 'MR' : s

const fmtPct = (n: number, dp = 2) => (n >= 0 ? '+' : '') + n.toFixed(dp) + '%'
const greenRed = (n: number) => n >= 0 ? 'text-green' : 'text-red'

interface Props {
  positions: PositionDisplay[]
}

function PositionCard({ p }: { p: PositionDisplay }) {
  const up = p.unrealizedPnL >= 0
  const profitTarget = 10
  const progress = Math.max(0, Math.min(1, p.unrealizedPnLPct / profitTarget))

  const trailActive = !!(p.trailingActivated && p.trailingStop != null)
  const trailCalc   = !!(p.trailingActivated && p.trailingStop == null)
  const trailDistPct = trailActive && p.trailingStop != null
    ? ((p.currentPrice - p.trailingStop) / p.currentPrice) * 100
    : null

  const signal       = p.signalType ?? 'default'
  const activatePct  = ((ACTIVATION_PCT[signal] ?? 0.05) * 100).toFixed(0)
  const pnlSign      = p.unrealizedPnL >= 0 ? '+' : ''

  return (
    <div className="group relative bg-surface border border-border rounded-xl p-5 hover:border-border2 transition">

      {/* top row: symbol + signal + pnl */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="text-lg font-bold tracking-tight">{p.symbol}</div>
          <SignalBadge signal={toSignalCode(p.signalType)} />
        </div>
        <div className="text-right">
          <div className={cx('num text-2xl font-semibold leading-none', greenRed(p.unrealizedPnL))}>
            {fmtPct(p.unrealizedPnLPct, 2)}
          </div>
          <div className={cx('num text-[11px] mt-1 font-medium', greenRed(p.unrealizedPnL))}>
            {pnlSign}${Math.abs(p.unrealizedPnL).toFixed(2)}
          </div>
        </div>
      </div>

      {/* mid row: price + entry info */}
      {/* ADAPTED: sparkline absent from PositionDisplay — omitted */}
      <div className="flex items-end justify-between mb-4">
        <div>
          <div className="num text-[17px] font-semibold leading-none">${p.currentPrice.toFixed(2)}</div>
          <div className="text-[10.5px] text-muted mt-1.5 num">
            entry ${p.avgEntryPrice.toFixed(2)} · {p.qty} sh
            {p.daysOpen != null && <span className="text-mute2"> · {p.daysOpen}d open</span>}
          </div>
        </div>
      </div>

      {/* trailing stop status */}
      <div className="flex items-center gap-2 mb-3.5">
        {trailActive && p.trailingStop != null ? (
          <>
            <Dot tone="green" pulse />
            <span className="text-[11px] num text-green">
              Trail ${p.trailingStop.toFixed(2)}
              <span className="opacity-80"> · {trailDistPct?.toFixed(2)}% to stop</span>
            </span>
          </>
        ) : trailCalc ? (
          <>
            <Dot tone="amber" />
            <span className="text-[11px] text-amber">Trail calculating...</span>
          </>
        ) : (
          <>
            <Dot tone="muted" />
            <span className="text-[11px] text-muted">Trail inactive · activates at +{activatePct}%</span>
          </>
        )}
      </div>

      {/* progress to profit target */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] tracking-wider text-muted uppercase">Profit Target</span>
          <span className="text-[10px] num text-mute2">{p.unrealizedPnLPct.toFixed(1)}% / {profitTarget}%</span>
        </div>
        <Progress value={progress} tone={up ? 'green' : 'red'} />
      </div>

      <div className="absolute inset-x-5 -bottom-px h-px bg-gradient-to-r from-transparent via-border2 to-transparent opacity-0 group-hover:opacity-100 transition" />
    </div>
  )
}

export function PositionsTable({ positions }: Props) {
  return (
    <Card padded={false}>
      <div className="flex items-baseline justify-between px-6 pt-5 pb-4">
        <div className="flex items-baseline gap-3">
          <h3 className="text-sm font-semibold tracking-[0.18em] uppercase text-text">Open Positions</h3>
          {/* ADAPTED: positionsMax not available as prop — showing count only */}
          <span className="text-[11px] text-muted">{positions.length} active</span>
        </div>
        <button className="text-[11px] text-muted hover:text-text tracking-wide">View all →</button>
      </div>
      {positions.length === 0 ? (
        <p className="px-6 pb-8 text-center text-sm text-muted">No open positions</p>
      ) : (
        <div className="px-6 pb-6 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {positions.map((p) => <PositionCard key={p.symbol} p={p} />)}
        </div>
      )}
    </Card>
  )
}
