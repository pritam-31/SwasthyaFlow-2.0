/**
 * Dynamic follow-up question service (P0-5).
 *
 * Human-in-the-loop pipeline:
 *   suggested (AI or clinician) → asked → answered / skipped.
 *
 * Hard rules enforced here:
 *  - Questions are suggestions; a human puts them to the patient.
 *  - Answers are recorded verbatim but anonymised before storage.
 *  - Questions and answers never request identifiers and never diagnose.
 *  - Every transition writes an audit entry with the acting identity.
 */

import { randomUUID } from 'node:crypto'
import type {
  FollowUpQuestion,
  FollowUpTarget,
  PatientSession,
  SupportedLanguage,
  UserRole,
} from '../types'
import type { FollowUpCategory, FollowUpGenerationInput } from '../types/followup.types'
import { HttpError } from '../middleware/errorHandler'
import { addAudit } from './auditStore'
import { assertFollowUpAnswerSafe, assertFollowUpTextSafe } from './followUpSafety'
import { generateFollowUpQuestions } from './followUpGenerator'
import { fromIntakeLanguage } from './languageDetectionService'
import { anonymizeMultilingual } from './multilingualAnonymizer'
import { getFollowUpsForSession, getSession, setFollowUpsForSession } from './sessionStore'

export interface FollowUpActor {
  name: string
  role: UserRole
}

function nowIso(): string {
  return new Date().toISOString()
}

function newId(): string {
  return `fu-${randomUUID()}`
}

function sessionOf(sessionId: string): PatientSession {
  const session = getSession(sessionId)
  if (!session) throw new HttpError(404, 'Session not found.')
  return session
}

function languageOf(session: PatientSession): SupportedLanguage {
  return session.note?.language ?? fromIntakeLanguage(session.language)
}

function currentQuestions(sessionId: string): FollowUpQuestion[] {
  return getFollowUpsForSession(sessionId)
}

function save(sessionId: string, questions: FollowUpQuestion[]): void {
  setFollowUpsForSession(sessionId, questions)
}

/** Pure builder used by the stateless analyze endpoint and the session flows. */
export function buildFollowUpQuestions(input: FollowUpGenerationInput): FollowUpQuestion[] {
  const stamp = nowIso()
  const drafts = generateFollowUpQuestions(input).drafts
  const questions: FollowUpQuestion[] = drafts.map((draft) => ({
    id: newId(),
    question: draft.question,
    status: 'suggested' as const,
    language: draft.language,
    category: draft.category,
    target: draft.target,
    priority: draft.priority,
    reason: draft.reason,
    sourceType: draft.sourceType,
    sourceRef: draft.sourceRef,
    confidenceScore: draft.confidenceScore,
    createdAt: stamp,
    updatedAt: stamp,
  }))
  return questions
}

function sourceBreakdown(questions: FollowUpQuestion[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const q of questions) counts[q.sourceType] = (counts[q.sourceType] ?? 0) + 1
  return counts
}

function evaluateBranch(question: FollowUpQuestion, answers: Map<string, string>): boolean {
  const askIf = question.askIf
  if (!askIf) return true // no branching condition, always surface
  const depAnswer = answers.get(askIf.questionId)
  if (!depAnswer) return true // dependency not yet answered, surface the question
  // Case-insensitive substring match: check if depAnswer contains any of the values in answerIn
  return askIf.answerIn.some((val) => depAnswer.toLowerCase().includes(val.toLowerCase()))
}

function reEvaluateDependents(sessionId: string, answeredQuestionId: string, answers: Map<string, string>): FollowUpQuestion[] {
  const questions = currentQuestions(sessionId)
  return questions.map((q) => {
    // Check if this question depends on the answered question
    if (q.askIf?.questionId === answeredQuestionId) {
      // Re-evaluate the branch condition
      const meetsCondition = evaluateBranch(q, answers)
      if (meetsCondition) {
        // Condition met: keep 'suggested' status (or restore from 'skipped-branch')
        return { ...q, status: 'suggested' }
      } else {
        // Condition not met: set to 'skipped-branch'
        return { ...q, status: 'skipped-branch' }
      }
    }
    return q
  })
}

