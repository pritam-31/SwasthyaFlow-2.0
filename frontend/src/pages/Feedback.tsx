import { useCallback, useEffect, useState } from 'react'
import { MessagesSquare, RefreshCw } from 'lucide-react'
import { Button, Card, EmptyState, InfoBanner, PageHeader } from '../components/ui'
import FeedbackDashboardPanel from '../components/feedback/FeedbackDashboardPanel'
import FeedbackExportPanel from '../components/feedback/FeedbackExportPanel'
import FeedbackFilters from '../components/feedback/FeedbackFilters'
import FeedbackList from '../components/feedback/FeedbackList'
import { useTriage } from '../context/TriageContext'
import * as feedbackApi from '../services/feedbackApi'
import { FEEDBACK_SECTION_LABELS } from '../services/safetyPolicy'
import { CODE_BY_INTAKE_LANGUAGE } from '../types/language.types'
import type { Feedback, FeedbackFilter } from '../types/feedback.types'

/**
 * The clinician feedback workspace (P2-15). Clinical staff read and record
 * verdicts on AI outputs; facility admins additionally see the facility rollup
 * and can export it. Feedback is advisory evidence only — it never
 * auto-applies to a rule, threshold or score.
 */
export default function FeedbackPage() {
  const { permissions, language } = useTriage()
  const labels = FEEDBACK_SECTION_LABELS[CODE_BY_INTAKE_LANGUAGE[language]]
  const [filter, setFilter] = useState<FeedbackFilter>({})
  const [items, setItems] = useState<Feedback[]>([])
  const [loading, setLoading] = useState(false)
  const [offline, setOffline] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    setOffline(false)
    try {
      setItems(await feedbackApi.fetchFeedback(filter))
    } catch {
      setItems([])
      setOffline(true)
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    if (!permissions.canViewFeedback) return
    void reload()
  }, [permissions.canViewFeedback, reload])

  if (!permissions.canViewFeedback) {
    return <InfoBanner tone="amber">{labels.readOnly}</InfoBanner>
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={labels.title}
        subtitle={labels.subtitle}
        icon={<MessagesSquare size={20} />}
        action={
          <Button variant="secondary" size="sm" disabled={loading} onClick={() => void reload()}>
            <RefreshCw size={14} /> {loading ? labels.saving : labels.apply}
          </Button>
        }
      />

      {permissions.canViewFeedbackDashboard && (
        <>
          <FeedbackDashboardPanel labels={labels} />
          {permissions.canExportFeedback && <FeedbackExportPanel labels={labels} />}
        </>
      )}

      <Card
        title={labels.listTitle}
        subtitle={labels.listSubtitle}
        action={<FeedbackFilters labels={labels} value={filter} onChange={setFilter} onReset={() => setFilter({})} />}
      >
        {offline ? (
          <InfoBanner tone="amber">{labels.offline}</InfoBanner>
        ) : items.length === 0 ? (
          <EmptyState icon={<MessagesSquare size={18} />} title={labels.noData} hint={labels.listSubtitle} />
        ) : (
          <FeedbackList items={items} labels={labels} onChanged={() => void reload()} />
        )}
      </Card>
    </div>
  )
}
