import { NextResponse } from 'next/server'
import { runAgentCycle } from '@/lib/claude-agent'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Vercel Cron calls this GET endpoint on the schedule defined in vercel.json
export async function GET() {
  try {
    const result = await runAgentCycle()
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    console.error('Cron agent cycle failed:', error)
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
