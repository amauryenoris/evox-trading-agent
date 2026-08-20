import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { MarketDailyBriefing } from './types'

function getClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  return createClient(url, key)
}

export async function getMarketDailyBriefingByDate(briefingDate: string): Promise<MarketDailyBriefing | null> {
  const db = getClient()
  const { data, error } = await db
    .from('market_daily_briefings')
    .select('*')
    .eq('briefing_date', briefingDate)
    .maybeSingle()
  if (error) throw new Error(`Failed to fetch market daily briefing: ${error.message}`)
  return (data ?? null) as MarketDailyBriefing | null
}

export async function upsertMarketDailyBriefing(
  record: Omit<MarketDailyBriefing, 'id' | 'created_at'>
): Promise<void> {
  const db = getClient()
  const { error } = await db
    .from('market_daily_briefings')
    .upsert({ ...record }, { onConflict: 'briefing_date' })
  if (error) throw new Error(`Failed to upsert market daily briefing: ${error.message}`)
}
