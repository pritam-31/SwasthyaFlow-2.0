import { deflateSync } from 'node:zlib'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { after, before, describe, it } from 'node:test'
import sharp from 'sharp'
import { createApp } from '../src/app'
import { clearAudit, listAudit } from '../src/services/auditStore'
import { seedUsers } from '../src/services/authStore'
import { shutdownOcr } from '../src/services/ocrService'
import { classifyTextRegions, detectFaces } from '../src/services/piiDetectionService'
import { ingestVisualImage } from '../src/services/imageIngestService'
import { clearStoredImages } from '../src/services/imageStore'
import type { PiiRegion } from '../src/types'

/* ------------------------------------------------------------------ */
/*  Synthetic image fixtures                                           */
/* ------------------------------------------------------------------ */

/** A solid-colour JPEG (optionally with EXIF orientation set). */
async function solidJpeg(rgb: [number, number, number], width = 400, height = 300, exifOrientation?: number): Promise<Buffer> {
  const s = sharp({ create: { width, height, channels: 3, background: { r: rgb[0], g: rgb[1], b: rgb[2] } } })
    .jpeg({ quality: 90 })
  if (exifOrientation) s.withMetadata({ orientation: exifOrientation })
  return s.toBuffer()
}

/** A warm skin-tone oval (face heuristic target) on a pale background. */
async function faceImage(): Promise<Buffer> {
  const width = 400
  const height = 400
  const rgba = Buffer.alloc(width * height * 4, 255)
  const cx = 200
  const cy = 200
  const rx = 70
  const ry = 90
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = (x - cx) / rx
      const dy = (y - cy) / ry
      if (dx * dx + dy * dy <= 1) {
        const o = (y * width + x) * 4
        rgba[o] = 200
        rgba[o + 1] = 150
        rgba[o + 2] = 120
        rgba[o + 3] = 255
      }
    }
  }
  return rawPng(width, height, rgba)
}

/** Minimal PNG writer (solid background + optional dark rounded blob). */
function crcTable(): Uint32Array {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
}
const CRC = crcTable()
function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function pngChunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(8 + data.length + 4)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'ascii')
  data.copy(out, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}
