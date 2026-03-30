import { NextResponse } from 'next/server'
import { getWeeklyReports } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const reports = await getWeeklyReports(20)
    return NextResponse.json(reports)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
