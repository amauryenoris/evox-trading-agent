import { NextResponse } from 'next/server'
import { getLatestBriefing, getRecentSelections } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const [briefing, selections] = await Promise.all([
      getLatestBriefing(),
      getRecentSelections(5),
    ])
    return NextResponse.json({ briefing, selections })
  } catch (error) {
    console.error('[buy-scanner]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
