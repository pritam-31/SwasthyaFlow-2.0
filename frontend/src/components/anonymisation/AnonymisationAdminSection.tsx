import { ShieldCheck } from 'lucide-react'
import { ANONYMISATION_SECTION_LABELS } from '../../services/safetyPolicy'
import AnonymisationDisclaimer from './AnonymisationDisclaimer'
import AnonymisationMetricsDashboard from './AnonymisationMetricsDashboard'
import LeakTestRunner from './LeakTestRunner'
import PatternInventoryTable from './PatternInventoryTable'

/**
 * Admin anonymisation console (P0-7): facility-wide metrics, the synthetic leak
 * harness and the pattern inventory. Doctors only reach the per-case report and
 * the preview/preview components; everything here is backend-owned.
 */
export default function AnonymisationAdminSection() {
  return (
    <>
      <div className="space-y-3">
        <AnonymisationDisclaimer />
        <h2 className="flex items-center gap-2 text-sm font-bold text-ink-800">
          <ShieldCheck size={15} className="text-brand-600" /> {ANONYMISATION_SECTION_LABELS.en.title}
        </h2>
      </div>
      <AnonymisationMetricsDashboard />
      <LeakTestRunner />
      <PatternInventoryTable />
    </>
  )
}
