'use client'

import { useEffect, useState } from 'react'
import type { NewsEvent } from '@/lib/types'
import { ZSCORE_ENTRY_THRESHOLD } from '@/lib/config'
import { Card, Badge, Dot } from './ui'
import type { BadgeTone } from './ui'

const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ')

interface Props {
  initialEvents?: NewsEvent[]
}

function timeUntilExpiry(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now()
  if (diff <= 0) return 'expired'
  const hours   = Math.floor(diff / 3_600_000)
  const minutes = Math.floor((diff % 3_600_000) / 60_000)
  return hours > 0 ? `expires in ${hours}h` : `expires in ${minutes}m`
}

export function NewsIntelligence({ initialEvents = [] }: Props) {
  const [events, setEvents]     = useState<NewsEvent[]>(initialEvents)
  const [loadError, setError]   = useState<string | null>(null)

  async function fetchEvents() {
    try {
      const res = await fetch('/api/news-events')
      if (!res.ok) {
        if (res.status === 500) { setError('coming-soon'); return }
        throw new Error(`HTTP ${res.status}`)
      }
      const data = await res.json() as NewsEvent[]
      setEvents(data)
      setError(null)
    } catch {
      setError('error')
    }
  }

  useEffect(() => {
    fetchEvents()
    const interval = setInterval(fetchEvents, 5 * 60_000)
    return () => clearInterval(interval)
  }, [])

  if (loadError === 'coming-soon') {
    return (
      <Card label="News Intelligence">
        <p className="py-4 text-center text-xs text-muted">News intelligence coming soon</p>
      </Card>
    )
  }

  if (events.length === 0) {
    return (
      <Card label="News Intelligence">
        <p className="py-4 text-center text-xs text-muted">No active news events</p>
      </Card>
    )
  }

  // Aggregate sentiment distribution
  const bull  = events.filter((e) => e.sentiment === 'BULLISH').length
  const bear  = events.filter((e) => e.sentiment === 'BEARISH').length
  const neut  = events.filter((e) => e.sentiment === 'NEUTRAL').length
  // Net adjustment as sum of threshold_adjustment values, capped for display
  const net   = events.reduce((s, e) => s + (e.threshold_adjustment ?? 0), 0)
  const netSign = net >= 0 ? '+' : ''
  const verdict = net > 0.05 ? 'BULLISH' : net < -0.05 ? 'BEARISH' : 'NEUTRAL'
  const verdictTone: BadgeTone = net > 0.05 ? 'green' : net < -0.05 ? 'red' : 'amber'

  const sentToneText: Record<string, string> = {
    BULLISH: 'text-green', BEARISH: 'text-red', NEUTRAL: 'text-amber',
  }
  const sentDot: Record<string, 'green' | 'red' | 'amber'> = {
    BULLISH: 'green', BEARISH: 'red', NEUTRAL: 'amber',
  }
  const impactTone: Record<string, BadgeTone> = {
    HIGH: 'red', MEDIUM: 'amber', LOW: 'ghost',
  }

  return (
    <Card padded={false}>
      {/* Header: title + net adjustment verdict */}
      <div className="flex items-baseline justify-between px-5 pt-4 pb-3 border-b border-border">
        <div className="text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">
          News Intelligence · {events.length} active
        </div>
        <div className="flex items-center gap-3 text-[10.5px]">
          <span className="text-muted">
            net <span className={cx('num font-semibold', sentToneText[verdict])}>
              {netSign}{net.toFixed(2)}
            </span>
          </span>
          <Badge tone={verdictTone} size="xs">{verdict}</Badge>
        </div>
      </div>

      {/* Sentiment distribution bar */}
      <div className="px-5 pt-3 pb-2 flex items-center gap-1.5">
        <div className="flex-1 h-1 rounded-full overflow-hidden bg-white/[0.04] flex">
          <div className="h-full bg-green" style={{ width: `${(bull / events.length) * 100}%` }} />
          <div className="h-full bg-amber" style={{ width: `${(neut / events.length) * 100}%` }} />
          <div className="h-full bg-red"   style={{ width: `${(bear / events.length) * 100}%` }} />
        </div>
        <div className="text-[10px] num text-muted tracking-wider">
          <span className="text-green">{bull}</span>
          {' · '}
          <span className="text-amber">{neut}</span>
          {' · '}
          <span className="text-red">{bear}</span>
        </div>
      </div>

      {/* Event list */}
      <div className="max-h-[460px] overflow-y-auto px-2 pb-2">
        {events.map((n, i) => (
          <div
            key={n.id ?? i}
            className="mx-3 my-1 px-3 py-3 rounded-lg hover:bg-white/[0.02] transition border border-transparent hover:border-border"
          >
            <div className="flex items-start gap-3">
              <span className="mt-1.5">
                <Dot tone={sentDot[n.sentiment] ?? 'muted'} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium leading-snug text-text/95 mb-2">
                  {n.headline}
                </div>
                <div className="flex items-center flex-wrap gap-x-3 gap-y-1.5 text-[10.5px]">
                  <Badge tone={n.scope === 'MACRO' ? 'blue' : 'purple'} size="xs">
                    {n.scope}{n.symbol ? ` · ${n.symbol}` : ''}
                  </Badge>
                  <span className={cx('font-semibold tracking-[0.1em]', sentToneText[n.sentiment])}>
                    {n.sentiment}
                  </span>
                  {/* ADAPTED: threshold_adjustment shows as delta from base threshold */}
                  {n.threshold_adjustment !== 0 && (
                    <span className="num text-muted">
                      threshold{' '}
                      <span className={n.sentiment === 'BULLISH' ? 'text-green' : 'text-red'}>
                        {ZSCORE_ENTRY_THRESHOLD.toFixed(2)} → {(ZSCORE_ENTRY_THRESHOLD + n.threshold_adjustment).toFixed(2)}
                      </span>
                    </span>
                  )}
                  {n.expires_at && (
                    <span className="text-muted">{timeUntilExpiry(n.expires_at)}</span>
                  )}
                </div>
              </div>
              <Badge tone={impactTone[n.impact] ?? 'neutral'} size="xs">{n.impact}</Badge>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
