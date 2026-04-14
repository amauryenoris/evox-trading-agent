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
  RANGING: 'text-green-400 bg-green-400/10 border-green-400/20',
  TRENDING: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  TRANSITION: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
  HIGH_VOLATILITY: 'text-red-400 bg-red-400/10 border-red-400/20',
}

const gateDotColors = {
  open: 'bg-green-400',
  warning: 'bg-amber-400',
  closed: 'bg-red-400',
}

export function SystemStatus() {
  const [data, setData] = useState<SystemStatusData | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function fetchStatus() {
    try {
      const res = await fetch('/api/system-status')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json() as SystemStatusData
      setData(json)
      setError(null)
    } catch (err) {
      setError(String(err))
    }
  }

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 60_000)
    return () => clearInterval(interval)
  }, [])

  if (error) {
    return (
      <div className="bg-[#13131a] border border-[#1e1e2e] rounded-xl p-4">
        <p className="text-xs text-red-400">System status unavailable: {error}</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="bg-[#13131a] border border-[#1e1e2e] rounded-xl p-4">
        <div className="animate-pulse flex gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex-1 h-16 bg-slate-800 rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  const positionColor = data.positionCount >= data.maxPositions ? 'text-red-400' : 'text-green-400'

  return (
    <div className="bg-[#13131a] border border-[#1e1e2e] rounded-xl p-4 space-y-3">
      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
        System Status
      </h2>

      {/* Row 1 — 4 metric cards */}
      <div className="grid grid-cols-4 gap-3">
        {/* Mode */}
        <div className="bg-[#0d0d14] border border-[#1e1e2e] rounded-lg p-3">
          <p className="text-xs text-slate-500 mb-1">Mode</p>
          <p className={`text-sm font-bold ${data.mode === 'LEARN' ? 'text-green-400' : 'text-amber-400'}`}>
            {data.mode}
          </p>
        </div>

        {/* Market Regime */}
        <div className="bg-[#0d0d14] border border-[#1e1e2e] rounded-lg p-3">
          <p className="text-xs text-slate-500 mb-1">Market Regime</p>
          {data.marketRegime ? (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${regimeColors[data.marketRegime] ?? 'text-slate-400 bg-slate-700/50 border-slate-600/20'}`}>
              {data.marketRegime}
            </span>
          ) : (
            <p className="text-sm text-slate-600">—</p>
          )}
        </div>

        {/* Z-Score Threshold */}
        <div className="bg-[#0d0d14] border border-[#1e1e2e] rounded-lg p-3">
          <p className="text-xs text-slate-500 mb-1">Z-Score Threshold</p>
          <p className="text-sm font-bold text-slate-200">{data.zScoreThreshold.toFixed(2)}</p>
        </div>

        {/* Positions */}
        <div className="bg-[#0d0d14] border border-[#1e1e2e] rounded-lg p-3">
          <p className="text-xs text-slate-500 mb-1">Positions</p>
          <p className={`text-sm font-bold ${positionColor}`}>
            {data.positionCount} / {data.maxPositions}
          </p>
        </div>
      </div>

      {/* Row 2 — Gates status bar */}
      <div className="flex items-center gap-4 bg-[#0d0d14] border border-[#1e1e2e] rounded-lg px-4 py-2.5">
        <span className="text-xs text-slate-500 font-medium w-10">Gates</span>
        <div className="flex items-center gap-6">
          {/* Liquidity gate — static (no live data without running cycle) */}
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-slate-600 shrink-0" />
            <span className="text-xs text-slate-500">Liquidity</span>
          </div>

          {/* Trading hours */}
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full shrink-0 ${gateDotColors[data.gates.hours.status]}`} />
            <span className="text-xs text-slate-400">{data.gates.hours.label}</span>
          </div>

          {/* Overtrading */}
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full shrink-0 ${gateDotColors[data.gates.overtrading.status]}`} />
            <span className="text-xs text-slate-400">{data.gates.overtrading.label}</span>
          </div>

          {/* Positions / portfolio */}
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full shrink-0 ${gateDotColors[data.gates.positions.status]}`} />
            <span className="text-xs text-slate-400">{data.gates.positions.label}</span>
          </div>
        </div>

        {data.lastRun && (
          <span className="ml-auto text-xs text-slate-600">
            Last run: {new Date(data.lastRun).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>
    </div>
  )
}
