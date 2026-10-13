import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { mockFrom, mockGetBars, mockGetOpenPositions } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockGetBars: vi.fn(),
  mockGetOpenPositions: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: mockFrom }) }))
vi.mock('../src/lib/alpaca.js', () => ({ getBars: mockGetBars }))
vi.mock('../src/lib/db.js', () => ({ getOpenPositionContexts: mockGetOpenPositions }))

import {
  SECTOR_PROXY_ETFS,
  BACKFILL_MIN_ROWS,
  BACKFILL_TARGET_BARS,
  buildUniverse,
  getSymbolUniverse,
  fetchHistoryBars,
  syncSymbols,
  toRows,
} from './daily-bars-sync'

const callsAtImport = { positions: mockGetOpenPositions.mock.calls.length, from: mockFrom.mock.calls.length }

interface TestBar { t: string; o: number; h: number; l: number; c: number; v: number; vw: number; n: number }

function makeBars(count: number, startIso = '2025-01-01'): TestBar[] {
  const start = new Date(`${startIso}T05:00:00Z`).getTime()
  return Array.from({ length: count }, (_, i) => ({
    t: new Date(start + i * 24 * 60 * 60 * 1000).toISOString(),
    o: 10 + i, h: 11 + i, l: 9 + i, c: 10.5 + i, v: 1000 + i, vw: 10.2 + i, n: 50 + i,
  }))
}

function pageResponse(bars: TestBar[], nextToken: string | null) {
  return { ok: true, status: 200, json: async () => ({ bars, next_page_token: nextToken }), text: async () => '' }
}

let storedCounts: Record<string, number | Error> = {}
let selectionResult: { data: unknown; error: { message: string } | null } = { data: [], error: null }

function wireSupabase() {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'selection_history') {
      return { select: () => ({ gte: async () => selectionResult }) }
    }
    return {
      select: () => ({
        eq: async (_column: string, symbol: string) => {
          const stored = storedCounts[symbol] ?? 400
          return stored instanceof Error ? { count: null, error: { message: stored.message } } : { count: stored, error: null }
        },
      }),
    }
  })
}

beforeEach(() => {
  vi.stubEnv('ALPACA_API_KEY', 'test-key')
  vi.stubEnv('ALPACA_SECRET_KEY', 'test-secret')
  storedCounts = {}
  selectionResult = { data: [], error: null }
  mockGetBars.mockReset().mockResolvedValue(makeBars(3))
  mockGetOpenPositions.mockReset().mockResolvedValue([])
  mockFrom.mockReset()
  wireSupabase()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('SECTOR_PROXY_ETFS and universe', () => {
  it('exports the eleven sector-proxy ETFs', () => {
    expect([...SECTOR_PROXY_ETFS]).toEqual(['SPY', 'GDX', 'XLE', 'XLK', 'COPX', 'URA', 'REMX', 'SMH', 'XLY', 'XLC', 'XME'])
  })

  it('contains every ETF exactly once when the base universe already has some of them', () => {
    const universe = buildUniverse(['AAPL', 'GDX', 'XLE', 'AAPL'])

    for (const etf of SECTOR_PROXY_ETFS) expect(universe.filter((s) => s === etf)).toHaveLength(1)
    expect(universe.filter((s) => s === 'AAPL')).toHaveLength(1)
  })

  it('keeps the symbols that are not ETFs', () => {
    expect(buildUniverse(['AAPL', 'FCX'])).toEqual(expect.arrayContaining(['AAPL', 'FCX']))
  })

  it('adds the ETFs to open positions and candidates in the live universe', async () => {
    mockGetOpenPositions.mockResolvedValue([{ symbol: 'FCX' }, { symbol: 'GDX' }])
    selectionResult = { data: [{ candidates_offered: [{ symbol: 'NEM' }, { symbol: 'SPY' }] }], error: null }

    const universe = await getSymbolUniverse()

    expect(universe).toEqual(expect.arrayContaining(['FCX', 'NEM', ...SECTOR_PROXY_ETFS]))
    expect(universe.filter((s) => s === 'GDX')).toHaveLength(1)
    expect(universe.filter((s) => s === 'SPY')).toHaveLength(1)
  })

  it('still includes the ETFs when the selection_history read fails', async () => {
    mockGetOpenPositions.mockResolvedValue([{ symbol: 'FCX' }])
    selectionResult = { data: null, error: { message: 'boom' } }

    const universe = await getSymbolUniverse()

    expect(universe).toEqual(expect.arrayContaining(['FCX', ...SECTOR_PROXY_ETFS]))
  })
})

describe('backfill decision', () => {
  it('backfills an ETF stored below the threshold', async () => {
    storedCounts = { GDX: BACKFILL_MIN_ROWS - 1 }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(pageResponse(makeBars(5), null)))

    await syncSymbols(['GDX'])

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(mockGetBars).not.toHaveBeenCalled()
  })

  it.each([BACKFILL_MIN_ROWS, BACKFILL_MIN_ROWS + 1])('keeps the normal path for an ETF stored at %i rows', async (stored) => {
    storedCounts = { GDX: stored }
    vi.stubGlobal('fetch', vi.fn())

    await syncSymbols(['GDX'])

    expect(fetch).not.toHaveBeenCalled()
    expect(mockGetBars).toHaveBeenCalledWith('GDX', '1Day', 400, 400)
  })

  it('never backfills a symbol that is not a sector-proxy ETF and never counts its rows', async () => {
    vi.stubGlobal('fetch', vi.fn())

    await syncSymbols(['AAPL'])

    expect(fetch).not.toHaveBeenCalled()
    expect(mockGetBars).toHaveBeenCalledWith('AAPL', '1Day', 400, 400)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('logs one error line and keeps the normal path when the row count read fails', async () => {
    storedCounts = { XLE: new Error('count failed') }
    vi.stubGlobal('fetch', vi.fn())

    const result = await syncSymbols(['XLE'])

    expect(fetch).not.toHaveBeenCalled()
    expect(mockGetBars).toHaveBeenCalledTimes(1)
    expect(console.error).toHaveBeenCalledTimes(1)
    expect(result.failed).toBe(0)
    expect(result.processed).toBe(1)
  })
})

describe('fetchHistoryBars', () => {
  it('requests raw ascending bars with an explicit limit and follows the page token', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(pageResponse(makeBars(3, '2025-01-01'), 'tok-2'))
      .mockResolvedValueOnce(pageResponse(makeBars(2, '2025-01-04'), null))
    vi.stubGlobal('fetch', fetchMock)

    const bars = await fetchHistoryBars('GDX')

    expect(bars).toHaveLength(5)
    const first = new URL(fetchMock.mock.calls[0][0] as string)
    const second = new URL(fetchMock.mock.calls[1][0] as string)
    expect(first.pathname).toBe('/v2/stocks/GDX/bars')
    expect(first.searchParams.get('adjustment')).toBe('raw')
    expect(first.searchParams.get('sort')).toBe('asc')
    expect(first.searchParams.get('timeframe')).toBe('1Day')
    expect(first.searchParams.get('feed')).toBe('sip')
    expect(Number(first.searchParams.get('limit'))).toBeGreaterThanOrEqual(BACKFILL_TARGET_BARS)
    expect(first.searchParams.get('page_token')).toBeNull()
    expect(second.searchParams.get('page_token')).toBe('tok-2')
  })

  it('starts the window far enough back to hold the target number of trading days', async () => {
    const fetchMock = vi.fn().mockResolvedValue(pageResponse([], null))
    vi.stubGlobal('fetch', fetchMock)

    await fetchHistoryBars('GDX', new Date('2026-10-13T12:00:00Z'))

    const start = new URL(fetchMock.mock.calls[0][0] as string).searchParams.get('start') as string
    const days = (new Date('2026-10-13T12:00:00Z').getTime() - new Date(start).getTime()) / (24 * 60 * 60 * 1000)
    expect(days).toBeGreaterThanOrEqual(580)
  })

  it('keeps only the most recent target bars when the window returns more', async () => {
    const all = makeBars(450)
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(pageResponse(all.slice(0, 300), 'tok'))
      .mockResolvedValueOnce(pageResponse(all.slice(300), null)))

    const bars = await fetchHistoryBars('GDX')

    expect(bars).toHaveLength(BACKFILL_TARGET_BARS)
    expect(bars[0].t).toBe(all[50].t)
    expect(bars[bars.length - 1].t).toBe(all[449].t)
  })

  it('throws with the status when Alpaca rejects the request', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429, text: async () => 'slow down' }))

    await expect(fetchHistoryBars('GDX')).rejects.toThrow(/429/)
  })

  it('throws when the Alpaca keys are missing', async () => {
    vi.stubEnv('ALPACA_API_KEY', '')
    vi.stubGlobal('fetch', vi.fn())

    await expect(fetchHistoryBars('GDX')).rejects.toThrow(/ALPACA_API_KEY/)
  })

  it('stops with an error instead of paging forever', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(pageResponse(makeBars(1), 'again')))

    await expect(fetchHistoryBars('GDX')).rejects.toThrow(/pages/)
  })
})

