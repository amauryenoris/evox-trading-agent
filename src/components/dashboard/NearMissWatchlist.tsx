'use client'

import { useEffect, useState } from 'react'
import type { NearMissEntry } from '@/lib/types'
import { Card, Badge, Dot, Progress } from './ui'

const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ')

// ADAPTED: toSignalCode maps full signal_type to ui.tsx SignalBadge shortcodes
const toSignalCode = (s?: string | null) => s === 'MEAN_REVERSION' ? 'MR' : s

const blockedLabel: Record<string, string> = {
  max_positions: 'Portfolio full',
  max_buys:      'Daily limit reached',
  outranked:     'Outranked',
}

interface Props {
  initialEntries?: NearMissEntry[]
}

function NearMissItemCard({ entry }: { entry: NearMissEntry }) {
  const zscore    = entry.latest_zscore ?? entry.initial_zscore
  const zTarget   = entry.effective_threshold
  const regime    = entry.latest_regime ?? entry.initial_regime
  const isBlocked = entry.near_miss_type === 'BLOCKED_BY_GATE'

  // progress: how far z has moved toward threshold (both negative, so higher ratio = closer)
  const progress  = zTarget !== 0 ? Math.min(Math.max(zscore / zTarget, 0), 1) : 0
  const isReady   = zscore <= zTarget
  const statusTone = isBlocked ? 'amber' : isReady ? 'green' : 'amber'
  const statusLabel = isBlocked
    ? (blockedLabel[entry.blocked_reason ?? ''] ?? 'Blocked')
    : isReady ? 'READY' : 'WATCHING'

  const note = isBlocked
    ? `Signal threshold met · blocked by: ${blockedLabel[entry.blocked_reason ?? ''] ?? entry.blocked_reason ?? '—'}`
    : `${Math.abs(entry.gap_to_threshold).toFixed(3)} gap to entry · ${entry.monitoring_cycles} cycles`

  return (
    <div className="bg-surface2 border border-border rounded-lg p-3.5 hover:border-border2 transition">
      {/* top row */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2.5">
          <span className="font-semibold tracking-tight">{entry.symbol}</span>
          <Badge tone={statusTone} size="xs">{statusLabel}</Badge>
          {/* ADAPTED: SignalBadge replaces custom regime badge */}
          <span className="text-[10.5px] text-muted">· {regime}</span>
        </div>
        {/* ADAPTED: "day X" → "cycle X" because monitoring_cycles ≠ days */}
        <div className="text-[10.5px] text-muted num">cycle {entry.monitoring_cycles}</div>
      </div>

      {/* z-score progress bar */}
      <div className="flex items-center gap-3 mb-2">
        <div className="num text-[12px] tabular text-mute2">
          z <span className="text-text font-medium">{zscore.toFixed(2)}</span>
          <span className="opacity-60"> / {zTarget.toFixed(2)}</span>
        </div>
        <div className="flex-1">
          <Progress value={progress} tone={isReady ? 'green' : 'amber'} />
        </div>
        <div className="num text-[11px] text-mute2 w-10 text-right">{Math.round(progress * 100)}%</div>
      </div>

      {/* note */}
      <div className="text-[11px] text-muted">{note}</div>
    </div>
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
    <Card
      padded={false}
      label={`Near-Miss Watchlist · ${entries.length} tracked`}
      right={<button className="text-[11px] text-muted hover:text-text">Configure thresholds</button>}
    >
      <div className="px-5 pb-5 space-y-4">
        {entries.length === 0 && (
          <p className="py-6 text-center text-sm text-muted">No near-miss signals</p>
        )}

        {/* Group 1: approaching entry */}
        {nearMiss.length > 0 && (
          <div>
            {blockedGate.length > 0 && (
              <div className="text-[10px] tracking-[0.16em] uppercase text-muted mb-2">
                Close to entry ({nearMiss.length})
              </div>
            )}
            <div className="space-y-2.5">
              {nearMiss.map((e) => <NearMissItemCard key={e.id} entry={e} />)}
            </div>
          </div>
        )}

        {/* Group 2: ready but blocked */}
        {blockedGate.length > 0 && (
          <div>
            <div className="text-[10px] tracking-[0.16em] uppercase text-amber mb-2">
              Ready but blocked ({blockedGate.length})
            </div>
            <div className="space-y-2.5">
              {blockedGate.map((e) => <NearMissItemCard key={e.id} entry={e} />)}
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}
