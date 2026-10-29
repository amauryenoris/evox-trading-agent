import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { CachedEarnings, EarningsSession } from './earnings-window'

const TABLE = 'earnings_calendar'

export interface EarningsRow {
  symbol: string
  report_date: string
  session: EarningsSession
  fetched_at: string
}

function getClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  return createClient(url, key)
}

export async function getNextEarningsReport(symbol: string, fromDate: string): Promise<CachedEarnings | null> {
  const { data, error } = await getClient()
    .from(TABLE)
    .select('report_date, session')
    .eq('symbol', symbol)
    .gte('report_date', fromDate)
    .order('report_date', { ascending: true })
    .limit(1)
  if (error) throw new Error(`Failed to fetch next earnings report for ${symbol}: ${error.message}`)
  const row = (data ?? [])[0] as { report_date: string; session: EarningsSession } | undefined
  return row ? { reportDate: row.report_date, session: row.session } : null
}

export async function upsertEarningsRows(rows: EarningsRow[]): Promise<void> {
  if (rows.length === 0) return
  const { error } = await getClient().from(TABLE).upsert(rows, { onConflict: 'symbol,report_date' })
  if (error) throw new Error(`Failed to upsert earnings calendar: ${error.message}`)
}

export async function getEarningsCacheFreshness(): Promise<string | null> {
  const { data, error } = await getClient()
    .from(TABLE)
    .select('fetched_at')
    .order('fetched_at', { ascending: false })
    .limit(1)
  if (error) throw new Error(`Failed to fetch earnings cache freshness: ${error.message}`)
  const row = (data ?? [])[0] as { fetched_at: string } | undefined
  return row?.fetched_at ?? null
}

export async function deleteEarningsBefore(reportDate: string): Promise<void> {
  const { error } = await getClient().from(TABLE).delete().lt('report_date', reportDate)
  if (error) throw new Error(`Failed to prune earnings calendar: ${error.message}`)
}

export async function deleteUnrefreshedEarnings(reportDate: string, refreshedSince: string): Promise<void> {
  const { error } = await getClient()
    .from(TABLE)
    .delete()
    .eq('report_date', reportDate)
    .lt('fetched_at', refreshedSince)
  if (error) throw new Error(`Failed to delete rescheduled earnings for ${reportDate}: ${error.message}`)
}
