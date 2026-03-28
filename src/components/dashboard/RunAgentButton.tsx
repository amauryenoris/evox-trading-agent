'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function RunAgentButton() {
  const [isDispatching, setIsDispatching] = useState(false)
  const [dispatched, setDispatched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  // Auto-refresh dashboard data every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => router.refresh(), 60_000)
    return () => clearInterval(interval)
  }, [router])

  async function handleRun() {
    setIsDispatching(true)
    setDispatched(false)
    setError(null)
    try {
      const res = await fetch('/api/run-agent', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        setDispatched(true)
        // Refresh dashboard after a delay to catch results
        setTimeout(() => router.refresh(), 30_000)
      } else {
        setError(data.error ?? 'Unknown error')
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setIsDispatching(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      {dispatched && (
        <span className="text-xs text-slate-500">
          Dispatched ✓ —{' '}
          <a
            href="https://github.com/amauryenoris/evox-trading-agent/actions"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#1daa6c] hover:underline"
          >
            ver en Actions
          </a>
        </span>
      )}
      {error && (
        <span className="text-xs text-red-400">Error: {error}</span>
      )}
      <button
        onClick={handleRun}
        disabled={isDispatching}
        className="flex items-center gap-2 bg-[#1daa6c] hover:bg-[#168b57] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
      >
        {isDispatching ? (
          <>
            <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Dispatching...
          </>
        ) : (
          <>
            <span>▶</span> Run Analysis
          </>
        )}
      </button>
    </div>
  )
}
