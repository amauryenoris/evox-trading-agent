import { NextResponse } from 'next/server'
import { getOrders } from '@/lib/alpaca'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const orders = await getOrders('filled', 50)
    return NextResponse.json(orders)
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
