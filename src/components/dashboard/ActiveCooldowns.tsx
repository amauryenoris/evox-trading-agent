'use client'

import { useEffect, useState } from 'react'
import { Card, Badge } from './ui'

interface CooldownEntry {
  symbol: string
  exit_reason: string
  cooldown_until: string
}

function CooldownItemCard({ entry }: { entry: CooldownEntry }) {
  return (
    <div className="bg-surface2 border border-border rounded-lg p-3.5 hover:border-border2 transition">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="font-semibold tracking-tight">{entry.symbol}</span>
          <Badge tone="neutral" size="xs">{entry.exit_reason}</Badge>
        </div>
        <div className="text-[11px] text-muted num">
          until {new Date(entry.cooldown_until).toLocaleString('en-US')}
        </div>
      </div>
    </div>
  )
}

export function ActiveCooldowns() {
  const [cooldowns, setCooldowns] = useState<CooldownEntry[]>([])

  async function fetchCooldowns() {
    try {
      const res = await fetch('/api/cooldowns')
      if (!res.ok) return
      const data = await res.json() as { cooldowns: CooldownEntry[] }
      setCooldowns(data.cooldowns)
    } catch {
      // silently fail — non-critical
    }
  }

  useEffect(() => {
    fetchCooldowns()
    const interval = setInterval(fetchCooldowns, 60_000)
    return () => clearInterval(interval)
  }, [])

  return (
    <Card padded={false} label={`Active Cooldowns · ${cooldowns.length} tracked`}>
      <div className="px-5 pb-5 space-y-2.5">
        {cooldowns.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">No active cooldowns</p>
        ) : (
          cooldowns.map((c) => <CooldownItemCard key={c.symbol} entry={c} />)
        )}
      </div>
    </Card>
  )
}
