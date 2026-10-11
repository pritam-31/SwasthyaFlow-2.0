import { runAnonymiserLeakTest } from '../runners/runAnonymiserLeakTest'

const result = runAnonymiserLeakTest()
console.log(
  JSON.stringify(
    {
      passed: result.passed,
      failed: result.failed,
      precision: result.precision,
      recall: result.recall,
      f1: result.f1,
      byLanguage: result.byLanguage,
    },
    null,
    2,
  ),
)
if (result.failed > 0) process.exitCode = 1
