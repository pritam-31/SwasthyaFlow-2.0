import type {
  MissingInfoItem,
  SupportedLanguage,
  TimelineEventDraft,
  TimelineEventType,
  TimelineSource,
  UrgencyFlag,
} from '../types'
import { getRuleSetForText } from './rules/ruleRegistry'
import { parseTimeExpression } from './timeExpressionParser'
import { computeTimelineEventConfidence } from './confidenceService'

/**
 * Narrative → timeline draft extraction (P0-4).
 *
 * Turns free text into anonymised, time-anchored event drafts. The pass never
 * interprets the text clinically: it only groups *what the patient said* with
 * *when they said it happened*, keeps the sentences verbatim, and lets the
 * sorter order them. A sentence with no readable time is only kept when it
 * still talks about a symptom (so we never silently drop the complaint), and
 * it is then marked `precision: 'unknown'` — never given a guessed date.
 */

export interface TimelineExtractionOptions {
  /** Original text (typically the anonymised narrative already on disk). */
  text: string
  /** Extra anonymisation pass results — used when the caller re-ran it. */
  anonymizedText?: string
  language: SupportedLanguage
  source: TimelineSource
  sourceRef: string
  /** Intake reference timestamp for relative expressions. */
  referenceIso?: string
  urgencyFlags?: UrgencyFlag[]
  missingInfoItems?: MissingInfoItem[]
}

/** RegExp#test is stateful with a /g flag — clone without it. */
function tests(pattern: RegExp, text: string): boolean {
  const flags = pattern.flags.replace(/g/g, '')
  try {
    return new RegExp(pattern.source, flags).test(text)
  } catch {
    return false
  }
}

function hasClinicalSignal(text: string, language: SupportedLanguage): boolean {
  const ruleSet = getRuleSetForText(text, language)
  if (ruleSet.urgencyRules.some((r) => r.patterns.some((p) => tests(p, text)))) return true
  if (ruleSet.missingInfoChecks.some((c) => c.patterns.some((p) => tests(p, text)))) return true
  return /(pain|ache|fever|sick|disease|weak|durbal|bukha|rhe|दर्द|बुखार|बीमार|दुर्बल|ଯନ୍ତ୍ରଣା|ଜ୍ୱର|ଅସୁସ୍ଥ|ଦୁର୍ବଳ)/i.test(text)
}

const ONSET =
  /(started|began|begun|since)\b|(shuru|arambh|aarabha)\b|(शुरू|आरंभ|ଆରମ୍ଭ|ଆରମ୍ଭ)/

const CHANGE =
  /(worse|worsen|better|improved|increased|reduced)\b|(kam|badh|badhta|ghat)|(बढ़|घट|कम|बेहतर|ବଢ଼|କମ|ଭଲ)/

const PAST =
  /(earlier|previously|previous|last|past|admitted|admission|hospital|operat|surgery|injur|treatment)\b|(pahle|pehle|purbe)\b|(इलाज|भर्ती|पहले|चिकित्सा|ପୂର୍ବେ|ଚିକିତ୍ସା)/

const CURRENT =
  /(now|currently|today)\b|(aaj|aaji|abhi|eibe|aja)\b|(आज|अभी|ଆଜି)/

export function classifyEventType(sentence: string, first = false): TimelineEventType {
  if (CHANGE.test(sentence)) return 'symptom-change'
  if (ONSET.test(sentence)) return 'symptom-onset'
  if (PAST.test(sentence)) return 'past-medical-event'
  if (CURRENT.test(sentence) || first) return 'current-state'
  return 'other'
}

function splitIntoSentences(content: string): string[] {
  return content
    .replace(/\r\n/g, '\n')
    .split(/[।!?\n]+|\.\s+|\.(?=$)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

/** Urgency flags whose rule fired against this sentence. */
function flagsFor(sentence: string, language: SupportedLanguage, flags: UrgencyFlag[]): string[] {
  const ruleSet = getRuleSetForText(sentence, language)
  if (flags.length === 0 || ruleSet.urgencyRules.length === 0) return []
  return flags
    .filter((flag) => ruleSet.urgencyRules.some((rule) => rule.id === flag.ruleId && rule.patterns.some((p) => tests(p, sentence))))
    .map((flag) => flag.id)
}

/** Missing-info items whose field label mentions a keyword present in the sentence. */
function missingFor(sentence: string, items: MissingInfoItem[]): string[] {
  if (items.length === 0) return []
  const keywords = /(vital|bp|pulse|temperature|spo2|duration|timeline|day|week|medicat|allerg|history|past|dose|दिन|सप्ताह|औषधि|ଦିନ|ସପ୍ତାହ)/i
  if (!keywords.test(sentence)) return []
  return items.map((item) => item.id)
}

export function extractTimelineEvents(options: TimelineExtractionOptions): TimelineEventDraft[] {
  const content = options.anonymizedText ?? options.text
  if (!content || content.trim().length === 0) return []

  const sentences = splitIntoSentences(content)
  const drafts: TimelineEventDraft[] = []

  sentences.forEach((sentence, index) => {
    const parsed = parseTimeExpression(sentence, options.language, options.referenceIso)
    const eventType = classifyEventType(sentence, index === 0)

    let confidence: number
    let normalizedTime = null
    let timePrecision: TimelineEventDraft['timePrecision'] = 'unknown'
    let timeExpression = ''

    if (parsed) {
      confidence = parsed.precision === 'exact' ? 0.9 : 0.7
      normalizedTime = parsed.normalized
      timePrecision = parsed.precision
      timeExpression = parsed.raw
    } else if (hasClinicalSignal(sentence, options.language)) {
      // Keep the complaint, but stay honest: we do not know *when*.
      confidence = 0.4
      normalizedTime = null
      timePrecision = 'unknown'
      timeExpression = ''
    } else {
      return
    }

    drafts.push({
      timeExpression,
      normalizedTime,
      timePrecision,
      eventText: sentence,
      eventTextLanguage: options.language,
      eventType,
      source: options.source,
      sourceRef: options.sourceRef,
      confidence,
      confidenceScore: computeTimelineEventConfidence({ timePrecision, eventText: sentence }, options.language),
      relatedUrgencyFlagIds: flagsFor(sentence, options.language, options.urgencyFlags ?? []),
      relatedMissingInfoIds: missingFor(sentence, options.missingInfoItems ?? []),
    })
  })

  return drafts
}