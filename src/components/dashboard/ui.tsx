'use client'

import type { ReactNode } from 'react'

/* ─── cx helper ─── */

const cx = (...xs: (string | false | null | undefined)[]) =>
  xs.filter(Boolean).join(' ')

/* ─────────────────────────────────────────────
   Card
   ───────────────────────────────────────────── */

type CardProps = {
  className?: string
  children: ReactNode
  padded?: boolean
  label?: string
  right?: ReactNode
}

export function Card({ className = '', children, padded = true, label, right }: CardProps) {
  return (
    <div className={cx('relative bg-surface rounded-xl border border-border', className)}>
      {(label || right) && (
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <div className="text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">{label}</div>
          {right}
        </div>
      )}
      <div className={padded ? 'px-5 pb-5' : ''}>{children}</div>
    </div>
  )
}

/* ─────────────────────────────────────────────
   Badge
   ───────────────────────────────────────────── */

export type BadgeTone = 'neutral' | 'green' | 'red' | 'blue' | 'amber' | 'purple' | 'ghost'
export type BadgeSize = 'xs' | 'sm' | 'md'

type BadgeProps = {
  tone?: BadgeTone
  size?: BadgeSize
  className?: string
  children: ReactNode
}

export function Badge({ tone = 'neutral', size = 'sm', className = '', children }: BadgeProps) {
  const tones: Record<BadgeTone, string> = {
    neutral: 'bg-white/5 text-mute2 border border-border2',
    green:   'bg-green/10 text-green border border-green/20',
    red:     'bg-red/10 text-red border border-red/25',
    blue:    'bg-blue/10 text-blue border border-blue/25',
    amber:   'bg-amber/10 text-amber border border-amber/25',
    purple:  'bg-purple/15 text-purple2 border border-purple/30',
    ghost:   'bg-transparent text-muted border border-border2',
  }
  const sizes: Record<BadgeSize, string> = {
    xs: 'text-[9px] px-1.5 py-[2px] tracking-[0.1em]',
    sm: 'text-[10px] px-2 py-[3px] tracking-[0.12em]',
    md: 'text-[11px] px-2.5 py-1 tracking-[0.12em]',
  }
  return (
    <span className={cx('inline-flex items-center gap-1 rounded font-semibold uppercase', tones[tone], sizes[size], className)}>
      {children}
    </span>
  )
}

/* ─────────────────────────────────────────────
   SignalBadge
   ───────────────────────────────────────────── */

type SignalBadgeProps = {
  signal: string | null | undefined
  size?: BadgeSize
}

export function SignalBadge({ signal, size = 'sm' }: SignalBadgeProps) {
  if (!signal) return null
  const map: Record<string, { tone: BadgeTone; label: string }> = {
    MR:             { tone: 'blue',   label: 'MR' },
    TP:             { tone: 'green',  label: 'TP' },
    ZLE:            { tone: 'amber',  label: 'ZLE' },
    EMA:            { tone: 'purple', label: 'EMA' },
    TREND:           { tone: 'green',  label: 'Trend PB' },
    TREND_FOLLOWING: { tone: 'green',  label: 'Trend PB' },
    PULLBACK_EMA50:  { tone: 'green',  label: 'Trend PB' },
    TREND_PULLBACK:  { tone: 'green',  label: 'Trend PB' },
    TREND_ZLE05:     { tone: 'green',  label: 'Trend ZLE' },
    TREND_ZGT05:     { tone: 'amber',  label: 'TREND ZGT' },
    EMA_RECLAIM:     { tone: 'purple', label: 'EMA RECLAIM' },
    NEWS_FILTER:     { tone: 'purple', label: 'NEWS' },
    NO_SETUP:        { tone: 'ghost',  label: 'NO SETUP' },
  }
  const m = map[signal] ?? { tone: 'neutral' as BadgeTone, label: signal }
  return <Badge tone={m.tone} size={size}>{m.label}</Badge>
}

/* ─────────────────────────────────────────────
   Dot
   ───────────────────────────────────────────── */

type DotTone = 'green' | 'red' | 'amber' | 'muted' | 'purple' | 'blue'

type DotProps = {
  tone?: DotTone
  pulse?: boolean
}

export function Dot({ tone = 'green', pulse = false }: DotProps) {
  const toneMap: Record<DotTone, string> = {
    green:  'bg-green',
    red:    'bg-red',
    amber:  'bg-amber',
    muted:  'bg-muted',
    purple: 'bg-purple',
    blue:   'bg-blue',
  }
  return (
    <span className={cx('inline-block w-1.5 h-1.5 rounded-full', toneMap[tone], pulse && 'dot-live')} />
  )
}

/* ─────────────────────────────────────────────
   Progress
   ───────────────────────────────────────────── */

type ProgressTone = 'green' | 'red' | 'amber' | 'blue' | 'purple'

type ProgressProps = {
  value?: number
  tone?: ProgressTone
  height?: string
}

export function Progress({ value = 0, tone = 'green', height = 'h-1' }: ProgressProps) {
  const toneBg: Record<ProgressTone, string> = {
    green:  'bg-green',
    red:    'bg-red',
    amber:  'bg-amber',
    blue:   'bg-blue',
    purple: 'bg-purple',
  }
  return (
    <div className={cx('relative w-full rounded-full bg-white/[0.04] overflow-hidden', height)}>
      <div
        className={cx('h-full rounded-full', toneBg[tone])}
        style={{ width: Math.min(100, Math.max(0, value * 100)) + '%' }}
      />
    </div>
  )
}

/* ─────────────────────────────────────────────
   Sparkline
   ───────────────────────────────────────────── */

type SparklineProps = {
  data: number[]
  height?: number
  tone?: string   // 'auto' or any CSS color string
  width?: number
}

export function Sparkline({ data, height = 28, tone = 'auto', width = 120 }: SparklineProps) {
  if (!data?.length) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const pts = data.map((v, i): [number, number] => [
    (i / (data.length - 1)) * width,
    height - ((v - min) / range) * height,
  ])
  const isUp = data[data.length - 1] >= data[0]
  const stroke = tone === 'auto' ? (isUp ? '#00B386' : '#FF4444') : tone
  const fill = isUp ? 'rgba(0,179,134,0.12)' : 'rgba(255,68,68,0.12)'
  const d = pts.map(([x, y], i) => (i === 0 ? `M${x},${y}` : `L${x},${y}`)).join(' ')
  const area = `${d} L${width},${height} L0,${height} Z`
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block">
      <path d={area} fill={fill} />
      <path d={d} stroke={stroke} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
