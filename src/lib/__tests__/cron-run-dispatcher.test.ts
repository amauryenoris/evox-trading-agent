import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const { mockNextTradingDay } = vi.hoisted(() => ({ mockNextTradingDay: vi.fn() }))

vi.mock('@/lib/alpaca', () => ({ getNextTradingDay: mockNextTradingDay }))

import * as route from '../../app/api/cron/run/route'

const SECRET = 'test-cron-secret-0123456789abcdef'
const TOKEN = 'ghp_test_token_should_never_leak'
const TRADING_DAY = '2026-10-14T15:00:00Z'
const NON_TRADING_DAY = '2026-10-17T15:00:00Z'

const TARGET_FILES: Array<[string, string]> = [
  ['cycle', 'agent-cron.yml'],
  ['exits', 'agent-exits.yml'],
  ['health', 'position-health.yml'],
  ['bars', 'daily-bars-sync.yml'],
  ['weekly', 'weekly-report.yml'],
]

function makeRequest(target: string | null, headers: Record<string, string> = { authorization: `Bearer ${SECRET}` }) {
  const query = target === null ? '' : `?target=${encodeURIComponent(target)}`
  return new Request(`https://example.com/api/cron/run${query}`, { method: 'POST', headers })
}

function githubResponse(status: number, body = '') {
  return { status, ok: status >= 200 && status < 300, text: async () => body }
}

let fetchMock: ReturnType<typeof vi.fn>
let logged: string[]

