'use client'

import { useEffect, useState } from 'react'
import { Card, Badge } from './ui'

const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ')

interface RejectedEntry {
  symbol: string
  kind: 'TREND_ZGT05' | 'TREND_QUALITY_FAIL'
  reason: string
  z: number | null
  adx: number | null
  ts: string
}

export function RejectedSetups() {
  const [rows, setRows]       = useState<RejectedEntry[]>([])
  const [loading, setLoading] = useState(true)

  async function fetchRejected() {
    try {
      const res = await fetch('/api/rejected-today')
      if (!res.ok) return
      const data = await res.json() as RejectedEntry[]
      setRows(data)
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRejected()
    const interval = setInterval(fetchRejected, 60_000)
    return () => clearInterval(interval)
  }, [])

  return (
    <Card
      padded={false}
      label="Rejected Today · monitoring"
      right={
        <span className="text-[11px] text-muted">
          {rows.length} evaluated · 0 traded
        </span>
      }
    >
      {loading ? (
        <div className="px-5 pb-5 animate-pulse space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-10 bg-white/[0.04] rounded" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="px-5 pb-6 text-center text-sm text-muted">
          No trend rejections today
        </p>
      ) : (
        <div className="overflow-x-auto px-5 pb-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] tracking-[0.14em] uppercase text-muted border-b border-border">
                <th className="text-left font-medium py-2.5 pr-4">Symbol</th>
                <th className="text-left font-medium py-2.5 pr-4">Reject Type</th>
                <th className="text-left font-medium py-2.5 pr-4">Reason</th>
                <th className="text-right font-medium py-2.5 pr-4">Z-Score</th>
                <th className="text-right font-medium py-2.5">Last Eval</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r, i) => (
                <tr key={i} className="hover:bg-white/[0.02] transition">
                  <td className="py-3 pr-4 font-semibold">{r.symbol}</td>
                  <td className="py-3 pr-4">
                    <Badge tone="amber" size="xs">
                      {r.kind === 'TREND_ZGT05' ? 'Z>0.5' : 'QUALITY'}
                    </Badge>
                  </td>
                  <td className="py-3 pr-4 text-mute2 text-[12.5px]">{r.reason}</td>
                  <td className={cx(
                    'py-3 pr-4 text-right num',
                    r.z != null && Math.abs(r.z) > 0.5 ? 'text-amber' : 'text-mute2',
                  )}>
                    {r.z != null ? (r.z >= 0 ? '+' : '') + r.z.toFixed(2) : '—'}
                  </td>
                  <td className="py-3 text-right text-muted num text-[11px]">{r.ts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
