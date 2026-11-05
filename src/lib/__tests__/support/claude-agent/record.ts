import type { AgentCycleResult } from '../../../claude-agent'
import type { Call, World } from './world'

const ISO_TS = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g
const ORDER_FNS = new Set(['submitLimitOrder', 'submitStopOrder', 'submitStopLimitOrder', 'closePosition'])
const CONTEXT_FNS = new Set(['db.saveOpenPositionContext', 'db.updatePositionContext', 'db.updatePositionProtectiveStop', 'db.deleteOpenPositionContext'])
const NOISE_FNS = new Set(['agentLog.append', 'db.insertAgentLogEntry'])
const SAVED_INDICATOR_KEYS = ['effectiveThreshold', 'newsAdjustment', 'requestedQty', 'fillAttempts', 'state_fingerprint', 'spx_regime', 'tp_population_bucket', 'zle05_population_bucket']

function maskTimestamps(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(ISO_TS, '<ts>')
  if (Array.isArray(value)) return value.map(maskTimestamps)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, maskTimestamps(v)]))
  return value
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, sortKeys(v)]))
  }
  return value
}

function summarizeContextCall(call: Call) {
  const ctx = call.args.ctx as { symbol: string; buyPrice: number; quantity: number; signalType: unknown; stopOrderId: unknown; claudeReasoning: string; patternIdsUsed: string[]; indicators: Record<string, unknown> } | undefined
  if (!ctx) return { op: call.fn, ...call.args }
  const indicators = Object.fromEntries(SAVED_INDICATOR_KEYS.filter((k) => ctx.indicators[k] !== undefined).map((k) => [k, ctx.indicators[k]]))
  const learning = ctx.indicators.learningContext as { text?: string } | undefined
  const learningContext = learning ? { ...learning, text: `<${learning.text?.length ?? 0} chars>` } : null
  return {
    op: call.fn, symbol: ctx.symbol, buyPrice: ctx.buyPrice, quantity: ctx.quantity, signalType: ctx.signalType, stopOrderId: ctx.stopOrderId,
    claudeReasoning: ctx.claudeReasoning.slice(0, 60), patternIdsUsed: ctx.patternIdsUsed, indicators, learningContext,
  }
}

export function promptAt(world: World, nth = 0) {
  return world.prompts[nth] ?? null
}

export function claudeCallAt(world: World, nth = 0): Record<string, unknown> | null {
  return world.calls.filter((c) => c.fn === 'claude.create')[nth]?.args ?? null
}

export function buildRecord(world: World, result: AgentCycleResult) {
  const calls = world.calls
  const record = {
    marketOpen: result.marketOpen,
    decisions: result.decisions.map((d) => ({ symbol: d.symbol, action: d.decision.action, quantity: d.decision.quantity, orderExecuted: d.orderExecuted, error: d.error ?? null })),
    evaluations: result.evaluations.length,
    orders: calls.filter((c) => ORDER_FNS.has(c.fn)).map((c) => ({ symbol: c.args.symbol, side: c.args.side, qty: c.args.qty ?? null, type: c.args.type })),
    agentLog: calls.filter((c) => c.fn === 'agentLog.append' || c.fn === 'db.insertAgentLogEntry'),
    contexts: calls.filter((c) => CONTEXT_FNS.has(c.fn)).map(summarizeContextCall),
    callLog: calls.filter((c) => !NOISE_FNS.has(c.fn) && !c.fn.startsWith('db.save')).map((c) => `${c.fn} ${JSON.stringify(sortKeys(c.args))}`),
  }
  return JSON.stringify(sortKeys(maskTimestamps(record)), null, 2) + '\n'
}
