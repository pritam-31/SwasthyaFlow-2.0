import { randomUUID } from 'node:crypto'
import type {
  AnonymizationReport,
  DetectedLanguage,
  FollowUpQuestion,
  MissingInfoItem,
  MultilingualAnalyzeInput,
  TriageNote,
  TranslatedUrgencyFlag,
  UrgencyFlag,
} from '../types'
import { detectScriptLanguage, normalizeLanguage } from './languageDetectionService'
import { anonymizeMultilingual } from './multilingualAnonymizer'
import { buildFollowUpQuestions } from './followUpService'
import { getLatinForm } from './transliterationService'
import { getRuleSet } from './rules/ruleRegistry'
import {
  computeMissingInfoConfidence,
  computeTriageNoteConfidence,
  computeUrgencyConfidence,
} from './confidenceService'
import type { LanguageRuleSet } from '../types'

/**
 * Multilingual triage analysis (P0-3).
 *
 * Ordering is fixed: (1) detect language, (2) anonymise, (3) enforce the
 * per-language non-diagnostic phrases, (4) run workflow rules, (5) build the
 * observational draft. Nothing in the returned note is a diagnosis.
 */

const NO_NARRATIVE: Record<string, string> = {
  en: 'No narrative provided.',
  hi: 'कोई विवरण प्रदान नहीं किया गया।',
  or: 'କୌଣସି ବର୍ଣ୍ଣନା ଦିଆଯାଇନାହିଁ।',
}

const NO_VITALS: Record<string, string> = {
  en: 'Not provided in the intake.',
  hi: 'प्रवेश में प्रदान नहीं किया गया।',
  or: 'ଭର୍ତ୍ତିରେ ଦିଆଯାଇନାହିଁ।',
}

export interface MultilingualAnalysisResult {
  note: TriageNote
  anonymization: AnonymizationReport
  detectedLanguage: DetectedLanguage
}

/** First matching pattern result against any of several source strings. */
function matchAny(patterns: RegExp[], ...sources: string[]): RegExpExecArray | null {
  for (const source of sources) {
    for (const pattern of patterns) {
      const m = pattern.exec(source)
      if (m) return m
    }
  }
  return null
}

function matchesAny(patterns: RegExp[], ...sources: string[]): boolean {
  return matchAny(patterns, ...sources) !== null
}

/** Apply per-language non-diagnostic phrase filters to the note's narrative. */
function enforceNonDiagnostic(ruleSet: LanguageRuleSet, text: string): string {
  let out = text
  for (const banned of ruleSet.bannedPhrases) {
    out = out.replace(banned.pattern, banned.replacement)
  }
  return out
}

function splitSentences(text: string): { sentences: string[]; offsetOf: Array<[string, number]> } {
  const sentences: string[] = []
  const offsetOf: Array<[string, number]> = []
  let index = 0
  for (const raw of text.split(/(?<=[.!?।])\s+|\n+/)) {
    const sentence = raw.trim()
    if (!sentence) continue
    sentences.push(sentence)
    offsetOf.push([sentence, index])
    index += sentence.length + 1
  }
  return { sentences, offsetOf }
}

/**
 * Analyzes a narrative in its detected (or explicitly requested) language.
 * Merges English workflow rules for mixed-script (Hinglish/Odlish) input only
 * when the primary language produced nothing — never double-flagging.
 */
