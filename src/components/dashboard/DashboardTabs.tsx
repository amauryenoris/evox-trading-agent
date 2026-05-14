'use client'

import { useState, type ReactNode } from 'react'

const TABS = [
  { id: 'portfolio',    label: 'Portfolio',    kicker: '01' },
  { id: 'intelligence', label: 'Intelligence', kicker: '02' },
  { id: 'analytics',    label: 'Analytics',    kicker: '03' },
  { id: 'reports',      label: 'Reports',      kicker: '04' },
] as const

type TabId = (typeof TABS)[number]['id']

export function DashboardTabs({
  tabs,
  defaultTab = 'portfolio',
}: {
  tabs: Record<TabId, ReactNode>
  defaultTab?: TabId
}) {
  const [active, setActive] = useState<TabId>(defaultTab)

  return (
    <>
      {/* ─── Tab bar — sticky below the main header (Row 1 + Row 2) ─── */}
      <div className="sticky top-[108px] z-30 bg-[#0A0A0F]/85 backdrop-blur-xl border-b border-[#1E1E2E]">
        <div className="max-w-[1480px] mx-auto px-6 lg:px-8">
          <div
            role="tablist"
            aria-label="Dashboard sections"
            className="flex items-stretch gap-1 -mb-px overflow-x-auto"
          >
            {TABS.map((t) => {
              const isActive = active === t.id
              return (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`panel-${t.id}`}
                  id={`tab-${t.id}`}
                  onClick={() => setActive(t.id)}
                  className={
                    'relative px-4 lg:px-5 py-3.5 text-[12px] tracking-wide font-medium transition whitespace-nowrap ' +
                    (isActive
                      ? 'text-white'
                      : 'text-slate-500 hover:text-slate-200')
                  }
                >
                  <span className="inline-flex items-center gap-2">
                    <span
                      className={
                        'font-mono tabular-nums text-[10px] tracking-[0.18em] ' +
                        (isActive ? 'text-[#00B386]' : 'text-slate-600')
                      }
                    >
                      {t.kicker}
                    </span>
                    <span>{t.label}</span>
                  </span>
                  {isActive && (
                    <span
                      className="absolute left-2 right-2 -bottom-px h-[2px] bg-[#00B386] rounded-full"
                      style={{
                        boxShadow: '0 0 8px rgba(0,179,134,0.6)',
                      }}
                    />
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ─── Active panel ─── */}
      <main
        id={`panel-${active}`}
        role="tabpanel"
        aria-labelledby={`tab-${active}`}
        className="max-w-[1480px] mx-auto px-6 lg:px-8 py-8"
      >
        {tabs[active]}
      </main>
    </>
  )
}
