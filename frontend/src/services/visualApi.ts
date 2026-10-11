/**
 * Visual (photo) upload / review client (P0-2).
 *
 * The backend owns normalization, redaction, non-diagnostic extraction and the
 * audit trail — this module only moves images and review decisions across the
 * wire, typed to match backend/src/routes/visuals.routes.ts.
 */

import { fetchBlobUrl, postMultipart, request } from './api'
import type {
  DeleteVisualResponse,
  UploadVisualsResponse,
  VisualDetailResponse,
  VisualsView,
} from '../types/visual.types'

/** Upload photos to an existing session (POST /sessions/:id/visuals). */
export async function uploadSessionVisuals(
  sessionId: string,
  files: File[],
  visualType?: string,
): Promise<UploadVisualsResponse> {
  const form = new FormData()
  if (visualType) form.append('visualType', visualType)
  for (const file of files) form.append('files', file, file.name)
  return postMultipart(`/sessions/${encodeURIComponent(sessionId)}/visuals`, form)
}

export async function fetchSessionVisuals(sessionId: string): Promise<VisualsView> {
  return request(`/sessions/${encodeURIComponent(sessionId)}/visuals`)
}

export async function fetchVisual(visualId: string): Promise<VisualDetailResponse> {
  return request(`/visuals/${encodeURIComponent(visualId)}`)
}

/**
 * Load the redacted JPEG as an object URL. The endpoint NEVER serves the raw
 * original — only the redacted bytes. The caller must revoke the URL.
 */
export function fetchRedactedImageUrl(visualId: string): Promise<string> {
  return fetchBlobUrl(`/visuals/${encodeURIComponent(visualId)}/image`)
}

export async function verifyVisual(visualId: string, note?: string): Promise<VisualDetailResponse> {
  return request(`/visuals/${encodeURIComponent(visualId)}/verify`, {
    method: 'POST',
    body: JSON.stringify({ note: note ?? '' }),
  })
}

export async function rejectVisual(visualId: string, reason: string): Promise<VisualDetailResponse> {
  return request(`/visuals/${encodeURIComponent(visualId)}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })
}

export async function deleteVisual(visualId: string): Promise<DeleteVisualResponse> {
  return request(`/visuals/${encodeURIComponent(visualId)}`, { method: 'DELETE' })
}
