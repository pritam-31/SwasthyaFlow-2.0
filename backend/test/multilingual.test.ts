import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { after, before, describe, it } from 'node:test'
import { createApp } from '../src/app'
import { clearAudit, listAudit } from '../src/services/auditStore'
import { seedUsers } from '../src/services/authStore'
import { detectScriptLanguage, normalizeLanguage, toIntakeLanguage, fromIntakeLanguage } from '../src/services/languageDetectionService'
import { transliterateToLatin, getLatinForm } from '../src/services/transliterationService'
import { anonymizeMultilingual, sanitizePII } from '../src/services/multilingualAnonymizer'
import { analyzeWithFallback } from '../src/services/multilingualTriageService'
import { getRuleSetForText } from '../src/services/rules/ruleRegistry'

/* ------------------------------------------------------------------ */
/*  Unit tests — detection                                             */
/* ------------------------------------------------------------------ */

describe('languageDetectionService', () => {
  it('detects English from Latin script', () => {
    const d = detectScriptLanguage('Patient reports a mild headache since yesterday.')
    assert.equal(d.code, 'en')
    assert.equal(d.script, 'latin')
    assert.equal(d.isMixed, false)
    assert.ok(d.confidence > 0.7 && d.confidence <= 1)
  })

  it('detects Hindi from Devanagari', () => {
    const d = detectScriptLanguage('मुझे सीने में दर्द है और बुखार भी है।')
    assert.equal(d.code, 'hi')
    assert.equal(d.script, 'devanagari')
    assert.equal(d.isMixed, false)
    assert.ok(d.confidence > 0.3)
  })

  it('detects Odia from the Odia script', () => {
    const d = detectScriptLanguage('ମୋର ଛାତି ଯନ୍ତ୍ରଣା ଅଛି ଏବଂ ଜ୍ୱର ମଧ୍ୟ ଅଛି।')
    assert.equal(d.code, 'or')
    assert.equal(d.script, 'odia')
    assert.equal(d.isMixed, false)
  })

  it('detects Hinglish as mixed Hindi-dominant', () => {
    const d = detectScriptLanguage('मुझे सीने में दर्द hai aur बुखार भी hai.')
    assert.equal(d.code, 'hi')
    assert.equal(d.isMixed, true)
    assert.equal(d.script, 'mixed')
  })

  it('detects Odlish as mixed Odia-dominant', () => {
    const d = detectScriptLanguage('ମୋର ଛାତି ଯନ୍ତ୍ରଣା ଅଛି and fever bhi hai.')
    assert.equal(d.code, 'or')
    assert.equal(d.isMixed, true)
  })

  it('normalises product labels and scheme codes', () => {
    const text = 'my name is x'
    assert.equal(normalizeLanguage('English', text), 'en')
    assert.equal(normalizeLanguage('en', text), 'en')
    assert.equal(normalizeLanguage('Hindi', text), 'hi')
    assert.equal(normalizeLanguage('hi', text), 'hi')
    assert.equal(normalizeLanguage('Odia', text), 'or')
    assert.equal(normalizeLanguage('or', text), 'or')
    assert.equal(normalizeLanguage('Oriya', text), 'or')
  })

  it('falls back to detection for unknown labels', () => {
    const text = 'मुझे सीने में दर्द है'
    assert.equal(normalizeLanguage('Esperanto', text, detectScriptLanguage(text).code), 'hi')
  })

  it('round-trips between scheme codes and display languages', () => {
    assert.equal(fromIntakeLanguage('Hindi'), 'hi')
    assert.equal(fromIntakeLanguage('Odia'), 'or')
    assert.equal(fromIntakeLanguage('English'), 'en')
    assert.equal(toIntakeLanguage('hi'), 'Hindi')
    assert.equal(toIntakeLanguage('or'), 'Odia')
    assert.equal(toIntakeLanguage('en'), 'English')
  })
})

