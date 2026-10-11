import { v2 as cloudinary } from 'cloudinary'

/**
 * Cloudinary adapter (P1-9).
 *
 * All binary media lives in Cloudinary; MongoDB stores only metadata + refs.
 * Originals are NEVER uploaded — the visual pipeline redacts in memory first
 * and only the redacted JPEG is persisted (see visualService). Folders:
 *   - swasthyaflow/visuals-redacted  (redacted JPEGs, one per visual id)
 *   - swasthyaflow/reports-source    (uploaded report source files)
 *   - swasthyaflow/exports           (generated export bundles)
 */

export type MediaFolder = 'swasthyaflow/visuals-redacted' | 'swasthyaflow/reports-source' | 'swasthyaflow/exports'

export const MEDIA_FOLDERS: Record<'visual' | 'report' | 'export', MediaFolder> = {
  visual: 'swasthyaflow/visuals-redacted',
  report: 'swasthyaflow/reports-source',
  export: 'swasthyaflow/exports',
}

export interface UploadedAsset {
  publicId: string
  secureUrl: string
  resourceType: string
  format: string
  bytes: number
  width: number
  height: number
  folder: MediaFolder
}

let configured = false

export function cloudinaryConfigured(): boolean {
  return Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)
}

function ensureConfigured(): void {
  if (configured) return
  if (!cloudinaryConfigured()) {
    throw new Error('Cloudinary is not configured (CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET).')
  }
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  })
  configured = true
}

export async function uploadImage(buffer: Buffer, folder: MediaFolder, publicId: string): Promise<UploadedAsset> {
  ensureConfigured()
  const result = await cloudinary.uploader.upload(`data:image/jpeg;base64,${buffer.toString('base64')}`, {
    folder,
    public_id: publicId,
    resource_type: 'image',
    overwrite: true,
  })
  return {
    publicId: result.public_id,
    secureUrl: result.secure_url,
    resourceType: result.resource_type ?? 'image',
    format: result.format ?? 'jpg',
    bytes: result.bytes ?? buffer.length,
    width: result.width ?? 0,
    height: result.height ?? 0,
    folder,
  }
}

export async function uploadRaw(buffer: Buffer, folder: MediaFolder, publicId: string, format = 'pdf'): Promise<UploadedAsset> {
  ensureConfigured()
  const result = await cloudinary.uploader.upload(`data:application/octet-stream;base64,${buffer.toString('base64')}`, {
    folder,
    public_id: publicId,
    resource_type: 'raw',
    format,
    overwrite: true,
  })
  return {
    publicId: result.public_id,
    secureUrl: result.secure_url,
    resourceType: result.resource_type ?? 'raw',
    format: result.format ?? format,
    bytes: result.bytes ?? buffer.length,
    width: 0,
    height: 0,
    folder,
  }
}

export async function downloadAsset(publicId: string, resourceType = 'image'): Promise<Buffer> {
  ensureConfigured()
  const resource = await cloudinary.api.resource(publicId, { resource_type: resourceType })
  const url = typeof resource.secure_url === 'string' ? resource.secure_url : String(resource.secure_url)
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Cloudinary download failed (${response.status}) for ${publicId}.`)
  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

export async function destroyAsset(publicId: string, resourceType = 'image'): Promise<void> {
  ensureConfigured()
  await cloudinary.uploader.destroy(publicId, { resource_type: resourceType, invalidate: true })
}
