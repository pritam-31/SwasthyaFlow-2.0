import { Save } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Button } from '../ui'
import { useApp } from '../../store/AppStore'
import { SECURITY_SECTION_LABELS } from '../../services/safetyPolicy'
import type { SecurityPolicy } from '../../types/security.types'
import * as securityApi from '../../services/securityApi'

type Lang = 'en' | 'hi' | 'or'

function num(value: string): number {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0
}

/** Facility security policy editor — administrator only (server re-verifies). */
export function SecurityPolicyForm({ lang = 'en' }: { lang?: Lang }) {
  const t = SECURITY_SECTION_LABELS[lang]
  const { pushToast } = useApp()
  const [policy, setPolicy] = useState<SecurityPolicy | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    securityApi
      .fetchEffectivePolicy()
      .then(setPolicy)
      .catch((e: unknown) => pushToast('error', e instanceof Error ? e.message : 'Could not load the security policy.'))
  }, [pushToast])

  if (!policy) {
    return <p className="text-[12px] text-ink-400">Loading policy…</p>
  }

  const patch = <K extends 'password' | 'lockout' | 'session' | 'twoFactor' | 'ipAllowlist' | 'rateLimit'>(
    group: K,
    value: Partial<SecurityPolicy[K]>,
  ) => {
    setPolicy({ ...policy, [group]: { ...policy[group], ...value } })
  }

  const save = async () => {
    setBusy(true)
    try {
      await securityApi.updatePolicy(policy)
      pushToast('success', t.policySaved)
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Could not save the policy.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <Group title="Passwords">
          <NumField label={t.minLength} value={policy.password.minLength} onChange={(v) => patch('password', { minLength: num(v) })} />
          <div className="grid grid-cols-2 gap-2">
            <BoolField label={t.requireLetter} checked={policy.password.requireLetter} onChange={(v) => patch('password', { requireLetter: v })} />
            <BoolField label={t.requireDigit} checked={policy.password.requireDigit} onChange={(v) => patch('password', { requireDigit: v })} />
            <BoolField label={t.requireSymbol} checked={policy.password.requireSymbol} onChange={(v) => patch('password', { requireSymbol: v })} />
            <BoolField label={t.blockCommon} checked={policy.password.blockCommon} onChange={(v) => patch('password', { blockCommon: v })} />
            <BoolField label={t.blockUsername} checked={policy.password.blockUsername} onChange={(v) => patch('password', { blockUsername: v })} />
          </div>
          <NumField label={t.expiryDays} value={policy.password.expiryDays} onChange={(v) => patch('password', { expiryDays: num(v) })} />
        </Group>

        <Group title="Lockout">
          <NumField label={t.maxFailures} value={policy.lockout.maxFailures} onChange={(v) => patch('lockout', { maxFailures: num(v) })} />
          <NumField label={t.baseLockoutMinutes} value={policy.lockout.baseLockoutMinutes} onChange={(v) => patch('lockout', { baseLockoutMinutes: num(v) })} />
          <BoolField label={t.exponential} checked={policy.lockout.exponential} onChange={(v) => patch('lockout', { exponential: v })} />
          <NumField label={t.maxLockoutMinutes} value={policy.lockout.maxLockoutMinutes} onChange={(v) => patch('lockout', { maxLockoutMinutes: num(v) })} />
        </Group>

        <Group title="Sessions">
          <NumField label={t.accessTokenMinutes} value={policy.session.accessTokenMinutes} onChange={(v) => patch('session', { accessTokenMinutes: num(v) })} />
          <NumField label={t.refreshTokenDays} value={policy.session.refreshTokenDays} onChange={(v) => patch('session', { refreshTokenDays: num(v) })} />
          <NumField label={t.concurrentSessionLimit} value={policy.session.concurrentSessionLimit} onChange={(v) => patch('session', { concurrentSessionLimit: num(v) })} />
          <BoolField label={t.deviceBinding} checked={policy.session.deviceBinding} onChange={(v) => patch('session', { deviceBinding: v })} />
        </Group>

        <Group title="Two-factor">
          <BoolField label={t.twoFactorRequired} checked={policy.twoFactor.required} onChange={(v) => patch('twoFactor', { required: v })} />
          <div className="space-y-1">
            <p className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-400">{t.allowedRoles}</p>
            {(['system-admin', 'facility-admin', 'admin', 'doctor', 'nurse', 'patient'] as const).map((role) => (
              <label key={role} className="flex items-center gap-2 text-[12px] text-ink-700">
                <input
                  type="checkbox"
                  className="accent-brand-600"
                  checked={policy.twoFactor.allowedRoles.includes(role)}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...policy.twoFactor.allowedRoles, role]
                      : policy.twoFactor.allowedRoles.filter((r) => r !== role)
                    patch('twoFactor', { allowedRoles: next })
                  }}
                />
                {role}
              </label>
            ))}
          </div>
        </Group>

        <Group title="IP allowlist">
          <BoolField label={t.ipAllowlistEnabled} checked={policy.ipAllowlist.enabled} onChange={(v) => patch('ipAllowlist', { enabled: v })} />
          <div>
            <p className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-400">{t.cidrs}</p>
            <input
              className="inp"
              value={policy.ipAllowlist.cidrs.join(', ')}
              onChange={(e) =>
                patch('ipAllowlist', { cidrs: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })
              }
              disabled={!policy.ipAllowlist.enabled}
              placeholder="10.0.0.0/8, 192.168.1.0/24"
            />
          </div>
        </Group>

        <Group title="Rate limits">
          <NumField label={t.globalPerMinute} value={policy.rateLimit.globalPerMinute} onChange={(v) => patch('rateLimit', { globalPerMinute: num(v) })} />
          <NumField label={t.authPerMinute} value={policy.rateLimit.authPerMinute} onChange={(v) => patch('rateLimit', { authPerMinute: num(v) })} />
          <NumField label={t.sensitivePerMinute} value={policy.rateLimit.sensitivePerMinute} onChange={(v) => patch('rateLimit', { sensitivePerMinute: num(v) })} />
          <NumField label={t.uploadPerMinute} value={policy.rateLimit.uploadPerMinute} onChange={(v) => patch('rateLimit', { uploadPerMinute: num(v) })} />
          <NumField label={t.syncPerMinute} value={policy.rateLimit.syncPerMinute} onChange={(v) => patch('rateLimit', { syncPerMinute: num(v) })} />
        </Group>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-[11px] text-ink-400">
          {policy.updatedAt ? `Updated ${new Date(policy.updatedAt).toLocaleString()}${policy.updatedBy ? ` by ${policy.updatedBy}` : ''}` : ''}
        </p>
        <Button onClick={save} disabled={busy}>
          <Save size={14} /> {t.savePolicy}
        </Button>
      </div>
    </div>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-ink-200 p-3 space-y-2.5">
      <p className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-ink-500">{title}</p>
      {children}
    </div>
  )
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: string) => void }) {
  return (
    <div>
      <p className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-400">{label}</p>
      <input className="inp" type="number" min={0} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

function BoolField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-[12px] text-ink-700">
      <input type="checkbox" className="accent-brand-600" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}