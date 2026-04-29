'use client'

import { useEffect, useState } from 'react'
import type { NearMissEntry } from '@/lib/types'

interface Props {
  initialEntries?: NearMissEntry[]
}

const regimeBadge: Record<string, string> = {
  RANGING:        'text-green-400 bg-green-400/10 border-green-400/20',
  TRANSITION:     'text-amber-400 bg-amber-400/10 border-amber-400/20',
  HIGH_VOLATILITY:'text-red-400 bg-red-400/10 border-red-400/20',
  TRENDING:       'text-blue-400 bg-blue-400/10 border-blue-400/20',
}

const signalTypeBadge: Record<string, { cls: string; label: string }> = {
  MEAN_REVERSION: { cls: 'text-blue-400 bg-blue-500/10 border-blue-500/20',   label: 'MR'    },
  TREND_PULLBACK: { cls: 'text-green-400 bg-green-500/10 border-green-500/20', label: 'TREND' },
  TREND_ZLE05:    { cls: 'text-amber-400 bg-amber-500/10 border-amber-500/20', label: 'ZLE05' },
  EMA_RECLAIM:    { cls: 'text-purple-400 bg-purple-500/10 border-purple-500/20', label: 'EMA'  },
}

const blockedReasonLabel: Record<string, string> = {
  max_positions: 'Portfolio full',
  max_buys:      'Daily limit reached',
}

function SignalBadge({ type }: { type?: string | null }) {
  if (!type || !(type in signalTypeBadge)) return <span className="text-slate-600">—</span>
  const { cls, label } = signalTypeBadge[type]
  return (
    <span className={`px-1.5 py-0.5 rounded-full border text-xs ${cls}`}>
      {label}
    </span>
  )
}

export function NearMissWatchlist({ initialEntries = [] }: Props) {
  const [entries, setEntries] = useState<NearMissEntry[]>(initialEntries)

  async function fetchEntries() {
    try {
      const res = await fetch('/api/near-miss')
      if (!res.ok) return
      const data = await res.json() as NearMissEntry[]
      setEntries(data)
    } catch {
      // silently fail — non-critical
    }
  }

  useEffect(() => {
    fetchEntries()
    const interval = setInterval(fetchEntries, 60_000)
    return () => clearInterval(interval)
  }, [])

  const nearMiss    = entries.filter((e) => e.near_miss_type !== 'BLOCKED_BY_GATE')
  const blockedGate = entries.filter((e) => e.near_miss_type === 'BLOCKED_BY_GATE')

  return (
    <div className="bg-[#13131a] border border-[#1e1e2e] rounded-xl p-4 space-y-5">
      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
        Near-Miss Watchlist ({entries.length} active)
      </h2>

      {entries.length === 0 && (
        <p className="text-slate-600 text-sm py-4 text-center">No near-miss signals</p>
      )}

      {/* ── GROUP 1: Close to entry ── */}
      {nearMiss.length > 0 && (
        <div>
          <p className="text-xs text-slate-500 font-medium mb-2 uppercase tracking-wider">
            Close to entry ({nearMiss.length})
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-600 border-b border-[#1e1e2e]">
                  <th className="text-left pb-2 pr-3 font-medium">Symbol</th>
                  <th className="text-left pb-2 pr-3 font-medium">Type</th>
                  <th className="text-left pb-2 pr-3 font-medium w-32">Progress</th>
                  <th className="text-right pb-2 pr-3 font-medium">Z-Score</th>
                  <th className="text-left pb-2 pr-3 font-medium">Regime</th>
                  <th className="text-right pb-2 pr-3 font-medium">Cycles</th>
                  <th className="text-right pb-2 font-medium">News Boost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e1e2e]">
                {nearMiss.map((entry) => {
                  const zscore  = entry.latest_zscore ?? entry.initial_zscore
                  const fillPct = Math.min(Math.max((zscore / -1.5) * 100, 0), 100)
                  const isReady = zscore <= entry.effective_threshold
                  const isClose = entry.gap_to_threshold < 0.10
                  const regime  = entry.latest_regime ?? entry.initial_regime

                  const rowClass   = isReady ? 'bg-green-400/5' : isClose ? 'bg-amber-400/5' : ''
                  const zscoreColor = isReady ? 'text-green-400' : isClose ? 'text-amber-400' : 'text-slate-500'

                  return (
                    <tr key={entry.id} className={`${rowClass} transition-colors`}>
                      <td className="py-2 pr-3 font-semibold text-slate-200">{entry.symbol}</td>
                      <td className="py-2 pr-3"><SignalBadge type={entry.signal_type} /></td>
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-1.5">
                          <div className="flex-1 bg-[#0a0a0f] rounded-full h-1.5 w-24">
                            <div
                              className={`h-1.5 rounded-full ${fillPct >= 90 ? 'bg-green-500' : 'bg-blue-500'}`}
                              style={{ width: `${fillPct}%` }}
                            />
                          </div>
                          <span className="text-slate-600 w-8 text-right">{fillPct.toFixed(0)}%</span>
                        </div>
                      </td>
                      <td className={`py-2 pr-3 text-right font-mono ${zscoreColor}`}>{zscore.toFixed(3)}</td>
                      <td className="py-2 pr-3">
                        <span className={`px-1.5 py-0.5 rounded-full border text-xs ${regimeBadge[regime] ?? 'text-slate-400 border-slate-600/20'}`}>
                          {regime}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-right text-slate-400">{entry.monitoring_cycles}</td>
                      <td className="py-2 text-right">
                        {entry.news_boost_applied !== 0 ? (
                          <span className="text-green-400">+{entry.news_boost_applied.toFixed(2)}</span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── GROUP 2: Ready but blocked ── */}
      {blockedGate.length > 0 && (
        <div>
          <p className="text-xs text-amber-500/80 font-medium mb-2 uppercase tracking-wider">
            Ready but blocked ({blockedGate.length})
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-600 border-b border-[#1e1e2e]">
                  <th className="text-left pb-2 pr-3 font-medium">Symbol</th>
                  <th className="text-left pb-2 pr-3 font-medium">Type</th>
                  <th className="text-right pb-2 pr-3 font-medium">Z-Score</th>
                  <th className="text-right pb-2 pr-3 font-medium">Threshold</th>
                  <th className="text-left pb-2 font-medium">Blocked by</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e1e2e]">
                {blockedGate.map((entry) => {
                  const zscore = entry.latest_zscore ?? entry.initial_zscore
                  return (
                    <tr key={entry.id} className="bg-amber-400/5 transition-colors">
                      <td className="py-2 pr-3 font-semibold text-slate-200">{entry.symbol}</td>
                      <td className="py-2 pr-3"><SignalBadge type={entry.signal_type} /></td>
                      <td className="py-2 pr-3 text-right font-mono text-green-400">{zscore.toFixed(3)}</td>
                      <td className="py-2 pr-3 text-right font-mono text-slate-500">
                        {entry.effective_threshold.toFixed(2)}
                      </td>
                      <td className="py-2">
                        <span className="px-1.5 py-0.5 rounded border text-xs text-amber-400 bg-amber-500/10 border-amber-500/20">
                          {blockedReasonLabel[entry.blocked_reason ?? ''] ?? entry.blocked_reason ?? '—'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
