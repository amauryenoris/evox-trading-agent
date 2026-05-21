import { NextResponse } from 'next/server'
import { readPatternLibrary } from '@/lib/learning'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const patterns = await readPatternLibrary()
    return NextResponse.json(patterns)
  } catch (error) {
    console.error('[patterns]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
