import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetBars } = vi.hoisted(() => ({ mockGetBars: vi.fn() }))

vi.mock('../alpaca', () => ({ getBars: mockGetBars }))

import { maxRegularSessionHigh, getPeakHighSinceLastCheck, PEAK_LOOKBACK_MS } from '../peak-high'
import type { AlpacaBar } from '../types'

function bar(t: string, h: number): AlpacaBar {
  return { t, o: h, h, l: h, c: h, v: 1000, vw: h, n: 10 }
}

// 2026-10-20 is EDT (UTC-4): 09:30 ET = 13:30Z, 16:00 ET = 20:00Z
describe('maxRegularSessionHigh', () => {
  it('ignores pre-market and after-hours bars', () => {
    const bars = [
      bar('2026-10-20T12:00:00Z', 200),
      bar('2026-10-20T13:30:00Z', 105),
      bar('2026-10-20T15:00:00Z', 107),
      bar('2026-10-20T20:00:00Z', 300),
    ]
    expect(maxRegularSessionHigh(bars)).toBe(107)
  })

  it('includes the 15:59 ET bar and excludes 16:00 ET', () => {
    const bars = [bar('2026-10-20T19:59:00Z', 110), bar('2026-10-20T20:00:00Z', 120)]
    expect(maxRegularSessionHigh(bars)).toBe(110)
  })

  it('handles standard time (EST, UTC-5)', () => {
    const bars = [bar('2026-12-01T14:29:00Z', 150), bar('2026-12-01T14:30:00Z', 101)]
    expect(maxRegularSessionHigh(bars)).toBe(101)
  })

  it('returns null with no regular-session bars', () => {
    expect(maxRegularSessionHigh([])).toBeNull()
    expect(maxRegularSessionHigh([bar('2026-10-20T12:00:00Z', 200)])).toBeNull()
  })
})

describe('getPeakHighSinceLastCheck', () => {
  beforeEach(() => vi.clearAllMocks())

  it('makes exactly one 1Min bars request starting at the later of buyTimestamp and the lookback', async () => {
    mockGetBars.mockResolvedValue([bar('2026-10-20T15:00:00Z', 108)])
    const now = new Date('2026-10-20T16:00:00Z')

    const peak = await getPeakHighSinceLastCheck('SOFI', '2026-10-20T14:00:00Z', now)

    expect(peak).toBe(108)
    expect(mockGetBars).toHaveBeenCalledTimes(1)
    expect(mockGetBars).toHaveBeenCalledWith('SOFI', '1Min', 0, expect.any(Number), '2026-10-20T14:00:00.000Z')
  })

  it('caps the start at the lookback window for older positions', async () => {
    mockGetBars.mockResolvedValue([])
    const now = new Date('2026-10-20T16:00:00Z')

    await getPeakHighSinceLastCheck('SOFI', '2026-10-01T14:00:00Z', now)

    const start = mockGetBars.mock.calls[0][4] as string
    expect(new Date(start).getTime()).toBe(now.getTime() - PEAK_LOOKBACK_MS)
  })

  it('returns null when the request fails', async () => {
    mockGetBars.mockRejectedValue(new Error('boom'))
    const peak = await getPeakHighSinceLastCheck('SOFI', '2026-10-20T14:00:00Z', new Date('2026-10-20T16:00:00Z'))
    expect(peak).toBeNull()
  })

  it('returns null for an unparsable buy timestamp without calling Alpaca', async () => {
    const peak = await getPeakHighSinceLastCheck('SOFI', 'not-a-date', new Date('2026-10-20T16:00:00Z'))
    expect(peak).toBeNull()
    expect(mockGetBars).not.toHaveBeenCalled()
  })
})
