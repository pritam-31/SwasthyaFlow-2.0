import { ArrowRight, CalendarClock, ChevronRight, FlaskConical } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Badge, Card, cx, InfoBanner, PageHeader, SourceRef, Stagger, StaggerItem } from '../components/ui'
import { reviewMeta, urgencyOf, urgentMeta } from '../lib/format'
import { useApp } from '../store/AppStore'

export default function FollowupsPage() {
  const { cases, reports } = useApp()
  const navigate = useNavigate()
  const followups = cases.filter((c) => c.mode === 'followup' || c.mode === 'maternal')
  const compareCase = cases.find((c) => c.id === 'case-0006')
  const prev = reports.find((r) => r.id === 'rpt-0003')
  const cur = reports.find((r) => r.id === 'rpt-0004')

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Continuity of care"
        title="Chronic & Follow-up Support"
        subtitle="Compare patient-reported information between visits with neutral language. No automatic medication changes."
      />

      <InfoBanner tone="amber">
        Changes between visits are <strong>highlighted for clinical review</strong> — the system never concludes
        improvement or worsening, and never adjusts medication automatically.
      </InfoBanner>

      <Stagger className="grid gap-3 sm:grid-cols-2">
        {followups.map((c, i) => {
          const urg = urgencyOf(c)
          return (
            <StaggerItem key={c.id}>
            <button
              onClick={() => navigate(`/app/cases/${c.id}`)}
              className="sf-card-hover group flex w-full items-start justify-between gap-3 rounded-2xl border border-ink-200 bg-white p-5 text-left shadow-[var(--shadow-card)] hover:border-brand-300"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2.5">
                  <span
                    className={cx(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-extrabold',
                      i % 2 === 0 ? 'bg-brand-100 text-brand-700' : 'bg-violet-100 text-violet-700',
                    )}
                  >
                    {c.patientId.slice(-3)}
                  </span>
                  <p className="truncate text-sm font-extrabold text-ink-900">{c.patientId}</p>
                  <Badge className="bg-white text-ink-500 ring-ink-200">{c.mode}</Badge>
                </div>
                <p className="mt-2.5 line-clamp-2 text-[13px] leading-relaxed text-ink-600">{c.chiefConcern}</p>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <Badge className={urgentMeta[urg].classes}>
                    <span className={cx('h-1.5 w-1.5 rounded-full', urgentMeta[urg].dot)} />
                    {urgentMeta[urg].label}
                  </Badge>
                  <Badge className={reviewMeta[c.reviewStatus].classes}>{reviewMeta[c.reviewStatus].label}</Badge>
                </div>
              </div>
              <ChevronRight size={16} className="mt-1 shrink-0 text-ink-300 transition-transform group-hover:translate-x-0.5" />
            </button>
            </StaggerItem>
          )
        })}
      </Stagger>

      {compareCase && prev && cur && (
        <Card title="Previous visit vs current visit" subtitle="Patient-reported change since previous visit — neutral language only.">
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <p className="sf-eyebrow">Patient-reported change</p>
              <div className="mt-2.5 space-y-2.5">
                <div className="rounded-xl border border-ink-200 bg-white p-3.5 text-xs leading-relaxed text-ink-700">
                  <p className="flex items-center gap-1.5 font-bold text-ink-800">
                    <CalendarClock size={13} className="text-ink-400" /> Previous visit
                  </p>
                  <p className="mt-1.5">Reported fatigue and thirst. Fasting glucose {prev.fields[0]?.value} mg/dL (previous).</p>
                </div>
                <div className="rounded-xl border border-brand-200 bg-gradient-to-br from-brand-50 to-emerald-50/40 p-3.5 text-xs leading-relaxed text-ink-700">
                  <p className="flex items-center gap-1.5 font-bold text-brand-800">
                    <span className="h-2 w-2 rounded-full bg-brand-500" /> Current visit
                  </p>
                  <p className="mt-1.5">
                    Dizziness reported. Fasting glucose {cur.fields[0]?.value} mg/dL. Patient-reported change since
                    previous visit highlighted for review.
                  </p>
                </div>
              </div>
              <p className="mt-3 rounded-xl bg-amber-50/70 px-3 py-2.5 text-[11px] leading-relaxed text-amber-900 ring-1 ring-inset ring-amber-200">
                The system does not automatically adjust medication or conclude improvement/worsening.
              </p>
            </div>
            <div>
              <p className="sf-eyebrow">Parameter-level comparison</p>
              <div className="mt-2.5 overflow-hidden rounded-xl border border-ink-200">
                <table className="sf-table w-full !text-xs">
                  <thead>
                    <tr>
                      <th>Parameter</th>
                      <th>Previous</th>
                      <th />
                      <th>Current</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prev.fields.map((f, i) => (
                      <tr key={f.param}>
                        <td className="font-bold text-ink-800">{f.param}</td>
                        <td>
                          {f.value} {f.unit}
                        </td>
                        <td>
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                            <ArrowRight size={10} />
                          </span>
                        </td>
                        <td>
                          {cur.fields[i]?.value} {cur.fields[i]?.unit}
                          <span className="ml-1.5 rounded bg-ink-50 px-1.5 py-0.5 text-[9px] font-semibold text-ink-400">
                            {f.value} → {cur.fields[i]?.value}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <CalendarClock size={13} className="text-ink-400" />
                <SourceRef label="Previous: BloodSugar_Prev.pdf" />
                <SourceRef label="Current: BloodSugar_Current.pdf" />
              </div>
            </div>
          </div>
        </Card>
      )}

      <Card title="Maternal follow-up (configurable workflow)" subtitle="Configured urgency signals escalate to qualified healthcare staff. No diagnosis or treatment advice.">
        <div className="flex items-start gap-3 rounded-xl bg-brand-50/50 p-4 text-sm leading-relaxed text-ink-600 ring-1 ring-inset ring-brand-100">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
            <FlaskConical size={16} />
          </span>
          <p>
            Maternal follow-ups track scheduled visits, patient-provided symptoms, previous visit information,
            uploaded reports and missing information. Any configured urgency signal (e.g. reported foot swelling +
            headache) is escalated to qualified staff — see case <strong className="text-ink-800">SYN-2026-007</strong>.
          </p>
        </div>
      </Card>
    </div>
  )
}
