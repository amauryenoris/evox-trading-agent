import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { REJECTED_FILTER, classifyRejected, buildRejectedReason } from '@/lib/rejected-classification'

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
      .or(REJECTED_FILTER)
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
      const kind = classifyRejected(err)
      const reason = buildRejectedReason(kind, err, z, adx)

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
