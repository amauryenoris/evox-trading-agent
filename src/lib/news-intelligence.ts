import Anthropic from '@anthropic-ai/sdk'
import { getNewsForSymbols, getMacroNews } from './alpaca'
import { saveNewsEvent } from './db'
import type { ThresholdMap, NewsEvent } from './types'

const BASE_THRESHOLD = -1.5
const MAX_NEWS_PER_CYCLE = 10

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
    if (impact === 'HIGH') return -0.15
    if (impact === 'MEDIUM') return -0.08
    return -0.03
  }
  if (sentiment === 'BEARISH') {
    if (impact === 'HIGH') return 0.25
    if (impact === 'MEDIUM') return 0.15
    return 0.05
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

Rules:
- scope=MACRO if it affects broad market (Fed, inflation, war, recession, rates)
- scope=SYMBOL if it affects one specific stock
- sentiment=BULLISH if positive for stock prices, BEARISH if negative, NEUTRAL otherwise
- impact=HIGH for major surprises, MEDIUM for notable news, LOW for minor updates`

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

    // Deduplicate by headline
    const seen = new Set<string>()
    const unique = allArticles.filter((a) => {
      if (seen.has(a.headline)) return false
      seen.add(a.headline)
      return true
    })

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

function buildThresholdMap(symbols: string[], classified: NewsClassification[]): ThresholdMap {
  const map: ThresholdMap = {}

  // Start all symbols at base threshold
  for (const s of symbols) map[s] = BASE_THRESHOLD

  // Calculate macro adjustment (sum of all MACRO news adjustments)
  const macroAdjustment = classified
    .filter((c) => c.scope === 'MACRO')
    .reduce((sum, c) => sum + c.threshold_adjustment, 0)
  map['__MACRO__'] = macroAdjustment

  // Track which symbols have their own news
  const symbolsWithOwnNews = new Set<string>()

  // Apply SYMBOL-level adjustments
  for (const c of classified) {
    if (c.scope === 'SYMBOL' && c.symbol && map[c.symbol] !== undefined) {
      const current = map[c.symbol]
      const adjusted = current + c.threshold_adjustment
      // Cap adjustments: threshold must stay between -1.8 and -1.2
      map[c.symbol] = Math.max(-1.8, Math.min(-1.2, adjusted))
      symbolsWithOwnNews.add(c.symbol)
    }
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
  console.log(`[NEWS] Threshold map built — ${adjustedCount} symbols adjusted, macro=${macroAdjustment.toFixed(3)}`)

  return map
}