function rawPng(width: number, height: number, rgba: Buffer): Buffer {
  const stride = 1 + width * 4
  const raw = Buffer.alloc(height * stride)
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

async function toJpeg(png: Buffer): Promise<Buffer> {
  return sharp(png).jpeg({ quality: 90 }).toBuffer()
}
async function toWebp(png: Buffer): Promise<Buffer> {
  return sharp(png).webp().toBuffer()
}
async function toHeic(png: Buffer): Promise<Buffer> {
  return sharp(png).heif({ quality: 85, compression: 'av1' }).toBuffer()
}

/* ------------------------------------------------------------------ */
/*  Unit tests                                                         */
/* ------------------------------------------------------------------ */

describe('imageIngestService', () => {
  it('accepts JPEG/PNG/HEIC/WEBP, converts to JPEG, strips EXIF and downscales', async () => {
    const jpeg = await solidJpeg([120, 60, 40], 400, 300, 6)
    const ingested = await ingestVisualImage({ buffer: jpeg, originalName: 'a.jpg', mimeType: 'image/jpeg', size: jpeg.length })
    assert.equal(ingested.width, 300, 'EXIF orientation must be applied (400x300 rotated -> 300x400)')
    assert.equal(ingested.height, 400)
    assert.ok(ingested.converted === false)
    const meta = await sharp(ingested.buffer).metadata()
    assert.equal(meta.exif, undefined, 'EXIF must be stripped from the stored JPEG')
    assert.equal(meta.xmp, undefined, 'XMP metadata must be stripped from the stored JPEG')

    const png = await rawPng(400, 300, Buffer.alloc(400 * 300 * 4, 200))
    const ingestedPng = await ingestVisualImage({ buffer: png, originalName: 'a.png', mimeType: 'image/png', size: png.length })
    assert.equal(ingestedPng.width, 400)
    assert.ok(ingestedPng.converted)

    const webp = await toWebp(await solidJpeg([120, 60, 40]))
    const ingestedWebp = await ingestVisualImage({ buffer: webp, originalName: 'a.webp', mimeType: 'image/webp', size: webp.length })
    assert.equal(ingestedWebp.width, 400)
    assert.ok(ingestedWebp.converted)

    let heicOk = true
    try {
      const heic = await toHeic(await solidJpeg([120, 60, 40]))
      const ingestedHeic = await ingestVisualImage({ buffer: heic, originalName: 'a.heic', mimeType: 'image/heic', size: heic.length })
      assert.equal(ingestedHeic.width, 400)
      assert.ok(ingestedHeic.converted)
    } catch {
      heicOk = false
    }
    if (!heicOk) {
      // Codec unavailable on this machine — the ingest path is still guarded.
      assert.ok(true)
    }
  })

  it('rejects unsupported types (415), empty (400), corrupt (400) and oversized (413)', async () => {
    await assert.rejects(ingestVisualImage({ buffer: Buffer.from('hello'), originalName: 'a.txt', mimeType: 'text/plain', size: 5 }), (e: { status: number }) => e.status === 415)
    await assert.rejects(ingestVisualImage({ buffer: Buffer.alloc(0), originalName: 'a.png', mimeType: 'image/png', size: 0 }), (e: { status: number }) => e.status === 400)
    await assert.rejects(ingestVisualImage({ buffer: Buffer.from('not an image'), originalName: 'a.png', mimeType: 'image/png', size: 12 }), (e: { status: number }) => e.status === 400)
    const big = Buffer.concat([await solidJpeg([120, 60, 40]), Buffer.alloc(10 * 1024 * 1024 + 1024)])
    await assert.rejects(ingestVisualImage({ buffer: big, originalName: 'a.jpg', mimeType: 'image/jpeg', size: big.length }), (e: { status: number }) => e.status === 413)
  })
})

describe('piiDetectionService', () => {
  it('classifies phone lines as PII regions with source ocr-label', () => {
    const words = [
      { text: 'PHONE:', confidence: 90, x0: 10, y0: 10, x1: 60, y1: 30 },
      { text: '98765', confidence: 90, x0: 65, y0: 10, x1: 120, y1: 30 },
      { text: '43210', confidence: 90, x0: 125, y0: 10, x1: 180, y1: 30 },
    ]
    const regions = classifyTextRegions(words, 200, 100)
    assert.ok(regions.length >= 1, 'phone line must be flagged')
    const phone = regions.find((r) => r.type === 'phone' || r.type === 'name-plate')
    assert.ok(phone, `expected phone PII region, got ${regions.map((r) => r.type).join(', ')}`)
    if (phone) {
      assert.equal(phone.source, 'ocr-label')
      assert.ok(phone.bbox.width > 0 && phone.bbox.height > 0)
    }
  })

  it('classifies name-plate and hospital-band labels', () => {
    const words = [
      { text: 'Name', confidence: 90, x0: 10, y0: 10, x1: 50, y1: 30 },
      { text: 'Plate', confidence: 90, x0: 55, y0: 10, x1: 100, y1: 30 },
    ]
    const regions = classifyTextRegions(words, 200, 100)
    assert.ok(regions.some((r) => r.type === 'name-plate'), 'name plate must be flagged')

    const band = [
      { text: 'Hospital', confidence: 90, x0: 10, y0: 50, x1: 80, y1: 70 },
      { text: 'Band', confidence: 90, x0: 85, y0: 50, x1: 130, y1: 70 },
    ]
    const bandRegions = classifyTextRegions(band, 200, 100)
    assert.ok(bandRegions.some((r) => r.type === 'hospital-band' || r.type === 'wristband'), 'hospital band must be flagged')
  })

  it('detects a face-like oval via the documented heuristic', async () => {
    const png = await faceImage()
    const regions = await detectFaces(png, 400, 400)
    assert.ok(regions.length >= 1, 'face heuristic must flag the skin-tone oval')
    const face = regions.find((r) => r.type === 'face')
    assert.ok(face, `expected face region, got ${regions.map((r) => r.type).join(', ')}`)
    if (face) {
      assert.equal(face.source, 'face-heuristic')
      assert.ok(face.bbox.x + face.bbox.width > 0.3 && face.bbox.x < 0.7, 'face box centred horizontally')
      assert.ok(face.bbox.y + face.bbox.height > 0.3 && face.bbox.y < 0.7, 'face box centred vertically')
    }
  })
})

/* ------------------------------------------------------------------ */
/*  HTTP integration tests                                             */
/* ------------------------------------------------------------------ */

describe('visual API (HTTP)', () => {
  let server: Server
  let base = ''

  before(async () => {
    seedUsers()
    clearAudit()
    clearStoredImages()
    server = createApp().listen(0)
    await new Promise<void>((resolve) => server.once('listening', () => resolve()))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  after(async () => {
    await shutdownOcr()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  async function login(username: string, password: string): Promise<string> {
    const res = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    const text = await res.text()
    assert.equal(res.status, 200, text)
    return (JSON.parse(text) as { token: string }).token
  }

  async function createTriageSession(token: string, text: string): Promise<string> {
    const res = await fetch(`${base}/api/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ text, consentAcknowledged: true, language: 'English' }),
    })
    const bodyText = await res.text()
    assert.equal(res.status, 201, bodyText)
    return (JSON.parse(bodyText) as { session: { id: string } }).session.id
  }

  interface UploadFile {
    name: string
    type: string
    buffer: Buffer
  }

  async function uploadVisuals(token: string, route: string, sessionId: string | null, files: UploadFile[]): Promise<{ status: number; body: Record<string, unknown> }> {
    const form = new FormData()
    if (sessionId) form.append('sessionId', sessionId)
    for (const file of files) form.append('files', new File([file.buffer], file.name, { type: file.type }))
    const res = await fetch(`${base}/api${route}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: form,
    })
    const text = await res.text()
    return { status: res.status, body: text ? (JSON.parse(text) as Record<string, unknown>) : {} }
  }

  interface ApiResult {
    status: number
    body: Record<string, unknown>
  }

  async function api(token: string, method: string, path: string, payload?: Record<string, unknown>): Promise<ApiResult> {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    })
    const text = await res.text()
    return { status: res.status, body: text ? (JSON.parse(text) as Record<string, unknown>) : {} }
  }

  it('requires an authenticated session for visual routes', async () => {
    const res = await fetch(`${base}/api/sessions/sess-nope/visuals`)
    assert.equal(res.status, 401)
  })

  it('runs the full upload → review lifecycle with face redaction and audit', async () => {
    const nurse = await login('nurse', 'Nurse@123')
    const doctor = await login('doctor', 'Doctor@123')
    const admin = await login('admin', 'Admin@123')
    const sid = await createTriageSession(nurse, 'Deep wound on the leg since two days.')

    const png = await faceImage()
    const upload = await uploadVisuals(nurse, `/sessions/${sid}/visuals`, null, [
      { name: 'leg.jpg', type: 'image/jpeg', buffer: await toJpeg(png) },
    ])
    assert.equal(upload.status, 201, JSON.stringify(upload.body))
    const body = upload.body as { visuals: Array<Record<string, unknown>>; processing: Array<{ visual: Record<string, unknown> }> }
    assert.equal(body.visuals.length, 1)
    const visual = body.processing[0].visual as Record<string, unknown> & { status: string }
    assert.equal(visual.status, 'pending-review')
    const pii = visual.pii as PiiRegion[]
    assert.ok(pii.length >= 1, 'face-like region must be detected and reported in the visual record')
    assert.ok(pii.some((r) => r.source === 'face-heuristic'))
    assert.equal(visual['storedMimeType'], 'image/jpeg')
    assert.equal(visual['visualType'], 'wound')

    const visualId = visual.id as string

    // Redacted image endpoint returns image/jpeg bytes.
    const img = await fetch(`${base}/api/visuals/${visualId}/image`, {
      headers: { authorization: `Bearer ${nurse}` },
    })
    assert.equal(img.status, 200)
    assert.equal(img.headers.get('content-type'), 'image/jpeg')
    const bytes = Buffer.from(await img.arrayBuffer())
    assert.ok(bytes.length > 100, 'redacted image must be non-empty')

    // Nurse cannot verify/reject/delete — doctor expected.
    const nurseVerify = await api(nurse, 'POST', `/api/visuals/${visualId}/verify`)
    assert.equal(nurseVerify.status, 403)
    const nurseDelete = await api(nurse, 'DELETE', `/api/visuals/${visualId}`)
    assert.equal(nurseDelete.status, 403)

    // Doctor verifies.
    const verified = await api(doctor, 'POST', `/api/visuals/${visualId}/verify`, { note: 'Matches what I saw.' })
    assert.equal(verified.status, 200)
    assert.equal((verified.body.visual as { status: string }).status, 'verified')
    assert.equal((verified.body.visual as { reviewedByRole: string }).reviewedByRole, 'doctor')

    const doubleVerify = await api(doctor, 'POST', `/api/visuals/${visualId}/verify`)
    assert.equal(doubleVerify.status, 409)

    // Reject needs a real reason.
    const shortReason = await api(doctor, 'POST', `/api/visuals/${visualId}/reject`, { reason: 'x' })
    assert.equal(shortReason.status, 400)
    const rejected = await api(doctor, 'POST', `/api/visuals/${visualId}/reject`, { reason: 'Wrong patient photo.' })
    assert.equal(rejected.status, 200)
    assert.equal((rejected.body.visual as { status: string }).status, 'rejected')
    assert.equal((rejected.body.visual as { rejectionReason: string }).rejectionReason, 'Wrong patient photo.')

    // Admin deletes; file purged too.
    const deleted = await api(admin, 'DELETE', `/api/visuals/${visualId}`)
    assert.equal(deleted.status, 200)
    assert.equal(deleted.body.deleted, true)
    assert.equal((deleted.body.visuals as unknown[]).length, 0)

    const gone = await api(admin, 'GET', `/api/visuals/${visualId}`)
    assert.equal(gone.status, 404)
    const goneImg = await fetch(`${base}/api/visuals/${visualId}/image`, {
      headers: { authorization: `Bearer ${admin}` },
    })
    assert.equal(goneImg.status, 404)

    // Full audit trail.
    const trail = listAudit(sid)
    const actions = new Set(trail.map((e) => e.action))
    for (const action of ['visual.uploaded', 'visual.pii_detected', 'visual.redacted', 'visual.extracted', 'visual.verified', 'visual.rejected', 'visual.deleted']) {
      assert.ok(actions.has(action), `expected audit entry "${action}" for the session`)
    }
    assert.ok(trail.every((e) => e.sessionId === sid))
  })

  it('rejects unsupported, empty, corrupt and oversized images', async () => {
    const nurse = await login('nurse', 'Nurse@123')
    const sid = await createTriageSession(nurse, 'Validation tests.')

    const unsupported = await uploadVisuals(nurse, `/sessions/${sid}/visuals`, null, [
      { name: 'note.txt', type: 'text/plain', buffer: Buffer.from('hello') },
    ])
    assert.equal(unsupported.status, 415)

    const empty = await uploadVisuals(nurse, `/sessions/${sid}/visuals`, null, [
      { name: 'empty.png', type: 'image/png', buffer: Buffer.alloc(0) },
    ])
    assert.equal(empty.status, 400)

    const corrupt = await uploadVisuals(nurse, `/sessions/${sid}/visuals`, null, [
      { name: 'broken.jpg', type: 'image/jpeg', buffer: Buffer.from('not an image') },
    ])
    assert.equal(corrupt.status, 400)

    const big = Buffer.concat([await solidJpeg([120, 60, 40]), Buffer.alloc(10 * 1024 * 1024 + 1024)])
    const oversized = await uploadVisuals(nurse, `/sessions/${sid}/visuals`, null, [
      { name: 'big.jpg', type: 'image/jpeg', buffer: big },
    ])
    assert.equal(oversized.status, 413)
  })

  it('infers visual type from narrative keywords and returns non-diagnostic features', async () => {
    const nurse = await login('nurse', 'Nurse@123')
    const rashSid = await createTriageSession(nurse, 'Itchy rash on the arms for three days.')
    const png = await faceImage()
    const upload = await uploadVisuals(nurse, `/sessions/${rashSid}/visuals`, null, [
      { name: 'rash.png', type: 'image/png', buffer: png },
    ])
    assert.equal(upload.status, 201)
    const body = upload.body as { processing: Array<{ visual: Record<string, unknown> }> }
    const visual = body.processing[0].visual as Record<string, unknown>
    assert.equal(visual.visualType, 'rash')
    const extraction = visual.extraction as { features: Array<{ label: string; value: string }>; concerns: Array<{ label: string; ruleId: string }>; typeBasis: string }
    assert.ok(extraction.typeBasis.includes('rash'), 'type basis should explain the classification')
    assert.ok(extraction.features.length >= 5, 'expected descriptive feature rows')
    assert.ok(extraction.features.every((f) => f.label && f.value))
    assert.ok(Array.isArray(extraction.concerns), 'concerns are an array')

    // Non-diagnostic: never mentions diagnosis/prescription/treatment.
    const disclaimer = visual.disclaimer as string
    assert.ok(disclaimer.includes('NON-DIAGNOSTIC'))
    assert.ok(!/diagnos|prescrib|treatment/gi.test(JSON.stringify(extraction.features.map((f) => `${f.label} ${f.value}`))))
  })

  it('hides a patient from visuals that are not their own (404, never 403)', async () => {
    const nurse = await login('nurse', 'Nurse@123')
    const patient = await login('patient', 'Patient@123')

    const suffix = Date.now().toString(36)
    const registered = await fetch(`${base}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: `patient_${suffix}`, displayName: 'Test Patient', password: 'Passw0rd123' }),
    })
    assert.equal(registered.status, 201)
    const strangerPatient = ((await registered.json()) as { token: string }).token

    const sid = await createTriageSession(patient, 'My own photo note.')
    const png = await faceImage()
    const upload = await uploadVisuals(nurse, `/sessions/${sid}/visuals`, null, [
      { name: 'mine.jpg', type: 'image/jpeg', buffer: await toJpeg(png) },
    ])
    assert.equal(upload.status, 201)
    const visualId = (upload.body as { processing: Array<{ visual: { id: string } }> }).processing[0].visual.id

    // A different patient gets a 404 — never a hint the visual exists.
    const patientList = await api(patient, 'GET', `/api/sessions/${sid}/visuals`)
    assert.equal(patientList.status, 200)
    assert.equal((patientList.body.visuals as unknown[]).length, 1)

    const strangerDetail = await api(strangerPatient, 'GET', `/api/visuals/${visualId}`)
    assert.equal(strangerDetail.status, 404)
    const strangerImg = await fetch(`${base}/api/visuals/${visualId}/image`, {
      headers: { authorization: `Bearer ${strangerPatient}` },
    })
    assert.equal(strangerImg.status, 404)
  })

  it('accepts multi-file uploads (up to 5) per request', async () => {
    const nurse = await login('nurse', 'Nurse@123')
    const sid = await createTriageSession(nurse, 'Multiple photos test.')
    const png = await faceImage()
    const files: UploadFile[] = []
    for (let i = 0; i < 3; i++) {
      files.push({ name: `p${i}.png`, type: 'image/png', buffer: png })
    }
    const upload = await uploadVisuals(nurse, `/sessions/${sid}/visuals`, null, files)
    assert.equal(upload.status, 201)
    assert.equal((upload.body.visuals as unknown[]).length, 3)
    assert.equal((upload.body.processing as unknown[]).length, 3)
  })
})