'use client'

import { useState, type ReactNode } from 'react'

type Tab = 'portfolio' | 'intelligence' | 'analytics' | 'reports'

interface Props {
  portfolio: ReactNode
  intelligence: ReactNode
  analytics: ReactNode
  reports: ReactNode
}

const TABS: { id: Tab; label: string; number: string }[] = [
  { id: 'portfolio',    label: 'Portfolio',     number: '01' },
  { id: 'intelligence', label: 'Intelligence',  number: '02' },
  { id: 'analytics',   label: 'Analytics',     number: '03' },
  { id: 'reports',     label: 'Reports',       number: '04' },
]

export function DashboardTabs({ portfolio, intelligence, analytics, reports }: Props) {
  const [active, setActive] = useState<Tab>('portfolio')

  const panels: Record<Tab, ReactNode> = { portfolio, intelligence, analytics, reports }

  return (
    <div>
      {/* Sticky tab bar */}
      <div className="sticky top-0 z-20 bg-[#0a0a0f]/90 backdrop-blur-sm border-b border-[#1e1e2e] mb-6">
        <div className="flex gap-0.5">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActive(tab.id)}
              className={[
                'flex items-center gap-1.5 px-5 py-3 text-sm font-medium transition-colors',
                'border-b-2 -mb-px focus:outline-none',
                active === tab.id
                  ? 'border-indigo-500 text-slate-100'
                  : 'border-transparent text-slate-500 hover:text-slate-300 hover:border-slate-600',
              ].join(' ')}
            >
              <span className="text-[10px] text-slate-600 font-mono">{tab.number}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Active panel */}
      <div className="space-y-6">
        {panels[active]}
      </div>
    </div>
  )
}
