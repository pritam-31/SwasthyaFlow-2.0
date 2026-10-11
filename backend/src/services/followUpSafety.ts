/**
 * Follow-up text safety (P0-5).
 *
 * Follow-up questions and answers must obey two rules, mirrored on the
 * frontend (src/services/safetyPolicy.ts):
 *  1. Never request personal identifiers — the system only ever stores the
 *     anonymized surrogate patient id.
 *  2. Never diagnose / prescribe / recommend treatment — same non-diagnostic
 *     guard the timeline uses, applied to human-entered follow-up text.
 */

import { assertTimelineTextSafe } from './timelineBuilder'

/** RegExp#test is stateful with a /g flag — clone without it. */
function tests(pattern: RegExp, text: string): boolean {
  const flags = pattern.flags.replace(/g/g, '')
  try {
    return new RegExp(pattern.source, flags).test(text)
  } catch {
    return false
  }
}
interface PiiRequestRule {
  label: string
  pattern: RegExp
}

const PII_REQUEST_RULES: PiiRequestRule[] = [
  // English
  { label: 'patient name', pattern: /\b(?:what is (?:the )?patient'?s name|patient'?s name|the name of the patient|your name|full name)\b/i },
  // Devanagari (Hindi)
  { label: 'नाम (name)', pattern: /(?:रोगी का नाम|मरीज का नाम|आपका नाम|पूरा नाम)/ },
  // Odia script
  { label: 'ନାମ (name)', pattern: /(?:ରୋଗୀଙ୍କ ନାମ|ତୁମ ନାମ|ପୂରା ନାମ)/ },
  // Romanised (Hinglish / Odlish)
  { label: 'naam (name)', pattern: /\b(?:naam kya|aapka naam|apna naam|marij ka naam|pura naam|patient ka naam)\b/i },
  // Phone / contact
  { label: 'phone number', pattern: /\b(?:phone number|mobile number|contact number|mobile no\.?|phone no\.?|mobile number kya)\b/i },
  // Devanagari phone
  { label: 'फ़ोन नंबर', pattern: /(?:फ़ोन नंबर|फोन नंबर|मोबाइल नंबर|मोबाइल नंम्बर)/ },
  // Odia phone
  { label: 'ଫୋନ ନମ୍ବର', pattern: /(?:ଫୋନ ନମ୍ବର|ମୋବାଇଲ ନମ୍ବର)/ },
  // Identity numbers
  { label: 'identity number', pattern: /\b(?:aadhaar|aadhar|pan card|voter id|ration card)\b/i },
  { label: 'आधार', pattern: /(?:आधार)/ },
  { label: 'ଆଧାର', pattern: /(?:ଆଧାର)/ },
  // Address
  { label: 'address', pattern: /\b(?:home address|residential address|full address|your address)\b/i },
  { label: 'पता', pattern: /(?:घर का पता|आपका पता|पूरा पता)/ },
  { label: 'ଠିକଣା', pattern: /(?:ଘର ଠିକଣା|ପୂରା ଠିକଣା)/ },
  // Date of birth
  { label: 'date of birth', pattern: /\b(?:date of birth|d\.?o\.?b\.?|birth date)\b/i },
  { label: 'जन्म तिथि', pattern: /(?:जन्म तिथि|जन्मदिन)/ },
  { label: 'ଜନ୍ମ', pattern: /(?:ଜନ୍ମ ତାରିଖ|ଜନ୍ମଦିନ)/ },
]

/** Returns the labels of any personal-identifier request found in `text`. */
export function findPiiRequestLanguage(text: string): string[] {
  const hits: string[] = []
  for (const rule of PII_REQUEST_RULES) {
    if (tests(rule.pattern, text)) hits.push(rule.label)
  }
  return hits
}

/**
 * Guard for human-entered follow-up QUESTION text. Blocks personal-identifier
 * requests and diagnostic / prescription phrasing.
 */
export function assertFollowUpTextSafe(text: string): { error: string; suggestion: string } | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  const nonDiagnostic = assertNonDiagnosticGuard(trimmed)
  if (nonDiagnostic) return nonDiagnostic

  const pii = findPiiRequestLanguage(trimmed)
  if (pii.length > 0) {
    return {
      error: 'Follow-up text would request personal identifiers.',
      suggestion:
        `Never ask for or record identifying details (${pii.join(', ')}). ` +
        'Identify the patient by their anonymized id (PT-XXXX), never by name, phone, address or date of birth.',
    }
  }

  return null
}

/**
 * Guard for recorded ANSWERS. Answers are kept verbatim, so PII is handled by
 * the anonymizer (silently stripped); this guard only blocks diagnostic or
 * prescription phrasing so the stored note never contains diagnosis language.
 */
export function assertFollowUpAnswerSafe(text: string): { error: string; suggestion: string } | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  return assertNonDiagnosticGuard(trimmed)
}

function assertNonDiagnosticGuard(text: string): { error: string; suggestion: string } | null {
  const nonDiagnostic = assertTimelineTextSafe(text)
  if (nonDiagnostic) {
    return {
      error: nonDiagnostic.error === 'Timeline text matches a non-diagnostic safeguard.'
        ? 'Follow-up text matches a non-diagnostic safeguard.'
        : nonDiagnostic.error,
      suggestion:
        'Keep the patient\u2019s report as they told it — the follow-up records what the patient says; it never diagnoses, prescribes or recommends treatment.',
    }
  }
  return null
}