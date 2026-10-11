import type { AnonymizationReport, Redaction, RedactionCategory } from '../types'
import { anonymiseText, toLegacyAnonymizationReport } from './unifiedAnonymizer'

/**
 * Strips PII from free text before anything reaches the analysis layer.
 * Prototype regex rules — the real system would use a proper NER pipeline.
 *
 * The same rules run over intake narratives and over OCR output from uploaded
 * reports (P0-1), so the report parser never sees a name, an identifier or the
 * reporting facility. OCR text is noisier than typed text: separators around
 * `:`/`-` are optional, spacing is flexible and names may be in Devanagari or
 * Oriya script. Marker/value pairs never span lines, so a bare column header
 * such as `Name` cannot swallow the row that follows it.
 *
 * P0-3: the public {@link anonymize} entry point delegates to the language-aware
 * pipeline; {@link anonymizeBase} stays the shared Latin-script rule set.
 */

const REDACTED: Record<RedactionCategory, string> = {
  name: '[NAME REDACTED]',
  phone: '[PHONE REDACTED]',
  'id-number': '[ID REDACTED]',
  email: '[EMAIL REDACTED]',
  address: '[ADDRESS REDACTED]',
  'date-of-birth': '[DOB REDACTED]',
  'hospital-id': '[HOSPITAL ID REDACTED]',
  'patient-id': '[PATIENT ID REDACTED]',
  aadhaar: '[AADHAAR REDACTED]',
  pan: '[PAN REDACTED]',
  'voter-id': '[VOTER ID REDACTED]',
  'ration-card': '[RATION CARD REDACTED]',
  'lab-name': '[LAB REDACTED]',
}

interface Rule {
  category: RedactionCategory
  pattern: RegExp
}

/**
 * Case-insensitive literal built without the `i` flag, so the part of the rule
 * that captures the name itself can stay case-sensitive (`(?i:…)` inline flags
 * are not available on the Node versions this runs on).
 */
function ci(literal: string): string {
  return literal.replace(/[a-z]/g, (ch) => `[${ch}${ch.toUpperCase()}]`).replace(/ /g, '[^\\S\\n]+')
}

/** A single horizontal-whitespace character (no line breaks); pair with `*` or `+`. */
const HS = '[^\\S\\n]'
/** Optional separator around `:` / `-`, same line only. */
const SEP = String.raw`(?:[:-][^\S\n]*|[^\S\n]+)`

/**
 * A name follows a marker. Lowercase first word → take the lowercase run;
 * capitalised first word → take the proper-noun run. Anything else in the
 * sentence (symptoms, durations) is left in place for the analysis layer.
 */
const NAME_CAPTURE = String.raw`(?:[a-z][a-z.'-]*(?:[^\S\n]+[a-z][a-z.'-]+){0,3}|[A-Z][A-Za-z.'-]*(?:[^\S\n]+[A-Z][A-Za-z.'-]+){0,3})`

/** Devanagari (Hindi) and Oriya name runs — exclude the danda so a name can
 * never swallow the next sentence (e.g. an address that follows a full stop). */
const DEVANAGARI_NAME = String.raw`[\u0900-\u0963\u0966-\u097F][\u0900-\u0963\u0966-\u097F .'-]{1,40}`
const ORIYA_NAME = String.raw`[\u0B00-\u0B7F][\u0B00-\u0B7F .'-]{1,40}`
/** Any-script name: Latin, Devanagari or Oriya. */
const ANY_NAME = `(?:${NAME_CAPTURE}|${DEVANAGARI_NAME}|${ORIYA_NAME})`

const TITLE = `\\b(?:${['mr', 'mrs', 'ms', 'miss', 'shri', 'sri', 'smt', 'dr'].map(ci).join('|')})`

/**
 * Report forms also print `Test Name`, `Specimen Name`, `Sample Name`, … — those
 * labels are followed by a measurement, never by a person, so the bare `name`
 * marker is suppressed right after them.
 */
const NOT_A_PERSON_LABEL = `(?<!(?:${['test', 'specimen', 'sample', 'item', 'parameter', 'analyte', 'investigation'].map(ci).join('|')})[^\\S\\n])`

