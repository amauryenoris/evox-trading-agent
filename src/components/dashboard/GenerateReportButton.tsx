'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { isDateRangeIncomplete, isDateRangeInverted } from '@/lib/report-validation'

export function GenerateReportButton() {
  const [isGenerating, setIsGenerating] = useState(false)
  const [generated, setGenerated] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [weekStart, setWeekStart] = useState('')
  const [weekEnd, setWeekEnd] = useState('')
  const router = useRouter()

  async function handleGenerate() {
    setGenerated(false)
    setError(null)

    if (isDateRangeIncomplete(weekStart, weekEnd)) {
      setError('Both start and end dates must be provided together')
      return
    }

    if (weekStart && weekEnd && isDateRangeInverted(weekStart, weekEnd)) {
      setError('Start date must be before or equal to end date')
      return
    }

    setIsGenerating(true)
    try {
      const body = weekStart && weekEnd ? { weekStart, weekEnd } : {}
      const res = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.success) {
        setGenerated(true)
        router.refresh()
      } else {
        setError(data.error ?? 'Unknown error')
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      {generated && (
        <span className="text-xs text-slate-500">Report generated ✓</span>
      )}
      {error && (
        <span className="text-xs text-red-400">Error: {error}</span>
      )}
      <input
        type="date"
        value={weekStart}
        onChange={(e) => setWeekStart(e.target.value)}
        aria-label="Report start date"
        className="bg-[#13131a] border border-[#1e1e2e] text-slate-300 text-sm px-2.5 py-2 rounded-lg focus:outline-none focus:border-slate-600"
      />
      <input
        type="date"
        value={weekEnd}
        onChange={(e) => setWeekEnd(e.target.value)}
        aria-label="Report end date"
        className="bg-[#13131a] border border-[#1e1e2e] text-slate-300 text-sm px-2.5 py-2 rounded-lg focus:outline-none focus:border-slate-600"
      />
      <button
        onClick={handleGenerate}
        disabled={isGenerating}
        className="flex items-center gap-2 bg-[#13131a] hover:bg-[#1e1e2e] border border-[#1e1e2e] disabled:opacity-50 disabled:cursor-not-allowed text-slate-300 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
      >
        {isGenerating ? (
          <>
            <span className="inline-block w-3.5 h-3.5 border-2 border-slate-600 border-t-slate-300 rounded-full animate-spin" />
            Generating...
          </>
        ) : (
          <>
            <span>📄</span> Weekly Report
          </>
        )}
      </button>
    </div>
  )
}