/* ------------------------------------------------------------------ */
/*  Unit tests — transliteration                                       */
/* ------------------------------------------------------------------ */

describe('transliterationService', () => {
  it('converts Devanagari to Latin with no script residue', () => {
    const latin = transliterateToLatin('मेरा नाम राम है', 'devanagari')
    assert.ok(latin.length > 0)
    assert.ok(!/[\u0900-\u097F]/.test(latin), `still has Devanagari: ${latin}`)
    assert.ok(/[a-z]/.test(latin))
  })

  it('converts Odia to Latin with no script residue', () => {
    const latin = transliterateToLatin('ମୋର ଛାତି ଯନ୍ତ୍ରଣା ଅଛି', 'odia')
    assert.ok(latin.length > 0)
    assert.ok(!/[\u0B00-\u0B7F]/.test(latin), `still has Odia: ${latin}`)
  })

  it('leaves Latin text untouched', () => {
    assert.equal(transliterateToLatin('chest pain ok', 'devanagari'), 'chest pain ok')
  })

  it('getLatinForm keeps Latin fragments inside mixed text', () => {
    const latin = getLatinForm('मुझे chest pain hai', 'hi', 'devanagari')
    assert.ok(latin.includes('chest pain'))
    assert.ok(!/[\u0900-\u097F]/.test(latin))
  })
})

/* ------------------------------------------------------------------ */
/*  Unit tests — multilingual anonymiser                               */
/* ------------------------------------------------------------------ */

describe('multilingualAnonymizer', () => {
  it('redacts a Devanagari name and reports per-language counts', () => {
    const { text, report } = anonymizeMultilingual('मेरा नाम राम कुमार है। श्री सिंह जी मिले।', 'hi')
    assert.ok(text.includes('[NAME REDACTED]'))
    assert.ok(report.redactedCount >= 2)
    const hi = report.byLanguage?.find((b) => b.language === 'hi')
    assert.ok(hi && hi.count >= 2)
  })

  it('redacts an Odia address', () => {
    const { text } = anonymizeMultilingual('ଠିକଣା: ଭୁବନେଶ୍ୱର, ଓଡ଼ିଶା', 'or')
    assert.ok(text.includes('[ADDRESS REDACTED]'))
  })

  it('redacts a romanised Hinglish name', () => {
    const { text } = anonymizeMultilingual('mera naam Rahul Sharma hai. We met at the clinic.', 'hi')
    assert.ok(text.includes('[NAME REDACTED]'))
  })

  it('redacts an OCR-noisy Aadhaar even in English', () => {
    const { text } = anonymizeMultilingual('My account 4321 8765 109O expires soon', 'en')
    assert.ok(text.includes('[AADHAAR REDACTED]'), text)
  })

  it('never leaves a captured value behind', () => {
    const { text } = anonymizeMultilingual('श्री राम कुमार ने बताया कि उनका नाम रोहन है', 'hi')
    assert.ok(!text.includes('रोहन'))
    assert.ok(text.includes('[NAME REDACTED]'))
  })

  it('sanitizePII deep-walks nested payloads', () => {
    const clean = sanitizePII<string | { nested: string[]; num: number }>({
      nested: ['मेरा नाम राम है', 'Aadhaar 9999 8888 7777'],
      num: 42,
    } as never)
    const value = clean as unknown as { nested: string[]; num: number }
    assert.equal(value.num, 42)
    assert.ok(!value.nested[0].includes('राम'))
    assert.ok(value.nested[0].includes('[NAME REDACTED]'))
    assert.ok(value.nested[1].includes('[AADHAAR REDACTED]'))
  })
})

/* ------------------------------------------------------------------ */
/*  Unit tests — multilingual triage                                   */
/* ------------------------------------------------------------------ */

