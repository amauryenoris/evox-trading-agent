import Anthropic from '@anthropic-ai/sdk'
import { getNewsForSymbols, getMacroNews } from './alpaca'
import { saveNewsEvent, getRecentNormalizedHeadlines, getRecentNewsClassifications } from './db'
import type { ThresholdMap, NewsEvent } from './types'
import { ZSCORE_ENTRY_THRESHOLD } from './config'

const BASE_THRESHOLD = ZSCORE_ENTRY_THRESHOLD

function normalizeHeadline(h: string): string {
  return h
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
}
const MAX_NEWS_PER_CYCLE = 10

// Hard caps — symmetric ±0.15 around base threshold
const MAX_BULLISH_ADJUSTMENT  =  0.150  // ceiling: max bullish relaxation per cycle/symbol
const MAX_BEARISH_ADJUSTMENT  = -0.150  // floor: max bearish tightening per cycle/symbol

interface NewsClassification {
  scope: 'MACRO' | 'SYMBOL'
  symbol: string | null
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL'
  impact: 'HIGH' | 'MEDIUM' | 'LOW'
  threshold_adjustment: number
  reasoning: string
}

function getThresholdAdjustment(sentiment: string, impact: string): number {
  if (sentiment === 'BULLISH') {
    if (impact === 'HIGH') return 0.15
    if (impact === 'MEDIUM') return 0.08
    return 0.03
  }
  if (sentiment === 'BEARISH') {
    if (impact === 'HIGH') return -0.15
    if (impact === 'MEDIUM') return -0.10
    return -0.05
  }
  return 0.0
}

async function classifyNewsItem(
  client: Anthropic,
  headline: string,
  symbol: string | null
): Promise<NewsClassification | null> {
  const prompt = `Classify this news item for a stock trading system. Return JSON only, no explanation.

Headline: "${headline}"
${symbol ? `Symbol: ${symbol}` : 'No specific symbol (may be macro)'}

Return exactly this JSON structure:
{
  "scope": "MACRO or SYMBOL",
  "symbol": "ticker or null",
  "sentiment": "BULLISH or BEARISH or NEUTRAL",
  "impact": "HIGH or MEDIUM or LOW",
  "reasoning": "one sentence"
}

Rules for scope:

scope=SYMBOL when:
- ONE specific company is the clear protagonist
- The news is primarily ABOUT that company
- Examples: earnings, CEO change, product launch, analyst rating, acquisition, guidance

scope=MACRO when:
- No single company is the main subject
- Two or more companies are equally central
- The company is mentioned only as context for a sector or market move
- The subject is an ETF, index, or benchmark (SPY, QQQ, VIX, S&P 500, Nasdaq, Dow)
- Affects economy or market broadly
- Examples: Fed decisions, inflation, rates, geopolitical events, sector-wide moves

When in doubt → scope=SYMBOL is safer

Rules for symbol:
- scope=SYMBOL → return the ONE protagonist ticker
- scope=MACRO → symbol MUST be null, never a ticker
- ETFs and indexes → always null

Verification examples:
  "Microsoft earnings beat estimates" → SYMBOL, MSFT
  "Microsoft and Nvidia expand AI partnership" → MACRO, null (two equal protagonists)
  "Chip stocks rally as Nvidia boosts sentiment" → MACRO, null (Nvidia is context, not protagonist)
  "SPY rises after CPI data" → MACRO, null (ETF/index)
  "Intel reports strong AI chip demand" → SYMBOL, INTC
  "S&P 500 drops amid tech sell-off" → MACRO, null
  "This Roblox Analyst Is No Longer Bullish" → SYMBOL, RBLX (company name without ticker = still SYMBOL)
  "Intel's Best Month Ever Powers ETF Wins" → SYMBOL, INTC (Intel is protagonist, ETF is secondary beneficiary)
  "SOXX ETF hits all-time high" → MACRO, null (ETF is the protagonist here)

Rules for sentiment and impact:
- sentiment=BULLISH if positive for stock prices, BEARISH if negative, NEUTRAL otherwise
- impact=HIGH for major surprises, MEDIUM for notable news, LOW for minor updates

Additional rules for specific event types:

Geopolitical events (wars, attacks, sanctions, conflicts, military strikes):
  → sentiment=BEARISH for equity markets
  → Exception: if directly benefits a specific sector (e.g. defense stocks) classify as SYMBOL not MACRO

Oil and commodity supply disruptions (pipeline attacks, port closures, OPEC cuts, natural disasters affecting supply):
  → sentiment=BEARISH for broad equity markets
  → Reason: supply shock = inflation risk + economic uncertainty

Central bank and rates (Fed, ECB, rate hikes, rate cuts, inflation data):
  → BEARISH if rates rise or inflation high
  → BULLISH if rates cut or inflation falls

Earnings surprises:
  → BULLISH if beat estimates
  → BEARISH if miss estimates or weak guidance

Examples:
  "Iran strikes UAE port" → MACRO BEARISH HIGH
  "Fire at petroleum site following drone attack" → MACRO BEARISH HIGH (supply disruption)
  "Fed cuts rates 50bps" → MACRO BULLISH HIGH
  "US sanctions on Iranian oil buyers" → MACRO BEARISH MEDIUM (trade uncertainty)`

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null
    const parsed = JSON.parse(jsonMatch[0]) as Partial<NewsClassification>
    if (!parsed.scope || !parsed.sentiment || !parsed.impact) return null
    const adjustment = getThresholdAdjustment(parsed.sentiment, parsed.impact)
    return {
      scope: parsed.scope,
      symbol: parsed.symbol ?? symbol,
      sentiment: parsed.sentiment,
      impact: parsed.impact,
      threshold_adjustment: adjustment,
      reasoning: parsed.reasoning ?? '',
    }
  } catch {
    return null
  }
}

