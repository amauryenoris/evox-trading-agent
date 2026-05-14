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

const regimeColors: Record<string, string> = {
  RANGING:         'text-green-400 bg-green-400/10 border-green-400/20',
  TRENDING:        'text-blue-400 bg-blue-400/10 border-blue-400/20',
  TRANSITION:      'text-amber-400 bg-amber-400/10 border-amber-400/20',
  HIGH_VOLATILITY: 'text-red-400 bg-red-400/10 border-red-400/20',
}

const gateDotColors = {
  open:    'bg-green-400',
  warning: 'bg-amber-400',
  closed:  'bg-red-400',
}

function Divider() {
  return <span className="w-px h-3.5 bg-[#1e1e2e] shrink-0" />
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
        // silently skip — bar is non-critical
      }
    }
    fetchStatus()
    const id = setInterval(fetchStatus, 60_000)
    return () => clearInterval(id)
  }, [])

  if (!data) {
    return (
      <div className="flex items-center gap-3 animate-pulse">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-3 w-16 bg-slate-800 rounded" />
        ))}
      </div>
    )
  }

  const positionColor =
    data.positionCount >= data.maxPositions ? 'text-red-400' :
    data.positionCount >= data.maxPositions - 1 ? 'text-amber-400' :
    'text-green-400'

  return (
    <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
      {/* Mode */}
      <span className={data.mode === 'LEARN' ? 'text-green-400 font-medium' : 'text-amber-400 font-medium'}>
        {data.mode}
      </span>

      <Divider />

      {/* Market Regime */}
      {data.marketRegime ? (
        <span className={`px-1.5 py-0.5 rounded-full font-medium border text-[10px] ${regimeColors[data.marketRegime] ?? 'text-slate-400 bg-slate-700/50 border-slate-600/20'}`}>
          {data.marketRegime}
        </span>
      ) : (
        <span>Regime —</span>
      )}

      <Divider />

      {/* Z-Score threshold */}
      <span>Z ≤ {data.zScoreThreshold.toFixed(2)}</span>

      <Divider />

      {/* Positions */}
      <span>
        Pos <span className={positionColor}>{data.positionCount}/{data.maxPositions}</span>
      </span>

      <Divider />

      {/* Gates */}
      <div className="flex items-center gap-2">
        {[data.gates.hours, data.gates.overtrading, data.gates.positions].map((gate, i) => (
          <span key={i} title={gate.label} className="flex items-center gap-1">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${gateDotColors[gate.status]}`} />
          </span>
        ))}
        <span className="text-slate-600">gates</span>
      </div>

      {/* Last run */}
      {data.lastRun && (
        <>
          <Divider />
          <span className="text-slate-600">
            Last run {new Date(data.lastRun).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </>
      )}
    </div>
  )
}
