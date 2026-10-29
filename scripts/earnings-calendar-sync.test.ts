import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockUpsert, mockDeleteUnrefreshed, mockDeleteBefore } = vi.hoisted(() => ({
  mockUpsert: vi.fn(),
  mockDeleteUnrefreshed: vi.fn(),
  mockDeleteBefore: vi.fn(),
}))

vi.mock('../src/lib/db.js', () => ({
  upsertEarningsRows: mockUpsert,
  deleteUnrefreshedEarnings: mockDeleteUnrefreshed,
  deleteEarningsBefore: mockDeleteBefore,
}))

import {
  EARNINGS_USER_AGENT,
  MIN_REQUEST_INTERVAL_MS,
  buildWeekdays,
  mapSession,
  parseNasdaqRows,
  exceedsFailureThreshold,
  runEarningsSync,
} from './earnings-calendar-sync'

const RUN_START = '2026-10-29T11:17:00.000Z'

function payload(rows: Array<Record<string, unknown>> | null, rCode = 200) {
  return { data: { rows }, message: null, status: { rCode } }
}

function okResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body }
}

const noSleep = async () => {}

describe('buildWeekdays', () => {
  it('lists weekdays from today through today plus the lookahead, skipping weekends', () => {
    const days = buildWeekdays('2026-10-29', 7)
    expect(days).toEqual(['2026-10-29', '2026-10-30', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'])
  })

  it('skips a weekend start', () => {
    expect(buildWeekdays('2026-10-31', 2)).toEqual(['2026-11-02'])
  })
})

describe('mapSession', () => {
  it.each([
    ['time-pre-market', 'BMO'],
    ['time-after-hours', 'AMC'],
    ['time-not-supplied', 'UNKNOWN'],
    ['something-else', 'UNKNOWN'],
    [undefined, 'UNKNOWN'],
    [null, 'UNKNOWN'],
  ])('maps %s to %s', (label, expected) => {
    expect(mapSession(label as string | undefined)).toBe(expected)
  })
})

describe('parseNasdaqRows', () => {
  it('builds rows with the session, report date and fetched_at', () => {
    const rows = parseNasdaqRows(
      payload([
        { symbol: 'GOOGL', time: 'time-after-hours' },
        { symbol: 'cop', time: 'time-pre-market' },
      ]),
      '2026-11-05',
      RUN_START
    )
    expect(rows).toEqual([
      { symbol: 'GOOGL', report_date: '2026-11-05', session: 'AMC', fetched_at: RUN_START },
      { symbol: 'COP', report_date: '2026-11-05', session: 'BMO', fetched_at: RUN_START },
    ])
  })

  it('returns no rows for an empty day', () => {
    expect(parseNasdaqRows(payload(null), '2026-11-26', RUN_START)).toEqual([])
    expect(parseNasdaqRows(payload([]), '2026-11-26', RUN_START)).toEqual([])
  })

  it('skips rows without a symbol and dedupes repeated symbols', () => {
    const rows = parseNasdaqRows(
      payload([{ symbol: ' ', time: 'time-pre-market' }, { time: 'x' }, { symbol: 'A', time: 'time-pre-market' }, { symbol: 'a', time: 'time-after-hours' }]),
      '2026-11-05',
      RUN_START
    )
    expect(rows.map((r) => r.symbol)).toEqual(['A'])
  })

  it('throws for a payload that is not a calendar response', () => {
    expect(() => parseNasdaqRows(null, '2026-11-05', RUN_START)).toThrow()
    expect(() => parseNasdaqRows({ foo: 1 }, '2026-11-05', RUN_START)).toThrow()
    expect(() => parseNasdaqRows(payload([], 500), '2026-11-05', RUN_START)).toThrow()
  })
})

describe('exceedsFailureThreshold', () => {
  it('is false at exactly 5% and true above', () => {
    expect(exceedsFailureThreshold(1, 20)).toBe(false)
    expect(exceedsFailureThreshold(2, 20)).toBe(true)
    expect(exceedsFailureThreshold(0, 0)).toBe(false)
  })
})

describe('runEarningsSync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpsert.mockResolvedValue(undefined)
    mockDeleteUnrefreshed.mockResolvedValue(undefined)
    mockDeleteBefore.mockResolvedValue(undefined)
  })

  const options = (fetchFn: ReturnType<typeof vi.fn>, isLive = true) => ({
    today: '2026-10-29',
    lookaheadDays: 3,
    runStartIso: RUN_START,
    isLive,
    fetchFn: fetchFn as unknown as typeof fetch,
    sleep: noSleep,
  })

  it('fetches each weekday with the descriptive User-Agent and upserts the rows', async () => {
    const fetchFn = vi.fn(async (url: string) =>
      okResponse(payload([{ symbol: url.includes('2026-10-30') ? 'UUUU' : 'COP', time: 'time-pre-market' }]))
    )

    const result = await runEarningsSync(options(fetchFn))

    expect(fetchFn).toHaveBeenCalledTimes(2)
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, { headers: Record<string, string> }]
    expect(url).toBe('https://api.nasdaq.com/api/calendar/earnings?date=2026-10-29')
    expect(init.headers['User-Agent']).toBe(EARNINGS_USER_AGENT)
    expect(mockUpsert).toHaveBeenCalledWith([
      { symbol: 'COP', report_date: '2026-10-29', session: 'BMO', fetched_at: RUN_START },
      { symbol: 'UUUU', report_date: '2026-10-30', session: 'BMO', fetched_at: RUN_START },
    ])
    expect(result.failedDays).toEqual([])
  })

  it('treats an empty day as a success', async () => {
    const fetchFn = vi.fn(async () => okResponse(payload(null)))
    const result = await runEarningsSync(options(fetchFn))
    expect(result.failedDays).toEqual([])
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('retries a failed day once and recovers', async () => {
    let calls = 0
    const fetchFn = vi.fn(async () => {
      calls++
      if (calls === 1) throw new Error('timeout')
      return okResponse(payload([{ symbol: 'A', time: 'time-not-supplied' }]))
    })
    const result = await runEarningsSync(options(fetchFn))
    expect(result.failedDays).toEqual([])
    expect(fetchFn).toHaveBeenCalledTimes(3)
  })

  it('reports a day that fails twice and does not delete its cached rows', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.includes('2026-10-30')) return { ok: false, status: 503, json: async () => ({}) }
      return okResponse(payload([{ symbol: 'A', time: 'time-not-supplied' }]))
    })
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await runEarningsSync(options(fetchFn))

    expect(result.failedDays).toEqual(['2026-10-30'])
    expect(errors.mock.calls.flat().join(' ')).toContain('2026-10-30')
    expect(mockDeleteUnrefreshed).toHaveBeenCalledTimes(1)
    expect(mockDeleteUnrefreshed).toHaveBeenCalledWith('2026-10-29', RUN_START)
    errors.mockRestore()
  })

  it('prunes rows older than 14 days before today', async () => {
    await runEarningsSync(options(vi.fn(async () => okResponse(payload([])))))
    expect(mockDeleteBefore).toHaveBeenCalledWith('2026-10-15')
  })

  it('writes nothing in a dry run', async () => {
    const fetchFn = vi.fn(async () => okResponse(payload([{ symbol: 'A', time: 'time-not-supplied' }])))
    const result = await runEarningsSync(options(fetchFn, false))
    expect(mockUpsert).not.toHaveBeenCalled()
    expect(mockDeleteUnrefreshed).not.toHaveBeenCalled()
    expect(mockDeleteBefore).not.toHaveBeenCalled()
    expect(result.rowCount).toBeGreaterThan(0)
  })

  it('waits at least the minimum interval between requests', async () => {
    const sleep = vi.fn(async () => {})
    const fetchFn = vi.fn(async () => okResponse(payload([])))
    await runEarningsSync({ ...options(fetchFn), sleep })
    expect(sleep).toHaveBeenCalledWith(MIN_REQUEST_INTERVAL_MS)
    expect(MIN_REQUEST_INTERVAL_MS).toBeGreaterThanOrEqual(250)
  })
})