export async function newsIntelligenceLayer(symbols: string[]): Promise<ThresholdMap> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.warn('[NEWS] ANTHROPIC_API_KEY not set — using default thresholds')
    return buildDefaultMap(symbols)
  }

  try {
    // Fetch news from Alpaca
    const [symbolNews, macroNews] = await Promise.all([
      getNewsForSymbols(symbols, 12, 5),
      getMacroNews(12, 8),
    ])

    const allArticles = [...symbolNews, ...macroNews]
    if (allArticles.length === 0) {
      console.log('[NEWS] No news articles found — using default thresholds')
      return buildDefaultMap(symbols)
    }

    // Cross-cycle dedup: fetch normalized headlines already processed in last 12h
    const existingNormalized = await getRecentNormalizedHeadlines(12)

    // Deduplicate within-cycle AND against DB
    const seen = new Set<string>()
    const unique = allArticles.filter((a) => {
      const normalized = normalizeHeadline(a.headline)
      if (seen.has(normalized) || existingNormalized.has(normalized)) return false
      seen.add(normalized)
      return true
    })

    // If all articles are already in DB, rebuild thresholdMap from recent DB events
    if (unique.length === 0) {
      console.log('[NEWS] All articles already processed — rebuilding thresholdMap from DB')
      const recentEvents = await getRecentNewsClassifications(12)
      const asClassified: NewsClassification[] = recentEvents
        .filter((e) => e.scope && e.sentiment && e.impact)
        .map((e) => ({
          scope: e.scope as 'MACRO' | 'SYMBOL',
          symbol: e.symbol,
          sentiment: e.sentiment as 'BULLISH' | 'BEARISH' | 'NEUTRAL',
          impact: e.impact as 'HIGH' | 'MEDIUM' | 'LOW',
          threshold_adjustment: e.threshold_adjustment,
          reasoning: '',
        }))
      return buildThresholdMap(symbols, asClassified)
    }

    // Limit to MAX_NEWS_PER_CYCLE
    const toProcess = unique.slice(0, MAX_NEWS_PER_CYCLE)
    console.log(`[NEWS] Processing ${toProcess.length} articles (${unique.length} unique, ${allArticles.length} total)`)

    const client = new Anthropic({ apiKey })
    const now = new Date().toISOString()

    const classified: NewsClassification[] = []
    for (const article of toProcess) {
      const primarySymbol = article.symbols?.[0] ?? null
      const result = await classifyNewsItem(client, article.headline, primarySymbol)
      if (!result) continue

      classified.push(result)

      // Persist to Supabase
      const event: Omit<NewsEvent, 'id' | 'created_at'> = {
        timestamp: now,
        symbol: result.symbol,
        scope: result.scope,
        sentiment: result.sentiment,
        impact: result.impact,
        threshold_adjustment: result.threshold_adjustment,
        headline: article.headline,
        headline_normalized: normalizeHeadline(article.headline),
        reasoning: result.reasoning,
      }
      try {
        await saveNewsEvent(event)
      } catch (err) {
        console.error('[NEWS] Failed to save news event:', err)
      }
    }

    return buildThresholdMap(symbols, classified)
  } catch (err) {
    console.error('[NEWS] News intelligence layer failed, using defaults:', err)
    return buildDefaultMap(symbols)
  }
}

