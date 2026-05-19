'use client'

import { useMemo, useState, type ReactNode } from 'react'
import type { AgentLogEntry } from '@/lib/types'

/* ──────────────────────────────────────────────────────────
   AgentReasoningLog — structured per-entry-type display
   ────────────────────────────────────────────────────────── */

type EntryKind =
  | 'BUY_EXECUTED'
  | 'SELL_EXECUTED'
  | 'HOLDING'
  | 'NO_SETUP'
  | 'TREND_REJECTED'
  | 'ALREADY_HOLDING'
  | 'OTHER'

type SignalKind = 'MR' | 'TP' | 'ZLE' | 'EMA' | 'TREND' | string | null

type ParsedEntry = {
  pnlPct?: number
  zScore?: number
  signalType?: SignalKind
  daysOpen?: number
  highSinceEntry?: number
  trail?: number
  adx?: number
  threshold?: number
  rsi?: number
  macd?: number
  bb?: number
  price?: number
  entryPrice?: number
  shares?: number
  value?: number
  confidence?: number
  regime?: string
  exitRule?: string
  ghostClose?: boolean
}

/* ─── helpers ─── */

const num = (s: string | null | undefined): number | undefined =>
  s == null ? undefined : Number(s)

function parseEntry(text: string | undefined | null): ParsedEntry {
  if (!text) return {}
  const p: ParsedEntry = {}
  const rx = (re: RegExp): string | null => { const m = text.match(re); return m ? m[1] : null }

  p.pnlPct         = num(rx(/pnlPct\s*=\s*(-?\d+\.?\d*)/i))
  p.zScore         = num(rx(/zScore\s*[=:]?\s*(-?\d+\.?\d*)/i))
  p.signalType     = rx(/signalType\s*=\s*([A-Z_0-9]+)/i)
  p.daysOpen       = num(rx(/daysOpen\s*=\s*(\d+)/i))
  p.highSinceEntry = num(rx(/highSinceEntry\s*=\s*\$?(-?\d+\.?\d*)/i))
  p.trail          = num(rx(/trail(?:Price|Stop)?\s*[=:]?\s*\$?(-?\d+\.?\d*)/i))
  p.adx            = num(rx(/adx\s*[=:]?\s*(-?\d+\.?\d*)/i))
  p.threshold      = num(rx(/z-score [0-9.-]+ > ([0-9.-]+)/))
  p.rsi            = num(rx(/rsi\s*[=:]?\s*(-?\d+\.?\d*)/i))
  p.macd           = num(rx(/macd\s*[=:]?\s*(-?\d+\.?\d*)/i))
  p.bb             = num(rx(/%?b\s*[=:]?\s*(-?\d+\.?\d*)/i))
  p.price          = num(rx(/(?:price|p\$)\s*[=:]?\s*\$?(-?\d+\.?\d*)/i))
  p.entryPrice     = num(rx(/entry\s*[=:]?\s*\$?(-?\d+\.?\d*)/i))
  p.shares         = num(rx(/shares?\s*[=:]?\s*(\d+)/i))
  p.value          = num(rx(/value\s*[=:]?\s*\$?(-?\d+\.?\d*)/i))
  p.confidence     = num(rx(/confidence\s*[=:]?\s*(-?\d+\.?\d*)/i))
  p.regime         = rx(/regime\s*[=:]?\s*([A-Z_]+)/i) ?? undefined
  p.ghostClose     = /ghost.?close|alpaca\s*gtc/i.test(text)

  if (/profit\s*target/i.test(text))       p.exitRule = 'profit target'
  else if (/trailing\s*stop/i.test(text))  p.exitRule = 'trailing stop'
  else if (/ema50/i.test(text))            p.exitRule = 'EMA50 exit'
  else if (/time\s*stop/i.test(text))      p.exitRule = 'time stop (20d)'

  return p
}

