import { NextResponse } from 'next/server'
import { getReportById, createStorageSignedUrl } from '@/lib/db'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const report = await getReportById(id)
    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }
    const signedUrl = await createStorageSignedUrl(report.storagePath, 3600)
    return NextResponse.redirect(signedUrl)
  } catch (err) {
    console.error('[reports/download]:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