describe('rows', () => {
  it('maps a bar to a daily_bars row with a plain date', () => {
    const [row] = toRows('GDX', [{ t: '2026-10-09T04:00:00Z', o: 1, h: 2, l: 0.5, c: 1.5, v: 100, vw: 1.2, n: 7 }] as never)

    expect(row).toEqual({ symbol: 'GDX', bar_date: '2026-10-09', open: 1, high: 2, low: 0.5, close: 1.5, volume: 100, vwap: 1.2, trade_count: 7 })
  })

  it('contributes rows from one path only, with no duplicate (symbol, bar_date)', async () => {
    storedCounts = { GDX: 10 }
    const bars = makeBars(5)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(pageResponse([...bars, bars[0]], null)))

    const { rows } = await syncSymbols(['GDX'])

    const keys = rows.map((r) => `${r.symbol}|${r.bar_date}`)
    expect(new Set(keys).size).toBe(keys.length)
    expect(rows).toHaveLength(5)
    expect(mockGetBars).not.toHaveBeenCalled()
  })
})

describe('failure isolation', () => {
  it('logs one line for the failing symbol, counts it and keeps the others', async () => {
    mockGetBars.mockImplementation(async (symbol: string) => {
      if (symbol === 'BAD') throw new Error('alpaca down')
      return makeBars(2)
    })

    const result = await syncSymbols(['AAPL', 'BAD', 'FCX'])

    expect(result.failed).toBe(1)
    expect(result.processed).toBe(2)
    expect(result.rows).toHaveLength(4)
    expect(console.error).toHaveBeenCalledTimes(1)
    expect((console.error as unknown as { mock: { calls: string[][] } }).mock.calls[0][0]).toContain('[DAILY_BARS_ERROR] BAD')
  })

  it('lets a failing ETF backfill fail without aborting the other symbols', async () => {
    storedCounts = { GDX: 0 }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'oops' }))

    const result = await syncSymbols(['GDX', 'AAPL'])

    expect(result.failed).toBe(1)
    expect(result.processed).toBe(1)
    expect(result.rows.every((r) => r.symbol === 'AAPL')).toBe(true)
  })
})

describe('module import', () => {
  it('does not start a sync run when imported', () => {
    expect(callsAtImport).toEqual({ positions: 0, from: 0 })
  })
})
