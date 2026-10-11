import { Router } from 'express'
import { authUser } from '../middleware/auth'
import { HttpError } from '../middleware/errorHandler'
import { detectScriptLanguage, toIntakeLanguage } from '../services/languageDetectionService'
import { transliterateToLatin } from '../services/transliterationService'
import { getAllRuleSets } from '../services/rules/ruleRegistry'
import { addAudit } from '../services/auditStore'

export const languageRouter = Router()

const MAX_TEXT_LENGTH = 10_000

function readText(body: Record<string, unknown>): string {
  const text = typeof body?.text === 'string' ? body.text.trim() : ''
  if (text.length === 0) throw new HttpError(400, 'text is required.')
  if (text.length > MAX_TEXT_LENGTH) throw new HttpError(413, 'text is too long (max 10000 characters).')
  return text
}

/** Supported languages with their disclaimers + section labels for the UI. */
languageRouter.get('/supported', (_req, res) => {
  res.json({
    languages: getAllRuleSets().map((rs) => ({
      code: rs.language,
      label: toIntakeLanguage(rs.language),
      disclaimer: rs.disclaimer,
      sectionLabels: rs.sectionLabels,
    })),
  })
})

languageRouter.post('/detect', (req, res) => {
  const text = readText(req.body)
  const detected = detectScriptLanguage(text)
  const user = authUser(req)

  addAudit({
    sessionId: 'language',
    actor: user.displayName,
    role: user.role,
    action: 'language.detected',
    detail: `Detected ${detected.code} (${detected.script}, confidence ${detected.confidence.toFixed(2)}, mixed=${detected.isMixed}).`,
    category: 'view',
  })

  res.json({
    detectedLanguage: {
      code: detected.code,
      label: toIntakeLanguage(detected.code),
      confidence: Math.round(detected.confidence * 100) / 100,
      script: detected.script,
      isMixed: detected.isMixed,
    },
  })
})

languageRouter.post('/transliterate', (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text : ''
  if (!text.trim()) throw new HttpError(400, 'text is required.')
  const from = req.body?.from
  if (from !== 'devanagari' && from !== 'odia') {
    throw new HttpError(400, 'from must be either "devanagari" or "odia".')
  }
  const latinForm = transliterateToLatin(text, from)
  const user = authUser(req)

  addAudit({
    sessionId: 'language',
    actor: user.displayName,
    role: user.role,
    action: 'language.transliterated',
    detail: `Transliterated ${from} input to Latin for review.`,
    category: 'view',
  })

  res.json({ originalText: text, latinForm, from })
})