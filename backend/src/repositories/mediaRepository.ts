import { CloudinaryAssetModel } from '../db/models/CloudinaryAsset'
import { destroyAsset, downloadAsset, MEDIA_FOLDERS, uploadImage, uploadRaw } from '../services/cloudinaryService'

/**
 * Cloudinary-backed media store (P1-9). Replaces the old in-process blob map:
 * Mongo keeps the metadata row, Cloudinary keeps the bytes. Only redacted
 * images, report source files and exports ever pass through here.
 */

export type MediaCategory = 'visual-redacted' | 'report-source' | 'export'

export interface StoredAsset {
  id: string
  publicId: string
  secureUrl: string
  resourceType: string
  format: string
  bytes: number
  width: number
  height: number
  folder: string
  category: MediaCategory
  sessionId?: string
  createdAt: string
}

function folderFor(category: MediaCategory): 'swasthyaflow/visuals-redacted' | 'swasthyaflow/reports-source' | 'swasthyaflow/exports' {
  if (category === 'visual-redacted') return MEDIA_FOLDERS.visual
  if (category === 'report-source') return MEDIA_FOLDERS.report
  return MEDIA_FOLDERS.export
}

export async function uploadMedia(input: {
  id: string
  category: MediaCategory
  buffer: Buffer
  sessionId?: string
}): Promise<StoredAsset> {
  const folder = folderFor(input.category)
  const publicId = `${input.id}`
  const uploaded =
    input.category === 'visual-redacted'
      ? await uploadImage(input.buffer, folder, publicId)
      : await uploadRaw(input.buffer, folder, publicId)
  const asset: StoredAsset = {
    id: input.id,
    publicId: uploaded.publicId,
    secureUrl: uploaded.secureUrl,
    resourceType: uploaded.resourceType,
    format: uploaded.format,
    bytes: uploaded.bytes,
    width: uploaded.width,
    height: uploaded.height,
    folder,
    category: input.category,
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    createdAt: new Date().toISOString(),
  }
  await CloudinaryAssetModel.replaceOne({ _id: asset.id }, { ...asset, _id: asset.id }, { upsert: true })
  return asset
}

export async function listAssets(): Promise<StoredAsset[]> {
  return CloudinaryAssetModel.find().sort({ createdAt: 1 }).lean<StoredAsset[]>().exec()
}

export async function downloadMedia(id: string): Promise<Buffer> {
  const asset = await CloudinaryAssetModel.findOne({ _id: id }).lean<StoredAsset>().exec()
  if (!asset) throw new Error(`No media asset registered for ${id}.`)
  return downloadAsset(asset.publicId, asset.resourceType)
}

export async function deleteMedia(id: string): Promise<boolean> {
  const asset = await CloudinaryAssetModel.findOne({ _id: id }).lean<StoredAsset>().exec()
  if (!asset) return false
  try {
    await destroyAsset(asset.publicId, asset.resourceType)
  } finally {
    await CloudinaryAssetModel.deleteOne({ _id: id })
  }
  return true
}

export async function clearMediaAssets(): Promise<void> {
  await CloudinaryAssetModel.deleteMany({})
}