/** Merge freshly generated suggestions with human-tracked ones (never lost). */
function mergeGenerated(existing: FollowUpQuestion[], fresh: FollowUpQuestion[]): FollowUpQuestion[] {
  const tracked = existing.filter((q) => q.status !== 'suggested')
  const trackedKeys = new Set(tracked.map((q) => `${q.sourceType}|${q.sourceRef}|${q.category}`))
  const additions = fresh.filter((q) => !trackedKeys.has(`${q.sourceType}|${q.sourceRef}|${q.category}`))
  return [...tracked, ...additions].sort((a, b) => a.priority - b.priority)
}

/** Generate the AI draft for a session (first build / regenerate). */
function runGeneration(
  sessionId: string,
  actor: FollowUpActor,
  action: 'followup.generated' | 'followup.regenerated',
): { questions: FollowUpQuestion[]; warnings: string[] } {
  const session = sessionOf(sessionId)
  const existing = currentQuestions(sessionId)
  const input: FollowUpGenerationInput = {
    language: languageOf(session),
    displayText: session.displayText,
    urgencyFlags: session.note?.urgencyFlags ?? [],
    missingInformation: session.note?.missingInformation ?? [],
    reports: session.reports.map((r) => ({ id: r.id, type: r.type })),
    visuals: session.visuals.map((v) => ({ id: v.id })),
    hasTimeline: session.timeline ? session.timeline.events.length > 0 : false,
  }
  const stamp = nowIso()
  const { drafts, warnings } = generateFollowUpQuestions(input)
  const fresh = drafts.map((draft) => ({
    id: newId(),
    question: draft.question,
    status: 'suggested' as const,
    language: draft.language,
    category: draft.category,
    target: draft.target,
    priority: draft.priority,
    reason: draft.reason,
    sourceType: draft.sourceType,
    sourceRef: draft.sourceRef,
    confidenceScore: draft.confidenceScore,
    createdAt: stamp,
    updatedAt: stamp,
  }))
  const questions = mergeGenerated(existing, fresh)

  save(sessionId, questions)

  addAudit({
    sessionId,
    actor: actor.name,
    role: actor.role,
    action,
    detail: JSON.stringify({
      action: action === 'followup.generated' ? 'generate' : 'regenerate',
      questionCount: questions.length,
      sourceBreakdown: sourceBreakdown(questions),
      ...(action === 'followup.regenerated' ? { previousCount: existing.length } : {}),
    }),
    category: 'decision',
  })

  return { questions, warnings }
}

/**
 * First-time generation (intake). Uses whatever the note already holds plus the
 * uploaded sources; preserves human-tracked questions if any exist.
 */
export function ensureSessionFollowUps(
  sessionId: string,
  actor: FollowUpActor,
): { questions: FollowUpQuestion[]; warnings: string[] } {
  return runGeneration(sessionId, actor, 'followup.generated')
}

/** Replace the AI-suggested set, keeping human-tracked questions. */
export function regenerateSessionFollowUps(
  sessionId: string,
  actor: FollowUpActor,
): { questions: FollowUpQuestion[]; warnings: string[] } {
  return runGeneration(sessionId, actor, 'followup.regenerated')
}

/** Read the current question list (staff; patients filter client-side). */
export function getSessionQuestions(sessionId: string): FollowUpQuestion[] {
  return currentQuestions(sessionId)
}

function findQuestion(sessionId: string, questionId: string): { questions: FollowUpQuestion[]; target: FollowUpQuestion } | null {
  const questions = currentQuestions(sessionId)
  const target = questions.find((q) => q.id === questionId)
  if (!target) return null
  return { questions, target }
}

