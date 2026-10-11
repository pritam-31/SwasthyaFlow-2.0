/**
 * Report upload / review client (P0-1).
 *
 * The backend owns extraction, anonymization and the audit trail — this module
 * only moves files and review decisions across the wire, typed to match
 * backend/src/routes/reports.routes.ts.
 */

import { postMultipart, request } from './api'
import type {
  DeleteReportResponse,
  ReportDetailResponse,
  ReportsView,
  UploadReportsResponse,
} from '../types/report.types'

/** Upload files to an existing session — the primary flow (POST /sessions/:id/reports). */
export async function uploadSessionReports(
  sessionId: string,
  files: File[],
): Promise<UploadReportsResponse> {
  const form = new FormData()
  for (const file of files) form.append('files', file, file.name)
  return postMultipart(`/sessions/${encodeURIComponent(sessionId)}/reports`, form)
}

/** Upload shortcut when only a sessionId string is known (POST /reports). */
export async function uploadReports(sessionId: string, files: File[]): Promise<UploadReportsResponse> {
  const form = new FormData()
  form.append('sessionId', sessionId)
  for (const file of files) form.append('files', file, file.name)
  return postMultipart('/reports', form)
}

export async function fetchSessionReports(sessionId: string): Promise<ReportsView> {
  return request(`/sessions/${encodeURIComponent(sessionId)}/reports`)
}

export async function fetchReport(reportId: string): Promise<ReportDetailResponse> {
  return request(`/reports/${encodeURIComponent(reportId)}`)
}

export async function verifyReport(
  reportId: string,
  note?: string,
): Promise<ReportDetailResponse> {
  return request(`/reports/${encodeURIComponent(reportId)}/verify`, {
    method: 'POST',
    body: JSON.stringify({ note: note ?? '' }),
  })
}

export async function rejectReport(
  reportId: string,
  reason: string,
): Promise<ReportDetailResponse> {
  return request(`/reports/${encodeURIComponent(reportId)}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })
}

export async function deleteReport(reportId: string): Promise<DeleteReportResponse> {
  return request(`/reports/${encodeURIComponent(reportId)}`, { method: 'DELETE' })
}