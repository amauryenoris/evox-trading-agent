import { NextResponse } from 'next/server'
import { getActiveNewsEvents } from '@/lib/db'

export const dynamic = 'force-dynamic'

const IMPACT_ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2 }

export async function GET() {
  try {
    // Pass empty array to get all symbols (MACRO + all symbols)
    const events = await getActiveNewsEvents([])
    const sorted = [...events].sort((a, b) => {
      const impactDiff = (IMPACT_ORDER[a.impact] ?? 3) - (IMPACT_ORDER[b.impact] ?? 3)
      if (impactDiff !== 0) return impactDiff
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    })
    return NextResponse.json(sorted)
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