function collectLogs() {
  const sink = (...args: unknown[]) => { logged.push(args.map((a) => (a instanceof Error ? `${a.name}:${a.message}` : String(a))).join(' ')) }
  vi.spyOn(console, 'log').mockImplementation(sink)
  vi.spyOn(console, 'error').mockImplementation(sink)
  vi.spyOn(console, 'warn').mockImplementation(sink)
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
  vi.setSystemTime(new Date(TRADING_DAY))
  vi.stubEnv('CRON_SECRET', SECRET)
  vi.stubEnv('GITHUB_TOKEN', TOKEN)
  vi.stubEnv('GITHUB_OWNER', 'test-owner')
  vi.stubEnv('GITHUB_REPO', 'test-repo')
  logged = []
  collectLogs()
  fetchMock = vi.fn().mockResolvedValue(githubResponse(204))
  vi.stubGlobal('fetch', fetchMock)
  mockNextTradingDay.mockReset().mockResolvedValue(new Date('2026-10-14T00:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('methods', () => {
  it('answers GET with 405 and an Allow: POST header', async () => {
    const res = await route.GET()

    expect(res.status).toBe(405)
    expect(res.headers.get('allow')).toBe('POST')
  })

  it('exports only POST and GET handlers so every other method is rejected by Next with 405', () => {
    const handlers = Object.keys(route).filter((k) => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(k))

    expect(handlers.sort()).toEqual(['GET', 'POST'])
  })
})

describe('configuration and authentication', () => {
  it.each([['unset', undefined], ['empty', '']])('answers 503 and calls nothing when CRON_SECRET is %s', async (_label, value) => {
    if (value === undefined) vi.stubEnv('CRON_SECRET', undefined as unknown as string)
    else vi.stubEnv('CRON_SECRET', value)

    const res = await route.POST(makeRequest('cycle'))

    expect(res.status).toBe(503)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(mockNextTradingDay).not.toHaveBeenCalled()
  })

  it.each([
    ['missing header', {}],
    ['wrong secret of the same length', { authorization: `Bearer ${'x'.repeat(SECRET.length)}` }],
    ['shorter secret', { authorization: 'Bearer short' }],
    ['longer secret', { authorization: `Bearer ${SECRET}extra` }],
    ['wrong scheme', { authorization: `Basic ${SECRET}` }],
    ['bare secret without scheme', { authorization: SECRET }],
  ])('answers 401 and calls nothing on %s', async (_label, headers) => {
    const res = await route.POST(makeRequest('cycle', headers as Record<string, string>))

    expect(res.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(mockNextTradingDay).not.toHaveBeenCalled()
  })

  it('does not read the target before authenticating (an invalid target with a bad secret is still 401)', async () => {
    const res = await route.POST(makeRequest('nope', { authorization: 'Bearer wrong' }))

    expect(res.status).toBe(401)
  })

  it('returns generic bodies that contain neither the secret nor the token', async () => {
    const bodies = await Promise.all([
      route.POST(makeRequest('cycle', {})),
      route.POST(makeRequest('nope')),
    ].map(async (p) => (await p).text()))

    for (const body of bodies) {
      expect(body).not.toContain(SECRET)
      expect(body).not.toContain(TOKEN)
    }
  })
})

describe('target selection', () => {
  it.each(['__proto__', 'constructor', 'toString', 'CYCLE', 'cycle ', '../cycle', 'agent-cron.yml', 'unknown', ''])(
    'answers 400 for the invalid target %j without consulting the calendar or GitHub',
    async (target) => {
      const res = await route.POST(makeRequest(target))

      expect(res.status).toBe(400)
      expect(fetchMock).not.toHaveBeenCalled()
      expect(mockNextTradingDay).not.toHaveBeenCalled()
    }
  )

  it('answers 400 when the target is missing', async () => {
    const res = await route.POST(makeRequest(null))

    expect(res.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('ignores the request body', async () => {
    const req = new Request('https://example.com/api/cron/run?target=health', {
      method: 'POST',
      headers: { authorization: `Bearer ${SECRET}` },
      body: JSON.stringify({ target: 'cycle', ref: 'evil' }),
    })

    await route.POST(req)

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/workflows/position-health.yml/dispatches')
    expect(JSON.parse(init.body as string)).toEqual({ ref: 'main' })
  })
})

describe('dispatch', () => {
  it.each(TARGET_FILES)('dispatches target %s to %s on ref main with no inputs', async (target, file) => {
    const res = await route.POST(makeRequest(target))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, target, dispatched: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`https://api.github.com/repos/test-owner/test-repo/actions/workflows/${file}/dispatches`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ ref: 'main' })
    expect(init.headers).toEqual({
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    })
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('URL-encodes the owner and repository segments', async () => {
    vi.stubEnv('GITHUB_OWNER', 'own er')
    vi.stubEnv('GITHUB_REPO', 're/po')

    await route.POST(makeRequest('cycle'))

    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toContain('/repos/own%20er/re%2Fpo/actions/')
  })

  it.each([[422, 'validation failed: workflow does not have workflow_dispatch'], [404, 'Not Found'], [401, 'Bad credentials']])(
    'answers a generic 502 on GitHub %i without leaking the token or the GitHub body',
    async (status, body) => {
      fetchMock.mockResolvedValue(githubResponse(status, body))

      const res = await route.POST(makeRequest('cycle'))

      expect(res.status).toBe(502)
      const text = await res.text()
      expect(text).not.toContain(body)
      expect(text).not.toContain(TOKEN)
      expect(logged.join('\n')).not.toContain(body)
      expect(logged.join('\n')).toContain(String(status))
    }
  )

  it('answers a generic 502 on a network error and logs only the error class', async () => {
    fetchMock.mockRejectedValue(Object.assign(new TypeError(`connect failed ${TOKEN}`), { name: 'TypeError' }))

    const res = await route.POST(makeRequest('cycle'))

    expect(res.status).toBe(502)
    const all = logged.join('\n')
    expect(all).toContain('TypeError')
    expect(all).not.toContain('connect failed')
    expect(all).not.toContain(TOKEN)
  })

  it('aborts the GitHub request after 10 seconds and answers 502', async () => {
    fetchMock.mockImplementation((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
      })
    )

    const pending = route.POST(makeRequest('cycle'))
    await vi.advanceTimersByTimeAsync(10_000)
    const res = await pending

    expect(res.status).toBe(502)
    expect(logged.join('\n')).toContain('AbortError')
    expect(logged.join('\n')).not.toContain(TOKEN)
  })

})

describe('trading-day guard', () => {
  it('skips with 200 on a non-trading day and dispatches nothing', async () => {
    vi.setSystemTime(new Date(NON_TRADING_DAY))
    mockNextTradingDay.mockResolvedValue(new Date('2026-10-19T00:00:00Z'))

    const res = await route.POST(makeRequest('cycle'))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, skipped: 'non_trading_day' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('asks the calendar about the day after the previous New York date', async () => {
    await route.POST(makeRequest('cycle'))

    const [from, daysAhead] = mockNextTradingDay.mock.calls[0] as [Date, number]
    expect(from.toISOString().split('T')[0]).toBe('2026-10-13')
    expect(daysAhead).toBe(1)
  })

  it('uses the New York date, not the UTC date, near midnight UTC', async () => {
    vi.setSystemTime(new Date('2026-10-15T01:30:00Z'))

    await route.POST(makeRequest('cycle'))

    const [from] = mockNextTradingDay.mock.calls[0] as [Date]
    expect(from.toISOString().split('T')[0]).toBe('2026-10-13')
  })

  it('dispatches when the calendar helper rejects', async () => {
    mockNextTradingDay.mockRejectedValue(new Error('alpaca down'))

    const res = await route.POST(makeRequest('cycle'))

    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('dispatches when the calendar helper takes longer than 3 seconds', async () => {
    mockNextTradingDay.mockReturnValue(new Promise(() => {}))

    const pending = route.POST(makeRequest('cycle'))
    await vi.advanceTimersByTimeAsync(3_000)
    const res = await pending

    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each(TARGET_FILES.map(([target]) => target))('applies the guard to the %s target', async (target) => {
    vi.setSystemTime(new Date(NON_TRADING_DAY))
    mockNextTradingDay.mockResolvedValue(new Date('2026-10-19T00:00:00Z'))

    const res = await route.POST(makeRequest(target))

    expect(await res.json()).toEqual({ success: true, skipped: 'non_trading_day' })
  })
})

describe('logging', () => {
  it('writes one log line per authenticated request with the target and the outcome', async () => {
    await route.POST(makeRequest('exits'))

    const lines = logged.filter((l) => l.includes('[cron/run]'))
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('target=exits')
    expect(lines[0]).toContain('dispatched')
  })

  it('logs the skipped outcome', async () => {
    vi.setSystemTime(new Date(NON_TRADING_DAY))
    mockNextTradingDay.mockResolvedValue(new Date('2026-10-19T00:00:00Z'))

    await route.POST(makeRequest('bars'))

    expect(logged.filter((l) => l.includes('[cron/run]'))).toEqual([expect.stringContaining('skipped')])
  })

  it('never writes the secret or the token to any log line across all paths', async () => {
    fetchMock.mockResolvedValueOnce(githubResponse(422, TOKEN)).mockRejectedValueOnce(new Error(TOKEN))
    await route.POST(makeRequest('cycle'))
    await route.POST(makeRequest('cycle'))
    await route.POST(makeRequest('cycle', { authorization: `Bearer ${SECRET}x` }))
    vi.stubEnv('GITHUB_TOKEN', '')
    await route.POST(makeRequest('cycle'))

    const all = logged.join('\n')
    expect(all).not.toContain(SECRET)
    expect(all).not.toContain(TOKEN)
  })
})

describe('unexpected failures are visible in the logs', () => {
  function throwingRequest(message: string): Request {
    return {
      url: 'https://example.com/api/cron/run?target=bars',
      headers: { get: () => { throw new Error(message) } },
    } as unknown as Request
  }

  it('names GITHUB_TOKEN in an error log and calls nothing when it is missing', async () => {
    vi.stubEnv('GITHUB_TOKEN', '')

    const res = await route.POST(makeRequest('bars'))

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ success: false, error: 'Internal server error' })
    expect(logged.find((l) => l.includes('missing_github_token'))).toContain('GITHUB_TOKEN')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([['GITHUB_OWNER'], ['GITHUB_REPO']])('falls back to the default repository when %s is unset', async (name) => {
    vi.stubEnv(name, undefined as unknown as string)

    const res = await route.POST(makeRequest('bars'))

    expect(res.status).toBe(200)
    const [url] = fetchMock.mock.calls[0]
    expect(String(url)).toContain(name === 'GITHUB_OWNER' ? '/repos/amauryenoris/test-repo/' : '/repos/test-owner/evox-trading-agent/')
  })

  it('uses both defaults when owner and repository are empty strings', async () => {
    vi.stubEnv('GITHUB_OWNER', '')
    vi.stubEnv('GITHUB_REPO', '')

    await route.POST(makeRequest('bars'))

    const [url] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/repos/amauryenoris/evox-trading-agent/actions/workflows/daily-bars-sync.yml/dispatches')
  })

  it('answers a generic 500 and logs the real error when the handler throws', async () => {
    const errorSpy = vi.spyOn(console, 'error')

    const res = await route.POST(throwingRequest('boom: real cause'))

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ success: false, error: 'Internal server error' })
    const loggedByError = errorSpy.mock.calls.map((c) => c.map(String).join(' ')).join('\n')
    expect(loggedByError).toContain('[cron/run]')
    expect(loggedByError).toContain('boom: real cause')
  })

  it('redacts the token and the secret from a logged error', async () => {
    await route.POST(throwingRequest(`failed with ${TOKEN} and ${SECRET}`))

    const all = logged.join('\n')
    expect(all).toContain('failed with')
    expect(all).not.toContain(TOKEN)
    expect(all).not.toContain(SECRET)
  })
})

describe('route source', () => {
  const source = readFileSync(join(__dirname, '../../app/api/cron/run/route.ts'), 'utf8')

  it('does not import the trading cycle', () => {
    expect(source).not.toMatch(/claude-agent|runAgentCycle/)
  })

  it('keeps force-dynamic and a 15 second maxDuration', () => {
    expect(source).toMatch(/export const dynamic = 'force-dynamic'/)
    expect(source).toMatch(/export const maxDuration = 15/)
  })

  it('exposes the same maxDuration at runtime', () => {
    expect(route.maxDuration).toBe(15)
    expect(route.dynamic).toBe('force-dynamic')
  })
})
