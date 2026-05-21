import { NextResponse } from 'next/server'
import { runAgentCycle } from '@/lib/claude-agent'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const result = await runAgentCycle()
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    console.error('[cron/run] agent cycle failed:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
