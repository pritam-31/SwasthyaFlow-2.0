import type { FailureMode, LayerId } from '../types/modelcard.types'
import { SEED_TIMESTAMP } from './modelCardSeed'

/**
 * Default failure-mode catalogue (P2-13): 17 known failure modes across the
 * eight layers. Fixed text so seeding is idempotent; every string passes
 * `enforceNonDiagnostic`.
 */

interface SeedFailureSpec {
  failureId: string
  layerId: LayerId
  title: string
  description: string
  triggerExample: string
  impact: FailureMode['impact']
  likelihood: FailureMode['likelihood']
  status: FailureMode['status']
  mitigation: string
}

const SEED_FAILURES: SeedFailureSpec[] = [
  {
    failureId: 'FM-001',
    layerId: 'triage-engine',
    title: 'Negated severity phrases trigger urgency rules',
    description:
      'A negated phrase such as denying a symptom can still match the keyword rule that raises the associated urgency signal.',
    triggerExample: 'Intake note reads "no chest pain", yet the acute-chest-pain signal is raised.',
    impact: 'high',
    likelihood: 'common',
    status: 'mitigated',
    mitigation: 'Negation windows are checked ahead of keyword rules for severity terms; unmatched cases are surfaced with a verify-negation prompt.',
  },
  {
    failureId: 'FM-002',
    layerId: 'triage-engine',
    title: 'Sarcasm and hypotheticals read literally',
    description: 'A note that quotes a patient joking or describing a hypothetical is scored as if the symptom were reported.',
    triggerExample: 'Note reads "as if I were having a seizure, haha", and the seizure signal is raised.',
    impact: 'medium',
    likelihood: 'rare',
    status: 'open',
    mitigation: 'Quoted and hypothetical clauses are flagged for reviewer confirmation before signals are shown as active.',
  },
  {
    failureId: 'FM-003',
    layerId: 'multilingual-rules',
    title: 'Hindi/Odia word order splits symptom and qualifier',
    description:
      'Adjective/noun ordering in Hindi and Odia can place a severity qualifier away from the symptom keyword, so the rule pack misses the combined observation.',
    triggerExample: 'Odia phrasing places the modifier before the noun and the matched symptom loses its severity qualifier.',
    impact: 'high',
    likelihood: 'uncommon',
    status: 'mitigated',
    mitigation: 'Rule packs include both orderings; a proximity window links qualifiers to the nearest symptom.',
  },
  {
    failureId: 'FM-004',
    layerId: 'multilingual-rules',
    title: 'Devanagari full stop is not treated as a sentence boundary',
    description: 'The Devanagari danda is not always recognised, so separate statements can be merged into one clause.',
    triggerExample: 'Two sentences separated by the danda are read as one, merging a vitals list with the next complaint.',
    impact: 'medium',
    likelihood: 'uncommon',
    status: 'mitigated',
    mitigation: 'The normaliser splits on both the Latin full stop and the Devanagari danda before rule matching.',
  },
  {
    failureId: 'FM-005',
    layerId: 'report-parser',
    title: 'OCR mangles numeric ranges',
    description:
      'A blood-pressure style range can be read without its separator or with stray zeros, producing a value that no rule recognises.',
    triggerExample: 'A reading printed as "120 / 80" is captured as a single malformed token.',
    impact: 'high',
    likelihood: 'uncommon',
    status: 'open',
    mitigation: 'Range patterns are re-joined after OCR; values that fail range validation are surfaced for manual entry.',
  },
  {
    failureId: 'FM-006',
    layerId: 'report-parser',
    title: 'Unit spelling variations break normalisation',
    description: 'Equivalent unit spellings and case differences are not always normalised, so a numeric finding is attached to the wrong unit.',
    triggerExample: 'A result labelled with a mixed-case unit is normalised differently from the canonical form.',
    impact: 'medium',
    likelihood: 'common',
    status: 'mitigated',
    mitigation: 'A unit alias table is applied case-insensitively before findings are stored.',
  },
  {
    failureId: 'FM-007',
    layerId: 'report-parser',
    title: 'Multi-column PDFs interleave values',
    description: 'Text extraction can read across columns instead of down them, mixing unrelated labels and values.',
    triggerExample: 'A two-column table is read row-by-row across both columns, pairing the wrong label and value.',
    impact: 'high',
    likelihood: 'uncommon',
    status: 'open',
    mitigation: 'Column detection is attempted before extraction; files that fail the layout check are flagged for manual review.',
  },
  {
    failureId: 'FM-008',
    layerId: 'visual-feature-service',
    title: 'Non-document photos misclassified as reports',
    description: 'Images without a document (packaging, scenery) can be classified as a report page, wasting reviewer time.',
    triggerExample: 'A photo of a medicine box is classified as a report page.',
    impact: 'low',
    likelihood: 'uncommon',
    status: 'mitigated',
    mitigation: 'A document-likeness score gates classification; low-scoring images are marked not-a-document.',
  },
  {
    failureId: 'FM-009',
    layerId: 'visual-feature-service',
    title: 'Low-light photos reduce detection accuracy',
    description: 'Dim or blurred photos lower text-region detection and can over-trigger the face heuristic.',
    triggerExample: 'A dim photo of a form is reported as mostly unreadable with several over-redacted regions.',
    impact: 'medium',
    likelihood: 'common',
    status: 'open',
    mitigation: 'Image quality is reported alongside results and staff are prompted to re-capture when quality is low.',
  },
  {
    failureId: 'FM-010',
    layerId: 'timeline-extractor',
    title: 'Relative times lack a reference point',
    description: 'Statements such as a relative time of day have no anchor and are placed relative to the session rather than the reported onset.',
    triggerExample: 'An onset described only as a relative time is placed at the session timestamp.',
    impact: 'medium',
    likelihood: 'common',
    status: 'accepted',
    mitigation: 'Relative times are marked uncertain and the reviewer is prompted to confirm the anchor.',
  },
  {
    failureId: 'FM-011',
    layerId: 'timeline-extractor',
    title: 'Overlapping windows create duplicate events',
    description: 'Two statements describing the same interval can be extracted as separate events with overlapping windows.',
    triggerExample: 'Onset and worsening described in one sentence produce two overlapping timeline entries.',
    impact: 'low',
    likelihood: 'common',
    status: 'mitigated',
    mitigation: 'Overlapping events from the same source are merged and marked as one interval.',
  },
  {
    failureId: 'FM-012',
    layerId: 'follow-up-generator',
    title: 'Follow-up repeats an answered concern',
    description: 'A concern already answered on the intake form can be suggested again because the answer is not linked to the gap.',
    triggerExample: 'A question about fever duration is suggested although the intake note already states it.',
    impact: 'low',
    likelihood: 'common',
    status: 'mitigated',
    mitigation: 'Answered gaps are recorded so the generator filters them out before suggesting a question.',
  },
  {
    failureId: 'FM-013',
    layerId: 'anonymiser',
    title: 'Names that are common words are over-redacted',
    description: 'A person whose name is also a common word can cause the word to be redacted in sentences where it is not a name.',
    triggerExample: 'A sentence using a common word that is also a patient name loses that word to redaction.',
    impact: 'medium',
    likelihood: 'uncommon',
    status: 'accepted',
    mitigation: 'Common-word names use context cues; borderline matches are reported as warnings for reviewer review.',
  },
  {
    failureId: 'FM-014',
    layerId: 'anonymiser',
    title: 'Transliterated names matched partially',
    description: 'Hindi or Odia names written in Latin script are sometimes only partially matched, leaving part of the name in place.',
    triggerExample: 'A two-part transliterated name has only its second part redacted.',
    impact: 'high',
    likelihood: 'uncommon',
    status: 'mitigated',
    mitigation: 'Adjacent-name heuristics redact the full name span when a partial match is found near a name context.',
  },
  {
    failureId: 'FM-015',
    layerId: 'anonymiser',
    title: 'Phone numbers split across OCR lines escape detection',
    description: 'An identifier broken across an OCR line break can evade the pattern that needs the number in one run.',
    triggerExample: 'A phone number split after five digits leaves both halves unredacted.',
    impact: 'high',
    likelihood: 'uncommon',
    status: 'open',
    mitigation: 'OCR lines from the same block are re-joined before pattern matching; split-token warnings are raised.',
  },
  {
    failureId: 'FM-016',
    layerId: 'priority-scoring',
    title: 'Missing vitals lower a priority below its urgency',
    description: 'When vitals are absent the score loses confidence, which can rank a genuinely urgent case below cases with complete vitals.',
    triggerExample: 'A case with strong symptoms but no vitals is ranked below cases with routine vitals.',
    impact: 'high',
    likelihood: 'common',
    status: 'mitigated',
    mitigation: 'Missing vitals are treated as an uncertain factor that raises the review priority and flags the gap.',
  },
  {
    failureId: 'FM-017',
    layerId: 'priority-scoring',
    title: 'Wait time can dominate clinical signals',
    description: 'A long wait time can outweigh clinical signals and move a case up or down the queue more than its observations warrant.',
    triggerExample: 'A case with mild signals but a long wait is ranked above a case with stronger signals.',
    impact: 'medium',
    likelihood: 'uncommon',
    status: 'open',
    mitigation: 'Wait time is capped as a factor and its contribution is shown separately so staff can see the split.',
  },
]

/** Builds the default failure-mode catalogue (deterministic). */
export function buildSeedFailureModes(): FailureMode[] {
  return SEED_FAILURES.map((spec) => ({
    failureId: spec.failureId,
    layerId: spec.layerId,
    title: spec.title,
    description: spec.description,
    triggerExample: spec.triggerExample,
    impact: spec.impact,
    likelihood: spec.likelihood,
    status: spec.status,
    mitigation: spec.mitigation,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
    updatedBy: 'system',
  }))
}
