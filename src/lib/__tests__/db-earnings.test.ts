import { describe, it, expect, beforeEach, vi } from 'vitest'

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }))

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: mockFrom }) }))

import {
  getNextEarningsReport,
  upsertEarningsRows,
  getEarningsCacheFreshness,
  deleteEarningsBefore,
  deleteUnrefreshedEarnings,
} from '../db-earnings'

function chain(result: { data?: unknown; error: { message: string } | null }) {
  const builder: Record<string, ReturnType<typeof vi.fn>> & { then?: unknown } = {}
  for (const name of ['select', 'eq', 'gte', 'lt', 'order', 'limit', 'delete', 'upsert']) {
    builder[name] = vi.fn(() => builder)
  }
  builder.then = (resolve: (v: unknown) => void) => resolve(result)
  return builder
}

describe('db-earnings', () => {
  beforeEach(() => vi.clearAllMocks())

  describe('getNextEarningsReport', () => {
    it('queries the earliest report on or after the date for the symbol', async () => {
      const builder = chain({ data: [{ report_date: '2026-10-28', session: 'AMC' }], error: null })
      mockFrom.mockReturnValue(builder)

      const result = await getNextEarningsReport('GOOGL', '2026-10-27')

      expect(mockFrom).toHaveBeenCalledWith('earnings_calendar')
      expect(builder.eq).toHaveBeenCalledWith('symbol', 'GOOGL')
      expect(builder.gte).toHaveBeenCalledWith('report_date', '2026-10-27')
      expect(builder.order).toHaveBeenCalledWith('report_date', { ascending: true })
      expect(builder.limit).toHaveBeenCalledWith(1)
      expect(result).toEqual({ reportDate: '2026-10-28', session: 'AMC' })
    })

    it('returns null when the symbol has no cached report', async () => {
      mockFrom.mockReturnValue(chain({ data: [], error: null }))
      expect(await getNextEarningsReport('SPY', '2026-10-27')).toBeNull()
    })

    it('throws when Supabase returns an error', async () => {
      mockFrom.mockReturnValue(chain({ error: { message: 'boom' } }))
      await expect(getNextEarningsReport('SPY', '2026-10-27')).rejects.toThrow('boom')
    })
  })

  describe('upsertEarningsRows', () => {
    it('upserts on symbol and report_date with the row shape', async () => {
      const builder = chain({ error: null })
      mockFrom.mockReturnValue(builder)
      const rows = [{ symbol: 'GOOGL', report_date: '2026-10-28', session: 'AMC' as const, fetched_at: '2026-10-27T11:17:00.000Z' }]

      await upsertEarningsRows(rows)

      expect(builder.upsert).toHaveBeenCalledWith(rows, { onConflict: 'symbol,report_date' })
    })

    it('does not call Supabase for an empty list', async () => {
      await upsertEarningsRows([])
      expect(mockFrom).not.toHaveBeenCalled()
    })

    it('throws when Supabase returns an error', async () => {
      mockFrom.mockReturnValue(chain({ error: { message: 'denied' } }))
      await expect(
        upsertEarningsRows([{ symbol: 'A', report_date: '2026-10-28', session: 'BMO', fetched_at: 'x' }])
      ).rejects.toThrow('denied')
    })
  })

  describe('getEarningsCacheFreshness', () => {
    it('returns the newest fetched_at', async () => {
      const builder = chain({ data: [{ fetched_at: '2026-10-27T11:17:00+00:00' }], error: null })
      mockFrom.mockReturnValue(builder)

      expect(await getEarningsCacheFreshness()).toBe('2026-10-27T11:17:00+00:00')
      expect(builder.order).toHaveBeenCalledWith('fetched_at', { ascending: false })
      expect(builder.limit).toHaveBeenCalledWith(1)
    })

    it('returns null for an empty table', async () => {
      mockFrom.mockReturnValue(chain({ data: [], error: null }))
      expect(await getEarningsCacheFreshness()).toBeNull()
    })

    it('throws when Supabase returns an error', async () => {
      mockFrom.mockReturnValue(chain({ error: { message: 'nope' } }))
      await expect(getEarningsCacheFreshness()).rejects.toThrow('nope')
    })
  })

  describe('deleteEarningsBefore', () => {
    it('deletes rows with an older report date', async () => {
      const builder = chain({ error: null })
      mockFrom.mockReturnValue(builder)

      await deleteEarningsBefore('2026-10-15')

      expect(builder.delete).toHaveBeenCalled()
      expect(builder.lt).toHaveBeenCalledWith('report_date', '2026-10-15')
    })

    it('throws when Supabase returns an error', async () => {
      mockFrom.mockReturnValue(chain({ error: { message: 'x' } }))
      await expect(deleteEarningsBefore('2026-10-15')).rejects.toThrow('x')
    })
  })

  describe('deleteUnrefreshedEarnings', () => {
    it('deletes rows of that day not refreshed since the run started', async () => {
      const builder = chain({ error: null })
      mockFrom.mockReturnValue(builder)

      await deleteUnrefreshedEarnings('2026-10-28', '2026-10-27T11:17:00.000Z')

      expect(builder.eq).toHaveBeenCalledWith('report_date', '2026-10-28')
      expect(builder.lt).toHaveBeenCalledWith('fetched_at', '2026-10-27T11:17:00.000Z')
    })

    it('throws when Supabase returns an error', async () => {
      mockFrom.mockReturnValue(chain({ error: { message: 'y' } }))
      await expect(deleteUnrefreshedEarnings('2026-10-28', 'z')).rejects.toThrow('y')
    })
  })
})
