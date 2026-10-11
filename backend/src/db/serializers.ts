import type { AnonymisationReport, PIIMatch, ReviewerFeedback } from '../types/anonymisation.types'

export function scrubRawMatch(match: PIIMatch): PIIMatch {
  const { raw, ...rest } = match as PIIMatch & { raw?: unknown }
  void raw
  return rest as PIIMatch
}

export function scrubRawReport(report: AnonymisationReport): AnonymisationReport {
  const cleaned: AnonymisationReport = {
    ...report,
    matches: report.matches.map(scrubRawMatch),
  }
  return cleaned
}

export function anonymiseFeedbackNote(note: string | undefined): string | undefined {
  if (!note || note.trim() === '') return note
  return note.trim().slice(0, 2000)
}

export function scrubFeedback(feedback: ReviewerFeedback): ReviewerFeedback {
  const { note, ...rest } = feedback
  const scrubbed: ReviewerFeedback = { ...rest } as ReviewerFeedback
  if (note !== undefined) {
    scrubbed.note = anonymiseFeedbackNote(note)
  }
  return scrubbed
}
