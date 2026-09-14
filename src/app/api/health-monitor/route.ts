import { NextResponse } from 'next/server'
import { getLatestHealthSnapshots } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const rows = await getLatestHealthSnapshots()
    const snapshotTimestamp = rows[0]?.snapshot_timestamp ?? null
    const snapshots = snapshotTimestamp
      ? rows.filter((r) => r.snapshot_timestamp === snapshotTimestamp)
      : []
    return NextResponse.json({ snapshots, snapshotTimestamp })
  } catch (error) {
    console.error('[health-monitor]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
