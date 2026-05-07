import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  return createClient(url, key)
}

export async function GET() {
  try {
    const db = getClient()
    const { data, error } = await db
      .from('agent_log')
      .select('created_at, portfolio_snapshot')
      .not('portfolio_snapshot', 'is', null)
      .gte('created_at', '2026-04-20')
      .order('created_at', { ascending: true })

    if (error) throw error

    // One point per day — first entry of each trading day (UTC date)
    const byDay = new Map<string, number>()
    for (const row of data ?? []) {
      const snapshot = row.portfolio_snapshot as { equity?: string } | null
      const equity = parseFloat(snapshot?.equity ?? '0')
      if (!equity || equity <= 0) continue
      const date = (row.created_at as string).split('T')[0]
      if (!byDay.has(date)) {
        byDay.set(date, equity)
      }
    }

    const history = Array.from(byDay.entries())
      .map(([date, equity]) => ({ date, equity }))
      .slice(-30) // last 30 trading days

    const START_EQUITY = 100_000
    const currentEquity = history.at(-1)?.equity ?? START_EQUITY
    const totalReturn = (currentEquity - START_EQUITY) / START_EQUITY

    return NextResponse.json({ history, startEquity: START_EQUITY, currentEquity, totalReturn })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
