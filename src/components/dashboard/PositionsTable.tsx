import type { PositionDisplay } from '@/lib/types'
import { getProfitFloorSettings, getProfitTargetPct, TRAILING_ACTIVATION_PCT } from '@/lib/protective-stop'
import { Card, SignalBadge, Dot, Progress } from './ui'

const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ')

// ADAPTED: MEAN_REVERSION → 'MR' because ui.tsx SignalBadge map uses shortcodes
const toSignalCode = (s?: string | null) => s === 'MEAN_REVERSION' ? 'MR' : s

const fmtPct = (n: number, dp = 2) => (n >= 0 ? '+' : '') + n.toFixed(dp) + '%'
const greenRed = (n: number) => n >= 0 ? 'text-green' : 'text-red'

interface Props {
  positions: PositionDisplay[]
}

export interface ProtectionStatus {
  state: 'active' | 'calculating' | 'inactive'
  text: string
}

export function describeProtection(p: PositionDisplay): ProtectionStatus {
  const signal = p.signalType ?? 'default'
  const floor = getProfitFloorSettings(p.signalType)
  const hasStop = !!(p.trailingActivated && p.trailingStop != null)
  const isCalculating = !!(p.trailingActivated && p.trailingStop == null)

  if (floor) {
    if (hasStop && p.trailingStop != null) {
      const floorPct = (p.trailingStop / p.avgEntryPrice - 1) * 100
      return { state: 'active', text: `Floor $${p.trailingStop.toFixed(2)} (+${floorPct.toFixed(2)}%)` }
    }
    if (isCalculating) return { state: 'calculating', text: 'Floor calculating...' }
    return { state: 'inactive', text: `Profit lock inactive - activates at +${floor.activationPct}%` }
  }

  if (hasStop && p.trailingStop != null) {
    const distPct = ((p.currentPrice - p.trailingStop) / p.currentPrice) * 100
    return { state: 'active', text: `Trail $${p.trailingStop.toFixed(2)} · ${distPct.toFixed(2)}% to stop` }
  }
  if (isCalculating) return { state: 'calculating', text: 'Trail calculating...' }
  const activatePct = ((TRAILING_ACTIVATION_PCT[signal] ?? TRAILING_ACTIVATION_PCT.default) * 100).toFixed(0)
  return { state: 'inactive', text: `Trail inactive · activates at +${activatePct}%` }
}

function PositionCard({ p }: { p: PositionDisplay }) {
  const up = p.unrealizedPnL >= 0
  const profitTarget = p.profitTargetPct ?? getProfitTargetPct(p.signalType) * 100
  const progress = Math.max(0, Math.min(1, p.unrealizedPnLPct / profitTarget))

  const protection = describeProtection(p)
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

      {/* protective stop status */}
      <div className="flex items-center gap-2 mb-3.5">
        {protection.state === 'active' ? (
          <>
            <Dot tone="green" pulse />
            <span className="text-[11px] num text-green">{protection.text}</span>
          </>
        ) : protection.state === 'calculating' ? (
          <>
            <Dot tone="amber" />
            <span className="text-[11px] text-amber">{protection.text}</span>
          </>
        ) : (
          <>
            <Dot tone="muted" />
            <span className="text-[11px] text-muted">{protection.text}</span>
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
