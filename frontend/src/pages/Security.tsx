import { Languages, LockKeyhole, ShieldCheck } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Badge, Button, Card, PageHeader } from '../components/ui'
import { PasswordStrengthMeter } from '../components/security/PasswordStrengthMeter'
import { TwoFactorSetup } from '../components/security/TwoFactorSetup'
import { SessionList } from '../components/security/SessionList'
import { DeviceList } from '../components/security/DeviceList'
import { SecurityPolicyForm } from '../components/security/SecurityPolicyForm'
import { SecurityEventsTable } from '../components/security/SecurityEventsTable'
import { IpBlocklistTable } from '../components/security/IpBlocklistTable'
import { LockoutTable } from '../components/security/LockoutTable'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../store/AppStore'
import { SECURITY_SECTION_LABELS } from '../services/safetyPolicy'
import { permissionsFor } from '../services/rbacService'
import { defaultPasswordPolicy } from '../types/security.types'
import * as securityApi from '../services/securityApi'

type Lang = 'en' | 'hi' | 'or'

const LANG_KEY = 'swasthyaflow.security.lang'

function readLang(): Lang {
  const saved = typeof localStorage === 'undefined' ? null : localStorage.getItem(LANG_KEY)
  return saved === 'hi' || saved === 'or' ? saved : 'en'
}

/**
 * Security console (P1-12). Personal security is available to every signed-in
 * account (patients included); the policy / events / lockouts / blocklist
 * panels are administrators only. The backend enforces every gate again.
 */
export default function SecurityPage() {
  const { user } = useAuth()
  const { pushToast } = useApp()
  const [lang, setLang] = useState<Lang>(readLang)
  const t = SECURITY_SECTION_LABELS[lang]

  if (!user) return null
  const perms = permissionsFor(user.role)
  const admin = perms.canViewSecurityAdmin

  const switchLang = (next: Lang) => {
    setLang(next)
    if (typeof localStorage !== 'undefined') localStorage.setItem(LANG_KEY, next)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="P1-12 · Security hardening"
        title={t.title}
        subtitle={t.subtitle}
        icon={<ShieldCheck size={18} />}
        action={
          <div className="flex items-center gap-2">
            {admin && (
              <Badge className="bg-lime-50 text-lime-700 ring-lime-200" icon={<ShieldCheck size={12} />}>
                {t.adminOnly}
              </Badge>
            )}
            <div className="flex gap-1 rounded-xl bg-ink-100/80 p-1">
              {(['en', 'hi', 'or'] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => switchLang(l)}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-bold uppercase transition-colors ${
                    lang === l ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-800'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
            <Languages size={14} className="text-ink-400" />
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title={t.passwordTitle} subtitle={t.passwordChange}>
          <ChangePasswordPanel t={t} username={user.username} pushError={(m) => pushToast('error', m)} pushSuccess={() => pushToast('success', t.passwordUpdated)} />
        </Card>

        <Card title={t.twoFactorTitle} subtitle={t.twoFactorSubtitle}>
          <TwoFactorSetup lang={lang} />
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title={t.sessionsTitle} subtitle={t.sessionsSubtitle}>
          <SessionList lang={lang} />
        </Card>
        <Card title={t.devicesTitle} subtitle={t.devicesSubtitle}>
          <DeviceList lang={lang} />
        </Card>
      </div>

      {admin && (
        <>
          <Card title={t.policyTitle} subtitle={t.policySubtitle}>
            <SecurityPolicyForm lang={lang} />
          </Card>
          <Card title={t.eventsTitle} subtitle={t.eventsSubtitle}>
            <SecurityEventsTable lang={lang} />
          </Card>
          <div className="grid gap-5 lg:grid-cols-2">
            <Card title={t.lockoutsTitle} subtitle={t.lockoutsSubtitle}>
              <LockoutTable lang={lang} />
            </Card>
            <Card title={t.blocklistTitle} subtitle={t.blocklistSubtitle}>
              <IpBlocklistTable lang={lang} />
            </Card>
          </div>
        </>
      )}

      <div className="flex items-center gap-2 text-[11px] text-ink-400">
        <LockKeyhole size={13} />
        {t.passwordRulesHint}
      </div>
    </div>
  )
}

function ChangePasswordPanel({
  t,
  username,
  pushError,
  pushSuccess,
}: {
  t: (typeof SECURITY_SECTION_LABELS)[Lang]
  username: string
  pushError: (m: string) => void
  pushSuccess: () => void
}) {
  const [current, setCurrent] = useState('')
  const [nextPw, setNextPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const policy = defaultPasswordPolicy()

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (nextPw !== confirm) {
      pushError(t.passwordsDontMatch)
      return
    }
    setBusy(true)
    try {
      await securityApi.changePassword(current, nextPw)
      pushSuccess()
      setCurrent('')
      setNextPw('')
      setConfirm('')
    } catch (err) {
      pushError(err instanceof Error ? err.message : 'Could not change the password.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-400">{t.currentPassword}</label>
        <input className="inp" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-400">{t.newPassword}</label>
        <input className="inp" type="password" value={nextPw} onChange={(e) => setNextPw(e.target.value)} autoComplete="new-password" required />
        <PasswordStrengthMeter password={nextPw} username={username} policy={policy} />
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-400">{t.confirmPassword}</label>
        <input className="inp" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
      </div>
      <Button type="submit" disabled={busy}>
        <LockKeyhole size={14} /> {t.updatePassword}
      </Button>
    </form>
  )
}