import Anthropic from '@anthropic-ai/sdk'
import type { MacroSentimentSummary } from './news-intelligence'
import type { SectorRotationSnapshot } from './sector-rotation'
import type { MarketDailyBriefing } from './types'
import { getMarketDailyBriefingByDate, upsertMarketDailyBriefing } from './db-market-briefing'

export interface SpxSnapshot {
  spx_price: number | null
  spx_sma50: number | null
  spx_sma200: number | null
  spx_regime: string | null
}

const RETRYABLE_STATUS_CODES = new Set([429, 529])

// Duplicated from claude-agent.ts's private callClaudeWithRetry() — that
// helper isn't exported and claude-agent.ts is Protected Zone, so this
// feature keeps its own copy rather than touching it.
async function callClaudeWithRetry(
  client: Anthropic,
  params: Parameters<Anthropic['messages']['create']>[0],
  maxRetries = 4
): Promise<Anthropic.Message> {
  let lastError: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await client.messages.create(params) as Anthropic.Message
    } catch (err) {
      lastError = err
      const status = (err as { status?: number }).status
      if (!status || !RETRYABLE_STATUS_CODES.has(status)) throw err

      if (attempt < maxRetries) {
        const delayMs = Math.min(1000 * 2 ** attempt, 30_000) + Math.random() * 500
        console.warn(`[BRIEFING] Claude API ${status} (attempt ${attempt + 1}/${maxRetries}) — retrying in ${Math.round(delayMs)}ms`)
        await new Promise((r) => setTimeout(r, delayMs))
      }
    }
  }
  throw lastError
}

const NARRATIVE_SYSTEM_PROMPT = `You are a market analyst writing a concise daily market briefing.
You will receive an SPX trend snapshot, sector rotation data, and a macro news sentiment count.
Synthesize these into a short narrative summarizing today's market conditions.

RESPOND ONLY with valid JSON (no markdown):
{
  "narrative": "2-4 sentences summarizing market regime, sector rotation, and macro sentiment"
}`

export function formatSpxSnapshotContext(snapshot: SpxSnapshot): string {
  if (snapshot.spx_price === null || snapshot.spx_regime === null) return 'SPX: no data'
  return `SPX: $${snapshot.spx_price.toFixed(2)}, regime=${snapshot.spx_regime}, SMA50=${snapshot.spx_sma50?.toFixed(2) ?? 'n/a'}, SMA200=${snapshot.spx_sma200?.toFixed(2) ?? 'n/a'}`
}

export function formatSectorRotationSnapshot(snapshot: SectorRotationSnapshot): string {
  const label = (name: string, val: number | null) =>
    val === null ? `${name}: no data` : `${name}: ${val >= 0 ? '+' : ''}${val.toFixed(2)}% vs SPY (20d)`

  return [
    label('Gold/Mining (GDX)', snapshot.gdx_relative_strength_pct),
    label('Energy (XLE)', snapshot.xle_relative_strength_pct),
    label('Technology (XLK)', snapshot.xlk_relative_strength_pct),
  ].join('\n')
}

export function formatMacroSentimentSummary(summary: MacroSentimentSummary): string {
  return `MACRO NEWS SENTIMENT (last 12h): ${summary.bullishCount} bullish, ${summary.bearishCount} bearish, ${summary.neutralCount} neutral`
}

export function buildBriefingRecord(
  briefingDate: string,
  spxSnapshot: SpxSnapshot,
  sectorRotation: SectorRotationSnapshot,
  macroSentiment: MacroSentimentSummary,
  narrative: string
): Omit<MarketDailyBriefing, 'id' | 'created_at'> {
  return {
    briefing_date: briefingDate,
    spx_price: spxSnapshot.spx_price,
    spx_sma50: spxSnapshot.spx_sma50,
    spx_sma200: spxSnapshot.spx_sma200,
    spx_regime: spxSnapshot.spx_regime,
    gdx_relative_strength_pct: sectorRotation.gdx_relative_strength_pct,
    xle_relative_strength_pct: sectorRotation.xle_relative_strength_pct,
    xlk_relative_strength_pct: sectorRotation.xlk_relative_strength_pct,
    macro_sentiment_bullish_count: macroSentiment.bullishCount,
    macro_sentiment_bearish_count: macroSentiment.bearishCount,
    macro_sentiment_neutral_count: macroSentiment.neutralCount,
    narrative,
    vix_proxy_change: null,
    upcoming_events_note: null,
  }
}

export async function synthesizeDailyBriefingNarrative(
  spxSnapshot: SpxSnapshot,
  sectorRotation: SectorRotationSnapshot,
  macroSentiment: MacroSentimentSummary
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')

  const prompt = `DAILY MARKET BRIEFING REQUEST

${formatSpxSnapshotContext(spxSnapshot)}

--- SECTOR ROTATION (20d relative strength vs SPY) ---
${formatSectorRotationSnapshot(sectorRotation)}

--- MACRO SENTIMENT ---
${formatMacroSentimentSummary(macroSentiment)}`

  const client = new Anthropic({ apiKey })
  const response = await callClaudeWithRetry(client, {
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: NARRATIVE_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  })

  const content = response.content[0]
  if (content.type !== 'text') throw new Error('Unexpected Claude response type')

  const jsonText = content.text.replace(/```json\n?|\n?```/g, '').trim()
  const parsed = JSON.parse(jsonText) as { narrative: string }

  return parsed.narrative
}

export async function generateDailyBriefing(
  spxSnapshot: SpxSnapshot,
  sectorRotation: SectorRotationSnapshot,
  macroSentiment: MacroSentimentSummary,
  synthesize: typeof synthesizeDailyBriefingNarrative = synthesizeDailyBriefingNarrative
): Promise<string> {
  const today = new Date().toISOString().split('T')[0]

  const existing = await getMarketDailyBriefingByDate(today)
  if (existing) {
    console.log(`[BRIEFING] Briefing already exists for ${today} — skipping synthesis`)
    return existing.narrative
  }

  const narrative = await synthesize(spxSnapshot, sectorRotation, macroSentiment)

  await upsertMarketDailyBriefing(buildBriefingRecord(today, spxSnapshot, sectorRotation, macroSentiment, narrative))
  console.log(`[BRIEFING] Synthesized and persisted new briefing for ${today}`)

  return narrative
}