export function analyzeWithFallback(input: MultilingualAnalyzeInput): MultilingualAnalysisResult {
  const text = input.text.trim()
  const detected = detectScriptLanguage(text)
  const code = normalizeLanguage(input.language, text, detected.code)
  const ruleSet = getRuleSet(code)
  const english = code === 'en' ? ruleSet : getRuleSet('en')

  // 1. Anonymise before anything touches the analysis layer.
  const anonymized = anonymizeMultilingual(text, code)
  const safeText = enforceNonDiagnostic(ruleSet, anonymized.text)
  const latinForm = getLatinForm(safeText, code, detected.script)

  const { sentences, offsetOf } = splitSentences(safeText)

  const flagMatch = (patterns: RegExp[]): { match: RegExpExecArray; source: 'original' | 'latin' } | null => {
    for (const pattern of patterns) {
      const m = pattern.exec(safeText)
      if (m) return { match: m, source: 'original' }
    }
    if (code !== 'en') {
      for (const pattern of patterns) {
        const m = pattern.exec(latinForm)
        if (m) return { match: m, source: 'latin' }
      }
    }
    return null
  }

  // 2. Urgency signals (workflow flags, not diagnoses).
  const buildFlag = (rule: { id: string; label: string; severity: 'red' | 'amber'; reason: string }, hit: { match: RegExpExecArray; source: 'original' | 'latin' }): TranslatedUrgencyFlag => {
    const sentence = offsetOf.find(([s]) => s.indexOf(hit.match[0]) !== -1)
    return {
      id: randomUUID(),
      label: rule.label,
      severity: rule.severity,
      reason: rule.reason,
      ruleId: rule.id,
      language: code as 'en' | 'hi' | 'or',
      originalText: sentence ? sentence[0] : hit.match.input,
      matchedText: hit.match[0],
    }
  }

  const flags: TranslatedUrgencyFlag[] = []
  for (const rule of ruleSet.urgencyRules) {
    const hit = flagMatch(rule.patterns)
    if (hit) flags.push(buildFlag(rule, hit))
  }

  // 3. Missing-information checks.
  const missingInformation: MissingInfoItem[] = []
  for (const check of ruleSet.missingInfoChecks) {
    if (!matchesAny(check.patterns, safeText, latinForm)) {
      missingInformation.push({ id: randomUUID(), field: check.label, whyItMatters: check.whyItMatters, ruleId: check.id, target: check.targetType })
    }
  }

  // 4. English urgency fallback for mixed-script input when no primary urgency
  //    signal fired. Missing-info checks stay in the primary language so the
  //    richer per-language check set is never double-reported.
  if (code !== 'en' && detected.isMixed && flags.length === 0) {
    for (const rule of english.urgencyRules) {
      const hit = flagMatch(rule.patterns)
      if (hit) flags.push(buildFlag(rule, hit))
    }
  }

  // 5. Follow-up questions in the note's language (P0-5: dynamic + context-aware).
  const followUpQuestions: FollowUpQuestion[] = buildFollowUpQuestions({
    language: code,
    displayText: safeText,
    urgencyFlags: flags as UrgencyFlag[],
    missingInformation,
  })

  // 5b. Attach extraction confidence to the produced items + the note aggregate (P2-14).
  const lang = code as 'en' | 'hi' | 'or'
  const flagScores = flags.map((flag) =>
    computeUrgencyConfidence({
      flag,
      sentence: flag.originalText,
      viaLatin: !safeText.includes(flag.matchedText),
      corroborated: flags.length >= 2,
    }),
  )
  flags.forEach((flag, i) => {
    flag.confidenceScore = flagScores[i]
  })
  const missingScore = computeMissingInfoConfidence({
    patternCount: 1,
    narrativeLength: safeText.length,
    language: lang,
  })
  for (const item of missingInformation) item.confidenceScore = missingScore
  const aggregateConfidence = computeTriageNoteConfidence({
    urgency: flagScores.length > 0 ? Math.min(...flagScores.map((sc) => sc.value)) : 1,
    missing: missingInformation.length > 0 ? missingScore.value : 1,
    labs: 1,
    vitals: 1,
    timeline: 1,
    language: lang,
  })

  const observations = sentences.slice(0, 6)
  const vitalsMatch = safeText.match(/\b(?:bp|बीपी|blood pressure|ब्लड प्रेशर|nadi|नाड़ी)\s*[:=]?\s*\d{2,3}\s*\/\s*\d{2,3}\b/i)
    ?? getLatinForm(safeText, code, detected.script).match(/\b(?:bp|blood pressure|temp(?:erature)?|pulse|spo2)\s*[:=]?\s*\d{2,3}(?:\s*\/\s*\d{2,3})?\b/i)
    ?? safeText.match(/\b(?:bp|blood pressure|temperature|pulse|spo2)\s*[:=]?\s*\d{2,3}(?:\s*\/\s*\d{2,3})?\b/i)

  const riskScore: TriageNote['riskScore'] = flags.some((f) => f.severity === 'red')
    ? 'High'
    : flags.some((f) => f.severity === 'amber')
      ? 'Medium'
      : 'Low'

  const note: TriageNote = {
    structuredNote: {
      chiefComplaint: `${ruleSet.sectionLabels.chiefComplaint}: ${sentences[0]?.slice(0, 160) || NO_NARRATIVE[code]}`,
      history: `${ruleSet.sectionLabels.history}: ${sentences.slice(0, 4).join(' ') || NO_NARRATIVE[code]}`,
      vitals: vitalsMatch ? `${ruleSet.sectionLabels.vitals}: ${vitalsMatch[0]}` : `${ruleSet.sectionLabels.vitals}: ${NO_VITALS[code]}`,
    },
    observations,
    urgencyFlags: flags as UrgencyFlag[],
    missingInformation,
    followUpQuestions,
    riskScore,
    status: 'ai-draft',
    language: code as 'en' | 'hi' | 'or',
    aggregateConfidence,
    generatedAt: new Date().toISOString(),
    disclaimer: ruleSet.disclaimer,
  }

  return { note, anonymization: anonymized.report, detectedLanguage: detected }
}

/** Convenience alias aligning the service name with the P0-3 pipeline. */
export const analyzeMultilingual = analyzeWithFallback

/** Lightweight passthrough for the /api/language/detect endpoint. */
export function detectLanguage(text: string): DetectedLanguage {
  return detectScriptLanguage(text)
}