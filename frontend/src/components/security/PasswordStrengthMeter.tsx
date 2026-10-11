import { Check, ShieldAlert, ShieldCheck, X } from 'lucide-react'
import { cx } from '../ui'
import type { PasswordPolicy } from '../../types/security.types'

/**
 * Client-side preview of the strict server-side policy (P1-12). The backend is
 * the single source of truth — this meter only stops a user submitting a
 * password that is guaranteed to be rejected.
 */

const COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  'password123',
  '123456',
  '12345678',
  '123456789',
  '1234567890',
  'qwerty',
  'qwerty123',
  'letmein',
  'admin',
  'admin123',
  'welcome',
  'welcome1',
  'iloveyou',
  'abc123',
  'monkey',
  'dragon',
  'passw0rd',
])

export interface PasswordEvaluation {
  ok: boolean
  errors: string[]
  score: number
}

/** Mirrors `backend/src/services/passwordPolicyService.ts` check semantics. */
export function evaluatePassword(password: string, username: string | undefined, policy: PasswordPolicy): PasswordEvaluation {
  const errors: string[] = []
  if (password.length < policy.minLength) errors.push(`at least ${policy.minLength} characters`)
  if (policy.requireLetter && !/[A-Za-z]/.test(password)) errors.push('a letter')
  if (policy.requireDigit && !/\d/.test(password)) errors.push('a digit')
  if (policy.requireSymbol && !/[^A-Za-z0-9]/.test(password)) errors.push('a symbol')
  if (policy.blockCommon && COMMON_PASSWORDS.has(password.toLowerCase())) errors.push('not a common password')
  if (
    policy.blockUsername &&
    username &&
    username.length >= 3 &&
    password.toLowerCase().includes(username.toLowerCase())
  ) {
    errors.push(`must not contain the username`)
  }

  let score = 0
  if (password.length >= policy.minLength) score += 1
  if (policy.requireLetter && /[A-Za-z]/.test(password)) score += 1
  if (policy.requireDigit && /\d/.test(password)) score += 1
  if (policy.requireSymbol && /[^A-Za-z0-9]/.test(password)) score += 1
  if (password.length >= policy.minLength + 6) score += 1

  return { ok: errors.length === 0, errors, score: Math.min(score, 5) }
}

const LEVELS: Array<{ label: string; bar: string; text: string }> = [
  { label: 'Very weak', bar: 'bg-rose-500', text: 'text-rose-600' },
  { label: 'Weak', bar: 'bg-orange-500', text: 'text-orange-600' },
  { label: 'Fair', bar: 'bg-amber-500', text: 'text-amber-600' },
  { label: 'Good', bar: 'bg-emerald-500', text: 'text-emerald-600' },
  { label: 'Strong', bar: 'bg-emerald-600', text: 'text-emerald-700' },
  { label: 'Excellent', bar: 'bg-lime-500', text: 'text-lime-700' },
]

export function PasswordStrengthMeter({
  password,
  username,
  policy,
}: {
  password: string
  username?: string
  policy: PasswordPolicy
}) {
  if (!password) return null
  const { ok, errors, score } = evaluatePassword(password, username, policy)
  const level = LEVELS[Math.min(score, LEVELS.length - 1)]

  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <span key={i} className={cx('h-1.5 flex-1 rounded-full', i < score ? level.bar : 'bg-ink-100')} />
          ))}
        </div>
        <span className={cx('text-[10px] font-bold uppercase tracking-wide', ok ? 'text-emerald-600' : level.text)}>
          {level.label}
        </span>
      </div>
      {ok ? (
        <p className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
          <ShieldCheck size={12} /> Meets the strict policy.
        </p>
      ) : (
        <ul className="space-y-0.5">
          {errors.map((e) => (
            <li key={e} className="flex items-start gap-1 text-[11px] text-ink-500">
              {e.startsWith('must not') ? <X size={12} className="mt-0.5 shrink-0 text-rose-500" /> : <Check size={12} className="mt-0.5 shrink-0 text-ink-400" />}
              {e}
            </li>
          ))}
        </ul>
      )}
      {errors.length > 2 && (
        <p className="flex items-center gap-1 text-[11px] font-semibold text-amber-600">
          <ShieldAlert size={12} /> A strong password protects this account.
        </p>
      )}
    </div>
  )
}