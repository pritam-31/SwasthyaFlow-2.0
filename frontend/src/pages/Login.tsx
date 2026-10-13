import { HeartPulse, Lock, ShieldCheck, Smartphone, UserPlus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Button, Card, cx } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { ApiError } from '../services/api'

/**
 * Synthetic demo credentials (the backend seeds these accounts on first boot).
 * Shown in every build — including the deployed prototype — so reviewers can
 * sign in without hunting for credentials. Set VITE_HIDE_DEMO_ACCOUNTS=true to
 * hide the panel for a public/customer-facing deployment.
 */
const DEMO_ACCOUNTS =
  import.meta.env.VITE_HIDE_DEMO_ACCOUNTS === 'true'
    ? []
    : [
        { label: 'Patient', username: 'patient', password: 'Patient@123' },
        { label: 'Nurse', username: 'nurse', password: 'Nurse@123' },
        { label: 'Doctor', username: 'doctor', password: 'Doctor@123' },
        { label: 'Admin', username: 'admin', password: 'Admin@123' },
      ]

const ROLE_CAPABILITIES = [
  { label: 'Patient', copy: 'Submit your own intake, answer follow-ups, read your own record.' },
  { label: 'Nurse', copy: 'Capture and edit notes, accept AI drafts, draft referrals.' },
  { label: 'Doctor', copy: 'Finalize notes and approve referrals to a higher-level facility.' },
  { label: 'Admin', copy: 'Everything above plus audit logs and user management.' },
]

export default function LoginPage() {
  const { user, login, register } = useAuth()
  const location = useLocation()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  /** True once the backend reports the account is 2FA-protected mid-login. */
  const [requireCode, setRequireCode] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const from = (location.state as { from?: string } | null)?.from
  const redirectTo = from && from !== '/login' ? from : '/app'

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setError(null)
    setBusy(true)
    try {
      if (mode === 'login') {
        await login(username.trim(), password, requireCode && code.trim() ? code.trim() : undefined)
      } else {
        await register({ username: username.trim(), displayName: displayName.trim(), password })
      }
      // The render below navigates once `user` is set.
    } catch (err) {
      if (err instanceof ApiError && err.twoFactorRequired) {
        setRequireCode(true)
        setError('Two-factor authentication is enabled on this account. Enter the 6-digit code from your authenticator app.')
      } else {
        setError(err instanceof Error ? err.message : 'Could not sign in.')
      }
      setBusy(false)
    }
  }

  const fillDemo = (d: (typeof DEMO_ACCOUNTS)[number]) => {
    setMode('login')
    setUsername(d.username)
    setPassword(d.password)
    setRequireCode(false)
    setCode('')
    setError(null)
  }

  if (user) return <Navigate to={redirectTo} replace />

  return (
    <div className="flex min-h-screen bg-canvas">
      {/* -------- Brand panel -------- */}
      <aside className="relative hidden w-[44%] max-w-[560px] flex-col justify-between overflow-hidden bg-ink-900 p-10 text-white md:flex">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(420px_420px_at_15%_0%,rgba(163,230,53,0.18),transparent_70%)]" />
        <div className="relative flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-lime-400 text-ink-900">
            <HeartPulse size={19} strokeWidth={2.4} />
          </span>
          <span className="text-[15px] font-extrabold tracking-tight">आरोग्य Sathi</span>
        </div>

        <div className="relative space-y-5">
          <h1 className="max-w-[26ch] text-[34px] font-extrabold leading-[1.08] tracking-tight">
            Human-in-the-loop triage for frontline health teams.
          </h1>
          <p className="max-w-[46ch] text-[13px] leading-relaxed text-white/60">
            Capture → Verify → Prioritize → Refer → Follow up. AI drafts the note; a licensed
            professional always makes the call. Prescribing is disabled for every role.
          </p>
          <ul className="space-y-2.5 pt-1">
            {ROLE_CAPABILITIES.map((r) => (
              <li key={r.label} className="flex items-start gap-2.5 text-[12px]">
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-lime-400/20 text-lime-300">
                  <ShieldCheck size={11} />
                </span>
                <span>
                  <span className="font-bold text-white">{r.label}</span>
                  <span className="text-white/55"> — {r.copy}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-[11px] font-medium text-white/40">
          Synthetic / public sample data only · Non-diagnostic prototype
        </p>
      </aside>

      {/* -------- Form -------- */}
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-[420px]">
          <div className="mb-6 flex items-center gap-2.5 md:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-lime-400 text-ink-900">
              <HeartPulse size={19} strokeWidth={2.4} />
            </span>
            <span className="text-[15px] font-extrabold tracking-tight text-ink-900">आरोग्य Sathi</span>
          </div>

          <div className="mb-5 flex gap-1 rounded-2xl bg-ink-100/80 p-1">
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m)
                  setRequireCode(false)
                  setCode('')
                  setError(null)
                }}
                className={cx(
                  'flex-1 rounded-xl px-3 py-2 text-[12px] font-bold transition-colors',
                  mode === m ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-800',
                )}
              >
                {m === 'login' ? 'Sign in' : 'Create account'}
              </button>
            ))}
          </div>

          <Card title={mode === 'login' ? 'Welcome back' : 'Create a patient account'}>
            <form onSubmit={submit} className="space-y-3.5">
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                  Username
                </label>
                <input
                  className="inp"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                  placeholder="e.g. nurse"
                />
              </div>

              {mode === 'register' && (
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                    Full name
                  </label>
                  <input
                    className="inp"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    autoComplete="name"
                    required
                    placeholder="As it should appear on records"
                  />
                </div>
              )}

              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                  Password
                </label>
                <input
                  className="inp"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  required
                  placeholder="At least 8 characters"
                />
                {mode === 'register' && (
                  <p className="mt-1 text-[11px] text-ink-400">
                    Minimum 8 characters with at least one letter and one digit.
                  </p>
                )}
              </div>

{mode === 'login' && requireCode && (
                  <div>
                    <label className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                      <Smartphone size={12} /> Two-factor code
                    </label>
                    <input
                      className="inp"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      placeholder="6-digit code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      autoFocus
                      required
                    />
                  </div>
                )}

                {error && (
                  <p className="rounded-xl bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-700 ring-1 ring-inset ring-rose-200">
                    {error}
                  </p>
                )}

              <Button type="submit" disabled={busy} className="w-full">
                {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
              </Button>

              <p className="flex items-center justify-center gap-1.5 text-[11px] text-ink-400">
                <Lock size={11} />
                New self-registered accounts always start as <span className="font-bold text-ink-600">patient</span>.
                Staff accounts are created by an administrator.
              </p>
            </form>
          </Card>

          {DEMO_ACCOUNTS.length > 0 && (
            <div className="mt-4 rounded-2xl border border-dashed border-ink-200 bg-white/70 p-3.5">
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-400">
                <UserPlus size={12} /> Demo accounts — tap to fill
              </p>
              <div className="grid grid-cols-4 gap-1.5">
                {DEMO_ACCOUNTS.map((d) => (
                  <button
                    key={d.label}
                    type="button"
                    onClick={() => fillDemo(d)}
                    className="rounded-xl bg-ink-100 px-2 py-2 text-[11px] font-bold text-ink-600 transition-colors hover:bg-ink-200/70 hover:text-ink-900"
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
