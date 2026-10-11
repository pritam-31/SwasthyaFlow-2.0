import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import type { BiasSliceDimension, LayerId } from '../../types/modelcard.types'
import { BIAS_SLICE_VALUES } from '../../types/modelcard.types'
import type { SupportedLanguage } from '../../types/language.types'
import type { DatasetRecord, LayerSample } from '../dataset.types'
import { datasetDir, datasetFilePath } from '../paths'
import { DATASET_SEED, DATASET_VERSION, GENERATOR_VERSION } from '../version'

/**
 * Deterministic synthetic dataset generator (P2-13).
 *
 * Produces balanced, non-identifying records. The same seed always yields the
 * same bytes, so the committed dataset carries a reproducible checksum. The
 * embedded disparities are deliberate: the evaluator is meant to *find* them.
 */

/* ------------------------------ PRNG + shuffle ------------------------------ */

function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = items[i]
    items[i] = items[j]
    items[j] = tmp
  }
  return items
}

/** A shuffled multiset with the most even distribution possible for `total`. */
function balanced<T>(values: T[], total: number, rng: () => number): T[] {
  const out: T[] = []
  while (out.length < total) out.push(...values)
  out.length = total
  return shuffle(out, rng)
}

/* ------------------------------ Layer behaviour ------------------------------ */

