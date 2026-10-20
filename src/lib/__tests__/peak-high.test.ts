import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetBars } = vi.hoisted(() => ({ mockGetBars: vi.fn() }))

vi.mock('../alpaca', () => ({ getBars: mockGetBars }))

import {
  maxRegularSessionHigh,
  getPeakHighSinceLastCheck,
  PEAK_LOOKBACK_MS,
  PEAK_CLOSE_CAP_RATIO,
  PEAK_MAX_JUMP_PP,
} from '../peak-high'
import type { AlpacaBar } from '../types'

function bar(t: string, h: number): AlpacaBar {
  return { t, o: h, h, l: h, c: h, v: 1000, vw: h, n: 10 }
}

function fullBar(t: string, fields: { h: number; c: number; v: number }): AlpacaBar {
  return { t, o: fields.c, h: fields.h, l: fields.c, c: fields.c, v: fields.v, vw: fields.c, n: 10 }
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

describe('maxRegularSessionHigh — bad print filter', () => {
  const T = '2026-10-20T15:00:00Z'

  it('exposes the named constants', () => {
    expect(PEAK_CLOSE_CAP_RATIO).toBe(1.01)
    expect(PEAK_MAX_JUMP_PP).toBe(10)
  })

  it('ignores a zero-volume spike', () => {
    const bars = [fullBar(T, { h: 150, c: 100, v: 0 }), bar('2026-10-20T15:01:00Z', 104)]
    expect(maxRegularSessionHigh(bars)).toBe(104)
  })

  it('ignores a bar with a non-finite field', () => {
    const bars = [fullBar(T, { h: Number.NaN, c: 100, v: 500 }), fullBar('2026-10-20T15:01:00Z', { h: 110, c: Number.NaN, v: 500 }), bar('2026-10-20T15:02:00Z', 103)]
    expect(maxRegularSessionHigh(bars)).toBe(103)
  })

  it('caps a high 5% above the close at close x 1.01', () => {
    const bars = [fullBar(T, { h: 105, c: 100, v: 500 })]
    expect(maxRegularSessionHigh(bars)).toBeCloseTo(101, 9)
  })

  it('leaves a legitimate high within 1% of the close unchanged', () => {
    const bars = [fullBar(T, { h: 100.8, c: 100, v: 500 })]
    expect(maxRegularSessionHigh(bars)).toBe(100.8)
  })

  it('returns null when every bar is invalid', () => {
    expect(maxRegularSessionHigh([fullBar(T, { h: 105, c: 100, v: 0 })])).toBeNull()
  })

  it('drops only the bars above the limit and keeps the valid ones', () => {
    const bars = [bar(T, 130), bar('2026-10-20T15:01:00Z', 106)]
    expect(maxRegularSessionHigh(bars, 110)).toBe(106)
  })
})

describe('getPeakHighSinceLastCheck — jump guard', () => {
  const NOW = new Date('2026-10-20T16:00:00Z')
  const BUY = '2026-10-20T14:00:00Z'
  const ENTRY = 100

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  it('returns a legitimate high unchanged and does not warn', async () => {
    mockGetBars.mockResolvedValue([bar('2026-10-20T15:00:00Z', 108)])

    const peak = await getPeakHighSinceLastCheck('SOFI', BUY, NOW, { storedHigh: 105, entry: ENTRY })

    expect(peak).toBe(108)
    expect(console.warn).not.toHaveBeenCalled()
  })

  it('accepts a candidate exactly at the 10 pp limit', async () => {
    mockGetBars.mockResolvedValue([bar('2026-10-20T15:00:00Z', 115)])

    const peak = await getPeakHighSinceLastCheck('SOFI', BUY, NOW, { storedHigh: 105, entry: ENTRY })

    expect(peak).toBe(115)
  })

  it('rejects a jump of more than 10 pp and warns with the numbers', async () => {
    mockGetBars.mockResolvedValue([bar('2026-10-20T15:00:00Z', 130)])

    const peak = await getPeakHighSinceLastCheck('SOFI', BUY, NOW, { storedHigh: 106, entry: ENTRY })

    expect(peak).toBeNull()
    expect(console.warn).toHaveBeenCalledTimes(1)
    const message = (console.warn as unknown as { mock: { calls: string[][] } }).mock.calls[0][0]
    expect(message).toContain('SOFI')
    expect(message).toContain('130')
    expect(message).toContain('106')
    expect(message).toContain('100')
    expect(message).toContain('116')
  })

  it('keeps the valid bars of the same check when one bar is rejected', async () => {
    mockGetBars.mockResolvedValue([bar('2026-10-20T15:00:00Z', 130), bar('2026-10-20T15:05:00Z', 109)])

    const peak = await getPeakHighSinceLastCheck('SOFI', BUY, NOW, { storedHigh: 106, entry: ENTRY })

    expect(peak).toBe(109)
  })

  it('skips the jump guard when no stored high or entry is supplied', async () => {
    mockGetBars.mockResolvedValue([bar('2026-10-20T15:00:00Z', 130)])

    expect(await getPeakHighSinceLastCheck('SOFI', BUY, NOW)).toBe(130)
    expect(await getPeakHighSinceLastCheck('SOFI', BUY, NOW, { storedHigh: Number.NaN, entry: ENTRY })).toBe(130)
    expect(await getPeakHighSinceLastCheck('SOFI', BUY, NOW, { storedHigh: 106, entry: 0 })).toBe(130)
  })

  it('still returns null when the bars request fails', async () => {
    mockGetBars.mockRejectedValue(new Error('boom'))
    const peak = await getPeakHighSinceLastCheck('SOFI', BUY, NOW, { storedHigh: 106, entry: ENTRY })
    expect(peak).toBeNull()
  })

  it('a bad bar that stays in the window never raises the stored high across several checks', async () => {
    // Arrange — same +30 pp bad print visible at four consecutive checks; a real high of 108 is also in the window
    mockGetBars.mockResolvedValue([bar('2026-10-20T15:00:00Z', 130), bar('2026-10-20T15:10:00Z', 108)])
    let stored = 106

    // Act
    for (let check = 0; check < 4; check++) {
      const peak = await getPeakHighSinceLastCheck('SOFI', BUY, NOW, { storedHigh: stored, entry: ENTRY })
      stored = Math.max(stored, peak ?? stored)
    }

    // Assert
    expect(stored).toBe(108)
  })

  it('a sequence of legitimate rising highs keeps up check after check', async () => {
    let stored = 106
    const highs = [111, 116, 121]

    for (const high of highs) {
      mockGetBars.mockResolvedValue([bar('2026-10-20T15:00:00Z', high)])
      const peak = await getPeakHighSinceLastCheck('SOFI', BUY, NOW, { storedHigh: stored, entry: ENTRY })
      stored = Math.max(stored, peak ?? stored)
    }

    expect(stored).toBe(121)
  })

  it('never lowers the stored high when the peak is below it', async () => {
    mockGetBars.mockResolvedValue([bar('2026-10-20T15:00:00Z', 101)])
    const peak = await getPeakHighSinceLastCheck('SOFI', BUY, NOW, { storedHigh: 106, entry: ENTRY })
    expect(Math.max(106, peak ?? 106)).toBe(106)
  })
})
