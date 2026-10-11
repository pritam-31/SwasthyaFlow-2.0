/**
 * Single-source safety disclaimer text and the non-diagnostic guard.
 *
 * Lives in a leaf module so both the rule sets and the analysis service can
 * import it without creating a runtime import cycle.
 */
export const NON_DIAGNOSTIC_DISCLAIMER =
  'This note is prepared by an AI assistant for review by a qualified healthcare worker. ' +
  'It does not diagnose, does not prescribe and does not replace professional medical judgement.'

/**
 * Fixed, system-authored statements stamped onto every model card (P2-13).
 * They are rendered on every card and are never editable through the API.
 */
export const MODEL_CARD_NON_DIAGNOSTIC_STATEMENT =
  'This AI layer produces observations, urgency signals and questions only. It does not diagnose, ' +
  'does not prescribe and does not determine treatment. Its output is a decision-support aid and ' +
  'must never be presented to a patient as a clinical conclusion.'

export const MODEL_CARD_HUMAN_IN_THE_LOOP_STATEMENT =
  'Every output from this layer is reviewed by a qualified healthcare worker before it is acted on. ' +
  'A clinician can override, correct or discard any suggestion. The layer never acts autonomously and ' +
  'never replaces professional medical judgement.'

export interface NonDiagnosticCheck {
  ok: boolean
  /** Offending sentences (already trimmed) that assert a clinical claim. */
  violations: string[]
}

/**
 * Negation markers that exempt a sentence from the non-diagnostic guard. A
 * statement is allowed to *name* diagnosis/prescription as long as it frames it
 * negatively or out of scope (e.g. "does not diagnose", "diagnosis is out of
 * scope", "must not be used for prescription").
 */
const NEGATION = /\b(?:not|no|neither|never|without|avoid|prevents?|excludes?|cannot|can'?t|won'?t|doesn'?t|don'?t|out\s+of\s+scope|forbidden|prohibited|disallowed)\b/i

/**
 * Claim patterns that must never appear in model-card/failure text. Each is an
 * affirmative clinical assertion — negated framing is skipped before testing.
 */
const CLAIM_PATTERNS: RegExp[] = [
  /\bdiagnos(?:es|ing|ed|e)\b/i,
  /\bprescrib(?:es|ing|ed|able)\b/i,
  /\b(?:provide|provides|provide?d|give|gives|give?n|deliver\w*|issue\w*|return\w*|offer\w*|make|makes)\b[^.!?\n]{0,80}\b(?:diagnos\w*|prescription\w*|treatment\s+plan\w*)\b/i,
  /\b(?:recommend\w*|advise\w*|suggest\w*|indicate\w*)\b[^.!?\n]{0,80}\b(?:medication\w*|medicine|drug\w*|antibiotic\w*|dose\w*|dosage|treatment\w*|therapy|prescription\w*)\b/i,
  /\b(?:treatment\s+plan\w*|plans?\s+(?:of\s+)?treatment|course\s+of\s+(?:treatment|therapy|medication\w*|antibiotic\w*))\b/i,
  /\b(?:cure|cures|cured|heals?|healed)\b/i,
  /\b(?:take|administer|start|begin|commence)\b[^.!?\n]{0,40}\b\d+\s*(?:mg|ml|\bg\b|mcg|tablet\w*|capsule\w*|dose\w*|units?)\b/i,
  /\bshould\s+(?:be\s+)?(?:treated|managed|prescribed|medicated)\b/i,
  /\bthis\s+(?:tool|model|system|engine|assistant|layer)\b[^.!?\n]{0,80}\b(?:treats?|manages?|decides?|determines?)\s+(?:the\s+)?(?:patient|treatment|diagnosis)\b/i,
]

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?।])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0)
}

/**
 * Rejects affirmative clinical claims (diagnosis, prescription, treatment
 * planning, dosing, cures) in a text field. Negated/out-of-scope framing is
 * permitted so cards can still document what a layer must NOT do.
 */
export function enforceNonDiagnostic(text: string): NonDiagnosticCheck {
  const violations: string[] = []
  for (const sentence of splitSentences(text)) {
    if (NEGATION.test(sentence)) continue
    if (CLAIM_PATTERNS.some((pattern) => pattern.test(sentence))) violations.push(sentence)
  }
  return { ok: violations.length === 0, violations }
}

/** Thrown-message helper: a short, non-repeating suggestion for the client. */
export function nonDiagnosticGuidance(violations: string[]): string {
  const sample = violations[0]?.slice(0, 160) ?? 'a clinical claim'
  return (
    `Non-diagnostic violation: "${sample}". ` +
    'Describe what the layer observes or flags; do not state, recommend or plan diagnosis, ' +
    'prescription, dosing or treatment. Use negated/out-of-scope wording when listing what is not permitted.'
  )
}