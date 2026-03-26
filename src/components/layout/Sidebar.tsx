import Link from 'next/link'

const links = [
  { href: '/dashboard', label: 'Dashboard', icon: '◈' },
  { href: '/dashboard#positions', label: 'Positions', icon: '⊞' },
  { href: '/dashboard#trades', label: 'Trade History', icon: '↕' },
  { href: '/dashboard#agent', label: 'Agent Log', icon: '◉' },
  { href: '/dashboard#patterns', label: 'Patterns', icon: '⋮' },
]

export function Sidebar() {
  return (
    <aside className="w-52 shrink-0 hidden lg:flex flex-col bg-black border-r border-[#1a1a1a] min-h-screen px-3 py-6">
      <div className="mb-8 px-2">
        <p className="text-xl font-black tracking-tight text-white">EVOX</p>
        <p className="text-sm font-medium text-[#1daa6c] leading-tight">Trading Agent</p>
        <p className="text-xs text-gray-600 mt-0.5">Paper Trading</p>
      </div>
      <nav className="space-y-0.5">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-[#1daa6c15] transition-colors"
          >
            <span className="text-base leading-none text-[#1daa6c]">{l.icon}</span>
            {l.label}
          </Link>
        ))}
      </nav>
      <div className="mt-auto px-2 pt-4 border-t border-[#1a1a1a]">
        <p className="text-xs text-gray-600">Powered by Claude</p>
        <p className="text-xs text-gray-700">claude-sonnet-4-6</p>
      </div>
    </aside>
  )
}