const BASE_RATE: Record<LayerId, number> = {
  'triage-engine': 0.9,
  'multilingual-rules': 0.88,
  'report-parser': 0.9,
  'visual-feature-service': 0.88,
  'timeline-extractor': 0.9,
  'follow-up-generator': 0.92,
  anonymiser: 0.99,
  'priority-scoring': 0.88,
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

interface SliceAttributes {
  language: SupportedLanguage
  ageBand: string
  sexMarker: string
  facilityType: string
  inputModality: string
}

/** Deliberate, deterministic slice weaknesses the evaluator should surface. */
function detectionRate(layerId: LayerId, record: SliceAttributes): number {
  let p = BASE_RATE[layerId]
  if (layerId === 'triage-engine') {
    if (record.language === 'or') p -= 0.16
    else if (record.language === 'hi') p -= 0.05
  }
  if (layerId === 'multilingual-rules') {
    if (record.language === 'or') p -= 0.15
    else if (record.language === 'hi') p -= 0.09
  }
  if (layerId === 'follow-up-generator' && record.language === 'or') p -= 0.06
  if (layerId === 'priority-scoring') {
    if (record.sexMarker === 'Other') p -= 0.12
    else if (record.sexMarker === 'Not stated') p -= 0.05
    if (record.ageBand === '60+') p -= 0.05
  }
  return clamp(p, 0.4, 0.995)
}

function sampleFor(layerId: LayerId, record: SliceAttributes, rng: () => number): LayerSample {
  const expected = 1 + Math.floor(rng() * 3)
  const rate = detectionRate(layerId, record)
  const detected = Math.min(expected, Math.round(expected * rate))
  const spurious = rng() < 0.08 ? 1 : 0
  return {
    layerId,
    truePositives: detected,
    falsePositives: spurious,
    falseNegatives: expected - detected,
  }
}

/* ------------------------------ File plan ------------------------------ */

const TRIAGE_FILES: Array<{ fileName: string; language: SupportedLanguage }> = [
  { fileName: 'triage-en.jsonl', language: 'en' },
  { fileName: 'triage-hi.jsonl', language: 'hi' },
  { fileName: 'triage-or.jsonl', language: 'or' },
]

const LAYER_FILES: Array<{ fileName: string; layerId: LayerId }> = [
  { fileName: 'reports.jsonl', layerId: 'report-parser' },
  { fileName: 'visuals.jsonl', layerId: 'visual-feature-service' },
  { fileName: 'timelines.jsonl', layerId: 'timeline-extractor' },
  { fileName: 'followups.jsonl', layerId: 'follow-up-generator' },
  { fileName: 'anonymiser.jsonl', layerId: 'anonymiser' },
  { fileName: 'priority.jsonl', layerId: 'priority-scoring' },
]

const ANONYMISER_TEMPLATES: Record<SupportedLanguage, { text: string; expectAbsent: string[]; expectPresent: string[] }> = {
  en: {
    text: 'My name is Ramesh Kumar and my phone is 9876543210. High BP 160/100 noted.',
    expectAbsent: ['Ramesh Kumar', '9876543210'],
    expectPresent: ['BP', '160/100'],
  },
  hi: {
    text: 'मेरा नाम रमेश कुमार है और फ़ोन 9876543210 है। बुखार 102 दर्ज है।',
    expectAbsent: ['रमेश कुमार', '9876543210'],
    expectPresent: ['बुखार', '102'],
  },
  or: {
    text: 'ମୋର ନାମ ରମେଶ କୁମାର ଏବଂ ଫୋନ 9876543210। ଜ୍ୱର 102।',
    expectAbsent: ['ରମେଶ କୁମାର', '9876543210'],
    expectPresent: ['ଜ୍ୱର', '102'],
  },
}

interface FilePlan {
  fileName: string
  records: DatasetRecord[]
}

function attributesFor(
  fileName: string,
  language: SupportedLanguage,
  total: number,
  rng: () => number,
): SliceAttributes[] {
  const ageBands = balanced(BIAS_SLICE_VALUES.ageBand, total, rng)
  const sexMarkers = balanced(BIAS_SLICE_VALUES.sexMarker, total, rng)
  const facilityTypes = balanced(BIAS_SLICE_VALUES.facilityType, total, rng)
  const modalities = balanced(BIAS_SLICE_VALUES.inputModality, total, rng)
  const languages =
    fileName.startsWith('triage-') ? Array.from({ length: total }, () => language) : balanced<SupportedLanguage>(['en', 'hi', 'or'], total, rng)

  return Array.from({ length: total }, (_value, index) => ({
    language: languages[index],
    ageBand: ageBands[index],
    sexMarker: sexMarkers[index],
    facilityType: facilityTypes[index],
    inputModality: modalities[index],
  }))
}

function buildTriageFile(fileName: string, language: SupportedLanguage, rng: () => number): FilePlan {
  const attributes = attributesFor(fileName, language, 300, rng)
  const records = attributes.map((record, index) => ({
    caseId: `triage-${language}-${String(index + 1).padStart(3, '0')}`,
    language: record.language,
    ageBand: record.ageBand,
    sexMarker: record.sexMarker,
    facilityType: record.facilityType,
    inputModality: record.inputModality,
    samples: [
      sampleFor('triage-engine', record, rng),
      sampleFor('multilingual-rules', record, rng),
    ],
  }))
  return { fileName, records }
}

function buildLayerFile(spec: { fileName: string; layerId: LayerId }, rng: () => number): FilePlan {
  const attributes = attributesFor(spec.fileName, 'en', 180, rng)
  const records = attributes.map((record, index) => {
    const base: DatasetRecord = {
      caseId: `${spec.layerId}-${String(index + 1).padStart(3, '0')}`,
      language: record.language,
      ageBand: record.ageBand,
      sexMarker: record.sexMarker,
      facilityType: record.facilityType,
      inputModality: record.inputModality,
      samples: [sampleFor(spec.layerId, record, rng)],
    }
    if (spec.layerId === 'anonymiser') {
      const template = ANONYMISER_TEMPLATES[record.language]
      base.modality = 'intake-text'
      base.text = template.text
      base.expectAbsent = template.expectAbsent
      base.expectPresent = template.expectPresent
    }
    return base
  })
  return { fileName: spec.fileName, records }
}

export interface GeneratedDataset {
  files: FilePlan[]
  manifest: DatasetManifestOutput
}

export interface DatasetManifestOutput {
  version: string
  generatorVersion: string
  generateCommand: string
  generatedAt: string
  seed: number
  checksum: string
  files: Array<{ fileName: string; count: number; sha256: string }>
  sliceCounts: Record<BiasSliceDimension, Record<string, number>>
}

function emptySliceCounts(): Record<BiasSliceDimension, Record<string, number>> {
  return {
    language: {},
    ageBand: {},
    sexMarker: {},
    facilityType: {},
    inputModality: {},
  }
}

function bump(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1
}

function serializeRecord(record: DatasetRecord): string {
  const ordered: Record<string, unknown> = {
    caseId: record.caseId,
    language: record.language,
    ageBand: record.ageBand,
    sexMarker: record.sexMarker,
    facilityType: record.facilityType,
    inputModality: record.inputModality,
    samples: record.samples,
  }
  if (record.modality !== undefined) ordered.modality = record.modality
  if (record.text !== undefined) ordered.text = record.text
  if (record.expectAbsent !== undefined) ordered.expectAbsent = record.expectAbsent
  if (record.expectPresent !== undefined) ordered.expectPresent = record.expectPresent
  return JSON.stringify(ordered)
}

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

/** Build the dataset entirely in memory (deterministic). */
export function buildDataset(seed: number = DATASET_SEED): GeneratedDataset {
  const rng = mulberry32(seed)
  const files: FilePlan[] = []
  for (const spec of TRIAGE_FILES) files.push(buildTriageFile(spec.fileName, spec.language, rng))
  for (const spec of LAYER_FILES) files.push(buildLayerFile(spec, rng))

  const sliceCounts = emptySliceCounts()
  const fileDescriptors: Array<{ fileName: string; count: number; sha256: string }> = []
  for (const file of files) {
    const body = file.records.map(serializeRecord).join('\n') + '\n'
    fileDescriptors.push({ fileName: file.fileName, count: file.records.length, sha256: sha256(body) })
    for (const record of file.records) {
      bump(sliceCounts.language, record.language)
      bump(sliceCounts.ageBand, record.ageBand)
      bump(sliceCounts.sexMarker, record.sexMarker)
      bump(sliceCounts.facilityType, record.facilityType)
      bump(sliceCounts.inputModality, record.inputModality)
    }
  }

  const checksum = sha256(
    JSON.stringify({
      version: DATASET_VERSION,
      generatorVersion: GENERATOR_VERSION,
      seed,
      files: fileDescriptors,
      sliceCounts,
    }),
  )

  return {
    files,
    manifest: {
      version: DATASET_VERSION,
      generatorVersion: GENERATOR_VERSION,
      generateCommand: 'npm run eval:generate',
      generatedAt: new Date().toISOString(),
      seed,
      checksum,
      files: fileDescriptors,
      sliceCounts,
    },
  }
}

/** Build + write every file and the manifest. Returns the written manifest. */
export function writeDataset(seed: number = DATASET_SEED): DatasetManifestOutput {
  const { files, manifest } = buildDataset(seed)
  mkdirSync(datasetDir(), { recursive: true })
  for (const file of files) {
    const body = file.records.map(serializeRecord).join('\n') + '\n'
    writeFileSync(datasetFilePath(file.fileName), body, 'utf8')
  }
  writeFileSync(datasetFilePath('manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8')
  return manifest
}
