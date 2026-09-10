'use client'

import { useEffect, useState } from 'react'
import { Card, Badge } from './ui'
import type { BadgeTone } from './ui'
import type { MarketDailyBriefing, SelectionDecision } from '@/lib/types'

const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ')

const STALE_THRESHOLD_DAYS = 2

interface BuyScannerData {
  briefing: MarketDailyBriefing | null
  selections: SelectionDecision[]
}

const REGIME_TONE: Record<string, BadgeTone> = {
  BULL: 'green',
  CAUTION: 'amber',
  BEAR: 'red',
}

function fmtPct(n: number | null, dp = 1): string {
  if (n === null) return '—'
  return (n >= 0 ? '+' : '') + n.toFixed(dp) + '%'
}

function isStale(mostRecentTimestamp: string | undefined): boolean {
  if (!mostRecentTimestamp) return true
  const ageMs = Date.now() - new Date(mostRecentTimestamp).getTime()
  return ageMs > STALE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000
}

function KV({ label, value, tone = 'neutral' }: {
  label: string; value: string; tone?: 'green' | 'red' | 'neutral'
}) {
  const tones = { green: 'text-green', red: 'text-red', neutral: 'text-text' }
  return (
    <div>
      <div className="text-[9.5px] uppercase tracking-wider text-muted">{label}</div>
      <div className={cx('num font-semibold mt-0.5', tones[tone])}>{value}</div>
    </div>
  )
}

