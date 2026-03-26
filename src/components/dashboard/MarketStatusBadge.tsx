import { getClock } from '@/lib/alpaca'

export async function MarketStatusBadge() {
  let isOpen = false
  let nextEvent = ''

  try {
    const clock = await getClock()
    isOpen = clock.is_open
    const next = isOpen ? clock.next_close : clock.next_open
    nextEvent = new Date(next).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/New_York',
      timeZoneName: 'short',
    })
  } catch {
    // silently fallback
  }

  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`inline-block w-2 h-2 rounded-full ${isOpen ? 'bg-green-400 animate-pulse' : 'bg-slate-600'}`}
      />
      <span className={`text-xs font-medium ${isOpen ? 'text-green-400' : 'text-slate-500'}`}>
        {isOpen ? 'MARKET OPEN' : 'MARKET CLOSED'}
      </span>
      {nextEvent && (
        <span className="text-xs text-slate-600">
          · {isOpen ? 'closes' : 'opens'} {nextEvent}
        </span>
      )}
    </div>
  )
}
