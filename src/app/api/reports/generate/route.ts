import { NextResponse } from 'next/server'
import { generateAndSaveReport } from '@/lib/report-generator'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const report = await generateAndSaveReport()
    return NextResponse.json({ success: true, reportId: report.id, report })
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
