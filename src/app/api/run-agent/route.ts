import { NextResponse } from 'next/server'
import { runAgentCycle } from '@/lib/claude-agent'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST() {
  try {
    const result = await runAgentCycle()
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
