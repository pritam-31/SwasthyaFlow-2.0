import { existsSync, readFileSync } from 'node:fs'
import type { DatasetManifest } from '../types/modelcard.types'
import type { DatasetRecord } from './dataset.types'
import { datasetDir, datasetFilePath, MANIFEST_FILE } from './paths'

/** Thrown when the committed dataset is absent or incomplete (P2-13). */
export class DatasetMissingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DatasetMissingError'
  }
}

export function readManifest(): DatasetManifest {
  const manifestPath = datasetFilePath(MANIFEST_FILE)
  if (!existsSync(manifestPath)) {
    throw new DatasetMissingError(`Dataset manifest not found at ${datasetDir()}. Run "npm run eval:generate".`)
  }
  return JSON.parse(readFileSync(manifestPath, 'utf8')) as DatasetManifest
}

export interface LoadedDataset {
  manifest: DatasetManifest
  records: DatasetRecord[]
}

export function readDataset(): LoadedDataset {
  const manifest = readManifest()
  const records: DatasetRecord[] = []
  for (const file of manifest.files) {
    const filePath = datasetFilePath(file.fileName)
    if (!existsSync(filePath)) {
      throw new DatasetMissingError(`Dataset file missing: ${file.fileName}. Run "npm run eval:generate".`)
    }
    for (const line of readFileSync(filePath, 'utf8').split('\n')) {
      const trimmed = line.trim()
      if (trimmed.length > 0) records.push(JSON.parse(trimmed) as DatasetRecord)
    }
  }
  return { manifest, records }
}
