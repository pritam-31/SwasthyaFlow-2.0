import { randomUUID } from 'node:crypto'
import { persistenceEnabled } from '../db/mongoose'
import { enqueue } from '../repositories/writeQueue'
import {
  deleteMedia,
  listAssets,
  downloadMedia,
  uploadMedia,
  type MediaCategory,
} from '../repositories/mediaRepository'

/**
 * In-memory store for file bytes (P0-2, extended by P0-6).
 *
 * Every entry is categorised so the retention sweep can purge by rule:
 *  - `visual-redacted`  the PII-redacted image (the only visual ever kept)
 *  - `visual-original`  pre-redaction originals — never written by design
 *  - `visual-source`    original visual uploads — never written by design
 *  - `report-source`    uploaded report bytes, kept only for re-processing
 *  - `export`           generated export payloads (purged after 1 day)
 *
 * Bytes are prototype-only (nothing is persisted) and keyed by id so the JSON
 * API never embeds images.
 */

export type StoredImageCategory =
  | 'report-source'
  | 'visual-redacted'
  | 'visual-original'
  | 'visual-source'
  | 'export'

export interface StoredImageInfo {
  id: string
  category: StoredImageCategory
  createdAt: string
  sessionId?: string
  bytes: number
}

interface StoredImage {
  id: string
  buffer: Buffer
  category: StoredImageCategory
  createdAt: string
  sessionId?: string
}

const images = new Map<string, StoredImage>()

function mediaCategory(category: StoredImageCategory): MediaCategory | undefined {
  if (category === 'visual-redacted') return 'visual-redacted'
  if (category === 'report-source') return 'report-source'
  if (category === 'export') return 'export'
  return undefined
}

function persistImage(stored: StoredImage): void {
  if (!persistenceEnabled()) return
  const category = mediaCategory(stored.category)
  if (!category) return
  enqueue('media:' + stored.id, () =>
    uploadMedia({ id: stored.id, category, buffer: stored.buffer, sessionId: stored.sessionId }),
  )
}

function toInfo(stored: StoredImage): StoredImageInfo {
  return {
    id: stored.id,
    category: stored.category,
    createdAt: stored.createdAt,
    ...(stored.sessionId ? { sessionId: stored.sessionId } : {}),
    bytes: stored.buffer.byteLength,
  }
}

export function saveStoredImage(
  id: string,
  buffer: Buffer,
  category: StoredImageCategory,
  opts?: { sessionId?: string },
): string {
  const stored: StoredImage = {
    id,
    buffer,
    category,
    createdAt: new Date().toISOString(),
    ...(opts?.sessionId ? { sessionId: opts.sessionId } : {}),
  }
  images.set(id, stored)
  persistImage(stored)
  return id
}

export function getStoredImage(id: string): StoredImage | undefined {
  return images.get(id)
}

export function listStoredImages(category?: StoredImageCategory): StoredImageInfo[] {
  const all = [...images.values()].filter((entry) => !category || entry.category === category)
  return all.map(toInfo)
}

export function countStoredImages(category?: StoredImageCategory): number {
  if (!category) return images.size
  return [...images.values()].filter((entry) => entry.category === category).length
}

export function deleteStoredImage(id: string): boolean {
  const removed = images.delete(id)
  if (removed && persistenceEnabled()) enqueue('media:' + id, () => deleteMedia(id))
  return removed
}

/** Retention sweep helper — purges every entry (or one category) older than `iso`. */
export function deleteStoredImagesBefore(iso: string, category?: StoredImageCategory): number {
  const cutoff = Date.parse(iso)
  if (!Number.isFinite(cutoff)) return 0
  let removed = 0
  for (const [id, entry] of [...images.entries()]) {
    if (category && entry.category !== category) continue
    if (Date.parse(entry.createdAt) < cutoff) {
      images.delete(id)
      if (persistenceEnabled()) enqueue('media:' + id, () => deleteMedia(id))
      removed += 1
    }
  }
  return removed
}

/** Cascade helper — every byte uploaded as part of one session. */
export function deleteStoredImagesForSession(sessionId: string): number {
  let removed = 0
  for (const [id, entry] of [...images.entries()]) {
    if (entry.sessionId === sessionId) {
      images.delete(id)
      if (persistenceEnabled()) enqueue('media:' + id, () => deleteMedia(id))
      removed += 1
    }
  }
  return removed
}

/** Key under which a report's source file is stored (`report-source-files` rule). */
export function reportSourceImageId(reportId: string): string {
  return `src-${reportId}`
}

/** Fresh id for a stored export payload (`export-files` rule). */
export function newExportImageId(): string {
  return `exp-${randomUUID()}`
}

/* ------------------------------------------------------------------ */
/*  Visual image helpers (P0-2 contract, unchanged for callers)        */
/* ------------------------------------------------------------------ */

export function saveRedactedImage(visualId: string, buffer: Buffer, opts?: { sessionId?: string }): void {
  saveStoredImage(visualId, buffer, 'visual-redacted', opts)
}

export function getRedactedImage(visualId: string): Buffer | undefined {
  return images.get(visualId)?.buffer
}

export function deleteRedactedImage(visualId: string): void {
  images.delete(visualId)
  if (persistenceEnabled()) enqueue('media:' + visualId, () => deleteMedia(visualId))
}

/** Test teardown / graceful reset. */
export function clearStoredImages(): void {
  images.clear()
}


/** Loads persisted media bytes from Cloudinary on boot (persistent mode only). */
export async function hydrateImages(): Promise<void> {
  const assets = await listAssets()
  images.clear()
  for (const asset of assets) {
    try {
      const buffer = await downloadMedia(asset.id)
      const category = asset.category as StoredImageCategory
      images.set(asset.id, {
        id: asset.id,
        buffer,
        category,
        createdAt: asset.createdAt,
        ...(asset.sessionId ? { sessionId: asset.sessionId } : {}),
      })
    } catch (err) {
      console.error('[hydrate media]', asset.id, err instanceof Error ? err.message : err)
    }
  }
}
