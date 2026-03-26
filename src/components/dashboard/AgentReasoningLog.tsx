import { formatDate } from '@/lib/utils'
import type { AgentLogEntry } from '@/lib/types'

interface Props {
  entries: AgentLogEntry[]
}

const actionColors = {
  BUY: 'bg-green-400/10 text-green-400 border-green-400/20',
  SELL: 'bg-red-400/10 text-red-400 border-red-400/20',
  HOLD: 'bg-slate-700/50 text-slate-400 border-slate-600/20',
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
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="border border-[#1e1e2e] rounded-lg p-3 hover:border-slate-700 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-100 text-sm">{entry.symbol}</span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium border ${actionColors[entry.decision.action]}`}
                  >
                    {entry.decision.action}
                  </span>
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

              {/* RSI / MACD snapshot */}
              <div className="flex gap-3 text-xs text-slate-500 mb-2">
                <span>RSI {entry.indicators.rsi?.toFixed(1) ?? '—'}</span>
                <span>MACD {entry.indicators.macd?.histogram.toFixed(3) ?? '—'}</span>
                <span>%B {entry.indicators.bollingerBands?.percentB.toFixed(2) ?? '—'}</span>
                <span>P${entry.indicators.currentPrice.toFixed(2)}</span>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed">{entry.decision.reasoning}</p>

              {entry.error && (
                <p className="text-xs text-amber-500 mt-1.5 bg-amber-500/5 rounded px-2 py-1">
                  {entry.error}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
