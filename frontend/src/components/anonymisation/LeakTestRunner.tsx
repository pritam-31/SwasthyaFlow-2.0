import { useState } from 'react'
import { PlayCircle, ShieldCheck, ShieldX } from 'lucide-react'
import { useTriage } from '../../context/TriageContext'
import { ANONYMISATION_SECTION_LABELS } from '../../services/safetyPolicy'
import { Badge, Button, Card, EmptyState } from '../ui'
import type { HarnessResult } from '../../types/anonymisation.types'

/**
 * Admin control to run the synthetic PII leak corpus (P0-7). The backend asserts
 * that no known identifier survives and that clinical content is preserved.
 */
export default function LeakTestRunner({ language = 'en' }: { language?: 'en' | 'hi' | 'or' }) {
  const { permissions, runAnonymisationLeakTests } = useTriage()
  const [result, setResult] = useState<HarnessResult | null>(null)
  const [running, setRunning] = useState(false)
  const t = ANONYMISATION_SECTION_LABELS[language]

  if (!permissions.canRunLeakTest) return null

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <ShieldCheck size={14} className="text-brand-600" /> {t.leakTestHeading}
        </span>
      }
      subtitle="Synthetic, non-identifying corpus — proves the pipeline strips every known identifier and preserves clinical content."
      action={
        <Button
          size="sm"
          disabled={running}
          onClick={async () => {
            setRunning(true)
            const res = await runAnonymisationLeakTests()
            setRunning(false)
            if (res) setResult(res)
          }}
        >
          <PlayCircle size={14} /> {running ? '…' : t.runLeakTest}
        </Button>
      }
    >
      {!result ? (
        <EmptyState icon={<ShieldCheck size={20} />} title={t.runLeakTest} hint="No test has been run in this session." />
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200">
              {result.passed} {t.leakTestPassed}
            </Badge>
            <Badge
              className={
                result.failed > 0 ? 'bg-rose-50 text-rose-700 ring-rose-200' : 'bg-ink-100 text-ink-600 ring-ink-200'
              }
            >
              {result.failed} {t.leakTestFailed}
            </Badge>
          </div>
          {result.failures.length === 0 ? (
            <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
              <ShieldCheck size={14} /> {t.noLeaks}
            </p>
          ) : (
            <ul className="space-y-1">
              {result.failures.map((failure, index) => (
                <li key={`${failure.case}-${index}`} className="flex items-center gap-2 text-xs text-rose-700">
                  <ShieldX size={13} /> <span className="font-mono text-[11px]">{failure.case}</span> — {failure.leak}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  )
}
