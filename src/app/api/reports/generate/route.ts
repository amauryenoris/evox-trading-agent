import { NextResponse } from 'next/server'
import { generateAndSaveReport } from '@/lib/report-generator'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const { weekStart, weekEnd } = body as { weekStart?: string; weekEnd?: string }

    if ((weekStart && !weekEnd) || (!weekStart && weekEnd)) {
      return NextResponse.json(
        { success: false, error: 'Both start and end dates must be provided together' },
        { status: 400 }
      )
    }

    if (weekStart && weekEnd && new Date(weekStart) > new Date(weekEnd)) {
      return NextResponse.json(
        { success: false, error: 'Start date must be before or equal to end date' },
        { status: 400 }
      )
    }

    const report = await generateAndSaveReport(weekStart, weekEnd)
    return NextResponse.json({ success: true, reportId: report.id, report })
  } catch (err) {
    console.error('[reports/generate]:', err)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