// ADAPTED: uses real AgentLogEntry field paths (entry.decision.action, entry.orderExecuted, entry.error)
// instead of new design's (entry as any).action / (entry as any).order_executed
function detectKind(entry: AgentLogEntry): EntryKind {
  if (entry.orderExecuted && entry.decision.action === 'BUY') return 'BUY_EXECUTED'
  // ADAPTED: SELL does not require orderExecuted — matches FILE 1 behavior
  if (entry.decision.action === 'SELL') return 'SELL_EXECUTED'

  const err = entry.error ?? ''
  if (/already\s+in\s+position|already_in_position/i.test(err)) return 'ALREADY_HOLDING'
  if (/trend_zgt05|trend_quality_fail/i.test(err))              return 'TREND_REJECTED'
  if (/setup\s*gate|no[\s_-]?setup/i.test(err))                return 'NO_SETUP'
  if (/exit_rules_check|exit_rules_skip/i.test(err))           return 'HOLDING'
  if (entry.decision.action === 'HOLD')                         return 'NO_SETUP'
  return 'OTHER'
}

/* ─── time formatting ─── */

function relativeTime(ts: string | number | Date): string {
  const diff = Math.max(0, Date.now() - new Date(ts).getTime())
  const s = Math.floor(diff / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// ADAPTED: renamed from cycleBucket — new design adds minutes to key for finer cycle grouping
function cycleKey(ts: string | number | Date): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}-${d.getMinutes()}`
}

// ADAPTED: simplified label (drops weekday) — matches new design format
function cycleLabel(ts: string | number | Date): string {
  return new Date(ts).toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

/* ─── UI primitives ─── */

function SignalBadge({ signal }: { signal: SignalKind }) {
  if (!signal) return null
  const map: Record<string, { bg: string; text: string; border: string; label: string }> = {
    MR:                 { bg: 'bg-blue-500/10',   text: 'text-blue-400',   border: 'border-blue-500/25',   label: 'MR' },
    MEAN_REVERSION:     { bg: 'bg-blue-500/10',   text: 'text-blue-400',   border: 'border-blue-500/25',   label: 'MR' },
    TP:                 { bg: 'bg-[#00B386]/10',  text: 'text-[#00B386]',  border: 'border-[#00B386]/25',  label: 'TP' },
    TREND_PULLBACK:     { bg: 'bg-[#00B386]/10',  text: 'text-[#00B386]',  border: 'border-[#00B386]/25',  label: 'TREND PB' },
    ZLE:                { bg: 'bg-amber-500/10',  text: 'text-amber-400',  border: 'border-amber-500/25',  label: 'ZLE' },
    TREND_ZLE05:        { bg: 'bg-amber-500/10',  text: 'text-amber-400',  border: 'border-amber-500/25',  label: 'TREND ZLE' },
    TREND_ZGT05:        { bg: 'bg-amber-500/10',  text: 'text-amber-400',  border: 'border-amber-500/25',  label: 'TREND ZGT' },
    TREND_QUALITY_FAIL: { bg: 'bg-amber-500/10',  text: 'text-amber-400',  border: 'border-amber-500/25',  label: 'QUALITY' },
    EMA:                { bg: 'bg-[#7C3AED]/15',  text: 'text-[#A78BFA]',  border: 'border-[#7C3AED]/30',  label: 'EMA' },
    EMA_RECLAIM:        { bg: 'bg-[#7C3AED]/15',  text: 'text-[#A78BFA]',  border: 'border-[#7C3AED]/30',  label: 'EMA RECLAIM' },
    TREND:              { bg: 'bg-[#00B386]/10',  text: 'text-[#00B386]',  border: 'border-[#00B386]/25',  label: 'TREND' },
    TREND_FOLLOWING:    { bg: 'bg-[#00B386]/10',  text: 'text-[#00B386]',  border: 'border-[#00B386]/25',  label: 'TREND' },
    PULLBACK_EMA50:     { bg: 'bg-[#00B386]/10',  text: 'text-[#00B386]',  border: 'border-[#00B386]/25',  label: 'TREND' },
  }
  const key = String(signal).toUpperCase()
  const m = map[key] ?? { bg: 'bg-white/5', text: 'text-slate-400', border: 'border-[#1E1E2E]', label: key }
  return (
    <span className={`inline-flex items-center rounded text-[10px] tracking-[0.12em] uppercase font-semibold px-2 py-[3px] border ${m.bg} ${m.text} ${m.border}`}>
      {m.label}
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

function KV({ label, value, tone = 'default', mono = true }: { label: string; value: ReactNode; tone?: 'default' | 'green' | 'red' | 'amber' | 'muted'; mono?: boolean }) {
  const colors = { default: 'text-slate-200', green: 'text-[#00B386]', red: 'text-[#FF4444]', amber: 'text-amber-400', muted: 'text-slate-500' }
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[10px] uppercase tracking-[0.12em] text-slate-500">{label}</span>
      <span className={`text-[12px] font-medium ${colors[tone]} ${mono ? 'font-mono tabular-nums' : ''}`}>{value}</span>
    </div>
  )
}

const fmt$ = (n: number | null | undefined, dp = 2): string =>
  n == null ? '—' : `$${n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`

const fmtPct = (n: number | null | undefined, dp = 2): string => {
  if (n == null) return '—'
  const x = Math.abs(n) < 5 && n !== 0 ? n * 100 : n
  return (x >= 0 ? '+' : '') + x.toFixed(dp) + '%'
}

const fmtNum = (n: number | null | undefined, dp = 2): string =>
  n == null ? '—' : n.toFixed(dp)

/* ─── CardShell ─── */

function CardShell({
  accent, glyph, title, symbol, signal, timeRel,
  expandable, expanded, onToggle, body, reasoning,
}: {
  accent: 'green' | 'red' | 'slate' | 'blue' | 'amber' | 'purple'
  glyph: string
  title: string
  symbol: string
  signal?: SignalKind
  timeRel: string
  expandable?: boolean
  expanded?: boolean
  onToggle?: () => void
  body: ReactNode
  reasoning?: string | null
}) {
  const accentBar  = { green: 'bg-[#00B386]', red: 'bg-[#FF4444]', slate: 'bg-slate-600', blue: 'bg-blue-500', amber: 'bg-amber-500', purple: 'bg-[#7C3AED]' }[accent]
  const accentText = { green: 'text-[#00B386]', red: 'text-[#FF4444]', slate: 'text-slate-400', blue: 'text-blue-400', amber: 'text-amber-400', purple: 'text-[#A78BFA]' }[accent]

  return (
    <div className="relative bg-[#12121A] border border-[#1E1E2E] rounded-lg overflow-hidden">
      <span className={`absolute left-0 top-0 bottom-0 w-[3px] ${accentBar}`} />
      <div className="pl-5 pr-4 py-3.5">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className={`text-[11px] font-semibold tracking-[0.14em] uppercase ${accentText}`}>
              <span className="mr-1.5">{glyph}</span>{title}
            </span>
            <span className="text-slate-100 font-semibold tracking-tight">{symbol}</span>
            <SignalBadge signal={signal ?? null} />
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-[10.5px] text-slate-500 font-mono tabular-nums">{timeRel}</span>
            {expandable && (
              <button
                onClick={onToggle}
                className="text-slate-500 hover:text-slate-200 transition"
                aria-label={expanded ? 'Collapse' : 'Expand'}
              >
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
            <div className="text-[12.5px] text-slate-400 leading-relaxed font-mono whitespace-pre-wrap break-words">
              {reasoning}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── TYPE 1 — BUY executed ─── */

function BuyCard({ entry, parsed, expanded, onToggle }: { entry: AgentLogEntry; parsed: ParsedEntry; expanded: boolean; onToggle: () => void }) {
  // ADAPTED: real field paths — new design used (entry as any).symbol / .reasoning / .signal_type
  const reasoning = entry.decision.reasoning ?? ''
  const sig       = entry.decision.signal_type as string | undefined
  // ADAPTED: indicators from entry.indicators, not parsed text — more reliable
  const price = entry.indicators.currentPrice
  const qty   = entry.decision.quantity
  const zScore = entry.indicators.kalman?.zScore
  const rsi    = entry.indicators.rsi
  const macd   = entry.indicators.macd?.histogram
  const bb     = entry.indicators.bollingerBands?.percentB
  const conf   = entry.decision.confidence

  return (
    <CardShell
      accent="green"
      glyph="▲"  // ADAPTED: encoding-safe glyph — new design used corrupted emoji (🟢)
      title="Buy Executed"
      symbol={entry.symbol}
      signal={sig ?? null}
      timeRel={relativeTime(entry.timestamp)}
      expandable
      expanded={expanded}
      onToggle={onToggle}
      reasoning={reasoning}
      body={
        <div className="space-y-2 text-[12px]">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
            <KV label="Entry"  value={fmt$(price)}                                                              tone="default" />
            <KV label="Shares" value={qty ?? '—'}                                                              tone="muted" />
            <KV label="Value"  value={fmt$(qty != null && price != null ? qty * price : undefined, 2)}         tone="default" />
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
            <KV label="Z-Score" value={fmtNum(zScore, 3)} tone={zScore != null && zScore < -1 ? 'green' : 'amber'} />
            <KV label="RSI"     value={fmtNum(rsi, 1)}    tone="muted" />
            <KV label="MACD"    value={fmtNum(macd, 2)}   tone="muted" />
            <KV label="%B"      value={fmtNum(bb, 2)}     tone="muted" />
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
            {/* ADAPTED: conf is a fraction (0–1) — multiply by 100 for display */}
            <KV label="Confidence" value={conf != null ? `${(conf * 100).toFixed(0)}%` : '—'} tone="green" />
            <KV label="Regime"     value={entry.indicators.marketRegime ?? '—'}               tone="muted" mono={false} />
          </div>
          {!expanded && reasoning && (
            <p className="text-[12px] text-slate-500 line-clamp-2 leading-relaxed">{reasoning}</p>
          )}
        </div>
      }
    />
  )
}

/* ─── TYPE 2 — SELL executed ─── */

function SellCard({ entry, parsed, expanded, onToggle }: { entry: AgentLogEntry; parsed: ParsedEntry; expanded: boolean; onToggle: () => void }) {
  // ADAPTED: real field paths
  const reasoning = entry.decision.reasoning ?? ''
  const sig       = entry.decision.signal_type as string | undefined
  const pnlPct    = parsed.pnlPct
  const tone: 'green' | 'red' = pnlPct != null && pnlPct >= 0 ? 'green' : 'red'

  return (
    <CardShell
      accent="red"
      glyph="▼"  // ADAPTED: encoding-safe glyph — new design used corrupted emoji (🔴)
      title="Sell Executed"
      symbol={entry.symbol}
      signal={sig ?? null}
      timeRel={relativeTime(entry.timestamp)}
      expandable
      expanded={expanded}
      onToggle={onToggle}
      reasoning={reasoning}
      body={
        <div className="space-y-2 text-[12px]">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
            <KV label="Exit" value={fmt$(entry.indicators.currentPrice)} tone="default" />
            <KV
              label="P&L"
              value={pnlPct != null ? `${pnlPct >= 0 ? '+' : ''}${(Math.abs(pnlPct) < 5 ? pnlPct * 100 : pnlPct).toFixed(2)}%` : '—'}
              tone={tone}
            />
            {parsed.exitRule && (
              <KV label="Exit rule" value={parsed.exitRule} tone="muted" mono={false} />
            )}
          </div>
          {parsed.ghostClose && (
            <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-amber-500/25 bg-amber-500/10 text-amber-400 text-[10.5px] tracking-wide">
              <span className="w-1 h-1 rounded-full bg-amber-400" />
              Closed by Alpaca GTC
            </div>
          )}
          {!expanded && reasoning && (
            <p className="text-[12px] text-slate-500 line-clamp-2 leading-relaxed">{reasoning}</p>
          )}
        </div>
      }
    />
  )
}

/* ─── TYPE 3 — Holding ─── */

function HoldingCard({ entry, parsed }: { entry: AgentLogEntry; parsed: ParsedEntry }) {
  // ADAPTED: real field paths
  const sig       = entry.decision.signal_type as string | undefined
  const pnlPctRaw = parsed.pnlPct
  const pnlPct    = pnlPctRaw != null && Math.abs(pnlPctRaw) < 5 ? pnlPctRaw * 100 : pnlPctRaw
  // ADAPTED: prefer entry.indicators.kalman?.zScore over parsed text extraction
  const z      = entry.indicators.kalman?.zScore ?? parsed.zScore
  const zLabel = z == null ? null : z >= 0.5 ? 'overvalued' : z <= -0.5 ? 'undervalued' : 'near FV'
  const zTone: 'amber' | 'green' | 'muted' = z == null ? 'muted' : z >= 0.5 ? 'amber' : z <= -0.5 ? 'green' : 'muted'

  return (
    <CardShell
      accent="slate"
      glyph="◆"  // ADAPTED: encoding-safe glyph — new design used corrupted char (⬪)
      title="Holding"
      symbol={entry.symbol}
      signal={sig ?? null}
      timeRel={relativeTime(entry.timestamp)}
      body={
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5 text-[12px]">
          {/* P&L */}
          <div>
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-[10px] uppercase tracking-[0.12em] text-slate-500">P&L</span>
              <span className={`font-mono tabular-nums font-medium ${pnlPct != null && pnlPct >= 0 ? 'text-[#00B386]' : 'text-[#FF4444]'}`}>
                {pnlPct != null ? `${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%` : '—'}
              </span>
            </div>
            <MiniBar value={pnlPct ?? 0} max={10} tone={pnlPct != null && pnlPct >= 0 ? 'green' : 'red'} />
            <div className="mt-0.5 text-[9.5px] text-slate-600 font-mono tabular-nums">→ +10% target</div>
          </div>

          {/* Days */}
          <div>
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Days Open</span>
              <span className="font-mono tabular-nums font-medium text-slate-300">{parsed.daysOpen ?? 0} / 20</span>
            </div>
            <MiniBar value={parsed.daysOpen ?? 0} max={20} tone="blue" />
            <div className="mt-0.5 text-[9.5px] text-slate-600 font-mono tabular-nums">→ 20-day cap</div>
          </div>

          {/* Z-score */}
          <div className="flex items-baseline justify-between sm:justify-start sm:gap-3">
            <span className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Z-Score</span>
            <span className={`font-mono tabular-nums font-medium ${zTone === 'amber' ? 'text-amber-400' : zTone === 'green' ? 'text-[#00B386]' : 'text-slate-400'}`}>
              {z != null ? (z >= 0 ? '+' : '') + z.toFixed(3) : '—'}
              {zLabel && <span className="text-slate-500 ml-1.5 font-sans font-normal">· {zLabel}</span>}
            </span>
          </div>

          {/* High / Trail */}
          <div className="flex items-baseline justify-between sm:justify-start sm:gap-3 flex-wrap">
            <span className="text-[10px] uppercase tracking-[0.12em] text-slate-500">High</span>
            <span className="font-mono tabular-nums text-slate-300">{fmt$(parsed.highSinceEntry)}</span>
            {parsed.trail != null && (
              <>
                <span className="text-slate-700">·</span>
                <span className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Trail</span>
                <span className="font-mono tabular-nums text-[#00B386]">{fmt$(parsed.trail)}</span>
              </>
            )}
          </div>
        </div>
      }
    />
  )
}

/* ─── TYPE 4 — No setup ─── */

function NoSetupCard({ entry, parsed }: { entry: AgentLogEntry; parsed: ParsedEntry }) {
  // ADAPTED: prefer entry.indicators values over parsed text extraction
  const zScore = entry.indicators.kalman?.zScore ?? parsed.zScore
  const rsi    = entry.indicators.rsi ?? parsed.rsi
  const price  = entry.indicators.currentPrice ?? parsed.price
  const regime = entry.indicators.marketRegime ?? parsed.regime

  return (
    <CardShell
      accent="slate"
      glyph="○"  // ADAPTED: encoding-safe glyph — new design used corrupted char (⬫)
      title="No Setup"
      symbol={entry.symbol}
      timeRel={relativeTime(entry.timestamp)}
      body={
        <div className="space-y-1.5 text-[12px]">
          <div className="font-mono tabular-nums text-slate-400">
            z-score <span className="text-slate-200">{zScore != null ? (zScore >= 0 ? '+' : '') + zScore.toFixed(3) : '—'}</span>
            <span className="text-slate-600 mx-1.5">&gt;</span>
            threshold <span className="text-amber-400">{parsed.threshold != null ? parsed.threshold.toFixed(2) : '-1.30'}</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
            {regime && <KV label="Regime" value={regime} tone="muted" mono={false} />}
            <KV label="RSI"   value={fmtNum(rsi, 1)}  tone="muted" />
            <KV label="Price" value={fmt$(price)}      tone="muted" />
          </div>
        </div>
      }
    />
  )
}

/* ─── TYPE 5 — Trend rejected ─── */

function TrendRejectedCard({ entry, parsed }: { entry: AgentLogEntry; parsed: ParsedEntry }) {
  // ADAPTED: real field paths
  const err       = entry.error ?? ''
  const isZGT     = /trend_zgt05/i.test(err)
  const isQuality = /trend_quality_fail/i.test(err)
  // ADAPTED: prefer entry.indicators values over parsed
  const zScore = entry.indicators.kalman?.zScore ?? parsed.zScore
  const adx    = entry.indicators.adx ?? parsed.adx

  let line: ReactNode = '—'
  if (isZGT) {
    line = (
      <span className="font-mono tabular-nums text-slate-300">
        z-score <span className="text-amber-400">{zScore != null ? (zScore >= 0 ? '+' : '') + zScore.toFixed(3) : '—'}</span>
        <span className="text-slate-600 mx-1.5">&gt;</span>
        <span className="text-slate-500">0.5</span>
        <span className="text-slate-500 font-sans ml-2">→ overvalued</span>
      </span>
    )
  } else if (isQuality) {
    line = (
      <span className="font-mono tabular-nums text-slate-300">
        ADX <span className="text-amber-400">{fmtNum(adx, 1)}</span>
        <span className="text-slate-600 mx-1.5">&lt;</span>
        <span className="text-slate-500">20</span>
        <span className="text-slate-500 font-sans ml-2">→ trend not confirmed</span>
      </span>
    )
  }

  return (
    <CardShell
      accent="amber"
      glyph="!"  // ADAPTED: encoding-safe glyph — new design used corrupted emoji (🟡)
      title="Trend Detected · Excluded"
      symbol={entry.symbol}
      timeRel={relativeTime(entry.timestamp)}
      body={<div className="text-[12px]">{line}</div>}
    />
  )
}

/* ─── TYPE 6 — Already in position ─── */

function AlreadyHoldingCard({ entry, parsed }: { entry: AgentLogEntry; parsed: ParsedEntry }) {
  // ADAPTED: real field paths
  const pnlPctRaw = parsed.pnlPct
  const pnlPct    = pnlPctRaw != null && Math.abs(pnlPctRaw) < 5 ? pnlPctRaw * 100 : pnlPctRaw

  return (
    <CardShell
      accent="blue"
      glyph="●"  // ADAPTED: encoding-safe glyph — new design used corrupted emoji (🔵)
      title="Already Holding"
      symbol={entry.symbol}
      timeRel={relativeTime(entry.timestamp)}
      body={
        <div className="flex items-center gap-5 text-[12px]">
          <span className="text-slate-500">Position already open — skipped</span>
          {pnlPct != null && (
            <KV label="P&L" value={`${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%`} tone={pnlPct >= 0 ? 'green' : 'red'} />
          )}
        </div>
      }
    />
  )
}

/* ─── Fallback ─── */

function OtherCard({ entry }: { entry: AgentLogEntry }) {
  // ADAPTED: real field paths — new design used (entry as any).reasoning / .error
  const reasoning = entry.decision.reasoning ?? entry.error ?? ''
  return (
    <CardShell
      accent="slate"
      glyph="·"
      title="Agent Event"
      symbol={entry.symbol}
      timeRel={relativeTime(entry.timestamp)}
      body={<div className="text-[12px] text-slate-500 line-clamp-2 leading-relaxed">{reasoning}</div>}
    />
  )
}

/* ─── main component ─── */

type Props = {
  entries: AgentLogEntry[]
  title?: string
}

export function AgentReasoningLog({ entries, title = 'Agent Decisions' }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [filter, setFilter]     = useState<'ALL' | 'TRADES' | 'HOLDING' | 'REJECTED'>('ALL')

  const enriched = useMemo(() => {
    return entries.map((e, i) => {
      // ADAPTED: real field paths — new design used (e as any).reasoning / .error
      const text = (e.decision.reasoning ?? '') + ' ' + (e.error ?? '')
      return {
        // ADAPTED: real field paths for id and symbol
        id: e.id ?? `${e.symbol}-${e.timestamp}-${i}`,
        kind: detectKind(e),
        parsed: parseEntry(text),
        entry: e,
      }
    })
  }, [entries])

  const filtered = useMemo(() => {
    if (filter === 'ALL')      return enriched
    if (filter === 'TRADES')   return enriched.filter(x => x.kind === 'BUY_EXECUTED' || x.kind === 'SELL_EXECUTED')
    if (filter === 'HOLDING')  return enriched.filter(x => x.kind === 'HOLDING' || x.kind === 'ALREADY_HOLDING')
    if (filter === 'REJECTED') return enriched.filter(x => x.kind === 'NO_SETUP' || x.kind === 'TREND_REJECTED')
    return enriched
  }, [enriched, filter])

  const grouped = useMemo(() => {
    const groups: { key: string; label: string; items: typeof filtered }[] = []
    let cur: { key: string; label: string; items: typeof filtered } | null = null
    for (const x of filtered) {
      // ADAPTED: real timestamp field
      const k = cycleKey(x.entry.timestamp)
      if (!cur || cur.key !== k) {
        cur = { key: k, label: cycleLabel(x.entry.timestamp), items: [] }
        groups.push(cur)
      }
      cur.items.push(x)
    }
    return groups
  }, [filtered])

  const toggle = (id: string) =>
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div className="bg-[#12121A] border border-[#1E1E2E] rounded-xl">
      {/* header */}
      <div className="flex items-baseline justify-between px-6 pt-5 pb-3">
        <div className="flex items-baseline gap-3">
          <h3 className="text-sm font-semibold tracking-[0.18em] uppercase text-slate-200">{title}</h3>
          <span className="text-[11px] text-slate-500">
            {entries.length} events · {grouped.length} cycles
          </span>
        </div>
        <div className="flex p-0.5 rounded-md bg-white/[0.04] border border-[#1E1E2E] text-[10.5px]">
          {(['ALL', 'TRADES', 'HOLDING', 'REJECTED'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={
                'px-2.5 py-1 rounded transition tracking-wide ' +
                (filter === f ? 'bg-white/[0.06] text-slate-100' : 'text-slate-500 hover:text-slate-200')
              }
            >
              {f}
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
            {/* cycle separator */}
            <div className="sticky top-0 z-10 px-6 py-2 bg-[#0F0F18]/95 backdrop-blur-sm border-y border-[#1E1E2E] flex items-center gap-2">
              <span className="h-px flex-1 bg-[#1E1E2E]" />
              <span className="text-[10px] tracking-[0.18em] uppercase text-slate-500 font-mono">
                Cycle · {group.label}
              </span>
              <span className="text-[10px] text-slate-600 font-mono">{group.items.length}</span>
              <span className="h-px flex-1 bg-[#1E1E2E]" />
            </div>

            <div className="px-6 py-3 space-y-2.5">
              {group.items.map(({ id, kind, parsed, entry }) => {
                const isOpen = expanded.has(id)
                switch (kind) {
                  case 'BUY_EXECUTED':    return <BuyCard           key={id} entry={entry} parsed={parsed} expanded={isOpen} onToggle={() => toggle(id)} />
                  case 'SELL_EXECUTED':   return <SellCard          key={id} entry={entry} parsed={parsed} expanded={isOpen} onToggle={() => toggle(id)} />
                  case 'HOLDING':         return <HoldingCard       key={id} entry={entry} parsed={parsed} />
                  case 'NO_SETUP':        return <NoSetupCard       key={id} entry={entry} parsed={parsed} />
                  case 'TREND_REJECTED':  return <TrendRejectedCard key={id} entry={entry} parsed={parsed} />
                  case 'ALREADY_HOLDING': return <AlreadyHoldingCard key={id} entry={entry} parsed={parsed} />
                  default:                return <OtherCard         key={id} entry={entry} />
                }
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