/**
 * An identifier token contains at least one digit (so prose is never eaten) and
 * may continue across spaces: `1234 5678 9012`, `GJ/12/345/6789012`, `MRN 45A3`.
 */
const ID_ATOM = String.raw`(?=[A-Za-z0-9/-]*\d)[A-Za-z0-9/-]+`
const ID_VALUE = String.raw`(?:${ID_ATOM}(?:[^\S\n]+${ID_ATOM})*)`

/**
 * Letterhead-style facility/lab names: "Dr. Lal PathLabs Ltd",
 * "District Hospital", "SCB Medical College". Keywords only — never a bare
 * capitalised run, so test names like "Complete Blood Count" are untouched.
 */
const ORG_KEYWORD = String.raw`(?:PathLabs|(?:[A-Za-z]{2,}[^\S\n]+)?Labs|Laborator(?:y|ies)|Diagnostics|Diagnostic[^\S\n]+Cent(?:re|er)|Pathology|Hospitals?|Medical[^\S\n]+Cent(?:re|er)|Polyclinics?|Health[^\S\n]+Cent(?:re|er))`
const ORG_NAME = String.raw`\b(?:[A-Z][A-Za-z&.'-]*[^\S\n]+){0,4}${ORG_KEYWORD}\b(?:[^\S\n]+(?:Ltd|Limited|Pvt\.?|Inc\.?|LLP))?`

