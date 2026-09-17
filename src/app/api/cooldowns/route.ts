import { NextResponse } from 'next/server'
import { getActiveCooldowns } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const cooldowns = await getActiveCooldowns()
    return NextResponse.json({ cooldowns })
  } catch (error) {
    console.error('[cooldowns]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
