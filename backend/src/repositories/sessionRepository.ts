import { PatientModel } from '../db/models/Patient'
import { PatientSessionModel, type DbPatientSession } from '../db/models/PatientSession'
import { TriageNoteModel } from '../db/models/TriageNote'
import { ExtractedReportModel } from '../db/models/ExtractedReport'
import { ExtractedVisualModel } from '../db/models/ExtractedVisual'
import { TimelineModel } from '../db/models/Timeline'
import { FollowUpQuestionModel } from '../db/models/FollowUpQuestion'
import { ReferralModel } from '../db/models/Referral'
import type { PatientSession } from '../types'

/**
 * Session aggregate persistence (P1-9). The whole session is stored in
 * `patient_sessions`; its parts are ALSO mirrored into their own collections.
 * `seeded` marks demo rows so the seeder can find them again.
 */

export interface StoredSession extends PatientSession {
  seeded: boolean
}

function toDoc(session: StoredSession): DbPatientSession {
  return {
    _id: session.id,
    id: session.id,
    patientId: session.patientId,
    language: session.language,
    ageBand: session.ageBand,
    sex: session.sex,
    intakePoint: session.intakePoint,
    facility: session.facility,
    facilityId: session.facilityId,
    displayText: session.displayText,
    anonymization: session.anonymization,
    reports: session.reports,
    visuals: session.visuals,
    note: session.note,
    timeline: session.timeline ?? null,
    overrides: session.overrides,
    referral: session.referral,
    pendingUploads: session.pendingUploads ?? [],
    status: session.status,
    ownerId: session.ownerId,
    createdBy: session.createdBy,
    createdByRole: session.createdByRole,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    deletedAt: session.deletedAt ?? null,
    consentRecordId: session.consentRecordId ?? null,
    assignedTo: session.assignedTo ?? null,
    assignedToName: session.assignedToName ?? null,
    seeded: session.seeded,
  }
}

export async function persistSession(session: StoredSession): Promise<void> {
  await PatientSessionModel.replaceOne({ _id: session.id }, toDoc(session), { upsert: true })
  await PatientModel.replaceOne(
    { _id: session.patientId },
    { _id: session.patientId, id: session.patientId, createdAt: session.createdAt, updatedAt: session.updatedAt },
    { upsert: true },
  )

  await TriageNoteModel.deleteMany({ sessionId: session.id })
  if (session.note) {
    await TriageNoteModel.create({
      _id: `tn-${session.id}`,
      id: `tn-${session.id}`,
      sessionId: session.id,
      structuredNote: session.note.structuredNote,
      observations: session.note.observations,
      urgencyFlags: session.note.urgencyFlags,
      missingInformation: session.note.missingInformation,
      followUpQuestions: session.note.followUpQuestions,
      riskScore: session.note.riskScore,
      status: session.note.status,
      language: session.note.language ?? null,
      generatedAt: session.note.generatedAt,
      disclaimer: session.note.disclaimer,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    })
  }

  await FollowUpQuestionModel.deleteMany({ sessionId: session.id })
  if (session.note && session.note.followUpQuestions.length > 0) {
    await FollowUpQuestionModel.insertMany(
      session.note.followUpQuestions.map((q) => ({
        _id: q.id,
        id: q.id,
        sessionId: session.id,
        question: q.question,
        status: q.status,
        answer: q.answer ?? null,
        language: q.language,
        category: q.category,
        target: q.target,
        priority: q.priority,
        reason: q.reason,
        sourceType: q.sourceType,
        sourceRef: q.sourceRef,
        askedAt: q.askedAt ?? null,
        answeredAt: q.answeredAt ?? null,
        answeredBy: q.answeredBy ?? null,
        answerLanguage: q.answerLanguage ?? null,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      })),
    )
  }

  await ExtractedReportModel.deleteMany({ sessionId: session.id })
  if (session.reports.length > 0) {
    await ExtractedReportModel.insertMany(session.reports.map((r) => ({ ...r, _id: r.id })))
  }

  await ExtractedVisualModel.deleteMany({ sessionId: session.id })
  if (session.visuals.length > 0) {
    await ExtractedVisualModel.insertMany(session.visuals.map((v) => ({ ...v, _id: v.id })))
  }

  await TimelineModel.deleteMany({ sessionId: session.id })
  if (session.timeline) {
    await TimelineModel.create({
      _id: session.timeline.id,
      id: session.timeline.id,
      sessionId: session.id,
      events: session.timeline.events,
      summary: session.timeline.summary,
      language: session.timeline.language,
      generatedAt: session.timeline.generatedAt,
      status: session.timeline.status,
      warnings: session.timeline.warnings,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    })
  }

  await ReferralModel.deleteMany({ sessionId: session.id })
  if (session.referral) {
    await ReferralModel.create({ ...session.referral, _id: session.referral.id })
  }
}

export async function removeSession(id: string): Promise<void> {
  await PatientSessionModel.deleteOne({ _id: id })
  await TriageNoteModel.deleteMany({ sessionId: id })
  await FollowUpQuestionModel.deleteMany({ sessionId: id })
  await ExtractedReportModel.deleteMany({ sessionId: id })
  await ExtractedVisualModel.deleteMany({ sessionId: id })
  await TimelineModel.deleteMany({ sessionId: id })
  await ReferralModel.deleteMany({ sessionId: id })
}

export async function loadAllSessions(): Promise<StoredSession[]> {
  const docs = await PatientSessionModel.find().lean<DbPatientSession[]>().exec()
  return docs.map((doc) => {
    const session: StoredSession = {
      id: doc.id,
      patientId: doc.patientId,
      language: doc.language as PatientSession['language'],
      ageBand: doc.ageBand as PatientSession['ageBand'],
      sex: doc.sex as PatientSession['sex'],
      intakePoint: doc.intakePoint as PatientSession['intakePoint'],
      facility: doc.facility,
      facilityId: doc.facilityId ?? 'facility-default',
      displayText: doc.displayText,
      anonymization: doc.anonymization as PatientSession['anonymization'],
      reports: (doc.reports ?? []) as PatientSession['reports'],
      visuals: (doc.visuals ?? []) as PatientSession['visuals'],
      note: (doc.note ?? null) as PatientSession['note'],
      timeline: (doc.timeline ?? undefined) as PatientSession['timeline'],
      overrides: (doc.overrides ?? []) as PatientSession['overrides'],
      referral: (doc.referral ?? null) as PatientSession['referral'],
      pendingUploads: (doc.pendingUploads ?? []) as PatientSession['pendingUploads'],
      status: doc.status as PatientSession['status'],
      ownerId: doc.ownerId,
      createdBy: doc.createdBy,
      createdByRole: doc.createdByRole as PatientSession['createdByRole'],
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      deletedAt: doc.deletedAt ?? undefined,
      consentRecordId: doc.consentRecordId ?? undefined,
      assignedTo: doc.assignedTo ?? undefined,
      assignedToName: doc.assignedToName ?? undefined,
      seeded: Boolean(doc.seeded),
    }
    return session
  })
}
