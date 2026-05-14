'use client'

import { useMemo, useState, type ReactNode } from 'react'
import type { AgentLogEntry } from '@/lib/types'

/* ── entry classification ─────────────────────────────────── */

type EntryKind =
  | 'BUY_EXECUTED'
  | 'SELL_EXECUTED'
  | 'HOLDING'
  | 'NO_SETUP'
  | 'TREND_REJECTED'
  | 'ALREADY_HOLDING'
  | 'OTHER'

function detectKind(entry: AgentLogEntry): EntryKind {
  if (entry.orderExecuted && entry.decision.action === 'BUY') return 'BUY_EXECUTED'
  if (entry.decision.action === 'SELL') return 'SELL_EXECUTED'
  const err = entry.error ?? ''
  if (/already\s+in\s+position|already_in_position/i.test(err)) return 'ALREADY_HOLDING'
  if (/trend_zgt05|trend_quality_fail/i.test(err)) return 'TREND_REJECTED'
  if (/exit_rules_check|exit_rules_skip/i.test(err)) return 'HOLDING'
  return 'NO_SETUP'
}

/* ── reasoning text parser ───────────────────────────────── */

interface ParsedCtx {
  pnlPct?: number
  daysOpen?: number
  highSinceEntry?: number
  trail?: number
  exitRule?: string
  ghostClose?: boolean
  threshold?: number
}

function parseCtx(text: string): ParsedCtx {
  const p: ParsedCtx = {}
  const rx = (re: RegExp) => { const m = text.match(re); return m ? m[1] : null }

  const pnl = rx(/pnlPct\s*=\s*(-?\d+\.?\d*)/i)
  if (pnl) p.pnlPct = Number(pnl)

  const days = rx(/daysOpen\s*=\s*(\d+)/i)
  if (days) p.daysOpen = Number(days)

  const high = rx(/highSinceEntry\s*=\s*\$?(-?\d+\.?\d*)/i)
  if (high) p.highSinceEntry = Number(high)

  const trail = rx(/trail\s*=\s*\$?(-?\d+\.?\d*)/i)
  if (trail) p.trail = Number(trail)

  const thr = rx(/threshold\s*[=:]\s*(-?\d+\.?\d*)/i)
  if (thr) p.threshold = Number(thr)

  if (/profit\s*target/i.test(text))                          p.exitRule = 'profit target'
  else if (/trailing\s*stop/i.test(text))                     p.exitRule = 'trailing stop'
  else if (/ema50/i.test(text) && /exit/i.test(text))         p.exitRule = 'EMA50 exit'
  else if (/time\s*stop/i.test(text))                         p.exitRule = 'time stop (20d)'

  p.ghostClose = /ghost.?close|alpaca\s*gtc/i.test(text)
  return p
}

/* ── time helpers ─────────────────────────────────────────── */

