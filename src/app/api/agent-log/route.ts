import { NextResponse } from 'next/server'
import { readAgentLog } from '@/lib/agent-log'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const log = await readAgentLog()
    return NextResponse.json(log)
  } catch (error) {
    console.error('[agent-log]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
