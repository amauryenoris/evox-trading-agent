import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 1000
const HISTORY_START = '2026-04-20'

function getClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  return createClient(url, key)
}

export async function GET() {
  try {
    const db = getClient()

    const allRows: Array<{ created_at: string; portfolio_snapshot: unknown }> = []
    let offset = 0

    while (true) {
      const { data, error } = await db
        .from('agent_log')
        .select('created_at, portfolio_snapshot')
        .not('portfolio_snapshot', 'is', null)
        .gte('created_at', HISTORY_START)
        .order('created_at', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1)

      if (error) throw error
      allRows.push(...(data ?? []))
      if ((data ?? []).length < PAGE_SIZE) break
      offset += PAGE_SIZE
    }

    // One point per day — max equity of each trading day (UTC date)
    const byDay = new Map<string, number>()
    for (const row of allRows) {
      const snapshot = row.portfolio_snapshot as { equity?: string } | null
      const equity = parseFloat(snapshot?.equity ?? '0')
      if (!equity || equity <= 50000) continue
      const date = (row.created_at as string).split('T')[0]
      const existing = byDay.get(date) ?? 0
      if (equity > existing) byDay.set(date, equity)
    }

    const history = Array.from(byDay.entries())
      .map(([date, equity]) => ({ date, equity }))

    const START_EQUITY = 100_000
    const currentEquity = history.at(-1)?.equity ?? START_EQUITY
    const totalReturn = (currentEquity - START_EQUITY) / START_EQUITY

    return NextResponse.json(
      { history, startEquity: START_EQUITY, currentEquity, totalReturn },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    console.error('[portfolio-history]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
