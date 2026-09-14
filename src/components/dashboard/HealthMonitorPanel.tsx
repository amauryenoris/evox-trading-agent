'use client'

import { useEffect, useState } from 'react'
import { Card } from './ui'
import type { PositionHealthSnapshot } from '@/lib/types'

interface HealthMonitorData {
  snapshots: PositionHealthSnapshot[]
  snapshotTimestamp: string | null
}

function fmtNum(n: number | null, dp = 2): string {
  return n === null ? '—' : n.toFixed(dp)
}

function fmtBucket(b: string | null): string {
  return b ?? '—'
}

function ComparisonRow({ label, entry, current }: { label: string; entry: string; current: string }) {
  return (
    <div className="grid grid-cols-[70px_1fr_1fr] items-center gap-2 text-[12px] py-1">
      <span className="text-[9.5px] uppercase tracking-wider text-muted">{label}</span>
      <span className="text-mute2">{entry}</span>
      <span className="font-semibold">{current}</span>
    </div>
  )
}

function PositionCard({ snapshot }: { snapshot: PositionHealthSnapshot }) {
  return (
    <Card padded={false}>
      <div className="flex items-baseline justify-between px-6 pt-5 pb-3">
        <span className="font-semibold text-sm">{snapshot.symbol}</span>
        <span className="text-[11px] text-muted num">
          {snapshot.current_price !== null ? `$${snapshot.current_price.toFixed(2)}` : '—'}
          {snapshot.days_since_entry !== null && (
            <span className="text-mute2"> · {snapshot.days_since_entry}d open</span>
          )}
        </span>
      </div>

      <div className="px-6 pb-5">
        <div className="grid grid-cols-[70px_1fr_1fr] gap-2 pb-1.5 mb-1 border-b border-border">
          <span />
          <span className="text-[9px] uppercase tracking-wider text-muted">Entry</span>
          <span className="text-[9px] uppercase tracking-wider text-muted">Current</span>
        </div>
        <ComparisonRow
          label="ADX"
          entry={fmtBucket(snapshot.entry_adx_bucket)}
          current={`${fmtBucket(snapshot.current_adx_bucket)} (${fmtNum(snapshot.current_adx, 1)})`}
        />
        <ComparisonRow
          label="MACD"
          entry={fmtBucket(snapshot.entry_macd_bucket)}
          current={`${fmtBucket(snapshot.current_macd_bucket)} (${fmtNum(snapshot.current_macd_histogram, 3)})`}
        />
        <ComparisonRow
          label="Z-Score"
          entry={fmtBucket(snapshot.entry_z_bucket)}
          current={`${fmtBucket(snapshot.current_z_bucket)} (${fmtNum(snapshot.current_z_score, 2)})`}
        />
        <ComparisonRow
          label="SPX"
          entry={fmtBucket(snapshot.entry_spx_regime)}
          current={fmtBucket(snapshot.current_spx_regime)}
        />
      </div>
    </Card>
  )
}

export function HealthMonitorPanel() {
  const [data, setData] = useState<HealthMonitorData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/health-monitor')
      .then((r) => r.json())
      .then((d: HealthMonitorData) => { setData(d); setLoading(false) })
      .catch((e) => { setError(String(e)); setLoading(false) })
  }, [])

  if (error) {
    return (
      <Card>
        <p className="text-xs text-red">Health Monitor data unavailable: {error}</p>
      </Card>
    )
  }

  if (loading || !data) {
    return (
      <Card padded={false}>
        <div className="animate-pulse px-6 py-5 space-y-3">
          <div className="h-24 bg-white/[0.04] rounded-lg" />
          <div className="h-24 bg-white/[0.04] rounded-lg" />
        </div>
      </Card>
    )
  }

  const { snapshots, snapshotTimestamp } = data

  if (snapshots.length === 0 || snapshotTimestamp === null) {
    return (
      <Card>
        <p className="text-xs text-muted">No health check data available.</p>
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      <div className="text-[11px] text-muted">
        Last checked: {new Date(snapshotTimestamp).toLocaleString('en-US')}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {snapshots.map((s) => (
          <PositionCard key={s.id} snapshot={s} />
        ))}
      </div>
    </div>
  )
}
