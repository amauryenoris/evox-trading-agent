'use client'

import { useState } from 'react'
import { formatDate } from '@/lib/utils'
import type { AgentLogEntry } from '@/lib/types'

// ─── types ───────────────────────────────────────────────────
type CardType = 'BUY_EXECUTED' | 'SELL_EXECUTED' | 'HOLDING' | 'NO_SETUP' | 'TREND_REJECTED' | 'ALREADY_HOLDING'
type FilterType = 'ALL' | 'TRADES' | 'HOLDING' | 'REJECTED'

interface Props {
  entries: AgentLogEntry[]
  title?: string
}

// ─── classification ──────────────────────────────────────────
function classifyEntry(entry: AgentLogEntry): CardType {
  if (entry.orderExecuted && entry.decision.action === 'BUY') return 'BUY_EXECUTED'
  if (entry.decision.action === 'SELL') return 'SELL_EXECUTED'
  if (entry.error === 'exit_rules_check' || entry.error === 'exit_rules_skip') return 'HOLDING'
  if (entry.error?.includes('TREND_ZGT05') || entry.error?.includes('TREND_QUALITY_FAIL')) return 'TREND_REJECTED'
  if (entry.error?.toLowerCase().includes('already holding') || entry.error?.toLowerCase().includes('already_holding')) return 'ALREADY_HOLDING'
  return 'NO_SETUP'
}

const FILTER_INCLUDES: Record<FilterType, CardType[]> = {
  ALL:      ['BUY_EXECUTED', 'SELL_EXECUTED', 'HOLDING', 'NO_SETUP', 'TREND_REJECTED', 'ALREADY_HOLDING'],
  TRADES:   ['BUY_EXECUTED', 'SELL_EXECUTED'],
  HOLDING:  ['HOLDING'],
  REJECTED: ['TREND_REJECTED', 'NO_SETUP', 'ALREADY_HOLDING'],
}