/** Mark a question as put to the patient (staff only). */
export function askFollowUp(sessionId: string, questionId: string, actor: FollowUpActor): FollowUpQuestion | null {
  const found = findQuestion(sessionId, questionId)
  if (!found) return null
  const stamp = nowIso()
  const updated: FollowUpQuestion = {
    ...found.target,
    status: 'asked',
    askedAt: found.target.askedAt ?? stamp,
    updatedAt: stamp,
  }
  const questions = found.questions.map((q) => (q.id === questionId ? updated : q))
  save(sessionId, questions)
  const answers = new Map<string, string>(questions.flatMap((question) => question.answer ? [[question.id, question.answer]] : []))
  save(sessionId, reEvaluateDependents(sessionId, questionId, answers))
  addAudit({
    sessionId,
    actor: actor.name,
    role: actor.role,
    action: 'followup.asked',
    detail: `Question put to the patient: "${updated.question.slice(0, 120)}"`,
    category: 'edit',
  })
  return updated
}

/** Record the patient's answer (verbatim, anonymised) in its own language. */
export function answerFollowUp(
  sessionId: string,
  questionId: string,
  answerText: string,
  answerLanguage: SupportedLanguage,
  actor: FollowUpActor,
): FollowUpQuestion | null {
  const found = findQuestion(sessionId, questionId)
  if (!found) return null

  const anonymized = anonymizeMultilingual(answerText, answerLanguage)
  const violation = assertFollowUpAnswerSafe(anonymized.text)
  if (violation) throw new HttpError(400, violation.error, { suggestion: violation.suggestion })

  const stamp = nowIso()
  const updated: FollowUpQuestion = {
    ...found.target,
    status: 'answered',
    answer: anonymized.text,
    answeredAt: stamp,
    answeredBy: actor.name,
    answerLanguage,
    updatedAt: stamp,
  }
  save(sessionId, found.questions.map((q) => (q.id === questionId ? updated : q)))
  addAudit({
    sessionId,
    actor: actor.name,
    role: actor.role,
    action: 'followup.answered',
    detail: `Answer recorded verbatim in ${answerLanguage} (${anonymized.report.redactedCount} PII marker(s) stripped).`,
    category: 'edit',
  })
  return updated
}

/** Skip a question (the patient could not / should not answer it now). */
export function skipFollowUp(sessionId: string, questionId: string, actor: FollowUpActor): FollowUpQuestion | null {
  const found = findQuestion(sessionId, questionId)
  if (!found) return null
  const stamp = nowIso()
  const updated: FollowUpQuestion = { ...found.target, status: 'skipped', updatedAt: stamp }
  save(sessionId, found.questions.map((q) => (q.id === questionId ? updated : q)))
  addAudit({
    sessionId,
    actor: actor.name,
    role: actor.role,
    action: 'followup.skipped',
    detail: `Follow-up question skipped: "${updated.question.slice(0, 120)}"`,
    category: 'edit',
  })
  return updated
}

export interface ClinicianFollowUpInput {
  text: string
  language: SupportedLanguage
  category: FollowUpCategory
  target: FollowUpTarget
}

/** Add a clinician-authored question to the session (runs the safety guard). */
export function addClinicianFollowUp(
  sessionId: string,
  input: ClinicianFollowUpInput,
  actor: FollowUpActor,
): FollowUpQuestion {
  void sessionOf(sessionId)
  const stamp = nowIso()

  const violation = assertFollowUpTextSafe(input.text)
  if (violation) throw new HttpError(400, violation.error, { suggestion: violation.suggestion })

  const anonymized = anonymizeMultilingual(input.text, input.language)
  const afterAnonymize = assertFollowUpTextSafe(anonymized.text)
  if (afterAnonymize) throw new HttpError(400, afterAnonymize.error, { suggestion: afterAnonymize.suggestion })

  const question: FollowUpQuestion = {
    id: newId(),
    question: anonymized.text,
    status: 'suggested',
    language: input.language,
    category: input.category,
    target: input.target,
    priority: 5,
    reason:
      input.language === 'hi'
        ? 'चिकित्सक द्वारा अनुवर्तन के लिए जोड़ा गया।'
        : input.language === 'or'
          ? 'ଚିକିତ୍ସକ ଅନୁସରଣ ପାଇଁ ଯୋଡ଼ିଛନ୍ତି।'
          : 'Added by a clinician for follow-up.',
    sourceType: 'clinician',
    sourceRef: 'clinician',
    createdAt: stamp,
    updatedAt: stamp,
  }

  save(sessionId, [...currentQuestions(sessionId), question])
  addAudit({
    sessionId,
    actor: actor.name,
    role: actor.role,
    action: 'followup.added',
    detail: `Clinician added a follow-up question (${input.language}): "${anonymized.text.slice(0, 120)}"`,
    category: 'edit',
  })
  return question
}

