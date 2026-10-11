import type { LayerId } from '../types/modelcard.types'
import type { SupportedLanguage } from '../types/language.types'

/** One classification sample a layer contributes to the evaluation (P2-13). */
export interface LayerSample {
  layerId: LayerId
  truePositives: number
  falsePositives: number
  falseNegatives: number
}

/** One line of a dataset JSONL file. Carries every slice attribute. */
export interface DatasetRecord {
  caseId: string
  language: SupportedLanguage
  ageBand: string
  sexMarker: string
  facilityType: string
  inputModality: string
  samples: LayerSample[]
  /** Anonymiser files only: synthetic text and its expected redaction contract. */
  modality?: string
  text?: string
  expectAbsent?: string[]
  expectPresent?: string[]
}
