import { NextResponse } from 'next/server'
import { getActiveNearMisses } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const entries = await getActiveNearMisses()
    const sorted = [...entries].sort((a, b) => a.gap_to_threshold - b.gap_to_threshold)
    return NextResponse.json(sorted)
  } catch (error) {
    console.error('[near-miss]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
