import { runBiasEvaluation } from '../runners/runBiasEvaluation'

const { report } = runBiasEvaluation({ id: 'cli', username: 'cli', role: 'system-admin' })
console.log(
  JSON.stringify(
    {
      runId: report.runId,
      reportId: report.reportId,
      overallF1: report.summary.overallF1,
      concerningSlices: report.summary.concerningSlices,
      missingSlices: report.missingSlices,
    },
    null,
    2,
  ),
)
