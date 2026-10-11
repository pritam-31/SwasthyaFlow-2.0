import type { LayerId, ModelCard, ModelTrainingData } from '../types/modelcard.types'
import { MODEL_CARD_HUMAN_IN_THE_LOOP_STATEMENT, MODEL_CARD_NON_DIAGNOSTIC_STATEMENT } from './nonDiagnostic'

/**
 * Default model-card catalogue (P2-13). Fixed text so seeding is idempotent and
 * the committed catalogue is reviewable. Every string here passes
 * `enforceNonDiagnostic` (see the seed test).
 */

/** Verbatim out-of-scope statement required on every card. */
export const OUT_OF_SCOPE_USE_STATEMENT =
  'This layer is a decision-support aid only. It MUST NOT be used for diagnosis, prescription or ' +
  'treatment planning. It MUST NOT perform triage category assignment per clinical protocol, and it ' +
  'MUST NOT act as a replacement of clinician judgment.'

/** Fixed timestamp so seeding is deterministic. */
export const SEED_TIMESTAMP = '2026-10-10T00:00:00.000Z'

interface SeedCardSpec {
  layerId: LayerId
  name: string
  summary: string
  description: string
  intendedUse: string
  risks: string[]
  intendedUsers: string[]
  trainingData: ModelTrainingData
}

