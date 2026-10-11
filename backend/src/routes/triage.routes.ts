import { Router } from 'express'
import { requireRole, authUser } from '../middleware/auth'
import { HttpError } from '../middleware/errorHandler'
import { anonymizeMultilingual } from '../services/multilingualAnonymizer'
import { analyzeWithFallback } from '../services/multilingualTriageService'
import { getAllRuleSets, getRuleSet } from '../services/rules/ruleRegistry'
import { detectScriptLanguage, normalizeLanguage, toIntakeLanguage } from '../services/languageDetectionService'
import { addAudit } from '../services/auditStore'
import type { SupportedLanguage } from '../types'

export const triageRouter = Router()

const MAX_TEXT_LENGTH = 10_000
const ACCEPTED_LANGUAGE = /^(?:en|english|hi|hindi|or|odia|oriya)$/i

function readText(body: Record<string, unknown>): string {
  const text = typeof body?.text === 'string' ? body.text.trim() : ''
  if (text.length === 0) throw new HttpError(400, 'text is required.')
  if (text.length > MAX_TEXT_LENGTH) throw new HttpError(413, 'text is too long (max 10000 characters).')
  return text
}

/**
 * Coerces any accepted language input (scheme codes or display enums) into a
 * scheme code; returns undefined when the field is absent or not recognised so
 * the analysis layer falls back to script detection.
 */
function readLanguage(body: Record<string, unknown>, text: string): SupportedLanguage | undefined {
  const value = typeof body?.language === 'string' ? body.language.trim() : ''
  if (!value || !ACCEPTED_LANGUAGE.test(value)) return undefined
  return normalizeLanguage(value, text)
}

/**
 * Stateless analysis endpoint: PII is stripped here as well, so callers can
 * never push raw identifiers straight into the analysis layer.
 * Clinical analysis is for staff — patients go through the consented
 * session-creation flow instead.
 */
triageRouter.post('/analyze', requireRole('nurse', 'doctor'), (req, res) => {
  const text = readText(req.body)
  const language = readLanguage(req.body, text)
  const autoDetect = req.body?.autoDetect === true || language === undefined

  const { note, anonymization, detectedLanguage } = analyzeWithFallback({ text, language, autoDetect })
  const user = authUser(req)

  addAudit({
    sessionId: 'triage',
    actor: user.displayName,
    role: user.role,
    action: 'triage.analyzed',
    detail: `Analyzed narrative as ${detectedLanguage.code} (${detectedLanguage.script}) with ${note.urgencyFlags.length} urgency signal(s), ${note.missingInformation.length} missing field(s), ${note.followUpQuestions.length} follow-up question(s).`,
    category: 'decision',
  })

  res.json({
    note,
    anonymization,
    detectedLanguage,
    language: detectedLanguage.code,
  })
})

/** PII preview for the intake form — same rules as the analysis layer. */
triageRouter.post('/anonymize', (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text : ''
  const language = readLanguage(req.body, text)
  const { text: redacted, report } = anonymizeMultilingual(text, language)
  const code = detectScriptLanguage(text).code
  const user = authUser(req)

  addAudit({
    sessionId: 'triage',
    actor: user.displayName,
    role: user.role,
    action: 'triage.anonymized',
    detail: `Previewed redaction in ${code} (${report.redactedCount} replacement(s)).`,
    category: 'edit',
  })

  res.json({ text: redacted, report, anonymization: report, language: code })
})

triageRouter.get('/rules', (_req, res) => {
  const english = getRuleSet('en')
  res.json({
    disclaimer: english.disclaimer,
    notice: 'Urgency signals are workflow labels produced by keyword rules — never a diagnosis.',
    prescribing: false,
    urgencySignals: english.urgencyRules.map((r) => ({ id: r.id, label: r.label, severity: r.severity, reason: r.reason })),
    redactionCategories: ['name', 'phone', 'id-number', 'email', 'address', 'date-of-birth'],
    languages: Object.fromEntries(
      getAllRuleSets().map((rs) => [
        rs.language,
        {
          language: rs.language,
          label: toIntakeLanguage(rs.language),
          disclaimer: rs.disclaimer,
          sectionLabels: rs.sectionLabels,
          urgencyRules: rs.urgencyRules.map((r) => ({ id: r.id, label: r.label, severity: r.severity, reason: r.reason })),
          missingInfoChecks: rs.missingInfoChecks.map((c) => ({ id: c.id, label: c.label, whyItMatters: c.whyItMatters })),
          followUpQuestions: rs.followUpQuestions.map((q) => ({ id: q.id, category: q.category, text: q.text, target: q.target, priority: q.priority })),
          bannedPhrases: rs.bannedPhrases.map((b) => ({ pattern: b.pattern.source, replacement: b.replacement })),
        },
      ]),
    ),
  })
})