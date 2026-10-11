import type { GridColDef } from '@mui/x-data-grid-pro'
import { BookOpen, FlaskConical, Languages, Save, ScrollText, Scale, ShieldCheck, Timer } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AppDataGrid } from '../components/AppDataGrid'
import { Button, Card, cx, PageHeader } from '../components/ui'
import RetentionAdminSection from '../components/retention/RetentionAdminSection'
import { SlaConfigEditor } from '../components/queue/SlaConfigEditor'
import AnonymisationAdminSection from '../components/anonymisation/AnonymisationAdminSection'
import ConfidencePolicyForm from '../components/confidence/ConfidencePolicyForm'
import { DEFAULT_SETTINGS, useApp } from '../store/AppStore'

interface RbacRow {
  id: string
  capability: string
  patient: boolean
  nurse: boolean
  doctor: boolean
  admin: boolean
}

export default function SettingsPage() {
  const { pushToast, offlineMode, setOfflineMode } = useApp()
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" subtitle="Facility configuration, retention policy, rules-engine keywords and AI provider — administrator only." />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Facility" subtitle="Basic facility settings">
          <div className="space-y-3">
            <Field label="Facility name">
              <input value={settings.facilityName} onChange={(e) => setSettings({ ...settings, facilityName: e.target.value })} className="inp" />
            </Field>
            <Field label="Facility type">
              <select value={settings.facilityType} onChange={(e) => setSettings({ ...settings, facilityType: e.target.value })} className="inp">
                <option>Primary Health Centre</option>
                <option>Community Health Centre</option>
                <option>District Hospital</option>
                <option>Industrial / Occupational Clinic</option>
                <option>Campus Health Centre</option>
              </select>
            </Field>
            <Field label="State">
              <input value={settings.state} onChange={(e) => setSettings({ ...settings, state: e.target.value })} className="inp" />
            </Field>
            <Field label="Supported languages" hint="Architected so more Indian languages can be added later.">
              <div className="flex flex-wrap gap-1.5">
                {settings.languages.map((l) => (
                  <span key={l} className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-800 ring-1 ring-inset ring-brand-200">
                    <Languages size={12} /> {l}
                  </span>
                ))}
              </div>
            </Field>
          </div>
        </Card>

        <Card title="Rules engine" subtitle="Transparent, inspectable, configurable urgency keywords">
          <p className="text-xs text-ink-500">Configured keyword groups evaluated against explicitly reported information:</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {settings.urgencyKeywords.map((k) => (
              <span key={k} className="rounded-full bg-ink-100 px-2.5 py-1 font-mono text-[11px] text-ink-600">{k}</span>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-ink-500">
            <ShieldCheck size={14} className="text-brand-600" />
            Rules produce workflow labels only — never medical decisions.
          </div>
          <div className="mt-4 rounded-lg bg-ink-50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">AI provider abstraction</p>
            <p className="mt-1 text-sm font-medium text-ink-700">{settings.aiProvider}</p>
            <p className="mt-1 text-[11px] text-ink-500">
              AIProvider → GeminiProvider / OpenAIProvider / LocalProvider / MockProvider. The demo runs on
              MockProvider so no external API is required.
            </p>
          </div>
        </Card>

        <Card title="Data retention (simulated)" subtitle="Configurable retention — uploaded files and temporary data deleted per policy">
          <div className="flex items-center gap-3">
            <Timer size={18} className="text-brand-600" />
            <div className="flex-1">
              <p className="text-xs font-medium text-ink-600">Retention window</p>
              <select
                value={settings.retentionHours}
                onChange={(e) => setSettings({ ...settings, retentionHours: Number(e.target.value) })}
                className="inp mt-1"
              >
                <option value={12}>12 hours</option>
                <option value={24}>24 hours</option>
                <option value={72}>72 hours</option>
                <option value={168}>7 days</option>
              </select>
            </div>
          </div>
          <div className="mt-3 space-y-1.5 rounded-lg border border-ink-200 p-3 text-[11px] text-ink-500">
            <p className="flex items-center justify-between"><span>Case created</span><strong className="text-ink-800">10 Sep</strong></p>
            <p className="flex items-center justify-between"><span>Retention</span><strong className="text-ink-800">{settings.retentionHours} hours</strong></p>
            <p className="flex items-center justify-between"><span>Status</span><strong className="text-amber-700">Scheduled for deletion</strong></p>
          </div>
          <p className="mt-2 text-[11px] text-ink-400">
            Demonstration only — uploaded files and temporary information are deleted according to the configured
            retention policy.
          </p>
        </Card>

        <Card title="Connectivity" subtitle="Offline-first capability (simulated for the prototype)">
          <div className="flex items-center justify-between rounded-lg border border-ink-200 p-3">
            <div>
              <p className="text-sm font-semibold text-ink-800">{offlineMode ? 'Offline mode active' : 'Connected'}</p>
              <p className="text-xs text-ink-500">
                {offlineMode ? 'Cloud AI features unavailable · data pending synchronization' : 'AI service: MockProvider (demo)'}
              </p>
            </div>
            <Button variant={offlineMode ? 'primary' : 'secondary'} onClick={() => setOfflineMode(!offlineMode)}>
              {offlineMode ? 'Go online' : 'Simulate offline mode'}
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-ink-400">
            Offline mode supports registration, local case creation, basic questionnaire and consent capture into a
            local temporary queue. On return of connectivity, pending cases sync.
          </p>
        </Card>
      </div>

      <SlaConfigEditor />

      <Card title="Model governance" subtitle="Model cards, the failure-mode catalogue and the bias-evaluation console">
        <div className="flex flex-wrap gap-2">
          <Link
            to="/app/model-card"
            className="inline-flex items-center gap-2 rounded-xl bg-white px-3.5 py-2 text-sm font-semibold text-ink-700 ring-1 ring-inset ring-ink-200 hover:bg-ink-50"
          >
            <BookOpen size={15} /> Model cards
          </Link>
          <Link
            to="/app/bias"
            className="inline-flex items-center gap-2 rounded-xl bg-white px-3.5 py-2 text-sm font-semibold text-ink-700 ring-1 ring-inset ring-ink-200 hover:bg-ink-50"
          >
            <Scale size={15} /> Bias evaluation
          </Link>
        </div>
        <p className="mt-2 text-[11px] text-ink-400">
          Cards document each AI / rule layer and are non-diagnostic by design. The bias console is restricted to system
          administrators.
        </p>
      </Card>

      <Card title="Audit trail & integrity" subtitle="Tamper-evident, per-facility hash chain with retention-aware export">
        <div className="flex flex-wrap gap-2">
          <Link
            to="/app/audit"
            className="inline-flex items-center gap-2 rounded-xl bg-white px-3.5 py-2 text-sm font-semibold text-ink-700 ring-1 ring-inset ring-ink-200 hover:bg-ink-50"
          >
            <ScrollText size={15} /> Audit logs & chain
          </Link>
        </div>
        <p className="mt-2 text-[11px] text-ink-400">
          Every action is hashed into a per-facility chain and can be verified or exported (CSV / JSON / PDF). Pruned
          entries leave a verifiable tombstone. Exports are anonymised and non-diagnostic.
        </p>
      </Card>

      <RetentionAdminSection />

      <AnonymisationAdminSection />

      <ConfidencePolicyForm />

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => pushToast('info', 'Settings reset to defaults (demo).')}>
          Reset
        </Button>
        <Button onClick={() => pushToast('success', 'Facility settings saved (demo).')}>
          <Save size={15} /> Save settings
        </Button>
      </div>

      <Card title="Role-based access control" subtitle="Static reference for the demo — a patient must never access another patient's case.">
        <AppDataGrid<RbacRow>
          rows={[
            ['Submit intake & consent', true, true, true, true],
            ['View triage queue', false, true, true, true],
            ['Verify / edit AI fields', false, true, true, false],
            ['Escalate to doctor', false, true, true, false],
            ['Approve referral', false, false, true, false],
            ['Read audit logs', false, false, false, true],
            ['Configure facility', false, false, false, true],
            ['View other patients', false, false, false, false],
          ].map(([capability, patient, nurse, doctor, admin]) => ({
            id: capability as string,
            capability: capability as string,
            patient: patient as boolean,
            nurse: nurse as boolean,
            doctor: doctor as boolean,
            admin: admin as boolean,
          }))}
          ariaLabel="Role-based access control"
          getRowId={(r) => r.id}
          hideToolbar
          hideFooter
          defaultDensity="compact"
          columns={[
            {
              field: 'capability',
              headerName: 'Capability',
              flex: 1.4,
              minWidth: 200,
              renderCell: (p) => <span className="font-semibold text-ink-700">{p.row.capability}</span>,
            },
            ...(['patient', 'nurse', 'doctor', 'admin'] as const).map<GridColDef<RbacRow>>((field) => ({
              field,
              headerName: { patient: 'Patient', nurse: 'Nurse / Worker', doctor: 'Doctor / MO', admin: 'Admin' }[field],
              flex: 1,
              minWidth: 110,
              renderCell: (p) => (
                <span
                  className={cx(
                    'inline-flex h-6 w-6 items-center justify-center rounded-lg text-[11px] font-extrabold',
                    p.row[field]
                      ? 'bg-emerald-100 text-emerald-700 ring-1 ring-inset ring-emerald-200'
                      : 'bg-ink-100 text-ink-400 ring-1 ring-inset ring-ink-200',
                  )}
                >
                  {p.row[field] ? '✓' : '✕'}
                </span>
              ),
            })),
          ]}
        />
      </Card>

      <div className="flex items-center gap-2 text-[11px] text-ink-400">
        <FlaskConical size={13} />
        A patient must never access another patient's case. Referral approval requires authorized staff.
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-400">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-ink-400">{hint}</p>}
    </div>
  )
}
