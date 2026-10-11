import type { PIIModality } from '../types/anonymisation.types'
import type { SupportedLanguage } from '../types/language.types'
import { anonymiseText } from './unifiedAnonymizer'

/**
 * PII leak test harness (P0-7).
 *
 * A built-in corpus of SYNTHETIC strings (never real people) exercises every
 * text modality and language. For each case the harness asserts that:
 *  - no known PII substring survives,
 *  - clinical content is preserved verbatim (anonymisation never alters meaning),
 *  - the expected typed placeholder is inserted,
 *  - a second pass is idempotent.
 *
 * The corpus is exposed to tests so a deliberately leaky entry can prove the
 * harness actually catches leaks (the sanity check).
 */

export interface HarnessCase {
  name: string
  modality: PIIModality
  text: string
  language?: SupportedLanguage
  /** Substrings that MUST NOT appear in the anonymised output. */
  mustBeAbsent: string[]
  /** Clinical substrings that MUST survive untouched. */
  mustRemain?: string[]
  /** Typed placeholder expected in the output. */
  expectPlaceholder?: string
}

export interface HarnessFailure {
  case: string
  leak: string
}

export interface HarnessResult {
  passed: number
  failed: number
  failures: HarnessFailure[]
}

/** Synthetic, non-identifying corpus. All names/numbers are fabricated. */
export const LEAK_CORPUS: HarnessCase[] = [
  {
    name: 'intake-text-en',
    modality: 'intake-text',
    text: 'My name is Ramesh Kumar and my phone is 9876543210. High BP 160/100 noted, Hb 9.2.',
    language: 'en',
    mustBeAbsent: ['Ramesh Kumar', '9876543210'],
    mustRemain: ['BP', '160/100', 'Hb'],
    expectPlaceholder: '[NAME REDACTED]',
  },
  {
    name: 'intake-text-hi',
    modality: 'intake-text',
    text: 'मेरा नाम रमेश कुमार है और फ़ोन 9876543210 है। बुखार 102 दर्ज है।',
    language: 'hi',
    mustBeAbsent: ['रमेश कुमार', '9876543210'],
    mustRemain: ['बुखार', '102'],
    expectPlaceholder: '[NAME REDACTED]',
  },
  {
    name: 'intake-text-or',
    modality: 'intake-text',
    text: 'ମୋର ନାମ ରମେଶ କୁମାର ଏବଂ ଫୋନ 9876543210। ଜ୍ୱର 102।',
    language: 'or',
    mustBeAbsent: ['ରମେଶ କୁମାର', '9876543210'],
    mustRemain: ['ଜ୍ୱର', '102'],
    expectPlaceholder: '[NAME REDACTED]',
  },
  {
    name: 'honorific-en',
    modality: 'voice-transcript',
    text: 'Dr. A. Mehta reviewed the case and advised a repeat test.',
    language: 'en',
    mustBeAbsent: ['A. Mehta'],
    mustRemain: ['repeat test'],
    expectPlaceholder: '[NAME REDACTED]',
  },
  {
    name: 'phone-plus91',
    modality: 'voice-transcript',
    text: 'Call back on +91-98765 43210 tomorrow.',
    language: 'en',
    mustBeAbsent: ['+91-98765 43210'],
  },
  {
    name: 'phone-zero-prefix',
    modality: 'intake-text',
    text: 'Contact 09876543210 for the report.',
    language: 'en',
    mustBeAbsent: ['09876543210'],
  },
  {
    name: 'aadhaar',
    modality: 'report-text',
    text: 'Aadhaar 1234 5678 9012 verified against the register.',
    language: 'en',
    mustBeAbsent: ['1234 5678 9012'],
    expectPlaceholder: '[AADHAAR REDACTED]',
  },
  {
    name: 'pan',
    modality: 'report-text',
    text: 'PAN ABCDE1234F captured for billing.',
    language: 'en',
    mustBeAbsent: ['ABCDE1234F'],
    expectPlaceholder: '[PAN REDACTED]',
  },
  {
    name: 'voter-id',
    modality: 'report-text',
    text: 'Voter ID ABC1234567 recorded on the form.',
    language: 'en',
    mustBeAbsent: ['ABC1234567'],
  },
  {
    name: 'ration-card',
    modality: 'report-text',
    text: 'Ration Card 1234567890 attached.',
    language: 'en',
    mustBeAbsent: ['1234567890'],
  },
  {
    name: 'passport',
    modality: 'report-text',
    text: 'Passport M1234567 scanned.',
    language: 'en',
    mustBeAbsent: ['M1234567'],
  },
  {
    name: 'driving-license',
    modality: 'report-text',
    text: 'Driving Licence GJ0120230001234 on file.',
    language: 'en',
    mustBeAbsent: ['GJ0120230001234'],
  },
  {
    name: 'email',
    modality: 'report-findings',
    text: 'Sent to john.doe@example.com for records.',
    language: 'en',
    mustBeAbsent: ['john.doe@example.com'],
    expectPlaceholder: '[EMAIL REDACTED]',
  },
  {
    name: 'address-en',
    modality: 'report-metadata',
    text: 'Address: 12 MG Road, Pune 411001.',
    language: 'en',
    mustBeAbsent: ['12 MG Road, Pune 411001'],
    expectPlaceholder: '[ADDRESS REDACTED]',
  },
  {
    name: 'address-hi',
    modality: 'report-metadata',
    text: 'पता: 12 एमजी रोड, पुणे',
    language: 'hi',
    mustBeAbsent: ['एमजी रोड'],
  },
  {
    name: 'address-or',
    modality: 'report-metadata',
    text: 'ଠିକଣା: 12 ଏମଜି ରୋଡ',
    language: 'or',
    mustBeAbsent: ['ଏମଜି ରୋଡ'],
  },
  {
    name: 'dob-en',
    modality: 'report-metadata',
    text: 'DOB: 12/01/1980 as declared.',
    language: 'en',
    mustBeAbsent: ['12/01/1980'],
    expectPlaceholder: '[DOB REDACTED]',
  },
  {
    name: 'dob-hi',
    modality: 'report-metadata',
    text: 'जन्म तिथि: 12/01/1980',
    language: 'hi',
    mustBeAbsent: ['12/01/1980'],
  },
  {
    name: 'dob-or',
    modality: 'report-metadata',
    text: 'ଜନ୍ମ ତାରିଖ: 12/01/1980',
    language: 'or',
    mustBeAbsent: ['12/01/1980'],
  },
  {
    name: 'facility',
    modality: 'report-metadata',
    text: 'Sample processed at District Hospital.',
    language: 'en',
    mustBeAbsent: ['District Hospital'],
    mustRemain: ['Sample processed'],
  },
  {
    name: 'doctor-name',
    modality: 'report-findings',
    text: 'Reported by Dr. S. Nair.',
    language: 'en',
    mustBeAbsent: ['S. Nair'],
  },
  {
    name: 'relative-name',
    modality: 'intake-text',
    text: 'Patient is S/o Ramesh Kumar.',
    language: 'en',
    mustBeAbsent: ['Ramesh Kumar'],
    expectPlaceholder: '[NAME REDACTED]',
  },
  {
    name: 'vehicle',
    modality: 'report-text',
    text: 'Vehicle GJ12AB3456 in the incident note.',
    language: 'en',
    mustBeAbsent: ['GJ12AB3456'],
    expectPlaceholder: '[VEHICLE REDACTED]',
  },
  {
    name: 'insurance',
    modality: 'report-text',
    text: 'Insurance No INS-998877 lodged.',
    language: 'en',
    mustBeAbsent: ['INS-998877'],
    expectPlaceholder: '[INSURANCE REDACTED]',
  },
  {
    name: 'bank-account',
    modality: 'report-text',
    text: 'Account No 123456789012 for refund.',
    language: 'en',
    mustBeAbsent: ['123456789012'],
    expectPlaceholder: '[BANK REDACTED]',
  },
  {
    name: 'ip-address',
    modality: 'log-message',
    text: 'Login succeeded from 192.168.1.101.',
    language: 'en',
    mustBeAbsent: ['192.168.1.101'],
    expectPlaceholder: '[IP REDACTED]',
  },
  {
    name: 'device-id',
    modality: 'log-message',
    text: 'Device MAC 00:1A:2B:3C:4D:5E registered.',
    language: 'en',
    mustBeAbsent: ['00:1A:2B:3C:4D:5E'],
    expectPlaceholder: '[DEVICE REDACTED]',
  },
  {
    name: 'gps',
    modality: 'log-message',
    text: 'Coordinates captured at 19.0760,72.8777 during upload.',
    language: 'en',
    mustBeAbsent: ['19.0760,72.8777'],
    expectPlaceholder: '[GPS REDACTED]',
  },
  {
    name: 'url-with-id',
    modality: 'export-file',
    text: 'Verify at https://phc.example.com/patient?id=PT-9931 now.',
    language: 'en',
    mustBeAbsent: ['id=PT-9931'],
    expectPlaceholder: '[URL REDACTED]',
  },
  {
    name: 'clinical-preserved',
    modality: 'clinician-note',
    text: 'Hb 9.2, BP 160/100, sugar 240. Medication Metformin. Allergy Penicillin.',
    language: 'en',
    mustBeAbsent: [],
    mustRemain: ['Hb 9.2', 'BP 160/100', 'sugar 240', 'Metformin', 'Penicillin'],
  },
]