function BriefingCard({ briefing }: { briefing: MarketDailyBriefing | null }) {
  if (!briefing) {
    return (
      <Card>
        <h3 className="text-sm font-semibold tracking-[0.18em] uppercase mb-2">Market Daily Briefing</h3>
        <p className="text-sm text-muted">No briefing available.</p>
      </Card>
    )
  }

  const regimeTone = (briefing.spx_regime && REGIME_TONE[briefing.spx_regime]) || 'neutral'
  const priceVsSma50 = briefing.spx_price !== null && briefing.spx_sma50 !== null
    ? ((briefing.spx_price - briefing.spx_sma50) / briefing.spx_sma50) * 100
    : null
  const priceVsSma200 = briefing.spx_price !== null && briefing.spx_sma200 !== null
    ? ((briefing.spx_price - briefing.spx_sma200) / briefing.spx_sma200) * 100
    : null

  return (
    <Card padded={false}>
      <div className="flex items-center justify-between px-6 pt-5 pb-3">
        <h3 className="text-sm font-semibold tracking-[0.18em] uppercase">Market Daily Briefing</h3>
        {briefing.spx_regime && <Badge tone={regimeTone}>{briefing.spx_regime}</Badge>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-6 pb-4">
        <KV label="SPX" value={briefing.spx_price !== null ? `$${briefing.spx_price.toFixed(2)}` : '—'} />
        <KV
          label="vs SMA50"
          value={fmtPct(priceVsSma50)}
          tone={priceVsSma50 === null ? 'neutral' : priceVsSma50 >= 0 ? 'green' : 'red'}
        />
        <KV
          label="vs SMA200"
          value={fmtPct(priceVsSma200)}
          tone={priceVsSma200 === null ? 'neutral' : priceVsSma200 >= 0 ? 'green' : 'red'}
        />
        <KV
          label="VIX Δ"
          value={fmtPct(briefing.vix_proxy_change)}
          tone={briefing.vix_proxy_change === null ? 'neutral' : briefing.vix_proxy_change >= 0 ? 'red' : 'green'}
        />
      </div>

      <div className="grid grid-cols-3 gap-3 px-6 pb-4">
        <KV label="GDX RS" value={fmtPct(briefing.gdx_relative_strength_pct)} />
        <KV label="XLE RS" value={fmtPct(briefing.xle_relative_strength_pct)} />
        <KV label="XLK RS" value={fmtPct(briefing.xlk_relative_strength_pct)} />
      </div>

      <div className="flex items-center gap-4 px-6 pb-4 text-[11px]">
        <span className="text-green">Bullish {briefing.macro_sentiment_bullish_count}</span>
        <span className="text-red">Bearish {briefing.macro_sentiment_bearish_count}</span>
        <span className="text-muted">Neutral {briefing.macro_sentiment_neutral_count}</span>
      </div>

      <div className="px-6 pb-5 text-[13px] text-mute2 leading-relaxed">
        {briefing.narrative}
      </div>
    </Card>
  )
}

function LatestSelectionCard({ selection }: { selection: SelectionDecision }) {
  const scoresBySymbol = new Map((selection.candidateScores ?? []).map((c) => [c.symbol, c]))
  const selected = selection.selectedSymbols.map((symbol) => ({
    symbol,
    score: scoresBySymbol.get(symbol),
  }))

  return (
    <Card padded={false}>
      <div className="flex items-baseline justify-between px-6 pt-5 pb-3">
        <h3 className="text-sm font-semibold tracking-[0.18em] uppercase">Latest Selection Cycle</h3>
        <span className="text-[11px] text-muted">{new Date(selection.timestamp).toLocaleString('en-US')}</span>
      </div>

      {selection.reasoning && (
        <p className="px-6 pb-3 text-[12.5px] text-mute2 leading-relaxed">{selection.reasoning}</p>
      )}

      <div className="divide-y divide-border">
        {selected.map(({ symbol, score }) => (
          <div key={symbol} className="px-6 py-4">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex items-center gap-2.5">
                <span className="font-semibold">{symbol}</span>
                {score && <Badge tone="blue" size="xs">{score.regime}</Badge>}
              </div>
              {score && <span className="text-[10.5px] text-muted num">score {score.score}</span>}
            </div>
            {score ? (
              <>
                <div className="text-[12.5px] text-mute2 leading-relaxed mb-2">{score.thesis}</div>
                {score.risks.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {score.risks.map((risk, i) => (
                      <Badge key={`${symbol}-risk-${i}`} tone="amber" size="xs">{risk}</Badge>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="text-[11px] text-muted">No score data for this candidate.</p>
            )}
          </div>
        ))}
      </div>
    </Card>
  )
}

function OlderSelectionsCard({ selections }: { selections: SelectionDecision[] }) {
  return (
    <Card padded={false}>
      <div className="px-6 pt-5 pb-3">
        <h3 className="text-sm font-semibold tracking-[0.18em] uppercase">Earlier Cycles</h3>
      </div>
      <div className="divide-y divide-border">
        {selections.map((s) => (
          <div key={s.timestamp} className="px-6 py-3 flex items-center justify-between gap-3">
            <span className="text-[11px] text-muted shrink-0">{new Date(s.timestamp).toLocaleString('en-US')}</span>
            <span className="text-[12px] text-mute2 text-right">{s.selectedSymbols.join(', ')}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}

export function BuyScannerPanel() {
  const [data, setData] = useState<BuyScannerData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/buy-scanner')
      .then((r) => r.json())
      .then((d: BuyScannerData) => { setData(d); setLoading(false) })
      .catch((e) => { setError(String(e)); setLoading(false) })
  }, [])

  if (error) {
    return (
      <Card>
        <p className="text-xs text-red">Buy Scanner data unavailable: {error}</p>
      </Card>
    )
  }

  if (loading || !data) {
    return (
      <Card padded={false}>
        <div className="animate-pulse px-6 py-5 space-y-3">
          <div className="h-24 bg-white/[0.04] rounded-lg" />
          <div className="h-40 bg-white/[0.04] rounded-lg" />
        </div>
      </Card>
    )
  }

  const { briefing, selections } = data
  const [latest, ...older] = selections
  const showStaleNotice = selections.length === 0 || isStale(latest?.timestamp)

  return (
    <div className="space-y-5">
      <BriefingCard briefing={briefing} />
      {showStaleNotice && (
        <Card>
          <p className="text-xs text-muted">
            {selections.length === 0
              ? 'No selection cycles recorded yet.'
              : `No selection cycles in the last ${STALE_THRESHOLD_DAYS} days.`}
          </p>
        </Card>
      )}
      {latest && <LatestSelectionCard selection={latest} />}
      {older.length > 0 && <OlderSelectionsCard selections={older} />}
    </div>
  )
}
