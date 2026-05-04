'use client'
import { logout } from '@/app/login/actions'

export function LogoutButton() {
  return (
    <button
      onClick={() => logout()}
      className="text-xs px-3 py-1.5 rounded-md border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500 transition-colors"
    >
      Sign Out
    </button>
  )
}