// ─── card styling ─────────────────────────────────────────────
const CARD_STYLES: Record<CardType, { accent: string; badge: string; label: string }> = {
  BUY_EXECUTED:    { accent: 'border-l-green-500',  badge: 'bg-green-500/10 text-green-400 border-green-500/20',    label: 'BUY' },
  SELL_EXECUTED:   { accent: 'border-l-red-500',    badge: 'bg-red-500/10 text-red-400 border-red-500/20',          label: 'SELL' },
  HOLDING:         { accent: 'border-l-slate-600',  badge: 'bg-slate-700/50 text-slate-400 border-slate-600/20',    label: 'HOLDING' },
  NO_SETUP:        { accent: 'border-l-slate-700',  badge: 'bg-slate-800/50 text-slate-600 border-slate-700/20',    label: 'NO SETUP' },
  TREND_REJECTED:  { accent: 'border-l-amber-600',  badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20',    label: 'REJECTED' },
  ALREADY_HOLDING: { accent: 'border-l-indigo-700', badge: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20', label: 'IN PORTFOLIO' },
}

const SIGNAL_BADGE: Record<string, string> = {
  MEAN_REVERSION:  'bg-blue-500/10 text-blue-400 border-blue-500/20',
  TREND_PULLBACK:  'bg-green-500/10 text-green-400 border-green-500/20',
  TREND_ZLE05:     'bg-green-500/10 text-green-400 border-green-500/20',
  EMA_RECLAIM:     'bg-violet-500/10 text-violet-400 border-violet-500/20',
  TREND_FOLLOWING: 'bg-green-500/10 text-green-400 border-green-500/20',
  PULLBACK_EMA50:  'bg-green-500/10 text-green-400 border-green-500/20',
}

const SIGNAL_LABEL: Record<string, string> = {
  MEAN_REVERSION:  'MR',
  TREND_PULLBACK:  'TP',
  TREND_ZLE05:     'ZLE',
  EMA_RECLAIM:     'EMA',
  TREND_FOLLOWING: 'TREND',
  PULLBACK_EMA50:  'TREND',
}

// ─── cycle grouping ──────────────────────────────────────────
function cycleBucket(ts: string): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}`
}

function cycleLabel(ts: string): string {
  const d = new Date(ts)
  return (
    d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/New_York' }) +
    ' · ' +
    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' })
  )
}

// ─── component ───────────────────────────────────────────────
export function AgentReasoningLog({ entries, title = 'Agent Decisions' }: Props) {
  const [filter, setFilter]     = useState<FilterType>('ALL')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // counts for filter labels
  const counts = {
    all:      entries.length,
    trades:   entries.filter(e => { const t = classifyEntry(e); return t === 'BUY_EXECUTED' || t === 'SELL_EXECUTED' }).length,
    holding:  entries.filter(e => classifyEntry(e) === 'HOLDING').length,
    rejected: entries.filter(e => { const t = classifyEntry(e); return t === 'TREND_REJECTED' || t === 'NO_SETUP' || t === 'ALREADY_HOLDING' }).length,
  }

  const FILTER_LABELS: Record<FilterType, string> = {
    ALL:      `All (${counts.all})`,
    TRADES:   `Trades (${counts.trades})`,
    HOLDING:  `Holding (${counts.holding})`,
    REJECTED: `Rejected (${counts.rejected})`,
  }

  const allowed = FILTER_INCLUDES[filter]
  const filtered = entries
    .map(e => ({ entry: e, type: classifyEntry(e) }))
    .filter(({ type }) => allowed.includes(type))

  // group by cycle bucket (hour)
  const cycleMap = new Map<string, { label: string; items: typeof filtered }>()
  for (const item of filtered) {
    const bucket = cycleBucket(item.entry.timestamp)
    if (!cycleMap.has(bucket)) {
      cycleMap.set(bucket, { label: cycleLabel(item.entry.timestamp), items: [] })
    }
    cycleMap.get(bucket)!.items.push(item)
  }
  const cycles = Array.from(cycleMap.values())

  return (
    <div className="bg-[#13131a] border border-[#1e1e2e] rounded-xl p-4">
      {/* header */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">{title}</h2>
        <div className="flex gap-1">
          {(['ALL', 'TRADES', 'HOLDING', 'REJECTED'] as FilterType[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={[
                'text-xs px-2.5 py-1 rounded-lg font-medium transition-colors',
                filter === f
                  ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                  : 'text-slate-500 hover:text-slate-300 border border-transparent hover:border-slate-700',
              ].join(' ')}
            >
              {FILTER_LABELS[f]}
            </button>
          ))}
        </div>
      </div>

      {cycles.length === 0 ? (
        <p className="text-slate-600 text-sm py-8 text-center">
          {entries.length === 0 ? 'No analysis runs yet' : 'No entries match this filter'}
        </p>
      ) : (
        <div className="space-y-5 max-h-[640px] overflow-y-auto pr-1">
          {cycles.map(({ label, items }) => (
            <div key={label}>
              {/* cycle header */}
              <div className="flex items-center gap-3 mb-2">
                <span className="text-[11px] text-slate-600 font-mono shrink-0">{label}</span>
                <div className="flex-1 h-px bg-[#1e1e2e]" />
                <span className="text-[11px] text-slate-700 shrink-0">{items.length}</span>
              </div>

              <div className="space-y-1.5">
                {items.map(({ entry, type }) => {
                  const style      = CARD_STYLES[type]
                  const isOpen     = expanded.has(entry.id)
                  const signalType = entry.decision.signal_type as string | undefined
                  const isHolding  = type === 'HOLDING'

                  return (
                    <div
                      key={entry.id}
                      onClick={() => toggle(entry.id)}
                      className={[
                        'border border-[#1e1e2e] border-l-2 rounded-lg p-3 cursor-pointer',
                        'hover:border-slate-700 transition-colors',
                        style.accent,
                      ].join(' ')}
                    >
                      {/* top row */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <span className="font-semibold text-slate-100 text-sm shrink-0">{entry.symbol}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium border shrink-0 ${style.badge}`}>
                            {style.label}
                          </span>
                          {signalType && SIGNAL_BADGE[signalType] && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium border shrink-0 ${SIGNAL_BADGE[signalType]}`}>
                              {SIGNAL_LABEL[signalType] ?? signalType}
                            </span>
                          )}
                          {entry.orderExecuted && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 shrink-0">
                              EXECUTED
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] text-slate-600">{formatDate(entry.timestamp)}</span>
                          <span className="text-[10px] text-slate-700">{isOpen ? '▲' : '▼'}</span>
                        </div>
                      </div>

                      {/* compact metrics row (skip for HOLDING — no useful indicators) */}
                      {!isHolding && (
                        <div className="flex gap-3 text-[11px] text-slate-600 mt-1.5">
                          {entry.indicators.rsi != null && (
                            <span>RSI {entry.indicators.rsi.toFixed(1)}</span>
                          )}
                          {entry.indicators.kalman?.zScore != null && (
                            <span>Z {entry.indicators.kalman.zScore.toFixed(2)}</span>
                          )}
                          <span className={entry.decision.confidence >= 0.65 ? 'text-slate-400' : ''}>
                            {(entry.decision.confidence * 100).toFixed(0)}% conf
                          </span>
                          <span>P${entry.indicators.currentPrice.toFixed(2)}</span>
                        </div>
                      )}

                      {/* expanded: reasoning + error */}
                      {isOpen && (
                        <div className="mt-2 pt-2 border-t border-[#1e1e2e] space-y-1.5">
                          {entry.decision.reasoning && (
                            <p className="text-xs text-slate-400 leading-relaxed">
                              {entry.decision.reasoning}
                            </p>
                          )}
                          {entry.error &&
                            entry.error !== 'exit_rules_check' &&
                            entry.error !== 'exit_rules_skip' &&
                            !entry.error.startsWith('Pre-filter flags:') && (
                              <p className="text-xs text-amber-500/80 bg-amber-500/5 rounded px-2 py-1">
                                {entry.error}
                              </p>
                            )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