const SEED_CARDS: SeedCardSpec[] = [
  {
    layerId: 'triage-engine',
    name: 'Triage Intake Engine',
    summary:
      'Extracts observations, symptoms and vitals from free-text intake notes and raises urgency signals for clinician review.',
    description:
      'A rule-assisted intake engine. It normalises the intake note, surfaces structured observations (chief complaint, history, vitals) and applies the urgency rule set. Output is a set of signals and missing-information prompts, never a conclusion.',
    intendedUse: 'Supports intake staff by structuring a free-text note and highlighting possible urgency signals for a clinician to verify.',
    risks: [
      'Urgency signals can be missed when the intake note is very short or ambiguous.',
      'Simple keyword rules can be confused by negation such as "no chest pain".',
      'Dense clinical shorthand varies between facilities and may not be recognised.',
    ],
    intendedUsers: ['registered nurses', 'doctors', 'facility administrators'],
    trainingData: {
      description: 'Rule-driven engine calibrated against a synthetic intake corpus.',
      volume: '900 synthetic triage cases across en/hi/or',
      syntheticOnly: true,
      languages: ['en', 'hi', 'or'],
      modalities: ['text', 'voice-transcript'],
    },
  },
  {
    layerId: 'multilingual-rules',
    name: 'Multilingual Clinical Language Rules',
    summary: 'Language-specific rule packs that map English, Hindi and Odia phrasing to the same clinical observations.',
    description:
      'Each rule pack lists the surface forms of symptoms and vitals in its language. The engine matches the note against the pack for its detected language and emits the shared observation codes.',
    intendedUse: 'Lets intake staff record notes in English, Hindi or Odia and still receive consistent structured observations.',
    risks: [
      'Odia and Hindi coverage is thinner than English and may miss colloquial phrasings.',
      'Word-order differences can separate a symptom from its qualifier.',
      'Transliterated terms written in Latin script are only partially matched.',
    ],
    intendedUsers: ['registered nurses', 'doctors', 'facility administrators'],
    trainingData: {
      description: 'Hand-authored rule packs, one per supported language.',
      volume: '900 synthetic triage cases across en/hi/or',
      syntheticOnly: true,
      languages: ['en', 'hi', 'or'],
      modalities: ['text', 'voice-transcript'],
    },
  },
  {
    layerId: 'report-parser',
    name: 'Report & Document Parser',
    summary: 'Reads uploaded lab reports and PDFs and extracts labelled numeric findings.',
    description:
      'The parser separates text from layout, identifies label/number/unit triples and normalises them. Unrecognised sections are surfaced for manual review rather than guessed.',
    intendedUse: 'Reduces transcription effort when staff attach a lab report to a case.',
    risks: [
      'Multi-column PDFs can interleave unrelated values.',
      'OCR can misread ranges and decimal separators.',
      'Unusual units may not be normalised correctly.',
    ],
    intendedUsers: ['registered nurses', 'doctors'],
    trainingData: {
      description: 'Sample reports with synthetic values and labels.',
      volume: '180 synthetic report samples',
      syntheticOnly: true,
      languages: ['en'],
      modalities: ['report'],
    },
  },
  {
    layerId: 'visual-feature-service',
    name: 'Visual Feature Service',
    summary: 'Describes non-clinical features of an uploaded image and flags likely document regions for review.',
    description:
      'The service detects text regions and reports image quality such as blur and lighting. It does not interpret clinical content of the image.',
    intendedUse: 'Helps staff confirm that an uploaded image is legible and contains the expected document before attaching it to a case.',
    risks: [
      'Low-light or skewed photos reduce region-detection accuracy.',
      'Non-document photos can be misclassified as reports.',
      'Face and name-plate heuristics can over-redact in busy scenes.',
    ],
    intendedUsers: ['registered nurses', 'doctors'],
    trainingData: {
      description: 'Synthetic images of documents and labels at varied quality.',
      volume: '180 synthetic visual samples',
      syntheticOnly: true,
      languages: ['en'],
      modalities: ['visual'],
    },
  },
  {
    layerId: 'timeline-extractor',
    name: 'Timeline & Temporal Extractor',
    summary: 'Orders events from a case into a chronological timeline and marks uncertain times.',
    description:
      'The extractor links symptom and care mentions to relative or absolute times. Statements without an anchor are kept with an uncertainty mark instead of being dropped.',
    intendedUse: 'Gives a reviewing clinician a quick chronological view of how a case evolved.',
    risks: [
      'Relative times without a reference point are placed approximately.',
      'Overlapping windows can produce duplicate timeline entries.',
      'Multiple sources may describe the same event twice.',
    ],
    intendedUsers: ['doctors', 'registered nurses'],
    trainingData: {
      description: 'Synthetic case narratives with explicit and relative timestamps.',
      volume: '180 synthetic timeline samples',
      syntheticOnly: true,
      languages: ['en', 'hi', 'or'],
      modalities: ['text', 'voice-transcript'],
    },
  },
  {
    layerId: 'follow-up-generator',
    name: 'Follow-up Question Generator',
    summary: 'Suggests follow-up questions that fill the gaps left by an intake note.',
    description:
      'Based on the missing-information list, the generator proposes short, non-leading questions for the intake worker to ask. Suggested questions can be edited, skipped or ignored.',
    intendedUse: 'Helps intake staff ask consistent, clinically relevant follow-up questions.',
    risks: [
      'The same concern can be asked twice if it was already answered.',
      'Odia phrasing is less fluent than English.',
      'Non-leading wording is not guaranteed for every template.',
    ],
    intendedUsers: ['registered nurses', 'doctors'],
    trainingData: {
      description: 'Synthetic intake notes paired with missing-information gaps.',
      volume: '180 synthetic follow-up samples',
      syntheticOnly: true,
      languages: ['en', 'hi', 'or'],
      modalities: ['text'],
    },
  },
  {
    layerId: 'anonymiser',
    name: 'Unified Anonymisation Pipeline',
    summary: 'Removes names, phone numbers and other identifiers from every modality before storage.',
    description:
      'One pipeline detects identifiers across text, transcripts, OCR and images and replaces them with typed placeholders in the note language. Clinical content is preserved.',
    intendedUse: 'Protects patient and staff identity across intake, reports, visuals, timelines and logs.',
    risks: [
      'Identifiers split across lines can escape detection.',
      'Names that are also common words can be over-redacted.',
      'Image face heuristics are conservative and may miss partial faces.',
    ],
    intendedUsers: ['all platform users'],
    trainingData: {
      description: 'Synthetic identifier corpus covering every text modality and language.',
      volume: '180 synthetic anonymiser samples plus the built-in leak corpus',
      syntheticOnly: true,
      languages: ['en', 'hi', 'or'],
      modalities: ['text', 'voice-transcript', 'report', 'visual'],
    },
  },
  {
    layerId: 'priority-scoring',
    name: 'Priority Scoring Engine',
    summary: 'Combines urgency signals, vitals and wait time into a queue priority for staff to review.',
    description:
      'The engine produces a relative priority and explains the factors that raised or lowered it. Missing vitals reduce the confidence shown to the reviewer.',
    intendedUse: 'Helps a facility order its work queue; the queue order is always adjustable by staff.',
    risks: [
      'Missing vitals can lower a priority below its true urgency.',
      'A long wait time can dominate the clinical signals.',
      'Scoring thresholds are calibrated per facility and may need tuning.',
    ],
    intendedUsers: ['registered nurses', 'doctors', 'facility administrators'],
    trainingData: {
      description: 'Synthetic cases with urgency signals, vitals and wait times.',
      volume: '180 synthetic priority samples',
      syntheticOnly: true,
      languages: ['en', 'hi', 'or'],
      modalities: ['text', 'report', 'visual'],
    },
  },
]

/** Builds the default cards (deterministic; used by the seed service and tests). */
export function buildSeedModelCards(): ModelCard[] {
  return SEED_CARDS.map((spec) => ({
    cardId: spec.layerId,
    layerId: spec.layerId,
    name: spec.name,
    modelVersion: '1.0.0',
    summary: spec.summary,
    description: spec.description,
    intendedUse: spec.intendedUse,
    outOfScopeUse: OUT_OF_SCOPE_USE_STATEMENT,
    nonDiagnosticStatement: MODEL_CARD_NON_DIAGNOSTIC_STATEMENT,
    humanInTheLoopStatement: MODEL_CARD_HUMAN_IN_THE_LOOP_STATEMENT,
    trainingData: spec.trainingData,
    intendedUsers: spec.intendedUsers,
    risksAndLimitations: spec.risks,
    versionHistory: [{ version: '1.0.0', date: SEED_TIMESTAMP, changelog: 'Initial published model card.' }],
    status: 'active',
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
    updatedBy: 'system',
  }))
}
