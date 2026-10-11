import { HttpError } from '../middleware/errorHandler'
import type { RetentionActor, RetentionExport, RetentionExportSection } from '../types'
import { addAudit } from './auditStore'
import { getStoredImage, newExportImageId, saveStoredImage } from './imageStore'
import { POLICY_VERSION } from './retentionConfig'
import { collectSessionExportSections, recordRetentionAction } from './retentionService'
import { getSessionIncludingDeleted } from './sessionStore'
import { anonymiseObject } from './unifiedAnonymizer'

/**
 * Portable data export (P0-6).
 *
 * Builds a non-diagnostic JSON copy of everything held about one case, stores
 * it under the `export-files` rule (purged after 1 day) and returns it. Image
 * bytes are referenced by id, never inlined.
 */

const EXPORT_DISCLAIMER =
  'Non-diagnostic data export: observational content only. This file contains no diagnosis, no prescription and no treatment advice — it is a copy of the records held about this case for review or transfer on request.'

export function buildSessionExport(sessionId: string, actor: RetentionActor): RetentionExport {
  const session = getSessionIncludingDeleted(sessionId)
  if (!session) throw new HttpError(404, 'Session not found.')

  const exportId = newExportImageId()
  const rawSections = collectSessionExportSections(sessionId)
  // Export content is anonymised one final time before it is written (P0-7).
  const sections = anonymiseObject(rawSections, 'export-file').value as RetentionExportSection[]
  const payload: RetentionExport = {
    exportId,
    sessionId,
    patientId: session.patientId,
    policyVersion: POLICY_VERSION,
    generatedAt: new Date().toISOString(),
    generatedBy: actor.name,
    generatedByRole: actor.role,
    disclaimer: EXPORT_DISCLAIMER,
    sections,
  }

  saveStoredImage(exportId, Buffer.from(JSON.stringify(payload, null, 2), 'utf8'), 'export', { sessionId })

  addAudit({
    sessionId,
    actor: actor.name,
    role: actor.role,
    action: 'session.exported',
    detail: `Portable export generated (${sections.length} section(s)) — stored for download and purged after 1 day.`,
    category: 'export',
  })
  recordRetentionAction({
    action: 'session.exported',
    targetId: sessionId,
    detail: `Export ${exportId} built with ${sections.length} section(s); purged under the export-files rule.`,
    actor,
  })

  return payload
}

/** Reads a stored export back (exports disappear once the rule purges them). */
export function getStoredSessionExport(exportId: string): RetentionExport | null {
  const stored = getStoredImage(exportId)
  if (!stored || stored.category !== 'export') return null
  try {
    return JSON.parse(stored.buffer.toString('utf8')) as RetentionExport
  } catch {
    return null
  }
}
