import { KeyRound, QrCode, ShieldCheck, ShieldX } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '../ui'
import { useAuth } from '../../context/AuthContext'
import { useApp } from '../../store/AppStore'
import { SECURITY_SECTION_LABELS } from '../../services/safetyPolicy'
import type { TwoFactorEnrollment } from '../../types/security.types'
import * as securityApi from '../../services/securityApi'

type Lang = 'en' | 'hi' | 'or'

/** Personal TOTP enrollment — works for every signed-in account. */
export function TwoFactorSetup({ lang = 'en' }: { lang?: Lang }) {
  const t = SECURITY_SECTION_LABELS[lang]
  const { user, refreshUser } = useAuth()
  const { pushToast } = useApp()
  const [step, setStep] = useState<'idle' | 'setup' | 'disable'>('idle')
  const [enrollment, setEnrollment] = useState<TwoFactorEnrollment | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  if (!user) return null
  const enabled = user.twoFactorEnabled === true

  const beginSetup = async () => {
    setBusy(true)
    try {
      const enr = await securityApi.startTwoFactorSetup()
      setEnrollment(enr)
      setStep('setup')
      setCode('')
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Could not start 2FA setup.')
    } finally {
      setBusy(false)
    }
  }

  const confirmEnable = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await securityApi.enableTwoFactor(code.trim())
      pushToast('success', t.twoFactorEnabled)
      setStep('idle')
      setEnrollment(null)
      setCode('')
      await refreshUser()
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'The code was not accepted.')
    } finally {
      setBusy(false)
    }
  }

  const confirmDisable = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await securityApi.disableTwoFactor(code.trim())
      pushToast('success', t.twoFactorDisabled)
      setStep('idle')
      setCode('')
      await refreshUser()
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'The code was not accepted.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {enabled ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-extrabold text-emerald-700 ring-1 ring-inset ring-emerald-200">
            <ShieldCheck size={12} /> {t.twoFactorEnabled}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-100 px-2.5 py-1 text-[11px] font-extrabold text-ink-500 ring-1 ring-inset ring-ink-200">
            <ShieldX size={12} /> 2FA off
          </span>
        )}
      </div>

      {step === 'idle' && (
        <Button variant={enabled ? 'secondary' : 'primary'} onClick={enabled ? () => setStep('disable') : beginSetup} disabled={busy}>
          <KeyRound size={14} /> {enabled ? t.disable : t.enable}
        </Button>
      )}

      {step === 'setup' && enrollment && (
        <div className="space-y-3 rounded-xl border border-ink-200 p-3">
          <p className="text-[12px] font-semibold text-ink-700">{t.setupTitle}</p>
          <p className="text-[11px] text-ink-500">{t.scanQr}</p>
          <div className="flex flex-wrap items-start gap-3">
            {enrollment.qrDataUrl && (
              <img src={enrollment.qrDataUrl} alt="TOTP QR" className="h-40 w-40 rounded-lg bg-white p-1 ring-1 ring-ink-200" />
            )}
            <div className="min-w-0 flex-1">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-ink-400">Secret</p>
              <code className="block break-all rounded-lg bg-ink-50 px-2.5 py-2 font-mono text-[12px] text-ink-700">
                {enrollment.secret}
              </code>
            </div>
          </div>
          <form onSubmit={confirmEnable} className="space-y-2">
            <input
              className="inp"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t.codePlaceholder}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
            />
            <Button type="submit" disabled={busy} size="sm">
              <QrCode size={13} /> {t.verifyAndEnable}
            </Button>
          </form>
        </div>
      )}

      {step === 'disable' && (
        <form onSubmit={confirmDisable} className="space-y-2 rounded-xl border border-ink-200 p-3">
          <p className="text-[12px] font-semibold text-ink-700">{t.disable}</p>
          <input
            className="inp"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={t.enterCode}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
          />
          <Button type="submit" variant="danger" disabled={busy} size="sm">
            {t.disable}
          </Button>
        </form>
      )}
    </div>
  )
}