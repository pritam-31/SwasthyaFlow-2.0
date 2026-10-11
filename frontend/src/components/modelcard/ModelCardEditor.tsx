import { useState, type FormEvent } from 'react'
import { Button, cx, Modal } from '../ui'
import { MODEL_CARD_SECTION_LABELS } from '../../services/safetyPolicy'
import { useApp } from '../../store/AppStore'
import { updateModelCard } from '../../services/modelCardApi'
import { LANGUAGE_NATIVE_LABEL, type LanguageCode } from '../../types/language.types'
import { MODEL_CARD_STATUSES, type ModelCard, type ModelCardStatus } from '../../types/modelcard.types'

type Lang = 'en' | 'hi' | 'or'

interface Draft {
  name: string
  summary: string
  description: string
  intendedUse: string
  outOfScopeUse: string
  intendedUsers: string
  risks: string
  status: ModelCardStatus
  dataDescription: string
  dataVolume: string
  syntheticOnly: boolean
  languages: LanguageCode[]
  modalities: string
  newVersion: string
  changelogEntry: string
}

function toDraft(card: ModelCard): Draft {
  return {
    name: card.name,
    summary: card.summary,
    description: card.description,
    intendedUse: card.intendedUse,
    outOfScopeUse: card.outOfScopeUse,
    intendedUsers: card.intendedUsers.join('\n'),
    risks: card.risksAndLimitations.join('\n'),
    status: card.status,
    dataDescription: card.trainingData.description,
    dataVolume: card.trainingData.volume,
    syntheticOnly: card.trainingData.syntheticOnly,
    languages: [...card.trainingData.languages],
    modalities: card.trainingData.modalities.join(', '),
    newVersion: '',
    changelogEntry: '',
  }
}

/**
 * Version-gated editor for one model card. The backend rejects an update that
 * does not bump the version or omits a changelog entry, does not pass the
 * non-diagnostic guard, or comes from a non-admin session — those errors are
 * surfaced verbatim in the toast.
 */
