'use client'
import { useState } from 'react'
import { login } from './actions'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleLogin() {
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
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', background: '#0a0a0a', gap: '16px',
    }}>
      <div style={{ color: '#00B386', fontSize: '28px', fontWeight: 'bold', fontFamily: 'Arial' }}>
        EVOX Trading Agent
      </div>
      <div style={{ color: '#888', fontSize: '14px', fontFamily: 'Arial', marginBottom: '8px' }}>
        Secure Access
      </div>
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        style={{
          padding: '12px', width: '300px',
          background: '#1a1a1a', border: '1px solid #333',
          color: '#fff', borderRadius: '6px',
          fontFamily: 'Arial', fontSize: '14px',
        }}
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleLogin()}
        style={{
          padding: '12px', width: '300px',
          background: '#1a1a1a', border: '1px solid #333',
          color: '#fff', borderRadius: '6px',
          fontFamily: 'Arial', fontSize: '14px',
        }}
      />
      {error && (
        <div style={{ color: '#ff4444', fontSize: '13px', fontFamily: 'Arial' }}>
          {error}
        </div>
      )}
      <button
        onClick={handleLogin}
        disabled={loading}
        style={{
          padding: '12px', width: '324px',
          background: loading ? '#555' : '#00B386',
          border: 'none', color: '#fff',
          borderRadius: '6px', fontFamily: 'Arial',
          fontSize: '14px', fontWeight: 'bold',
          cursor: loading ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? 'Signing in...' : 'Sign In'}
      </button>
    </div>
  )
}
