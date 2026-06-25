// Shared date-range validation — pure, no side-effect imports — safe to
// import from both server routes and 'use client' components.

export function isDateRangeIncomplete(start?: string, end?: string): boolean {
  return (!!start && !end) || (!start && !!end)
}

export function isDateRangeInverted(start: string, end: string): boolean {
  return new Date(start) > new Date(end)
}