const RULES: Rule[] = [
  // Explicit facility label first, then the letterhead pattern — both before
  // the person-name rules so "Dr. Lal PathLabs" is one organisation, not a doctor.
  {
    category: 'lab-name',
    pattern: new RegExp(
      `\\b(?:${ci('lab name')}|${ci('laboratory name')})${SEP}[^\\n,;]+`,
      'g',
    ),
  },
  { category: 'lab-name', pattern: new RegExp(ORG_NAME, 'g') },
  { category: 'email', pattern: /\b[\w.+-]+@[\w-]+\.[\w.]{2,}\b/g },
  // Aadhaar: keyword first, then a bare 12-digit number — before the phone rule
  // so it is redacted as a whole instead of being split into a partial match.
  {
    category: 'aadhaar',
    pattern: new RegExp(
      `\\b(?:aadhaar|aadhar)${HS}*(?:id|number|no\\.?)?${SEP}?${ID_VALUE}\\b`,
      'gi',
    ),
  },
  { category: 'aadhaar', pattern: /(?<!\d)\d{4}[\s-]?\d{4}[\s-]?\d{4}(?!\d)/g },
  // PAN: keyword (with the AAAAA9999A format) and the bare format.
  {
    category: 'pan',
    pattern: new RegExp(`\\b(?:pan|pan${HS}card)${HS}*(?:no|number|id)?${SEP}?[A-Za-z]{5}\\d{4}[A-Za-z]\\b`, 'gi'),
  },
  { category: 'pan', pattern: /(?<![A-Za-z0-9])[A-Za-z]{5}\d{4}[A-Za-z](?![A-Za-z0-9])/g },
  // Voter identity (EPIC / URN).
  {
    category: 'voter-id',
    pattern: new RegExp(`\\b(?:voter(?:${HS}id)?|epic|urn)${HS}*(?:id|number|no\\.?)?${SEP}?${ID_VALUE}\\b`, 'gi'),
  },
  // Ration card.
  {
    category: 'ration-card',
    pattern: new RegExp(`\\b${ci('ration card')}${HS}*(?:no|number|id)?${SEP}?${ID_VALUE}\\b`, 'gi'),
  },
  // Patient-level ids: ABHA, patient number, health id, OPD number.
  {
    category: 'patient-id',
    pattern: new RegExp(`\\babha${HS}*(?:id|number|no\\.?)?${SEP}?${ID_VALUE}\\b`, 'gi'),
  },
  {
    category: 'patient-id',
    pattern: new RegExp(`\\b(?:patient|health|opd)${HS}*(?:id|no\\.?|number|code|account)${SEP}?${ID_VALUE}\\b`, 'gi'),
  },
  // Facility-level ids: UHID, MRN, hospital/record numbers.
  {
    category: 'hospital-id',
    pattern: new RegExp(
      `\\b(?:uhid|mrn|${ci('hospital id')}|${ci('hospital number')}|${ci('hosp no')}|${ci('file number')})${SEP}?${ID_VALUE}\\b`,
      'gi',
    ),
  },
  // Everything else with an explicit identity marker (passport, licence, …).
  {
    category: 'id-number',
    pattern: new RegExp(
      `\\b(?:passport|${ci('driving licence')}|${ci('driving license')})${HS}*(?:id|number|no\\.?)?${SEP}?${ID_VALUE}\\b`,
      'gi',
    ),
  },
  // Indian mobiles: contiguous, spaced (98765 43210) or dashed, optional +91/0 prefix.
  { category: 'phone', pattern: /(?<!\d)(?:\+?91[\s-]?)?(?:0)?[6-9]\d{4}[\s-]?\d{5}(?!\d)/g },
  { category: 'date-of-birth', pattern: new RegExp(`\\b(?:dob|${ci('date of birth')}|${ci('born on')})[^\\S\\n]*[:-]?[^\\S\\n]*[^\\s,;][^\\n,;]*`, 'gi') },
  {
    category: 'address',
    pattern: new RegExp(
      `\\b(?:address|village|${ci('ward no')}|${ci('ward number')}|street|locality|colony|pincode|${ci('pin code')})${SEP}[^\\n,;]*`,
      'gi',
    ),
  },
  {
    // `name:…`, `Name : …`, `my name is …`, `patient name …` — separator is
    // optional around `:`/`-`, so `name:John Kumar` is redacted too. The name
    // may be Latin, Devanagari or Oriya (report OCR in Hindi/Odia).
    category: 'name',
    pattern: new RegExp(
      `\\b(?:${ci('my name is')}|${ci('i am called')}|${ci('patient name')}|${NOT_A_PERSON_LABEL}${ci('name')})${SEP}${ANY_NAME}`,
      'g',
    ),
  },
  {
    // Hindi/Odia markers printed on regional report forms:
    // `नाम:…`, `रोगी का नाम …`, `ନାମ:…`, `ରୋଗୀର ନାମ …`.
    category: 'name',
    pattern: new RegExp(
      `(?:नाम|रोगी${HS}+का${HS}+नाम|ନାମ|ରୋଗୀର${HS}+ନାମ)${SEP}${ANY_NAME}`,
      'g',
    ),
  },
  {
    // Title-prefixed person names: `Dr. A. Mehta`, `Shri Ramesh Kumar`.
    category: 'name',
    pattern: new RegExp(`${TITLE}\\.?${HS}+${ANY_NAME}`, 'g'),
  },
]

export function anonymizeBase(text: string): { text: string; report: AnonymizationReport } {
  let out = text
  const counts = new Map<RedactionCategory, number>()

  for (const rule of RULES) {
    out = out.replace(rule.pattern, () => {
      counts.set(rule.category, (counts.get(rule.category) ?? 0) + 1)
      return REDACTED[rule.category]
    })
  }

  const redactions: Redaction[] = [...counts.entries()].map(([category, count]) => ({ category, count }))
  return {
    text: out,
    report: { redactedCount: redactions.reduce((sum, r) => sum + r.count, 0), redactions },
  }
}

/**
 * Public entry point. Delegates to the unified anonymisation pipeline (P0-7)
 * for the `intake-text` modality; the legacy return shape is preserved for
 * existing callers. {@link anonymizeBase} stays the shared Latin-script rule set.
 *
 * @deprecated Prefer `runPipeline` / `anonymiseText` from the unified module.
 */
export function anonymize(text: string): { text: string; report: AnonymizationReport } {
  const result = anonymiseText(text, 'intake-text')
  const language = result.matches[0]?.language ?? 'en'
  return { text: result.text, report: toLegacyAnonymizationReport(result.matches, language) }
}