describe('multilingualTriageService', () => {
  it('flags Hindi chest pain as red with a Hindi draft', () => {
    const result = analyzeWithFallback({ text: 'मुझे सीने में दर्द है और सांस भी फूल रही है।' })
    const note = result.note
    assert.equal(note.language, 'hi')
    assert.equal(result.detectedLanguage.code, 'hi')
    const flag = note.urgencyFlags.find((f) => f.ruleId === 'URG-HI-01')
    assert.ok(flag, `expected URG-HI-01 in ${JSON.stringify(note.urgencyFlags)}`)
    assert.equal(flag.severity, 'red')
    assert.equal(note.riskScore, 'High')
    assert.ok(note.disclaimer.includes('निदान'))
    assert.ok(note.structuredNote.chiefComplaint.startsWith('मुख्य शिकायत'))
  })

  it('reports missing vitals for a Hindi intake without them', () => {
    const result = analyzeWithFallback({ text: 'मुझे सीने में दर्द है।' })
    const missing = result.note.missingInformation.map((m) => m.field)
    assert.ok(missing.some((f) => f.includes('महत्वपूर्ण संकेत')), missing.join(' | '))
  })

  it('returns Hindi follow-up questions', () => {
    const result = analyzeWithFallback({ text: 'मुझे सीने में दर्द है।' })
    assert.ok(result.note.followUpQuestions.length >= 3)
    assert.ok(result.note.followUpQuestions.every((q) => /[\u0900-\u097F]/.test(q.question)))
    assert.ok(result.note.followUpQuestions.some((q) => q.question.includes('लक्षण कब से')))
  })

  it('flags Odia chest pain as red', () => {
    const result = analyzeWithFallback({ text: 'ମୋର ଛାତି ଯନ୍ତ୍ରଣା ଅଛି।' })
    assert.equal(result.note.language, 'or')
    const flag = result.note.urgencyFlags.find((f) => f.ruleId === 'URG-OR-01')
    assert.ok(flag)
    assert.equal(flag.severity, 'red')
    assert.equal(result.note.riskScore, 'High')
    assert.ok(result.note.disclaimer.includes('ନିଦାନ'))
  })

  it('reports missing vitals for an Odia intake without them', () => {
    const result = analyzeWithFallback({ text: 'ମୋର ଛାତି ଯନ୍ତ୍ରଣା ଅଛି।' })
    assert.ok(result.note.missingInformation.some((m) => m.field.includes('ସଙ୍କେତ')))
  })

  it('keeps the English pipeline working with English drafts', () => {
    const result = analyzeWithFallback({ text: 'Patient reports chest pain since yesterday morning.' })
    assert.equal(result.note.language, 'en')
    const flag = result.note.urgencyFlags.find((f) => f.ruleId === 'URG-01')
    assert.ok(flag)
    assert.equal(flag.severity, 'red')
    assert.equal(result.note.riskScore, 'High')
    assert.ok(result.note.disclaimer.includes('does not diagnose'))
  })

  it('smoothes English intake with present vitals', () => {
    const result = analyzeWithFallback({ text: 'BP 130/90 and pulse 72, chest pain since yesterday.' })
    assert.ok(result.note.structuredNote.vitals.includes('130/90'))
    assert.ok(!result.note.missingInformation.some((m) => m.field.includes('Vital signs')))
  })

  it('merges English urgency rules for mixed Hinglish when silent', () => {
    const result = analyzeWithFallback({
      text: 'मुझे बीपी 120/80 है, दवा लेता हूँ, पहले कोई बीमारी नहीं रही, कब से यह समस्या है? chest pain जैसा महसूस होता है।',
    })
    assert.equal(result.note.language, 'hi')
    assert.equal(result.detectedLanguage.isMixed, true)
    const flag = result.note.urgencyFlags.find((f) => f.ruleId === 'URG-01')
    assert.ok(flag, `expected English fallback flag in ${JSON.stringify(result.note.urgencyFlags)}`)
  })

  it('rule registry resolves the right language set per text', () => {
    assert.equal(getRuleSetForText('मुझे सीने में दर्द है').language, 'hi')
    assert.equal(getRuleSetForText('ଛାତି ଯନ୍ତ୍ରଣା').language, 'or')
    assert.equal(getRuleSetForText('chest pain today').language, 'en')
    assert.equal(getRuleSetForText('whatever', 'hi').language, 'hi')
  })
})

