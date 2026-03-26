import { NextResponse } from 'next/server'
import { readAgentLog } from '@/lib/agent-log'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const log = await readAgentLog()
    // Return last 50, newest first
    return NextResponse.json(log.slice(0, 50))
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
