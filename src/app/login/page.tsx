'use client'
import { useId, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff } from 'lucide-react'
import { login } from './actions'
import { Card } from '@/components/dashboard/ui'

export default function LoginPage() {
  const emailId = useId()
  const passwordId = useId()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)
  const router = useRouter()

  const isFormIncomplete = email.trim() === '' || password === ''

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (isFormIncomplete || loading) return
    setLoading(true)
    setError('')
    const err = await login(email, password)
    if (err) {
      setError(err)
      setLoading(false)
    } else {
      router.push('/dashboard')
      router.refresh()
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-2xl font-bold text-green">EVOX Trading Agent</div>
          <div className="mt-1 text-sm text-muted">Secure Access</div>
        </div>

        <Card>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-6">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={emailId} className="sr-only">Email</label>
              <input
                id={emailId}
                type="email"
                placeholder="Email"
                autoComplete="email"
                required
                disabled={loading}
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full rounded-md border border-border bg-white/3 px-3 py-3 text-sm text-text placeholder:text-muted outline-none transition-colors focus:border-green focus:ring-2 focus:ring-green/30 disabled:opacity-50"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor={passwordId} className="sr-only">Password</label>
              <div className="relative">
                <input
                  id={passwordId}
                  type={isPasswordVisible ? 'text' : 'password'}
                  placeholder="Password"
                  autoComplete="current-password"
                  required
                  disabled={loading}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full rounded-md border border-border bg-white/3 px-3 py-3 pr-10 text-sm text-text placeholder:text-muted outline-none transition-colors focus:border-green focus:ring-2 focus:ring-green/30 disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setIsPasswordVisible(v => !v)}
                  disabled={loading}
                  aria-label={isPasswordVisible ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted outline-none transition-colors hover:text-text focus-visible:ring-2 focus-visible:ring-green/30 disabled:opacity-50"
                >
                  {isPasswordVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div role="alert" className="text-[13px] text-red">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || isFormIncomplete}
              className="w-full rounded-md bg-green py-3 text-sm font-semibold text-white outline-none transition-colors hover:bg-green2 focus-visible:ring-2 focus-visible:ring-green/50 disabled:cursor-not-allowed disabled:bg-muted/40 disabled:text-muted"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </Card>
      </div>
    </div>
  )
}
