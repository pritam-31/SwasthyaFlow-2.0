import type { AnonymiserLeakResult } from '../../types/modelcard.types'
import { LEAK_CORPUS, runHarness } from '../../services/anonymisationTestHarness'
import { EVAL_VERSION } from '../version'

/**
 * Anonymiser leak test (P2-13) — wraps the existing P0-7 harness.
 *
 * Runs the synthetic corpus, groups outcomes by language, and derives a
 * precision/recall/F1 view where "positive" means "every expected identifier
 * was removed". Altered clinical content (over-redaction) counts as a false
 * positive.
 */
export function runAnonymiserLeakTest(): AnonymiserLeakResult {
  const result = runHarness(LEAK_CORPUS)

  const byLanguage: Record<string, { passed: number; failed: number }> = {}
  let truePositives = 0
  let falseNegatives = 0
  let falsePositives = 0

  for (const testCase of LEAK_CORPUS) {
    const language = testCase.language ?? 'en'
    const bucket = byLanguage[language] ?? { passed: 0, failed: 0 }
    const failures = result.failures.filter((failure) => failure.case === testCase.name)
    const piiLeak = failures.some((failure) => failure.leak.startsWith('pii:') || failure.leak === 'no-redaction')
    const clinicalAltered = failures.some((failure) => failure.leak.startsWith('clinical-altered:'))

    if (failures.length === 0) {
      bucket.passed += 1
    } else {
      bucket.failed += 1
    }
    byLanguage[language] = bucket

    if (testCase.mustBeAbsent.length > 0) {
      if (piiLeak) falseNegatives += 1
      else truePositives += 1
    }
    if (clinicalAltered) falsePositives += 1
  }

  const precisionDen = truePositives + falsePositives
  const recallDen = truePositives + falseNegatives
  const precision = precisionDen === 0 ? 1 : truePositives / precisionDen
  const recall = recallDen === 0 ? 1 : truePositives / recallDen
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)
  const round4 = (value: number): number => Math.round(value * 10_000) / 10_000

  return {
    passed: result.passed,
    failed: result.failed,
    failures: result.failures,
    byLanguage,
    precision: round4(precision),
    recall: round4(recall),
    f1: round4(f1),
    ranAt: new Date().toISOString(),
    engineVersion: EVAL_VERSION,
  }
}
