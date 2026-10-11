import path from 'node:path'

/**
 * Dataset location (P2-13).
 *
 * Resolved from the process working directory (the backend package root when
 * the CLI scripts or the server run) with a `BIAS_DATASET_DIR` override that is
 * read on every call — tests redirect it to a scratch directory.
 */
export function datasetDir(): string {
  const override = process.env.BIAS_DATASET_DIR
  return override ? path.resolve(override) : path.resolve(process.cwd(), 'data', 'bias-eval')
}

export function datasetFilePath(fileName: string): string {
  return path.join(datasetDir(), fileName)
}

export const MANIFEST_FILE = 'manifest.json'
