import { NextResponse } from 'next/server'
import { readPatternLibrary } from '@/lib/learning'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const patterns = await readPatternLibrary()
    return NextResponse.json(patterns)
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
