import { NextResponse } from 'next/server'
import { getWeeklyReports } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const reports = await getWeeklyReports(20)
    return NextResponse.json(reports)
  } catch (err) {
    console.error('[reports]:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
