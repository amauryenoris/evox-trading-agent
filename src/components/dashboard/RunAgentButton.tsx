'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function RunAgentButton() {
  const [isRunning, setIsRunning] = useState(false)
  const [lastRun, setLastRun] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<{ decisions: number; marketOpen: boolean } | null>(null)
  const router = useRouter()

  async function handleRun() {
    setIsRunning(true)
    try {
      const res = await fetch('/api/run-agent', { method: 'POST' })
      const data = await res.json()
      setLastRun(new Date().toLocaleTimeString())
      if (data.success) {
        setLastResult({
          decisions: data.decisions?.length ?? 0,
          marketOpen: data.marketOpen ?? false,
        })
      }
      router.refresh()
    } catch (err) {
      console.error('Agent run failed:', err)
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      {lastRun && lastResult && (
        <span className="text-xs text-slate-500">
          Last run {lastRun} · {lastResult.decisions} decisions ·{' '}
          {lastResult.marketOpen ? (
            <span className="text-green-400">Market open</span>
          ) : (
            <span className="text-amber-400">Market closed</span>
          )}
        </span>
      )}
      <button
        onClick={handleRun}
        disabled={isRunning}
        className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
      >
        {isRunning ? (
          <>
            <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Analyzing...
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
