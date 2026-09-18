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
      .select('id, symbol, error, indicators, created_at')
      .or('error.ilike.TREND_ZGT125%,error.ilike.TREND_QUALITY_FAIL%,error.ilike.Spread gate%,error.ilike.MR_RANGING_ADX_GATE%')
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
      const upperErr = err.toUpperCase()

      const kind: 'TREND_ZGT125' | 'TREND_QUALITY_FAIL' | 'SPREAD_GATE' | 'MR_RANGING_ADX_GATE' =
        upperErr.startsWith('TREND_QUALITY_FAIL') ? 'TREND_QUALITY_FAIL'
        : upperErr.startsWith('SPREAD GATE') ? 'SPREAD_GATE'
        : upperErr.startsWith('MR_RANGING_ADX_GATE') ? 'MR_RANGING_ADX_GATE'
        : 'TREND_ZGT125'

      const reason =
        kind === 'TREND_ZGT125' ? `z-score ${z != null ? z.toFixed(3) : '—'} > 1.25 threshold`
        : kind === 'TREND_QUALITY_FAIL' ? `ADX ${adx != null ? adx.toFixed(1) : '—'} < 20 — trend not confirmed`
        : kind === 'MR_RANGING_ADX_GATE' ? `z-score ${z != null ? z.toFixed(3) : '—'} met threshold but ADX ${adx != null ? adx.toFixed(1) : '—'} too low — RANGING regime`
        : err.replace(/^Spread gate:\s*/i, '')

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
