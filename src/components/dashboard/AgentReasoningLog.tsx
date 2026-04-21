import { formatDate } from '@/lib/utils'
import type { AgentLogEntry, PreFilterFlag } from '@/lib/types'

interface Props {
  entries: AgentLogEntry[]
}

const actionColors = {
  BUY: 'bg-green-400/10 text-green-400 border-green-400/20',
  SELL: 'bg-red-400/10 text-red-400 border-red-400/20',
  HOLD: 'bg-slate-700/50 text-slate-400 border-slate-600/20',
}

const signalTypeBadge: Record<string, string> = {
  MEAN_REVERSION: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  TREND_FOLLOWING: 'bg-green-500/10 text-green-400 border-green-500/20',
  PULLBACK_EMA50: 'bg-green-500/10 text-green-400 border-green-500/20',
  OTHER: 'bg-slate-700/50 text-slate-500 border-slate-600/20',
  NO_SETUP: 'bg-slate-700/30 text-slate-600 border-slate-700/20',
}

const signalTypeLabel: Record<string, string> = {
  MEAN_REVERSION: 'MR',
  TREND_FOLLOWING: 'TREND',
  PULLBACK_EMA50: 'TREND',
  OTHER: 'OTHER',
}

function parsePreFilterFlags(error?: string): PreFilterFlag[] | null {
  if (!error) return null
  const match = error.match(/^Pre-filter flags: (.+)$/)
  if (!match) return null
  try {
    return JSON.parse(match[1]) as PreFilterFlag[]
  } catch {
    return null
  }
}

function hasPreFilterFlags(error?: string): boolean {
  return !!error && error.startsWith('Pre-filter flags:')
}

export function AgentReasoningLog({ entries }: Props) {
  return (
    <div className="bg-[#13131a] border border-[#1e1e2e] rounded-xl p-4">
      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
        Agent Decisions
      </h2>
      {entries.length === 0 ? (
        <p className="text-slate-600 text-sm py-6 text-center">No analysis runs yet</p>
      ) : (
        <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
          {entries.map((entry) => {
            const preFilterFlags = parsePreFilterFlags(entry.error)
            const isPreFilterOnly = hasPreFilterFlags(entry.error)
            const hasExecutionError = entry.error && !isPreFilterOnly
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const ind = entry.indicators as any
            const nearMissScore: number | undefined = ind?.near_miss_score
            const whatWouldTrigger: string | undefined = ind?.what_would_trigger
            const hasLearning = nearMissScore !== undefined

            return (
              <div
                key={entry.id}
                className="border border-[#1e1e2e] rounded-lg p-3 hover:border-slate-700 transition-colors"
              >
                {/* Header row */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-100 text-sm">{entry.symbol}</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium border ${actionColors[entry.decision.action]}`}
                    >
                      {entry.decision.action}
                    </span>
                    {entry.decision.signal_type && entry.decision.signal_type in signalTypeBadge ? (
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium border ${signalTypeBadge[entry.decision.signal_type]}`}>
                        {signalTypeLabel[entry.decision.signal_type] ?? entry.decision.signal_type}
                      </span>
                    ) : entry.decision.action === 'HOLD' && !entry.orderExecuted ? (
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium border ${signalTypeBadge['NO_SETUP']}`}>
                        NO_SETUP
                      </span>
                    ) : null}
                    {entry.orderExecuted && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/20">
                        EXECUTED
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-slate-600">{formatDate(entry.timestamp)}</span>
                </div>

                {/* Confidence bar */}
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs text-slate-500 w-16">Confidence</span>
                  <div className="flex-1 bg-[#0a0a0f] rounded-full h-1.5">
                    <div
                      className="h-1.5 rounded-full bg-indigo-500"
                      style={{ width: `${(entry.decision.confidence * 100).toFixed(0)}%` }}
                    />
                  </div>
                  <span className="text-xs text-slate-400 w-10 text-right">
                    {(entry.decision.confidence * 100).toFixed(0)}%
                  </span>
                </div>

                {/* Technical snapshot */}
                <div className="flex gap-3 text-xs text-slate-500 mb-2">
                  <span>RSI {entry.indicators.rsi?.toFixed(1) ?? '—'}</span>
                  <span>MACD {entry.indicators.macd?.histogram.toFixed(3) ?? '—'}</span>
                  <span>%B {entry.indicators.bollingerBands?.percentB.toFixed(2) ?? '—'}</span>
                  {(entry.decision.signal_type === 'TREND_FOLLOWING' || entry.decision.signal_type === 'PULLBACK_EMA50') && entry.indicators.ema50 && (
                    <span>EMA50 ${entry.indicators.ema50.toFixed(2)}</span>
                  )}
                  <span>P${entry.indicators.currentPrice.toFixed(2)}</span>
                </div>

                {/* Claude reasoning */}
                <p className="text-xs text-slate-400 leading-relaxed">
                  {entry.decision.reasoning || 'Analysis pending'}
                </p>

                {/* Execution error (gate blocks, etc.) */}
                {hasExecutionError && (
                  <p className="text-xs text-amber-500 mt-1.5 bg-amber-500/5 rounded px-2 py-1">
                    {entry.error}
                  </p>
                )}

                {/* Setup context (secondary info — muted) */}
                {preFilterFlags && preFilterFlags.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-dashed border-slate-700/50">
                    <p className="text-xs text-slate-600 font-medium mb-1">Setup context</p>
                    <div className="space-y-0.5">
                      {preFilterFlags.map((flag, i) => (
                        <p key={i} className="text-xs text-slate-600">
                          {flag.detail}{flag.gap > 0 ? ` (gap: ${flag.gap.toFixed(3)})` : ''}
                        </p>
                      ))}
                    </div>

                    {/* Learning section */}
                    {hasLearning && (
                      <div className="mt-1.5 flex items-center gap-3 text-xs text-slate-600">
                        <span>Near-miss: <span className="text-slate-500">{nearMissScore}/10</span></span>
                        {whatWouldTrigger && (
                          <span>Trigger: <span className="text-slate-500">{whatWouldTrigger}</span></span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
