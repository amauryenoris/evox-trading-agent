'use client'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export function LogoutButton() {
  const supabase = createClient()
  const router = useRouter()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <button
      onClick={handleLogout}
      className="text-xs px-3 py-1.5 rounded-md border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500 transition-colors"
    >
      Sign Out
    </button>
  )
}
