import { createClient, type SupabaseClient } from '@supabase/supabase-js'

function getClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  return createClient(url, key)
}

export async function upsertSymbolCooldown(
  symbol: string,
  exitReason: string,
  cooldownUntil: Date
): Promise<void> {
  const db = getClient()
  const { error } = await db.rpc('upsert_symbol_cooldown', {
    p_symbol:         symbol,
    p_exit_reason:    exitReason,
    p_cooldown_until: cooldownUntil.toISOString(),
  })
  if (error) {
    console.error(`[COOLDOWN_WRITE_ERROR] symbol=${symbol}`, error.message)
  }
}

export async function getActiveCooldowns(): Promise<
  Array<{
    symbol: string
    exit_reason: string
    cooldown_until: string
  }>
> {
  const db = getClient()
  const { data, error } = await db
    .from('symbol_cooldowns')
    .select('symbol, exit_reason, cooldown_until')
    .gt('cooldown_until', new Date().toISOString())
    .limit(100)
  if (error) {
    console.error('[COOLDOWN_READ_ERROR]', error.message)
    return []
  }
  return data ?? []
}

export async function cleanExpiredCooldowns(): Promise<void> {
  const db = getClient()
  const { error } = await db
    .from('symbol_cooldowns')
    .delete()
    .lte('cooldown_until', new Date().toISOString())
  if (error) {
    console.error('[COOLDOWN_CLEAN_ERROR]', error.message)
  }
}
