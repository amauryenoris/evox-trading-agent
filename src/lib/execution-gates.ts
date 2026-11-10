export function checkLiquidity(prevDayVolume: number): boolean {
  return prevDayVolume >= 1_000_000
}

export function checkTradingHours(): boolean {
  const now = new Date()
  const etFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  })
  const parts = etFormatter.formatToParts(now)
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10)
  const minute = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10)
  const totalMinutes = hour * 60 + minute
  // 9:45 AM ET = 585 minutes, 3:30 PM ET = 930 minutes
  return totalMinutes >= 585 && totalMinutes <= 930
}
