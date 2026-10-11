import { useEffect } from 'react'
import { useTriage } from '../../context/TriageContext'
import { CODE_BY_INTAKE_LANGUAGE } from '../../types/language.types'
import AnonymisationPreview from './AnonymisationPreview'
import AnonymisationReportCard from './AnonymisationReportCard'
import type { IntakeLanguage } from '../../types/triage'

/**
 * Per-case anonymisation panel (P0-7): a redaction preview plus the aggregated
 * coverage report across every modality for the case (doctor / admin). Raw PII
 * never leaves the backend, so only typed placeholders are shown.
 */
export default function SessionAnonymisation({
  sessionId,
  language,
}: {
  sessionId: string
  language: IntakeLanguage
}) {
  const { permissions, sessionAnonymisationReports, refreshSessionAnonymisationReport } = useTriage()
  const code = CODE_BY_INTAKE_LANGUAGE[language]

  useEffect(() => {
    if (permissions.canViewAnonymisationReport) void refreshSessionAnonymisationReport(sessionId)
  }, [sessionId, permissions.canViewAnonymisationReport, refreshSessionAnonymisationReport])

  if (!permissions.canPreviewAnonymisation) return null

  const report = sessionAnonymisationReports[sessionId]

  return (
    <div className="space-y-4">
      <AnonymisationPreview sessionId={sessionId} language={code} />
      {permissions.canViewAnonymisationReport && report && (
        <AnonymisationReportCard report={report} language={code} />
      )}
    </div>
  )
}