export function ModelCardEditor({
  card,
  open,
  onClose,
  onSaved,
  lang = 'en',
}: {
  card: ModelCard
  open: boolean
  onClose: () => void
  onSaved: (updated: ModelCard) => void
  lang?: Lang
}) {
  const t = MODEL_CARD_SECTION_LABELS[lang]
  const { pushToast } = useApp()
  const [draft, setDraft] = useState<Draft>(() => toDraft(card))
  const [busy, setBusy] = useState(false)

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }))

  const toggleLanguage = (code: LanguageCode) =>
    setDraft((d) => ({
      ...d,
      languages: d.languages.includes(code) ? d.languages.filter((c) => c !== code) : [...d.languages, code],
    }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (!draft.newVersion.trim() || !draft.changelogEntry.trim()) {
      pushToast('error', t.updateFailed)
      return
    }
    setBusy(true)
    try {
      const updated = await updateModelCard(card.cardId, {
        newVersion: draft.newVersion.trim(),
        changelogEntry: draft.changelogEntry.trim(),
        name: draft.name.trim(),
        summary: draft.summary.trim(),
        description: draft.description.trim(),
        intendedUse: draft.intendedUse.trim(),
        outOfScopeUse: draft.outOfScopeUse.trim(),
        intendedUsers: draft.intendedUsers.split('\n').map((s) => s.trim()).filter(Boolean),
        risksAndLimitations: draft.risks.split('\n').map((s) => s.trim()).filter(Boolean),
        status: draft.status,
        trainingData: {
          description: draft.dataDescription.trim(),
          volume: draft.dataVolume.trim(),
          syntheticOnly: draft.syntheticOnly,
          languages: draft.languages,
          modalities: draft.modalities.split(',').map((s) => s.trim()).filter(Boolean),
        },
      })
      pushToast('success', t.saved)
      onSaved(updated)
      onClose()
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : t.updateFailed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`${t.editingTitle} · ${card.name}`} wide>
      <form onSubmit={submit} className="space-y-4">
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800 ring-1 ring-inset ring-amber-200">
          {t.readOnly} {t.newVersionHint}
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t.newVersion}>
            <input
              value={draft.newVersion}
              onChange={(e) => set('newVersion', e.target.value)}
              placeholder="1.1.0"
              className="inp font-mono"
              required
            />
          </Field>
          <Field label={t.statusLabel}>
            <select value={draft.status} onChange={(e) => set('status', e.target.value as ModelCardStatus)} className="inp">
              {MODEL_CARD_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s === 'active' ? t.active : s === 'deprecated' ? t.deprecated : t.retired}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label={t.changelogLabel}>
          <textarea
            value={draft.changelogEntry}
            onChange={(e) => set('changelogEntry', e.target.value)}
            placeholder={t.changelogPlaceholder}
            className="inp min-h-[64px]"
            required
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t.name}>
            <input value={draft.name} onChange={(e) => set('name', e.target.value)} className="inp" required />
          </Field>
          <Field label={t.summary}>
            <input value={draft.summary} onChange={(e) => set('summary', e.target.value)} className="inp" required />
          </Field>
        </div>

        <Field label={t.description}>
          <textarea value={draft.description} onChange={(e) => set('description', e.target.value)} className="inp min-h-[72px]" required />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t.intendedUse}>
            <textarea value={draft.intendedUse} onChange={(e) => set('intendedUse', e.target.value)} className="inp min-h-[72px]" required />
          </Field>
          <Field label={t.outOfScope}>
            <textarea value={draft.outOfScopeUse} onChange={(e) => set('outOfScopeUse', e.target.value)} className="inp min-h-[72px]" required />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t.intendedUsers}>
            <textarea value={draft.intendedUsers} onChange={(e) => set('intendedUsers', e.target.value)} className="inp min-h-[72px]" required />
          </Field>
          <Field label={t.risks}>
            <textarea value={draft.risks} onChange={(e) => set('risks', e.target.value)} className="inp min-h-[72px]" required />
          </Field>
        </div>

        <fieldset className="space-y-3 rounded-xl border border-ink-200 p-3.5">
          <legend className="px-1 text-[11px] font-bold uppercase tracking-wide text-ink-400">{t.trainingData}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t.summary}>
              <input value={draft.dataDescription} onChange={(e) => set('dataDescription', e.target.value)} className="inp" required />
            </Field>
            <Field label={t.volume}>
              <input value={draft.dataVolume} onChange={(e) => set('dataVolume', e.target.value)} className="inp" required />
            </Field>
          </div>
          <Field label={t.languages}>
            <div className="flex flex-wrap gap-3">
              {(['en', 'hi', 'or'] as const).map((code) => (
                <label key={code} className="flex items-center gap-1.5 text-[12px] font-medium text-ink-600">
                  <input
                    type="checkbox"
                    checked={draft.languages.includes(code)}
                    onChange={() => toggleLanguage(code)}
                    className="h-3.5 w-3.5 rounded border-ink-300"
                  />
                  {LANGUAGE_NATIVE_LABEL[code]}
                </label>
              ))}
            </div>
          </Field>
          <Field label={t.modalities}>
            <input value={draft.modalities} onChange={(e) => set('modalities', e.target.value)} className="inp" />
          </Field>
          <label className="flex items-center gap-1.5 text-[12px] font-medium text-ink-600">
            <input
              type="checkbox"
              checked={draft.syntheticOnly}
              onChange={(e) => set('syntheticOnly', e.target.checked)}
              className="h-3.5 w-3.5 rounded border-ink-300"
            />
            {t.syntheticOnly}
          </label>
        </fieldset>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t.cancel}
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? t.loading : t.save}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className={cx('block')}>
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-400">{label}</span>
      {children}
    </label>
  )
}