function buildDefaultMap(symbols: string[]): ThresholdMap {
  const map: ThresholdMap = { __MACRO__: 0 }
  for (const s of symbols) map[s] = BASE_THRESHOLD
  return map
}

// Fix #2: Returns STRONGEST adjustment per symbol — not sum of all.
// Bearish (positive adj) overrides bullish (negative adj) when both exist.
function getSymbolAdjustment(newsItems: NewsClassification[]): number {
  if (newsItems.length === 0) return 0

  const bullish = newsItems.filter((c) => c.threshold_adjustment < 0)
  const bearish = newsItems.filter((c) => c.threshold_adjustment > 0)

  const strongestBullish = bullish.length > 0
    ? Math.min(...bullish.map((c) => c.threshold_adjustment))  // most negative
    : 0
  const strongestBearish = bearish.length > 0
    ? Math.max(...bearish.map((c) => c.threshold_adjustment))  // most positive
    : 0

  // Bearish overrides bullish if both exist
  if (strongestBearish > 0) return strongestBearish
  return strongestBullish
}

function buildThresholdMap(symbols: string[], classified: NewsClassification[]): ThresholdMap {
  const map: ThresholdMap = {}

  // Start all symbols at base threshold
  for (const s of symbols) map[s] = BASE_THRESHOLD

  // Fix #1: Calculate macro adjustment (sum), then apply hard cap at ±0.300
  let macroAdjustment = classified
    .filter((c) => c.scope === 'MACRO')
    .reduce((sum, c) => sum + c.threshold_adjustment, 0)
  macroAdjustment = Math.min(macroAdjustment, MAX_BULLISH_ADJUSTMENT)  // ceiling +0.15
  macroAdjustment = Math.max(macroAdjustment, MAX_BEARISH_ADJUSTMENT)  // floor -0.15
  map['__MACRO__'] = macroAdjustment
  console.log(`[NEWS] Macro adjustment: ${macroAdjustment.toFixed(3)} (capped at ±${MAX_BULLISH_ADJUSTMENT})`)

  // Fix #2: Group symbol news and apply STRONGEST adjustment per symbol
  const symbolNewsMap = new Map<string, NewsClassification[]>()
  for (const c of classified) {
    if (c.scope === 'SYMBOL' && c.symbol && map[c.symbol] !== undefined) {
      if (!symbolNewsMap.has(c.symbol)) symbolNewsMap.set(c.symbol, [])
      symbolNewsMap.get(c.symbol)!.push(c)
    }
  }

  const symbolsWithOwnNews = new Set<string>()
  for (const [symbol, newsItems] of symbolNewsMap) {
    let symbolAdj = getSymbolAdjustment(newsItems)
    symbolAdj = Math.min(symbolAdj, MAX_BULLISH_ADJUSTMENT)  // ceiling +0.15
    symbolAdj = Math.max(symbolAdj, MAX_BEARISH_ADJUSTMENT)  // floor -0.15

    const adjusted = BASE_THRESHOLD + macroAdjustment + symbolAdj
    map[symbol] = Math.max(-1.8, Math.min(-1.2, adjusted))
    symbolsWithOwnNews.add(symbol)
  }

  // Apply macro adjustment to symbols without their own news
  if (macroAdjustment !== 0) {
    for (const s of symbols) {
      if (!symbolsWithOwnNews.has(s)) {
        const adjusted = map[s] + macroAdjustment
        map[s] = Math.max(-1.8, Math.min(-1.2, adjusted))
      }
    }
  }

  const adjustedCount = Object.entries(map)
    .filter(([k, v]) => k !== '__MACRO__' && v !== BASE_THRESHOLD)
    .length
  const uniqueSymbolBoosts = symbolsWithOwnNews.size
  console.log(`[NEWS] Threshold map built — ${adjustedCount} symbols adjusted, ${uniqueSymbolBoosts} unique symbols with own news, macro=${macroAdjustment.toFixed(3)}`)

  return map
}
