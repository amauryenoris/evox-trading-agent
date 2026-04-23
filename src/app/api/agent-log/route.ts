import { NextResponse } from 'next/server'
import { readAgentLog } from '@/lib/agent-log'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const log = await readAgentLog()
    return NextResponse.json(log)
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