function relativeTime(ts: string): string {
  const diff = Math.max(0, Date.now() - new Date(ts).getTime())
  const s = Math.floor(diff / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function cycleBucket(ts: string): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}`
}

function cycleLabel(ts: string): string {
  return new Date(ts).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York',
  })
}

/* ── formatting ───────────────────────────────────────────── */

const f$ = (n: number | null | undefined, dp = 2): string =>
  n == null ? '—' : `$${n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`

const fNum = (n: number | null | undefined, dp = 2): string =>
  n == null ? '—' : n.toFixed(dp)

const fPct = (n: number | undefined): string => {
  if (n == null) return '—'
  const v = Math.abs(n) < 5 && n !== 0 ? n * 100 : n
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
}

/* ── primitives ───────────────────────────────────────────── */

function SignalBadge({ signal }: { signal: string | null | undefined }) {
  if (!signal) return null
  const map: Record<string, [string, string]> = {
    MEAN_REVERSION:     ['bg-blue-500/10 text-blue-400 border-blue-500/25',       'MR'],
    TREND_PULLBACK:     ['bg-[#00B386]/10 text-[#00B386] border-[#00B386]/25',    'TP'],
    TREND_ZLE05:        ['bg-amber-500/10 text-amber-400 border-amber-500/25',     'ZLE'],
    EMA_RECLAIM:        ['bg-[#7C3AED]/15 text-[#A78BFA] border-[#7C3AED]/30',    'EMA'],
    TREND_FOLLOWING:    ['bg-[#00B386]/10 text-[#00B386] border-[#00B386]/25',    'TREND'],
    PULLBACK_EMA50:     ['bg-[#00B386]/10 text-[#00B386] border-[#00B386]/25',    'TREND'],
    TREND_ZGT05:        ['bg-amber-500/10 text-amber-400 border-amber-500/25',     'TREND ZGT'],
    TREND_QUALITY_FAIL: ['bg-amber-500/10 text-amber-400 border-amber-500/25',    'QUALITY'],
  }
  const [cls, label] = map[signal] ?? ['bg-white/5 text-slate-400 border-[#1E1E2E]', signal]
  return (
    <span className={`inline-flex items-center rounded text-[10px] tracking-[0.12em] uppercase font-semibold px-2 py-[3px] border ${cls}`}>
      {label}
    </span>
  )
}

function MiniBar({ value, max, tone = 'green' }: { value: number; max: number; tone?: 'green' | 'red' | 'amber' | 'blue' }) {
  const pct = Math.max(0, Math.min(1, value / max))
  const fill = { green: 'bg-[#00B386]', red: 'bg-[#FF4444]', amber: 'bg-amber-500', blue: 'bg-blue-500' }[tone]
  return (
    <div className="relative h-1 w-full rounded-full bg-white/[0.04] overflow-hidden">
      <div className={`h-full rounded-full ${fill}`} style={{ width: `${pct * 100}%` }} />
    </div>
  )
}

function KV({ label, value, tone = 'default', mono = true }: {
  label: string; value: ReactNode; tone?: 'default' | 'green' | 'red' | 'amber' | 'muted'; mono?: boolean
}) {
  const colors = { default: 'text-slate-200', green: 'text-[#00B386]', red: 'text-[#FF4444]', amber: 'text-amber-400', muted: 'text-slate-500' }
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[10px] uppercase tracking-[0.12em] text-slate-500">{label}</span>
      <span className={`text-[12px] font-medium ${colors[tone]} ${mono ? 'font-mono tabular-nums' : ''}`}>{value}</span>
    </div>
  )
}

/* ── CardShell ────────────────────────────────────────────── */

type Accent = 'green' | 'red' | 'slate' | 'amber' | 'blue' | 'purple'

const ACCENT_BAR: Record<Accent, string>  = { green: 'bg-[#00B386]', red: 'bg-[#FF4444]', slate: 'bg-slate-600', amber: 'bg-amber-500', blue: 'bg-blue-500', purple: 'bg-[#7C3AED]' }
const ACCENT_TEXT: Record<Accent, string> = { green: 'text-[#00B386]', red: 'text-[#FF4444]', slate: 'text-slate-400', amber: 'text-amber-400', blue: 'text-blue-400', purple: 'text-[#A78BFA]' }

function CardShell({ accent, glyph, title, symbol, signal, timeRel, expandable, expanded, onToggle, body, reasoning }: {
  accent: Accent; glyph: string; title: string; symbol: string; signal?: string | null;
  timeRel: string; expandable?: boolean; expanded?: boolean; onToggle?: () => void;
  body: ReactNode; reasoning?: string | null
}) {
  return (
    <div className="relative bg-[#12121A] border border-[#1E1E2E] rounded-lg overflow-hidden hover:border-slate-700 transition-colors">
      <span className={`absolute left-0 top-0 bottom-0 w-[3px] ${ACCENT_BAR[accent]}`} />
      <div className="pl-5 pr-4 py-3.5">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2.5 flex-wrap min-w-0">
            <span className={`text-[11px] font-semibold tracking-[0.14em] uppercase shrink-0 ${ACCENT_TEXT[accent]}`}>
              <span className="mr-1">{glyph}</span>{title}
            </span>
            <span className="text-slate-100 font-semibold tracking-tight shrink-0">{symbol}</span>
            <SignalBadge signal={signal} />
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            <span className="text-[10.5px] text-slate-500 font-mono tabular-nums">{timeRel}</span>
            {expandable && (
              <button onClick={onToggle} className="text-slate-500 hover:text-slate-200 transition">
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none"
                  style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>
                  <path d="M3 5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
          </div>
        </div>
        {body}
        {expandable && expanded && reasoning && (
          <div className="mt-3 pt-3 border-t border-[#1E1E2E]">
            <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500 mb-1.5">Reasoning</div>
            <p className="text-[12.5px] text-slate-400 leading-relaxed font-mono whitespace-pre-wrap break-words">{reasoning}</p>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── per-kind cards ───────────────────────────────────────── */

function BuyCard({ entry, ctx, expanded, onToggle }: { entry: AgentLogEntry; ctx: ParsedCtx; expanded: boolean; onToggle: () => void }) {
  const sig    = entry.decision.signal_type as string | undefined
  const rsi    = entry.indicators.rsi
  const zScore = entry.indicators.kalman?.zScore
  const macd   = entry.indicators.macd?.histogram
  const bb     = entry.indicators.bollingerBands?.percentB
  const price  = entry.indicators.currentPrice
  const conf   = entry.decision.confidence
  const qty    = entry.decision.quantity
  return (
    <CardShell accent="green" glyph="▲" title="Buy Executed" symbol={entry.symbol}
      signal={sig} timeRel={relativeTime(entry.timestamp)}
      expandable expanded={expanded} onToggle={onToggle} reasoning={entry.decision.reasoning}
      body={
        <div className="space-y-2 text-[12px]">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
            <KV label="Entry"  value={f$(price)} />
            <KV label="Shares" value={qty}    tone="muted" />
            <KV label="Value"  value={f$(qty * price, 0)} />
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
            <KV label="Z"    value={fNum(zScore, 3)} tone={zScore != null && zScore < -1 ? 'green' : 'amber'} />
            <KV label="RSI"  value={fNum(rsi, 1)}   tone="muted" />
            <KV label="MACD" value={fNum(macd, 3)}  tone="muted" />
            <KV label="%B"   value={fNum(bb, 2)}    tone="muted" />
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
            <KV label="Confidence" value={`${(conf * 100).toFixed(0)}%`} tone="green" />
            {entry.indicators.marketRegime && <KV label="Regime" value={entry.indicators.marketRegime} tone="muted" mono={false} />}
          </div>
          {!expanded && entry.decision.reasoning && (
            <p className="text-[12px] text-slate-500 line-clamp-2 leading-relaxed">{entry.decision.reasoning}</p>
          )}
        </div>
      }
    />
  )
}

function SellCard({ entry, ctx, expanded, onToggle }: { entry: AgentLogEntry; ctx: ParsedCtx; expanded: boolean; onToggle: () => void }) {
  const sig     = entry.decision.signal_type as string | undefined
  const pnlPct  = ctx.pnlPct
  const tone: 'green' | 'red' = pnlPct == null || pnlPct >= 0 ? 'green' : 'red'
  return (
    <CardShell accent="red" glyph="▼" title="Sell Executed" symbol={entry.symbol}
      signal={sig} timeRel={relativeTime(entry.timestamp)}
      expandable expanded={expanded} onToggle={onToggle} reasoning={entry.decision.reasoning}
      body={
        <div className="space-y-2 text-[12px]">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
            <KV label="Exit" value={f$(entry.indicators.currentPrice)} />
            <KV label="P&L"  value={fPct(pnlPct)} tone={tone} />
            {ctx.exitRule && <KV label="Exit rule" value={ctx.exitRule} tone="muted" mono={false} />}
          </div>
          {ctx.ghostClose && (
            <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-amber-500/25 bg-amber-500/10 text-amber-400 text-[10.5px]">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Closed by Alpaca GTC
            </div>
          )}
          {!expanded && entry.decision.reasoning && (
            <p className="text-[12px] text-slate-500 line-clamp-2 leading-relaxed">{entry.decision.reasoning}</p>
          )}
        </div>
      }
    />
  )
}

function HoldingCard({ entry, ctx }: { entry: AgentLogEntry; ctx: ParsedCtx }) {
  const sig    = entry.decision.signal_type as string | undefined
  const zScore = entry.indicators.kalman?.zScore
  const pnlPct = ctx.pnlPct
  const days   = ctx.daysOpen ?? 0
  const pnlBar = pnlPct != null ? Math.abs(Math.abs(pnlPct) < 5 ? pnlPct * 100 : pnlPct) : 0
  const zLabel = zScore == null ? null : zScore >= 0.5 ? 'overvalued' : zScore <= -0.5 ? 'undervalued' : 'near FV'

  return (
    <CardShell accent="slate" glyph="◆" title="Holding" symbol={entry.symbol}
      signal={sig} timeRel={relativeTime(entry.timestamp)}
      body={
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-[12px]">
          <div>
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-[10px] uppercase tracking-[0.12em] text-slate-500">P&L</span>
              <span className={`font-mono tabular-nums font-medium ${pnlPct == null || pnlPct >= 0 ? 'text-[#00B386]' : 'text-[#FF4444]'}`}>
                {fPct(pnlPct)}
              </span>
            </div>
            <MiniBar value={pnlBar} max={10} tone={pnlPct == null || pnlPct >= 0 ? 'green' : 'red'} />
            <div className="mt-0.5 text-[9.5px] text-slate-600 font-mono">→ +10% target</div>
          </div>
          <div>
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Days Open</span>
              <span className="font-mono tabular-nums font-medium text-slate-300">{days} / 20</span>
            </div>
            <MiniBar value={days} max={20} tone="blue" />
            <div className="mt-0.5 text-[9.5px] text-slate-600 font-mono">→ 20-day cap</div>
          </div>
          <div className="flex items-baseline gap-3">
            <span className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Z-Score</span>
            <span className={`font-mono tabular-nums font-medium ${zScore != null && zScore >= 0.5 ? 'text-amber-400' : zScore != null && zScore <= -0.5 ? 'text-[#00B386]' : 'text-slate-400'}`}>
              {zScore != null ? (zScore >= 0 ? '+' : '') + zScore.toFixed(3) : '—'}
              {zLabel && <span className="text-slate-500 ml-1.5 font-sans font-normal">· {zLabel}</span>}
            </span>
          </div>
          <div className="flex items-baseline gap-3 flex-wrap">
            {ctx.highSinceEntry != null && (
              <>
                <span className="text-[10px] uppercase tracking-[0.12em] text-slate-500">High</span>
                <span className="font-mono tabular-nums text-slate-300">{f$(ctx.highSinceEntry)}</span>
              </>
            )}
            {ctx.trail != null && (
              <>
                <span className="text-slate-700">·</span>
                <span className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Trail</span>
                <span className="font-mono tabular-nums text-[#00B386]">{f$(ctx.trail)}</span>
              </>
            )}
          </div>
        </div>
      }
    />
  )
}

function NoSetupCard({ entry, ctx }: { entry: AgentLogEntry; ctx: ParsedCtx }) {
  const zScore = entry.indicators.kalman?.zScore
  return (
    <CardShell accent="slate" glyph="○" title="No Setup" symbol={entry.symbol}
      timeRel={relativeTime(entry.timestamp)}
      body={
        <div className="space-y-1.5 text-[12px]">
          <div className="font-mono tabular-nums text-slate-400">
            z-score <span className="text-slate-200">{zScore != null ? (zScore >= 0 ? '+' : '') + zScore.toFixed(3) : '—'}</span>
            <span className="text-slate-600 mx-1.5">&gt;</span>
            threshold <span className="text-amber-400">{ctx.threshold?.toFixed(2) ?? '-1.30'}</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            {entry.indicators.marketRegime && <KV label="Regime" value={entry.indicators.marketRegime} tone="muted" mono={false} />}
            <KV label="RSI"   value={fNum(entry.indicators.rsi, 1)}          tone="muted" />
            <KV label="Price" value={f$(entry.indicators.currentPrice)}       tone="muted" />
          </div>
        </div>
      }
    />
  )
}

function TrendRejectedCard({ entry }: { entry: AgentLogEntry }) {
  const isZGT = /trend_zgt05/i.test(entry.error ?? '')
  const zScore = entry.indicators.kalman?.zScore
  const adx    = entry.indicators.adx
  return (
    <CardShell accent="amber" glyph="!" title="Trend Detected · Excluded" symbol={entry.symbol}
      timeRel={relativeTime(entry.timestamp)}
      body={
        <div className="text-[12px] font-mono tabular-nums text-slate-400">
          {isZGT ? (
            <>
              z-score <span className="text-amber-400">{zScore != null ? (zScore >= 0 ? '+' : '') + zScore.toFixed(3) : '—'}</span>
              <span className="text-slate-600 mx-1.5">&gt;</span>
              <span className="text-slate-500">0.5</span>
              <span className="text-slate-500 font-sans ml-2">→ overvalued</span>
            </>
          ) : (
            <>
              ADX <span className="text-amber-400">{fNum(adx, 1)}</span>
              <span className="text-slate-600 mx-1.5">&lt;</span>
              <span className="text-slate-500">20</span>
              <span className="text-slate-500 font-sans ml-2">→ trend not confirmed</span>
            </>
          )}
        </div>
      }
    />
  )
}

function AlreadyHoldingCard({ entry, ctx }: { entry: AgentLogEntry; ctx: ParsedCtx }) {
  const pnlPct = ctx.pnlPct
  return (
    <CardShell accent="blue" glyph="●" title="Already Holding" symbol={entry.symbol}
      timeRel={relativeTime(entry.timestamp)}
      body={
        <div className="flex items-center gap-5 text-[12px]">
          <span className="text-slate-500">Position already open — skipped</span>
          {pnlPct != null && <KV label="P&L" value={fPct(pnlPct)} tone={pnlPct >= 0 ? 'green' : 'red'} />}
        </div>
      }
    />
  )
}

/* ── main component ───────────────────────────────────────── */

export function AgentReasoningLog({ entries, title = 'Agent Decisions' }: { entries: AgentLogEntry[]; title?: string }) {
  const [filter, setFilter]     = useState<'ALL' | 'TRADES' | 'HOLDING' | 'REJECTED'>('ALL')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const toggle = (id: string) =>
    setExpanded(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })

  const enriched = useMemo(() =>
    entries.map((e, i) => ({
      id: e.id ?? `${e.symbol}-${i}`,
      kind: detectKind(e),
      ctx: parseCtx((e.decision.reasoning ?? '') + ' ' + (e.error ?? '')),
      entry: e,
    })), [entries])

  const filtered = useMemo(() => {
    switch (filter) {
      case 'TRADES':   return enriched.filter(x => x.kind === 'BUY_EXECUTED' || x.kind === 'SELL_EXECUTED')
      case 'HOLDING':  return enriched.filter(x => x.kind === 'HOLDING' || x.kind === 'ALREADY_HOLDING')
      case 'REJECTED': return enriched.filter(x => x.kind === 'NO_SETUP' || x.kind === 'TREND_REJECTED')
      default:         return enriched
    }
  }, [enriched, filter])

  const grouped = useMemo(() => {
    const groups: { key: string; label: string; items: typeof filtered }[] = []
    let cur: (typeof groups)[0] | null = null
    for (const x of filtered) {
      const k = cycleBucket(x.entry.timestamp)
      if (!cur || cur.key !== k) { cur = { key: k, label: cycleLabel(x.entry.timestamp), items: [] }; groups.push(cur) }
      cur.items.push(x)
    }
    return groups
  }, [filtered])

  const counts = useMemo(() => ({
    trades:   enriched.filter(x => x.kind === 'BUY_EXECUTED' || x.kind === 'SELL_EXECUTED').length,
    holding:  enriched.filter(x => x.kind === 'HOLDING' || x.kind === 'ALREADY_HOLDING').length,
    rejected: enriched.filter(x => x.kind === 'NO_SETUP' || x.kind === 'TREND_REJECTED').length,
  }), [enriched])

  return (
    <div className="bg-[#12121A] border border-[#1E1E2E] rounded-xl">
      <div className="flex items-baseline justify-between px-6 pt-5 pb-3 flex-wrap gap-3">
        <div className="flex items-baseline gap-3">
          <h3 className="text-sm font-semibold tracking-[0.18em] uppercase text-slate-200">{title}</h3>
          <span className="text-[11px] text-slate-500">{enriched.length} events · {grouped.length} cycles</span>
        </div>
        <div className="flex p-0.5 rounded-md bg-white/[0.04] border border-[#1E1E2E] text-[10.5px]">
          {(['ALL', 'TRADES', 'HOLDING', 'REJECTED'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-2.5 py-1 rounded transition tracking-wide ${filter === f ? 'bg-white/[0.06] text-slate-100' : 'text-slate-500 hover:text-slate-200'}`}
            >
              {f === 'ALL' ? `All (${enriched.length})` : f === 'TRADES' ? `Trades (${counts.trades})` : f === 'HOLDING' ? `Holding (${counts.holding})` : `Rejected (${counts.rejected})`}
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-[#1E1E2E] max-h-[720px] overflow-y-auto">
        {grouped.length === 0 && (
          <div className="px-6 py-12 text-center text-slate-500 text-sm">
            {entries.length === 0 ? 'No analysis runs yet.' : 'No events match the current filter.'}
          </div>
        )}
        {grouped.map(group => (
          <div key={group.key}>
            <div className="sticky top-0 z-10 px-6 py-2 bg-[#0F0F18]/95 backdrop-blur-sm border-y border-[#1E1E2E] flex items-center gap-2">
              <span className="h-px flex-1 bg-[#1E1E2E]" />
              <span className="text-[10px] tracking-[0.18em] uppercase text-slate-500 font-mono">
                Cycle · {group.label}
              </span>
              <span className="text-[10px] text-slate-600 font-mono">{group.items.length}</span>
              <span className="h-px flex-1 bg-[#1E1E2E]" />
            </div>
            <div className="px-6 py-3 space-y-2.5">
              {group.items.map(({ id, kind, ctx, entry }) => {
                const isOpen = expanded.has(id)
                switch (kind) {
                  case 'BUY_EXECUTED':    return <BuyCard       key={id} entry={entry} ctx={ctx} expanded={isOpen} onToggle={() => toggle(id)} />
                  case 'SELL_EXECUTED':   return <SellCard      key={id} entry={entry} ctx={ctx} expanded={isOpen} onToggle={() => toggle(id)} />
                  case 'HOLDING':         return <HoldingCard   key={id} entry={entry} ctx={ctx} />
                  case 'NO_SETUP':        return <NoSetupCard   key={id} entry={entry} ctx={ctx} />
                  case 'TREND_REJECTED':  return <TrendRejectedCard key={id} entry={entry} />
                  case 'ALREADY_HOLDING': return <AlreadyHoldingCard key={id} entry={entry} ctx={ctx} />
                  default: return (
                    <CardShell key={id} accent="slate" glyph="·" title="Agent Event" symbol={entry.symbol}
                      timeRel={relativeTime(entry.timestamp)}
                      body={<p className="text-[12px] text-slate-500 line-clamp-2">{entry.decision.reasoning}</p>}
                    />
                  )
                }
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
