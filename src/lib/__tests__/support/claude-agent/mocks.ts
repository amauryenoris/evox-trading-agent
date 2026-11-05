import { vi } from 'vitest'
import type { TechnicalIndicators, TradeEvaluation } from '../../../types'

// Registered before '../claude-agent' is imported by the test file. Every boundary of runAgentCycle is doubled here.
const w = await vi.hoisted(async () => (await import('./world')).createWorld())
export const world = w

const CORE_PARAMS = new Set(['model', 'max_tokens', 'system', 'messages'])

vi.mock('../../../alpaca', async (orig) => ({ ...(await orig<typeof import('../../../alpaca')>()), ...w.alpaca }))

vi.mock('../../../indicators', async (orig) => ({
  ...(await orig<typeof import('../../../indicators')>()),
  calculateAllIndicators: (bars: object) => w.indicatorsFor(bars),
}))

vi.mock('../../../db', async (orig) => ({ ...(await orig<typeof import('../../../db')>()), ...w.db }))
vi.mock('../../../db-cooldowns', async (orig) => ({ ...(await orig<typeof import('../../../db-cooldowns')>()), ...w.cooldowns }))

vi.mock('../../../db-earnings', async (orig) => ({
  ...(await orig<typeof import('../../../db-earnings')>()),
  getEarningsCacheFreshness: async () => '2026-11-04T12:00:00.000Z',
  getNextEarningsReport: async (symbol: string) => w.cfg.earnings[symbol] ?? null,
}))

vi.mock('../../../agent-log', () => ({
  readAgentLog: async () => [],
  appendAgentLogEntries: async (entries: Array<Parameters<typeof w.summarizeEntry>[0]>) => {
    w.rec('agentLog.append', { entries: entries.map(w.summarizeEntry) })
  },
}))

vi.mock('../../../peak-high', async (orig) => ({ ...(await orig<typeof import('../../../peak-high')>()), getPeakHighSinceLastCheck: async () => null }))

vi.mock('../../../learning', async (orig) => ({
  ...(await orig<typeof import('../../../learning')>()),
  evaluateClosedTrade: async (ctx: { symbol: string }, sellPrice: number): Promise<TradeEvaluation> => {
    w.rec('learning.evaluateClosedTrade', { symbol: ctx.symbol, sellPrice })
    return { id: `eval-${ctx.symbol}`, symbol: ctx.symbol, sellPrice } as unknown as TradeEvaluation
  },
}))

vi.mock('../../../risk-manager', async (orig) => ({
  ...(await orig<typeof import('../../../risk-manager')>()),
  isNewPositionAllowed: async (symbol: string) => { w.rec('risk.isNewPositionAllowed', { symbol }); return w.cfg.risk },
}))

vi.mock('../../../stock-selector', async (orig) => ({
  ...(await orig<typeof import('../../../stock-selector')>()),
  selectStocksForAnalysis: async () => { w.rec('selector.select'); return [...w.cfg.watchlist] },
  recordSelectionOutcome: async (symbol: string) => { w.rec('selector.recordOutcome', { symbol }) },
}))

vi.mock('../../../news-intelligence', async (orig) => ({
  ...(await orig<typeof import('../../../news-intelligence')>()),
  newsIntelligenceLayer: async (symbols: string[]) => {
    w.rec('news.layer', { symbols })
    return { __MACRO__: 0, ...Object.fromEntries(symbols.map((s) => [s, w.PINS.zscoreEntryThreshold])) }
  },
  getAggregateMacroSentiment: async () => ({ sentiment: 'NEUTRAL', count: 0 }),
}))

vi.mock('../../../market-daily-briefing', async (orig) => ({
  ...(await orig<typeof import('../../../market-daily-briefing')>()),
  generateDailyBriefing: async () => 'Scripted daily briefing.',
}))

vi.mock('../../../watchlist-monitor', async (orig) => ({
  ...(await orig<typeof import('../../../watchlist-monitor')>()),
  updateWatchlist: async () => { w.rec('watchlist.update') },
  checkAutoEntry: async () => { w.rec('watchlist.checkAutoEntry'); return [...w.cfg.autoEntry] },
  detectNearMisses: async (symbol: string, _ind: TechnicalIndicators, _t: unknown, opts?: Record<string, unknown>) => {
    w.rec('watchlist.detectNearMisses', { symbol, opts: opts ?? null })
  },
  markWatchlistTriggered: async (symbol: string, entryLogId: string) => { w.rec('watchlist.markTriggered', { symbol, entryLogId }) },
}))

vi.mock('../../../config', async (orig) => ({
  ...(await orig<typeof import('../../../config')>()),
  ZSCORE_ENTRY_THRESHOLD: w.PINS.zscoreEntryThreshold,
  MAX_SPREAD_BPS: w.PINS.maxSpreadBps,
  INSTRUMENT_BLACKLIST: new Set(w.PINS.blacklist),
}))

vi.mock('../../../position-sizing', async (orig) => {
  const actual = await orig<typeof import('../../../position-sizing')>()
  return {
    ...actual,
    computeBuyQuantity: (input: Parameters<typeof actual.computeBuyQuantity>[0]) =>
      actual.computeBuyQuantity({ ...input, zOverrideEnabled: w.PINS.zOverrideEnabled }),
  }
})

vi.mock('crypto', async (orig) => {
  const actual = await orig<typeof import('crypto')>()
  return { ...actual, randomUUID: () => w.nextUuid() }
})

vi.mock('@anthropic-ai/sdk', () => ({
  default: class FakeAnthropic {
    messages = {
      create: async (params: Record<string, unknown>) => {
        const messages = params.messages as Array<{ role: string; content: string }>
        const user = messages[0].content
        w.prompts.push({ system: String(params.system), user })
        w.rec('claude.create', {
          model: params.model, maxTokens: params.max_tokens, paramKeys: Object.keys(params).sort(),
          messageRoles: messages.map((m) => m.role), systemIsString: typeof params.system === 'string',
          extraParams: Object.fromEntries(Object.entries(params).filter(([k]) => !CORE_PARAMS.has(k))),
        })
        return { content: [{ type: 'text', text: w.cfg.claude(user) }] }
      },
    }
  },
}))
