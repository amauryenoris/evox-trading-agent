import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const url = process.env.SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) throw new Error('Supabase env vars missing')
    const db = createClient(url, key)

    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)

    const { data, error } = await db
      .from('agent_log')
      .select('id, symbol, error, indicators, created_at, signal_type')
      .or('error.ilike.TREND_ZGT05%,error.ilike.TREND_QUALITY_FAIL%')
      .gte('created_at', startOfDay.toISOString())
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) throw new Error(error.message)

    const rows = (data ?? []).map((row) => {
      const ind = (row.indicators ?? {}) as Record<string, unknown>
      const kalman = ind.kalman as { zScore?: number } | null
      const z = kalman?.zScore ?? null
      const adx = typeof ind.adx === 'number' ? ind.adx : null
      const err: string = row.error ?? ''
      const kind: 'TREND_ZGT05' | 'TREND_QUALITY_FAIL' = err.toUpperCase().startsWith('TREND_QUALITY_FAIL')
        ? 'TREND_QUALITY_FAIL'
        : 'TREND_ZGT05'

      const reason = kind === 'TREND_ZGT05'
        ? `z-score ${z != null ? z.toFixed(3) : '—'} > 0.5 threshold`
        : `ADX ${adx != null ? adx.toFixed(1) : '—'} < 20 — trend not confirmed`

      const ts = new Date(row.created_at).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/New_York',
      })

      return { symbol: row.symbol as string, kind, reason, z, adx, ts }
    })

    return NextResponse.json(rows)
  } catch (error) {
    console.error('[rejected-today]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