/** Run the harness against any corpus (used to prove the harness catches leaks). */
export function runHarness(corpus: HarnessCase[]): HarnessResult {
  const failures: HarnessFailure[] = []

  for (const testCase of corpus) {
    const result = anonymiseText(testCase.text, testCase.modality, testCase.language)

    for (const pii of testCase.mustBeAbsent) {
      if (result.text.includes(pii)) failures.push({ case: testCase.name, leak: `pii:${pii}` })
    }
    if (testCase.mustBeAbsent.length > 0 && result.redactedCount === 0) {
      failures.push({ case: testCase.name, leak: 'no-redaction' })
    }
    for (const clinical of testCase.mustRemain ?? []) {
      if (!result.text.includes(clinical)) failures.push({ case: testCase.name, leak: `clinical-altered:${clinical}` })
    }
    if (testCase.expectPlaceholder && !result.text.includes(testCase.expectPlaceholder)) {
      failures.push({ case: testCase.name, leak: `placeholder-missing:${testCase.expectPlaceholder}` })
    }
    const second = anonymiseText(result.text, testCase.modality, testCase.language)
    if (second.text !== result.text) failures.push({ case: testCase.name, leak: 'not-idempotent' })
  }

  return { passed: corpus.length - failedCases(failures), failed: failedCases(failures), failures }
}

function failedCases(failures: HarnessFailure[]): number {
  return new Set(failures.map((failure) => failure.case)).size
}

/** Admin-triggered run over the built-in corpus. */
export function runLeakTests(): HarnessResult {
  return runHarness(LEAK_CORPUS)
}
