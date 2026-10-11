import { AnonymisationReportModel } from '../db/models/AnonymisationReport'
import { ReviewerFeedbackModel } from '../db/models/ReviewerFeedback'
import type { AnonymisationReport, ReviewerFeedback } from '../types/anonymisation.types'

export async function storeReport(report: AnonymisationReport): Promise<void> {
  await AnonymisationReportModel.replaceOne({ _id: report.id }, { ...report, _id: report.id }, { upsert: true })
}

export async function listReports(sessionId?: string): Promise<AnonymisationReport[]> {
  const query = sessionId ? { sessionId } : {}
  return AnonymisationReportModel.find(query).sort({ createdAt: -1 }).lean<AnonymisationReport[]>().exec()
}

export async function clearReports(): Promise<void> {
  await AnonymisationReportModel.deleteMany({})
}

export async function storeFeedback(entry: ReviewerFeedback): Promise<void> {
  await ReviewerFeedbackModel.replaceOne({ _id: entry.id }, { ...entry, _id: entry.id }, { upsert: true })
}

export async function listFeedback(reportId?: string): Promise<ReviewerFeedback[]> {
  const query = reportId ? { reportId } : {}
  return ReviewerFeedbackModel.find(query).sort({ createdAt: -1 }).lean<ReviewerFeedback[]>().exec()
}

export async function clearFeedback(): Promise<void> {
  await ReviewerFeedbackModel.deleteMany({})
}
