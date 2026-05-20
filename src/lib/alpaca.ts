import type {
  AlpacaAccount,
  AlpacaBar,
  AlpacaClock,
  AlpacaOrder,
  AlpacaPosition,
  ScreenerStock,
} from './types'
import { MAX_QUOTE_AGE_SECONDS } from './config'

function getHeaders() {
  const key = process.env.ALPACA_API_KEY
  const secret = process.env.ALPACA_SECRET_KEY
  if (!key || !secret) throw new Error('ALPACA_API_KEY or ALPACA_SECRET_KEY is not set')
  return {
    'APCA-API-KEY-ID': key,
    'APCA-API-SECRET-KEY': secret,
    'Content-Type': 'application/json',
  }
}

function baseUrl() {
  return process.env.ALPACA_BASE_URL ?? 'https://paper-api.alpaca.markets'
}

function dataUrl() {
  return process.env.ALPACA_DATA_URL ?? 'https://data.alpaca.markets'
}

async function alpacaFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...options, headers: { ...getHeaders(), ...(options?.headers ?? {}) } })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Alpaca API error ${res.status}: ${body}`)
  }
  return res.json() as Promise<T>
}

export async function getAccount(): Promise<AlpacaAccount> {
  return alpacaFetch<AlpacaAccount>(`${baseUrl()}/v2/account`)
}

export async function getPositions(): Promise<AlpacaPosition[]> {
  return alpacaFetch<AlpacaPosition[]>(`${baseUrl()}/v2/positions`)
}

export async function getOrders(status = 'filled', limit = 50): Promise<AlpacaOrder[]> {
  const url = new URL(`${baseUrl()}/v2/orders`)
  url.searchParams.set('status', status)
  url.searchParams.set('limit', String(limit))
  url.searchParams.set('direction', 'desc')
  return alpacaFetch<AlpacaOrder[]>(url.toString())
}

export async function getClock(): Promise<AlpacaClock> {
  return alpacaFetch<AlpacaClock>(`${baseUrl()}/v2/clock`)
}

export async function isMarketOpen(): Promise<boolean> {
  const clock = await getClock()
  return clock.is_open
}

/**
 * Fetches daily OHLCV bars for a symbol.
 * CRITICAL: feed=iex is required for free access with paper accounts.
 * Without it, Alpaca defaults to the SIP feed which requires a paid subscription.
 */
export async function getBars(
  symbol: string,
  timeframe: '1Day' | '1Hour' | '5Min' = '1Day',
  daysBack = 260,
  limit = 250
): Promise<AlpacaBar[]> {
  const start = new Date()
  start.setDate(start.getDate() - daysBack)
  const startStr = start.toISOString().split('T')[0]

  const url = new URL(`${dataUrl()}/v2/stocks/${symbol}/bars`)
  url.searchParams.set('timeframe', timeframe)
  url.searchParams.set('start', startStr)
  url.searchParams.set('limit', String(limit))
  url.searchParams.set('feed', 'sip')
  url.searchParams.set('sort', 'asc')

  const response = await alpacaFetch<{ bars: AlpacaBar[]; symbol: string; next_page_token: string | null }>(
    url.toString()
  )
  return response.bars ?? []
}

export async function submitOrder(
  symbol: string,
  qty: number,
  side: 'buy' | 'sell',
  type = 'market',
  timeInForce = 'day'
): Promise<AlpacaOrder> {
  return alpacaFetch<AlpacaOrder>(`${baseUrl()}/v2/orders`, {
    method: 'POST',
    body: JSON.stringify({ symbol, qty, side, type, time_in_force: timeInForce }),
  })
}

export async function submitLimitOrder(
  symbol: string,
  qty: number,
  side: 'buy' | 'sell',
  limitPrice: number,
): Promise<AlpacaOrder> {
  return alpacaFetch<AlpacaOrder>(`${baseUrl()}/v2/orders`, {
    method: 'POST',
    body: JSON.stringify({
      symbol,
      qty,
      side,
      type: 'limit',
      limit_price: Number(limitPrice.toFixed(2)),
      time_in_force: 'ioc',
    }),
  })
}

interface AlpacaQuoteResponse {
  quote?: {
    bp?: number
    ap?: number
    t?: string
  }
}

export async function getQuote(symbol: string): Promise<{
  bid: number
  ask: number
  spread: number
  spreadBps: number
  fresh: boolean
} | null> {
  try {
    const data = await alpacaFetch<AlpacaQuoteResponse>(
      `${dataUrl()}/v2/stocks/${symbol}/quotes/latest?feed=iex`
    )
    const bid = data?.quote?.bp ?? 0
    const ask = data?.quote?.ap ?? 0
    if (!bid || !ask) return null

    const quoteTime = data?.quote?.t ? new Date(data.quote.t).getTime() : null
    const fresh =
      quoteTime != null && (Date.now() - quoteTime) / 1000 < MAX_QUOTE_AGE_SECONDS

    const spread = ask - bid
    const mid = (bid + ask) / 2
    const spreadBps = mid > 0 ? Math.round((spread / mid) * 10000) : 9999

    return { bid, ask, spread, spreadBps, fresh }
  } catch {
    return null
  }
}

export async function closePosition(symbol: string): Promise<AlpacaOrder> {
  return alpacaFetch<AlpacaOrder>(`${baseUrl()}/v2/positions/${symbol}?cancel_orders=true`, {
    method: 'DELETE',
  })
}

interface AlpacaScreenerResponse {
  most_actives: Array<{ symbol: string; volume: number; trade_count: number }>
}

interface AlpacaSnapshot {
  latestTrade?: { p: number }
  dailyBar?: { c: number; o: number }
  prevDailyBar?: { c: number }
}

/**
 * Returns the top N most active stocks by volume with current price and daily change.
 * Falls back to empty array on any error — caller should use static watchlist as fallback.
 */
export async function getMarketMovers(limit = 30): Promise<ScreenerStock[]> {
  try {
    const screenerUrl = `${dataUrl()}/v1beta1/screener/stocks/most-actives?by=volume&top=${limit}`
    const screenerRes = await alpacaFetch<AlpacaScreenerResponse>(screenerUrl)
    const symbols = (screenerRes.most_actives ?? []).map((s) => s.symbol)
    if (symbols.length === 0) return []

    const snapshotUrl = `${dataUrl()}/v2/stocks/snapshots?symbols=${symbols.join(',')}&feed=iex`
    const snapshots = await alpacaFetch<Record<string, AlpacaSnapshot>>(snapshotUrl)

    return symbols
      .filter((sym) => snapshots[sym])
      .map((sym) => {
        const snap = snapshots[sym]
        const screenerData = screenerRes.most_actives.find((s) => s.symbol === sym)!
        const currentPrice = snap.latestTrade?.p ?? snap.dailyBar?.c ?? 0
        const prevClose = snap.prevDailyBar?.c ?? currentPrice
        const changePercent = prevClose > 0 ? ((currentPrice - prevClose) / prevClose) * 100 : 0
        return { symbol: sym, price: currentPrice, changePercent, volume: screenerData.volume }
      })
      .filter((s) => s.price > 0)
  } catch {
    return []
  }
}

/**
 * Returns current price snapshots for an arbitrary list of symbols.
 * Used to enrich sector watchlist stocks with live price/change data
 * before passing them to the stock selector.
 */
export async function getStockSnapshots(symbols: string[]): Promise<ScreenerStock[]> {
  if (symbols.length === 0) return []
  try {
    const snapshotUrl = `${dataUrl()}/v2/stocks/snapshots?symbols=${symbols.join(',')}&feed=iex`
    const snapshots = await alpacaFetch<Record<string, AlpacaSnapshot>>(snapshotUrl)

    return symbols
      .filter((sym) => snapshots[sym])
      .map((sym) => {
        const snap = snapshots[sym]
        const currentPrice = snap.latestTrade?.p ?? snap.dailyBar?.c ?? 0
        const prevClose = snap.prevDailyBar?.c ?? currentPrice
        const changePercent = prevClose > 0 ? ((currentPrice - prevClose) / prevClose) * 100 : 0
        return { symbol: sym, price: currentPrice, changePercent, volume: 0 }
      })
      .filter((s) => s.price > 0)
  } catch {
    return []
  }
}

export async function submitStopOrder(
  symbol: string,
  qty: number,
  stopPrice: number
): Promise<AlpacaOrder> {
  return alpacaFetch<AlpacaOrder>(`${baseUrl()}/v2/orders`, {
    method: 'POST',
    body: JSON.stringify({
      symbol,
      qty: String(qty),
      side: 'sell',
      type: 'stop',
      time_in_force: 'gtc',
      stop_price: stopPrice.toFixed(2),
    }),
  })
}

export interface AlpacaNewsArticle {
  id: number
  headline: string
  summary: string
  author: string
  created_at: string
  symbols: string[]
}

export async function getNewsForSymbols(
  symbols: string[],
  hoursBack = 24,
  limit = 5
): Promise<AlpacaNewsArticle[]> {
  try {
    const start = new Date(Date.now() - hoursBack * 3600 * 1000).toISOString()
    const url = new URL(`${dataUrl()}/v1beta1/news`)
    url.searchParams.set('symbols', symbols.join(','))
    url.searchParams.set('start', start)
    url.searchParams.set('limit', String(limit))
    url.searchParams.set('sort', 'desc')
    const res = await alpacaFetch<{ news: AlpacaNewsArticle[] }>(url.toString())
    return res.news ?? []
  } catch (err) {
    console.error('[NEWS] getNewsForSymbols failed:', (err as Error)?.message ?? err)
    return []
  }
}

export async function getMacroNews(hoursBack = 12, limit = 8): Promise<AlpacaNewsArticle[]> {
  try {
    const start = new Date(Date.now() - hoursBack * 3600 * 1000).toISOString()
    const url = new URL(`${dataUrl()}/v1beta1/news`)
    url.searchParams.set('start', start)
    url.searchParams.set('limit', String(limit))
    url.searchParams.set('sort', 'desc')
    const res = await alpacaFetch<{ news: AlpacaNewsArticle[] }>(url.toString())
    return res.news ?? []
  } catch (err) {
    console.error('[NEWS] getMacroNews failed:', (err as Error)?.message ?? err)
    return []
  }
}

/**
 * Returns the most recent filled sell order for a symbol after a given timestamp.
 * Used to find the exit price when a position is detected as closed.
 */
export async function getLatestSellOrder(symbol: string, afterTimestamp: string): Promise<AlpacaOrder | null> {
  const orders = await getOrders('filled', 100)
  const sellOrders = orders.filter(
    (o) =>
      o.symbol === symbol &&
      o.side === 'sell' &&
      o.filled_at !== null &&
      o.filled_at > afterTimestamp
  )
  if (sellOrders.length === 0) return null
  // Return the most recent one
  return sellOrders.sort((a, b) => (b.filled_at! > a.filled_at! ? 1 : -1))[0]
}
