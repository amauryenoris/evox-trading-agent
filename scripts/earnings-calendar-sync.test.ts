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
  isFarFutureDay,
  shouldFailRun,
  formatDoneLine,
  NEAR_WINDOW_CALENDAR_DAYS,
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

describe('isFarFutureDay', () => {
  it('treats offset 35 as near and offset 36 as far', () => {
    expect(NEAR_WINDOW_CALENDAR_DAYS).toBe(35)
    expect(isFarFutureDay('2026-10-29', '2026-12-03')).toBe(false)
    expect(isFarFutureDay('2026-10-29', '2026-12-04')).toBe(true)
    expect(isFarFutureDay('2026-10-29', '2026-10-29')).toBe(false)
  })
})

describe('far-future days', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpsert.mockResolvedValue(undefined)
    mockDeleteUnrefreshed.mockResolvedValue(undefined)
    mockDeleteBefore.mockResolvedValue(undefined)
  })

  const FAR_START = '2026-12-04'
  const options = (fetchFn: ReturnType<typeof vi.fn>) => ({
    today: '2026-10-29',
    lookaheadDays: 40,
    runStartIso: RUN_START,
    isLive: true,
    fetchFn: fetchFn as unknown as typeof fetch,
    sleep: noSleep,
  })
  const farUrl = (url: string) => url.slice(-10) >= FAR_START

  it('skips far days that return no data object, logs them and keeps their cached rows', async () => {
    const fetchFn = vi.fn(async (url: string) =>
      farUrl(url) ? okResponse({}) : okResponse(payload([{ symbol: 'A', time: 'time-not-supplied' }]))
    )
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const logs = vi.spyOn(console, 'log').mockImplementation(() => {})

    const result = await runEarningsSync(options(fetchFn))

    expect(result.skippedFarDays).toEqual(['2026-12-04', '2026-12-07', '2026-12-08'])
    expect(result.failedDays).toEqual([])
    expect(logs.mock.calls.flat().join(' ')).toContain('[EARNINGS_SYNC_SKIPPED_FAR_FUTURE] 2026-12-04')
    expect(errors).not.toHaveBeenCalled()
    const refreshed = mockDeleteUnrefreshed.mock.calls.map((c) => c[0])
    expect(refreshed).not.toContain('2026-12-04')
    errors.mockRestore()
    logs.mockRestore()
  })

  it('still counts a near day that returns no data object as a failure', async () => {
    const fetchFn = vi.fn(async (url: string) =>
      url.includes('2026-10-30') ? okResponse({}) : okResponse(payload([{ symbol: 'A', time: 'time-not-supplied' }]))
    )
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await runEarningsSync(options(fetchFn))

    expect(result.failedDays).toEqual(['2026-10-30'])
    expect(result.skippedFarDays).toEqual([])
    expect(errors.mock.calls.flat().join(' ')).toContain('no data object')
    errors.mockRestore()
  })

  it('excludes other far-day failures from the threshold but logs them as errors', async () => {
    const fetchFn = vi.fn(async (url: string) =>
      farUrl(url)
        ? { ok: false, status: 503, json: async () => ({}) }
        : okResponse(payload([{ symbol: 'A', time: 'time-not-supplied' }]))
    )
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await runEarningsSync(options(fetchFn))

    expect(result.failedDays).toEqual([])
    expect(result.skippedFarDays).toEqual([])
    expect(errors.mock.calls.flat().join(' ')).toContain('2026-12-04')
    errors.mockRestore()
  })

  it('uses only the near days as the denominator', async () => {
    const fetchFn = vi.fn(async (url: string) => okResponse(payload([{ symbol: 'A', time: 'time-not-supplied' }])))
    const result = await runEarningsSync(options(fetchFn))
    expect(result.nearDayCount).toBe(result.days.length - 3)
    expect(result.nearDayCount).toBe(26)
  })
})

describe('shouldFailRun', () => {
  const base = { failedNearDays: 0, nearDayCount: 25, rowCount: 100, isLive: true }

  it('passes at 1 of 25 near failures and fails at 2 of 25', () => {
    expect(shouldFailRun({ ...base, failedNearDays: 1 })).toBe(false)
    expect(shouldFailRun({ ...base, failedNearDays: 2 })).toBe(true)
  })

  it('fails on zero rows in a live run but not in a dry run', () => {
    expect(shouldFailRun({ ...base, rowCount: 0 })).toBe(true)
    expect(shouldFailRun({ ...base, rowCount: 0, isLive: false })).toBe(false)
  })

  it('passes a healthy run', () => {
    expect(shouldFailRun(base)).toBe(false)
  })
})

describe('formatDoneLine', () => {
  const result = { days: new Array(43).fill('d'), failedDays: [], skippedFarDays: ['a', 'b', 'c', 'd', 'e'], nearDayCount: 38, rowCount: 3455 }

  it('prints the final line in the requested format', () => {
    expect(formatDoneLine(result, true)).toBe('[EARNINGS_SYNC_DONE] days=43 failed_near=0 skipped_far=5 rows=3455')
  })

  it('appends the dry run suffix only in a dry run', () => {
    expect(formatDoneLine(result, false)).toBe(
      '[EARNINGS_SYNC_DONE] days=43 failed_near=0 skipped_far=5 rows=3455 (dry run, nothing written)'
    )
  })
})
