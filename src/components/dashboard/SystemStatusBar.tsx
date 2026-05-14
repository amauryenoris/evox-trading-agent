'use client'

import { useEffect, useState } from 'react'

interface GateStatus {
  status: 'open' | 'warning' | 'closed'
  label: string
}

interface SystemStatusData {
  mode: 'LEARN' | 'STRICT'
  marketRegime: string | null
  zScoreThreshold: number
  positionCount: number
  maxPositions: number
  lastRun: string | null
  gates: {
    hours: GateStatus
    overtrading: GateStatus
    positions: GateStatus
  }
}

const TONE: Record<string, string> = {
  green:  'text-[#00B386]',
  red:    'text-[#FF4444]',
  amber:  'text-amber-400',
  purple: 'text-[#A78BFA]',
  blue:   'text-blue-400',
  muted:  'text-slate-400',
}

function Item({ label, value, tone = 'muted' }: { label: string; value: string; tone?: keyof typeof TONE }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="text-slate-500 tracking-wider uppercase">{label}</span>
      <span className={`font-mono tabular-nums font-semibold ${TONE[tone] ?? 'text-slate-200'}`}>{value}</span>
    </span>
  )
}

const Sep = ({ className = '' }: { className?: string }) => (
  <span className={`text-[#272739] select-none ${className}`}>·</span>
)

function GateDot({ status }: { status: 'open' | 'warning' | 'closed' }) {
  const color = { open: 'bg-[#00B386]', warning: 'bg-amber-500', closed: 'bg-[#FF4444]' }[status]
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${color}`} />
}

export function SystemStatusBar() {
  const [data, setData] = useState<SystemStatusData | null>(null)

  useEffect(() => {
    async function fetchStatus() {
      try {
        const res = await fetch('/api/system-status')
        if (!res.ok) return
        setData(await res.json() as SystemStatusData)
      } catch {
        // non-critical — fail silently
      }
    }
    fetchStatus()
    const id = setInterval(fetchStatus, 60_000)
    return () => clearInterval(id)
  }, [])

  if (!data) {
    return (
      <div className="flex items-center gap-4 py-2 animate-pulse">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-2.5 w-14 bg-slate-800 rounded" />
        ))}
      </div>
    )
  }

  const isHV = data.marketRegime?.includes('HIGH') || data.marketRegime?.includes('VOLATILITY')
  const regimeTone: keyof typeof TONE = isHV ? 'red' : 'amber'
  const marketOpen = data.gates.hours.status === 'open'
  const lastRunLabel = data.lastRun
    ? new Date(data.lastRun).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    : '—'

  return (
    <div className="flex items-center flex-wrap gap-x-5 gap-y-1 py-2 text-[10.5px] overflow-x-auto">
      <Item label="Mode"        value={data.mode}                                       tone="purple" />
      <Sep />
      <Item label="Regime"      value={data.marketRegime ?? '—'}                        tone={regimeTone} />
      <Sep />
      <Item label="Z-Threshold" value={data.zScoreThreshold.toFixed(2)}                 tone="amber" />
      <Sep />
      <Item label="Positions"   value={`${data.positionCount}/${data.maxPositions}`}    tone="green" />
      <Sep />

      {/* gate dots */}
      <span className="inline-flex items-center gap-2">
        <span className="text-slate-500 tracking-wider uppercase">Gates</span>
        <span className="inline-flex items-center gap-1.5">
          <GateDot status={data.gates.hours.status} />
          <GateDot status={data.gates.overtrading.status} />
          <GateDot status={data.gates.positions.status} />
        </span>
      </span>
      <Sep />

      <Item label="Market" value={marketOpen ? 'OPEN' : 'CLOSED'} tone={marketOpen ? 'green' : 'red'} />

      <Sep className="ml-auto" />
      <span className="text-slate-500 font-mono tabular-nums">
        Last run · <span className="text-slate-400">{lastRunLabel}</span>
      </span>
    </div>
  )
}
