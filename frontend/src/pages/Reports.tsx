import { ArrowRight, FileText, Image as ImageIcon, ScanSearch, ShieldCheck, Upload } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Badge, Card, cx, InfoBanner, KpiTile, PageHeader, ProgressBar } from '../components/ui'
import { useApp } from '../store/AppStore'

export default function ReportsPage() {
  const { reports, cases } = useApp()
  const navigate = useNavigate()
  const ocrDone = reports.filter((r) => r.ocrStatus === 'done').length
  const ocrFailed = reports.filter((r) => r.ocrStatus !== 'done').length
  const verified = reports.reduce((acc, r) => acc + r.fields.filter((f) => f.status === 'verified').length, 0)

  const compareCase = cases.find((c) => c.id === 'case-0006')
  const compareReports = reports.filter((r) => r.id === 'rpt-0003' || r.id === 'rpt-0004')

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Investigations"
        title="Reports"
        subtitle="Every OCR value is source-backed and marked “needs verification” until a human checks it."
        action={
          <button
            onClick={() => navigate('/app/intake')}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-b from-brand-600 to-brand-700 px-3.5 py-2 text-xs font-bold text-white shadow-sm shadow-brand-900/20 ring-1 ring-inset ring-brand-700 transition-all hover:from-brand-700 hover:to-brand-800 active:scale-[0.98]"
          >
            <Upload size={15} /> Upload a report
          </button>
        }
      />

      <InfoBanner tone="sky">
        Lab values are surfaced as <strong>neutral changes</strong> with the reference range — never as a diagnosis.
        Clinical interpretation belongs to qualified staff.
      </InfoBanner>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile label="Total reports" value={reports.length} tone="brand" icon={<FileText size={20} />} hint="pdf + images" />
        <KpiTile label="OCR completed" value={ocrDone} tone="emerald" icon={<ScanSearch size={20} />} hint="extraction done" />
        <KpiTile label="OCR failed / low quality" value={ocrFailed} tone="rose" icon={<ImageIcon size={20} />} hint="no values invented" />
        <KpiTile label="Fields verified" value={verified} tone="sky" icon={<ShieldCheck size={20} />} hint="by staff" />
      </div>

      <Card title="All reports" subtitle={`${reports.length} documents across the pilot`} pad={false}>
        <div className="overflow-x-auto">
          <table className="sf-table min-w-[760px]">
            <thead>
              <tr>
                <th>Report</th>
                <th>Case</th>
                <th>Kind</th>
                <th>OCR status</th>
                <th>Fields</th>
                <th>Verified</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r, i) => {
                const owner = cases.find((c) => c.id === r.caseId)
                const ratio = r.fields.length ? (r.fields.filter((f) => f.status === 'verified').length / r.fields.length) * 100 : 0
                return (
                  <tr key={r.id} onClick={() => navigate(`/app/cases/${r.caseId}`)} className="cursor-pointer">
                    <td>
                      <div className="flex items-center gap-2.5">
                        <span
                          className={cx(
                            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                            r.type === 'pdf' ? 'bg-rose-50 text-rose-500' : 'bg-violet-50 text-violet-500',
                          )}
                        >
                          {r.type === 'pdf' ? <FileText size={15} /> : <ImageIcon size={15} />}
                        </span>
                        <div>
                          <p className="text-[13px] font-bold text-ink-800">{r.name}</p>
                          <p className="text-[11px] text-ink-400">{r.date}</p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <p className="text-xs font-bold text-brand-700">{owner?.patientId ?? r.caseId}</p>
                      <p className="text-[11px] text-ink-400">{(i + 1).toString().padStart(2, '0')}</p>
                    </td>
                    <td>
                      <Badge className="bg-white text-ink-500 ring-ink-200">{r.kind}</Badge>
                    </td>
                    <td>
                      <Badge
                        className={
                          r.ocrStatus === 'done'
                            ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                            : 'bg-rose-50 text-rose-700 ring-rose-200'
                        }
                      >
                        <span className={cx('h-1.5 w-1.5 rounded-full', r.ocrStatus === 'done' ? 'bg-emerald-500' : 'bg-rose-500')} />
                        {r.ocrStatus === 'done' ? 'Completed' : r.ocrStatus === 'low-quality' ? 'Low quality' : 'Failed'}
                      </Badge>
                    </td>
                    <td className="text-xs font-semibold text-ink-600">{r.fields.length}</td>
                    <td>
                      <div className="w-24">
                        <ProgressBar value={ratio} tone="emerald" />
                        <p className="mt-1 text-[10px] font-semibold text-ink-500">
                          {r.fields.filter((f) => f.status === 'verified').length}/{r.fields.length}
                        </p>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {compareCase && compareReports.length === 2 && (
        <Card
          title="Report comparison"
          subtitle='Neutral language only — "value changed from X to Y". A human interprets clinical meaning.'
        >
          <div className="overflow-hidden rounded-xl border border-ink-200">
            <table className="sf-table min-w-[560px] !text-xs">
              <thead>
                <tr>
                  <th>Parameter</th>
                  <th>Previous ({compareReports[0]?.name ?? '—'})</th>
                  <th />
                  <th>Current ({compareReports[1]?.name ?? '—'})</th>
                </tr>
              </thead>
              <tbody>
                {compareReports[0]?.fields.map((f, i) => {
                  const cur = compareReports[1]?.fields[i]
                  return (
                    <tr key={f.param}>
                      <td className="font-bold text-ink-800">{f.param}</td>
                      <td>
                        {f.value} {f.unit}
                      </td>
                      <td>
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                          <ArrowRight size={12} />
                        </span>
                      </td>
                      <td>
                        {cur?.value} {cur?.unit}
                        <span className="ml-2 rounded bg-ink-50 px-1.5 py-0.5 text-[10px] text-ink-400">
                          {f.value} → {cur?.value}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {compareReports.flatMap((r) =>
              r.fields.map((f) => (
                <span
                  key={f.id}
                  className={cx(
                    'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium',
                    f.status === 'verified'
                      ? 'border-emerald-200 bg-emerald-50/60 text-emerald-800'
                      : 'border-amber-200 bg-amber-50/60 text-amber-800',
                  )}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  {f.param}: <strong>{f.status}</strong>
                </span>
              )),
            )}
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-[11px] text-ink-400">
            <ShieldCheck size={13} className="text-brand-600" />
            The system does not conclude improvement, worsening, or disease from any change. Clinical interpretation
            belongs to the reviewing clinician.
          </p>
        </Card>
      )}
    </div>
  )
}
