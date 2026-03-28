import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Dispatches a workflow_dispatch event to GitHub Actions instead of running
// the cycle directly in Vercel (no 60s timeout, same env as the scheduled cron).
// Requires GITHUB_TOKEN env var — a PAT with "workflow" scope.
export async function POST() {
  const token = process.env.GITHUB_TOKEN
  if (!token) {
    return NextResponse.json({ success: false, error: 'GITHUB_TOKEN is not set' }, { status: 500 })
  }

  const res = await fetch(
    'https://api.github.com/repos/amauryenoris/evox-trading-agent/actions/workflows/agent-cron.yml/dispatches',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main' }),
    }
  )

  if (!res.ok) {
    const text = await res.text()
    return NextResponse.json({ success: false, error: text }, { status: 500 })
  }

  // GitHub returns 204 No Content on success
  return NextResponse.json({ success: true, dispatched: true })
}