export interface FollowUpEditPatch {
  question?: string
  category?: FollowUpCategory
  target?: FollowUpTarget
  priority?: number
}

/** Human-in-the-loop correction of a question's wording / routing. */
export function editFollowUp(
  sessionId: string,
  questionId: string,
  patch: FollowUpEditPatch,
  actor: FollowUpActor,
): FollowUpQuestion | null {
  const found = findQuestion(sessionId, questionId)
  if (!found) return null

  const updated: FollowUpQuestion = { ...found.target }

  if (patch.question !== undefined) {
    const violation = assertFollowUpTextSafe(patch.question)
    if (violation) throw new HttpError(400, violation.error, { suggestion: violation.suggestion })
    const anonymized = anonymizeMultilingual(patch.question, updated.language)
    const afterAnonymize = assertFollowUpTextSafe(anonymized.text)
    if (afterAnonymize) throw new HttpError(400, afterAnonymize.error, { suggestion: afterAnonymize.suggestion })
    updated.question = anonymized.text
  }
  if (patch.category !== undefined) updated.category = patch.category
  if (patch.target !== undefined) updated.target = patch.target
  if (patch.priority !== undefined) updated.priority = patch.priority
  updated.updatedAt = nowIso()

  save(sessionId, found.questions.map((q) => (q.id === questionId ? updated : q)))
  addAudit({
    sessionId,
    actor: actor.name,
    role: actor.role,
    action: 'followup.edited',
    detail: `Follow-up question edited (${Object.keys(patch).join(', ')}).`,
    category: 'edit',
  })
  return updated
}

/** Remove a follow-up question. */
export function deleteFollowUp(sessionId: string, questionId: string, actor: FollowUpActor): boolean {
  const found = findQuestion(sessionId, questionId)
  if (!found) return false
  save(
    sessionId,
    found.questions.filter((q) => q.id !== questionId),
  )
  addAudit({
    sessionId,
    actor: actor.name,
    role: actor.role,
    action: 'followup.deleted',
    detail: `Follow-up question removed (source ${found.target.sourceType}).`,
    category: 'edit',
  })
  return true
}

/** Reorder the list — `orderedIds` must be a permutation of the current ids. */
export function reorderFollowUps(
  sessionId: string,
  orderedIds: string[],
  actor: FollowUpActor,
): FollowUpQuestion[] | null {
  const questions = currentQuestions(sessionId)
  const currentIds = new Set(questions.map((q) => q.id))
  if (currentIds.size !== orderedIds.length || orderedIds.some((id) => !currentIds.has(id))) {
    throw new HttpError(400, 'orderedIds must contain every question id exactly once.')
  }
  const byId = new Map(questions.map((q) => [q.id, q]))
  const stamp = nowIso()
  const reordered = orderedIds.map((id, index) => ({ ...byId.get(id)!, priority: index + 1, updatedAt: stamp }))
  save(sessionId, reordered)
  addAudit({
    sessionId,
    actor: actor.name,
    role: actor.role,
    action: 'followup.reordered',
    detail: `Follow-up list reordered (${reordered.length} question(s)).`,
    category: 'edit',
  })
  return reordered
}