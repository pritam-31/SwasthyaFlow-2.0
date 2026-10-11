import { CheckCircle2, HandHeart, HeartPulse, Languages, MapPin, ShieldCheck, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Button, Card, cx, InfoBanner, KpiTile, Modal, PageHeader, ProgressBar } from '../components/ui'
import { CAMPS, useApp } from '../store/AppStore'

const CAMP_CHIPS = ['Fever', 'Headache', 'Cough', 'Weakness', 'Body ache', 'Skin rash', 'Eye irritation', 'None / checkup']

export default function HealthCamps() {
  const { cases, addCase, pushToast } = useApp()
  const navigate = useNavigate()
  const [screen, setScreen] = useState(false)
  const [lang, setLang] = useState<'English' | 'Hindi' | 'Odia'>('Odia')
  const [chips, setChips] = useState<string[]>([])
  const [consent, setConsent] = useState(false)

  const campCases = cases.filter((c) => c.mode === 'camp')
  const campTotals = useMemo(
    () => ({
      screened: CAMP_SUMMARY.screened + (campCases.length > 0 ? campCases.length : 0),
      pending: CAMP_SUMMARY.pending + campCases.filter((c) => c.reviewStatus === 'awaiting-nurse').length,
      reviewed: CAMP_SUMMARY.reviewed + campCases.filter((c) => c.reviewStatus === 'reviewed' || c.reviewStatus === 'closed').length,
    }),
    [campCases],
  )

  const submitScreening = () => {
    const symptomNames = chips.length ? chips : ['Checkup']
    const c = addCase({
      language: lang,
      mode: 'camp',
      chiefConcern: symptomNames.join(', ') + ' — camp screening',
      symptoms: symptomNames.map((name) => ({
        id: `s-${Math.random().toString(36).slice(2, 7)}`,
        name,
        duration: 'Unknown',
        source: 'Camp structured questionnaire',
        status: 'ai-extracted',
      })),
      timeline: [{ id: `t-${Math.random().toString(36).slice(2, 7)}`, dayLabel: 'Day 0', text: 'Screened at public health camp.', source: 'Camp questionnaire' }],
      missingInfo: ['Severity', 'Relevant history'],
      completeness: 60,
      followUpQuestions: [{ id: `q-${Math.random().toString(36).slice(2, 7)}`, question: 'How long has each symptom lasted?', status: 'suggested' }],
      consent: { status: 'granted', purpose: ['Symptom organisation', 'Healthcare-worker review'] },
      reporter: 'Camp health worker',
    })
    setScreen(false)
    setChips([])
    setConsent(false)
    pushToast('success', `Screening recorded for ${c.patientId} — awaiting health-worker review.`)
    window.setTimeout(() => navigate(`/app/cases/${c.id}`), 700)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Community outreach"
        title="Public Health Camp Mode"
        subtitle="Rapid low-literacy screening workflow for health camps and campsite clinics (synthetic data)."
      />

      <InfoBanner tone="brand">
        <strong>Screening summary:</strong> {campTotals.screened} screened · {campTotals.pending} pending review ·{' '}
        {campTotals.reviewed} reviewed · {CAMP_SUMMARY.referred} referred. Screening is not a diagnosis.
      </InfoBanner>

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiTile label="Total screened" value={campTotals.screened} tone="brand" icon={<Users size={20} />} hint="across camps" />
        <KpiTile label="Pending review" value={campTotals.pending} tone="amber" icon={<HeartPulse size={20} />} hint="awaiting staff" />
        <KpiTile label="Reviewed" value={campTotals.reviewed} tone="emerald" icon={<CheckCircle2 size={20} />} hint="human approved" />
      </div>

      <div className="sf-hero flex flex-wrap items-center justify-between gap-4 rounded-2xl p-6">
        <div className="flex items-center gap-4">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 text-white ring-1 ring-inset ring-white/25 backdrop-blur">
            <HandHeart size={22} />
          </span>
          <div>
            <p className="text-lg font-extrabold tracking-tight text-white">Start a rapid camp screening</p>
            <p className="mt-0.5 text-xs text-brand-100/90">
              Three taps: language → symptoms → consent. Large buttons for low-literacy users.
            </p>
          </div>
        </div>
        <button
          onClick={() => setScreen(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-[13px] font-bold text-brand-800 shadow-lg transition-all hover:bg-brand-50 active:scale-[0.98]"
        >
          <HeartPulse size={16} /> Start Screening
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {CAMPS.map((camp, i) => (
          <Card key={camp.id} className="sf-card-hover hover:border-brand-300">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <span
                  className={cx(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold',
                    i % 3 === 0
                      ? 'bg-brand-100 text-brand-700'
                      : i % 3 === 1
                        ? 'bg-sky-100 text-sky-700'
                        : 'bg-violet-100 text-violet-700',
                  )}
                >
                  {camp.campName.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-extrabold text-ink-900">{camp.campName}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-500">
                    <MapPin size={12} className="text-brand-600" /> {camp.location}
                  </p>
                  <p className="text-[11px] text-ink-400">{camp.date} · Language: {camp.language}</p>
                </div>
              </div>
              <Badge className="bg-white text-brand-700 ring-brand-200">{camp.screened} screened</Badge>
            </div>
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between text-[11px] font-semibold text-ink-500">
                <span>Reviewed progress</span>
                <span className="text-ink-700">{camp.reviewed}/{camp.screened}</span>
              </div>
              <ProgressBar value={(camp.reviewed / camp.screened) * 100} />
              <div className="flex items-center gap-4 pt-1 text-[11px] font-medium text-ink-500">
                <span className="inline-flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                  Pending: <strong className="text-ink-700">{camp.pendingReview}</strong>
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                  Referred: <strong className="text-ink-700">{camp.referred}</strong>
                </span>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Modal open={screen} onClose={() => setScreen(false)} title="Rapid camp screening">
        <div className="space-y-4">
          <div>
            <p className="mb-2 sf-eyebrow">Language</p>
            <div className="flex gap-1.5">
              {(['English', 'Hindi', 'Odia'] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className={cx(
                    'inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-bold transition-all',
                    lang === l
                      ? 'bg-gradient-to-b from-brand-600 to-brand-700 text-white shadow-sm ring-1 ring-inset ring-brand-700'
                      : 'bg-ink-100 text-ink-600 hover:bg-ink-200',
                  )}
                >
                  <Languages size={13} /> {l}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 sf-eyebrow">Symptoms reported</p>
            <div className="grid grid-cols-2 gap-1.5">
              {CAMP_CHIPS.map((chip) => (
                <button
                  key={chip}
                  onClick={() => setChips((p) => (p.includes(chip) ? p.filter((c) => c !== chip) : [...p, chip]))}
                  className={cx(
                    'rounded-xl px-3 py-3 text-center text-sm font-bold transition-all',
                    chips.includes(chip)
                      ? 'bg-gradient-to-b from-brand-600 to-brand-700 text-white shadow-sm ring-1 ring-inset ring-brand-700'
                      : 'bg-ink-100 text-ink-600 hover:bg-ink-200',
                  )}
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-ink-200 bg-ink-50/60 px-3 py-3 text-xs font-medium text-ink-700">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="h-4 w-4 accent-brand-700" />
            <ShieldCheck size={14} className="text-brand-600" />
            Consent to screen and record this synthetic sample information.
          </label>
          <Button className="w-full" disabled={!consent} onClick={submitScreening}>
            <CheckCircle2 size={15} /> Submit screening
          </Button>
        </div>
      </Modal>
    </div>
  )
}

const CAMP_SUMMARY = { screened: 302, pending: 14, reviewed: 283, referred: 6 }
