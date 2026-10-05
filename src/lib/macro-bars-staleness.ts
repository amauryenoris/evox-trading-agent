export const STALE_MACRO_BARS_MAX_DAYS = 5

export function isMacroBarsStale(bars: { t: string }[], referenceDate: Date): boolean {
  if (bars.length === 0) return true
  const lastBarDate = new Date(bars[bars.length - 1].t)
  const ageDays = (referenceDate.getTime() - lastBarDate.getTime()) / (24 * 60 * 60 * 1000)
  return ageDays > STALE_MACRO_BARS_MAX_DAYS
}
