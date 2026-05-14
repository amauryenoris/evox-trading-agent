'use client'

/**
 * SystemStatusBar — thin metadata strip for header Row 2.
 *
 * Replaces the card-style <SystemStatus /> when placed inside the sticky
 * header. Pass in the same shape your existing endpoint returns, or wire it
 * up to your own data fetch.
 */

import type { ReactNode } from 'react'

type Props = {
  mode?: string
  regime?: string
  zThreshold?: number
  positionsUsed?: number
  positionsMax?: number
  buysToday?: number
  buysMax?: number
  liquidity?: string
  liquidityOk?: boolean
  marketState?: 'OPEN' | 'CLOSED' | 'PRE' | 'POST'
  buyBudget?: number
  lastRun?: string
}

const toneText: Record<string, string> = {
  green:  'text-[#00B386]',
  red:    'text-[#FF4444]',
  amber:  'text-amber-400',
  purple: 'text-[#A78BFA]',
  blue:   'text-blue-400',
  muted:  'text-slate-400',
}

function Item({
  label,
  value,
  tone = 'muted',
}: {
  label: string
  value: ReactNode
  tone?: keyof typeof toneText
}) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="text-slate-500 tracking-wider uppercase">{label}</span>
      <span className={`font-mono tabular-nums font-semibold ${toneText[tone] ?? 'text-slate-200'}`}>
        {value}
      </span>
    </span>
  )
}

const Sep = ({ className = '' }: { className?: string }) => (
  <span className={`text-[#272739] select-none ${className}`}>·</span>
)

export function SystemStatusBar({
  mode = 'LEARN',
  regime = 'HIGH_VOLATILITY',
  zThreshold = -1.30,
  positionsUsed = 0,
  positionsMax = 5,
  buysToday = 0,
  buysMax = 5,
  liquidity = 'SIP',
  liquidityOk = true,
  marketState = 'CLOSED',
  buyBudget,
  lastRun,
}: Props) {
  return (
    <div className="flex items-center flex-wrap gap-x-5 gap-y-1 py-2 text-[10.5px] overflow-x-auto">
      <Item label="Mode"        value={mode}                                  tone="purple" />
      <Sep />
      <Item label="Regime"      value={regime}                                tone={regime.includes('HIGH') ? 'red' : 'amber'} />
      <Sep />
      <Item label="Z-Threshold" value={zThreshold.toFixed(2)}                 tone="amber" />
      <Sep />
      <Item label="Positions"   value={`${positionsUsed}/${positionsMax}`}    tone="green" />
      <Sep />
      <Item label="Buys Today"  value={`${buysToday}/${buysMax}`}             tone="muted" />
      <Sep />
      <Item label="Liquidity"   value={liquidity}                             tone={liquidityOk ? 'green' : 'red'} />
      <Sep />
      <Item label="Market"      value={marketState}                           tone={marketState === 'OPEN' ? 'green' : 'red'} />
      {buyBudget != null && (
        <>
          <Sep />
          <Item
            label="Buy Budget"
            value={'$' + buyBudget.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            tone="muted"
          />
        </>
      )}
      <Sep className="ml-auto" />
      <span className="text-slate-500 font-mono tabular-nums">
        Last run · <span className="text-slate-400">{lastRun ?? '—'}</span>
      </span>
    </div>
  )
}