/* ------------------------------------------------------------------ */
/*  HTTP integration                                                   */
/* ------------------------------------------------------------------ */

interface AnalyzedNote {
  language?: string
  urgencyFlags: Array<{ ruleId: string; severity: string; language?: string }>
  missingInformation: Array<{ field: string }>
  followUpQuestions: Array<{ question: string }>
  riskScore: string
  structuredNote: { vitals: string; chiefComplaint: string }
  disclaimer: string
}

interface AnalyzeBody {
  note: AnalyzedNote
  anonymization: { redactedCount: number; byLanguage?: Array<{ language: string; count: number }> }
  detectedLanguage: { code: string; label: string; script: string; isMixed: boolean; confidence: number }
  language: string
}

describe('multilingual API (HTTP)', () => {
  let server: Server
  let base = ''

  before(async () => {
    seedUsers()
    clearAudit()
    server = createApp().listen(0)
    await new Promise<void>((resolve) => server.once('listening', () => resolve()))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  after(async () => {
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

  let nurse = ''
  let doctor = ''
  let patient = ''

  before(async () => {
    nurse = await login('nurse', 'Nurse@123')
    doctor = await login('doctor', 'Doctor@123')
    patient = await login('patient', 'Patient@123')
    void doctor
  })

  it('analyze in Hindi as staff returns a Hindi note + detection + audit', async () => {
    const res = await api(nurse, 'POST', '/api/triage/analyze', { text: 'मुझे सीने में दर्द है।' })
    assert.equal(res.status, 200)
    const body = res.body as unknown as AnalyzeBody
    assert.equal(body.language, 'hi')
    assert.equal(body.note.language, 'hi')
    assert.equal(body.detectedLanguage.code, 'hi')
    assert.ok(body.note.urgencyFlags.some((f) => f.ruleId === 'URG-HI-01'))
    assert.equal(body.note.riskScore, 'High')

    const audits = listAudit()
    assert.ok(audits.some((a) => a.action === 'triage.analyzed' && a.detail.includes('hi')))
  })

  it('analyze stays staff-only — patients get 403', async () => {
    const res = await api(patient, 'POST', '/api/triage/analyze', { text: 'chest pain' })
    assert.equal(res.status, 403)
  })

  it('explicit language wins over detection', async () => {
    const res = await api(nurse, 'POST', '/api/triage/analyze', { text: 'मुझे सीने में दर्द है।', language: 'en' })
    assert.equal(res.status, 200)
    const body = res.body as unknown as AnalyzeBody
    assert.equal(body.note.language, 'en')
    assert.equal(body.note.urgencyFlags.length, 0)
  })

  it('anonymize preview redacts Hindi PII for any authenticated role', async () => {
    const res = await api(patient, 'POST', '/api/triage/anonymize', { text: 'मेरा नाम राम कुमार है। पता: गांधी नगर, दिल्ली' })
    assert.equal(res.status, 200)
    const body = res.body as { text: string; report: { redactedCount: number; byLanguage?: Array<{ language: string; count: number }> }; anonymization: { redactedCount: number }; language: string }
    assert.ok(body.text.includes('[NAME REDACTED]'))
    assert.ok(body.text.includes('[ADDRESS REDACTED]'))
    assert.equal(body.language, 'hi')
    assert.ok(body.report.byLanguage?.some((b) => b.language === 'hi'))
    assert.equal(body.anonymization.redactedCount, body.report.redactedCount)
  })

  it('rules endpoint exposes all three languages with legacy fields', async () => {
    const res = await api(nurse, 'GET', '/api/triage/rules')
    assert.equal(res.status, 200)
    const body = res.body as { prescribing: boolean; urgencySignals: Array<{ id: string }>; languages: Record<'en' | 'hi' | 'or', { label: string; disclaimer: string; urgencyRules: Array<{ id: string }>; bannedPhrases: Array<{ pattern: string; replacement: string }> }> }
    assert.equal(body.prescribing, false)
    assert.ok(body.urgencySignals.some((s) => s.id === 'URG-01'))
    assert.equal(body.languages.en.label, 'English')
    assert.equal(body.languages.hi.label, 'Hindi')
    assert.equal(body.languages.or.label, 'Odia')
    assert.ok(body.languages.hi.urgencyRules.some((r) => r.id === 'URG-HI-01'))
    assert.ok(body.languages.or.urgencyRules.some((r) => r.id === 'URG-OR-01'))
    assert.ok(body.languages.hi.disclaimer.includes('निदान'))
    assert.ok(body.languages.hi.bannedPhrases.some((b) => b.replacement.includes('दवा')))
  })

  it('language/supported lists the three languages with disclaimers', async () => {
    const res = await api(nurse, 'GET', '/api/language/supported')
    assert.equal(res.status, 200)
    const body = res.body as { languages: Array<{ code: string; label: string; disclaimer: string }> }
    assert.equal(body.languages.length, 3)
    assert.deepEqual(body.languages.map((l) => l.label).sort(), ['English', 'Hindi', 'Odia'])
    assert.ok(body.languages.every((l) => l.disclaimer.length > 10))
  })

  it('language/detect recognises Hinglish with a display label', async () => {
    const res = await api(nurse, 'POST', '/api/language/detect', { text: 'मुझे सीने में दर्द hai aur बुखार भी hai.' })
    assert.equal(res.status, 200)
    const body = res.body as { detectedLanguage: { code: string; label: string; script: string; isMixed: boolean } }
    assert.equal(body.detectedLanguage.code, 'hi')
    assert.equal(body.detectedLanguage.label, 'Hindi')
    assert.equal(body.detectedLanguage.isMixed, true)
    assert.equal(body.detectedLanguage.script, 'mixed')
  })

  it('language/transliterate converts Devanagari to Latin', async () => {
    const res = await api(nurse, 'POST', '/api/language/transliterate', { text: 'मेरा नाम राम है', from: 'devanagari' })
    assert.equal(res.status, 200)
    const body = res.body as { latinForm: string; from: string; originalText: string }
    assert.equal(body.from, 'devanagari')
    assert.ok(body.latinForm.length > 0)
    assert.ok(!/[\u0900-\u097F]/.test(body.latinForm))
    assert.ok(!/[\u0B00-\u0B7F]/.test(body.latinForm))
  })

  it('language/transliterate rejects an unknown source script', async () => {
    const res = await api(nurse, 'POST', '/api/language/transliterate', { text: 'नमस्ते', from: 'greek' })
    assert.equal(res.status, 400)
  })

  it('creates a session whose note is analysed in Hindi (IntakeLanguage passthrough)', async () => {
    const res = await api(nurse, 'POST', '/api/sessions', {
      text: 'मुझे सीने में दर्द है और बुखार भी है।',
      consentAcknowledged: true,
      language: 'Hindi',
    })
    assert.equal(res.status, 201)
    const body = res.body as { session: { id: string; language: string; note: AnalyzedNote } }
    assert.equal(body.session.language, 'Hindi')
    assert.equal(body.session.note.language, 'hi')
    assert.ok(body.session.note.urgencyFlags.some((f) => f.ruleId === 'URG-HI-01'))
  })

  it('writes language.detected audit entries', async () => {
    const audits = listAudit()
    assert.ok(audits.some((a) => a.action === 'language.detected' && a.detail.includes('mixed')))
    assert.ok(audits.some((a) => a.action === 'triage.anonymized' && a.detail.includes('hi')))
  })
})