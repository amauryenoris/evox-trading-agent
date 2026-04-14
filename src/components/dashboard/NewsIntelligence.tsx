'use client'

import { useEffect, useState } from 'react'
import type { NewsEvent } from '@/lib/types'

interface Props {
  initialEvents?: NewsEvent[]
}

const sentimentDot: Record<string, string> = {
  BULLISH: 'bg-green-400',
  NEUTRAL: 'bg-amber-400',
  BEARISH: 'bg-red-400',
}

const impactBadge: Record<string, string> = {
  HIGH: 'bg-red-500/20 text-red-400 border-red-500/20',
  MEDIUM: 'bg-amber-500/20 text-amber-400 border-amber-500/20',
  LOW: 'bg-slate-700/50 text-slate-400 border-slate-600/20',
}

const scopeBadge: Record<string, string> = {
  MACRO: 'bg-blue-500/20 text-blue-400 border-blue-500/20',
  SYMBOL: 'bg-slate-700/50 text-slate-400 border-slate-600/20',
}

function timeUntilExpiry(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now()
  if (diff <= 0) return 'expired'
  const hours = Math.floor(diff / 3_600_000)
  const minutes = Math.floor((diff % 3_600_000) / 60_000)
  if (hours > 0) return `expires in ${hours}h`
  return `expires in ${minutes}m`
}

export function NewsIntelligence({ initialEvents = [] }: Props) {
  const [events, setEvents] = useState<NewsEvent[]>(initialEvents)
  const [loadError, setLoadError] = useState<string | null>(null)

  async function fetchEvents() {
    try {
      const res = await fetch('/api/news-events')
      if (!res.ok) {
        if (res.status === 500) {
          setLoadError('coming-soon')
          return
        }
        throw new Error(`HTTP ${res.status}`)
      }
      const data = await res.json() as NewsEvent[]
      setEvents(data)
      setLoadError(null)
    } catch {
      setLoadError('error')
    }
  }

  useEffect(() => {
    fetchEvents()
    const interval = setInterval(fetchEvents, 5 * 60_000)
    return () => clearInterval(interval)
  }, [])

  if (loadError === 'coming-soon') {
    return (
      <div className="bg-[#13131a] border border-[#1e1e2e] rounded-xl p-4">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">
          News Intelligence
        </h2>
        <p className="text-xs text-slate-600 py-4 text-center">News intelligence coming soon</p>
      </div>
    )
  }

  if (events.length === 0) {
    return (
      <div className="bg-[#13131a] border border-[#1e1e2e] rounded-xl p-4">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">
          News Intelligence
        </h2>
        <p className="text-xs text-slate-600 py-4 text-center">No active news events</p>
      </div>
    )
  }

  return (
    <div className="bg-[#13131a] border border-[#1e1e2e] rounded-xl p-4">
      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
        News Intelligence ({events.length} active)
      </h2>

      <div className="space-y-2">
        {events.map((event, i) => {
          const adjColor = event.threshold_adjustment < 0
            ? 'text-green-400'
            : event.threshold_adjustment > 0
              ? 'text-red-400'
              : null

          return (
            <div
              key={event.id ?? i}
              className="flex items-start gap-3 border border-[#1e1e2e] rounded-lg p-2.5 hover:border-slate-700 transition-colors"
            >
              {/* Sentiment dot */}
              <div className="mt-1 shrink-0">
                <span className={`block w-2 h-2 rounded-full ${sentimentDot[event.sentiment] ?? 'bg-slate-600'}`} />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-200 leading-snug mb-1 truncate">
                  {event.headline}
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs px-1.5 py-0.5 rounded-full border ${scopeBadge[event.scope]}`}>
                    {event.scope}
                  </span>
                  {event.scope === 'SYMBOL' && event.symbol && (
                    <span className="text-xs text-slate-500 font-mono">{event.symbol}</span>
                  )}
                  <span className="text-xs text-slate-500">{event.sentiment} {event.impact}</span>
                  {event.threshold_adjustment !== 0 && adjColor && (
                    <span className={`text-xs ${adjColor}`}>
                      threshold -1.5 → {(-1.5 + event.threshold_adjustment).toFixed(2)}
                    </span>
                  )}
                  {event.expires_at && (
                    <span className="text-xs text-slate-600">{timeUntilExpiry(event.expires_at)}</span>
                  )}
                </div>
              </div>

              {/* Impact badge */}
              <div className="shrink-0">
                <span className={`text-xs px-1.5 py-0.5 rounded border ${impactBadge[event.impact]}`}>
                  {event.impact}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
