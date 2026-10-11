import { Database } from 'lucide-react'
import { Badge } from '../ui'
import { BIAS_DIMENSION_LABELS, BIAS_SECTION_LABELS } from '../../services/safetyPolicy'
import { ALL_BIAS_DIMENSIONS, type DatasetManifest } from '../../types/modelcard.types'

type Lang = 'en' | 'hi' | 'or'

function formatDate(value: string): string {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString()
}

/** Read-only summary of the deterministic synthetic dataset the run consumed. */
export function DatasetManifestCard({ manifest, lang = 'en' }: { manifest: DatasetManifest; lang?: Lang }) {
  const t = BIAS_SECTION_LABELS[lang]
  const totalRecords = manifest.files.reduce((sum, f) => sum + f.count, 0)

  return (
    <div className="space-y-4">
      <div className="grid gap-2 text-[11px] text-ink-500 sm:grid-cols-2">
        <p>
          <span className="font-semibold text-ink-600">{t.datasetVersion}:</span> {manifest.version}
        </p>
        <p>
          <span className="font-semibold text-ink-600">{t.generatorVersion}:</span> {manifest.generatorVersion}
        </p>
        <p>
          <span className="font-semibold text-ink-600">{t.generatedAt}:</span> {formatDate(manifest.generatedAt)}
        </p>
        <p>
          <span className="font-semibold text-ink-600">{t.seed}:</span> <span className="font-mono">{manifest.seed}</span>
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge className="bg-brand-50 text-brand-700 ring-brand-200">
          <Database size={11} /> {t.records}: {totalRecords}
        </Badge>
        <Badge className="bg-ink-100 text-ink-600 ring-ink-200">
          {t.files}: {manifest.files.length}
        </Badge>
      </div>

      <div className="rounded-lg bg-ink-50 p-2.5">
        <p className="text-[10px] font-bold uppercase tracking-wide text-ink-400">{t.checksum}</p>
        <p className="mt-0.5 break-all font-mono text-[11px] text-ink-600">{manifest.checksum}</p>
      </div>

      <div>
        <p className="text-[11px] font-bold uppercase tracking-wide text-ink-400">{t.files}</p>
        <ul className="mt-1.5 space-y-1">
          {manifest.files.map((f) => (
            <li key={f.fileName} className="flex items-center justify-between gap-2 font-mono text-[11px] text-ink-600">
              <span className="truncate">{f.fileName}</span>
              <span className="shrink-0 tabular-nums text-ink-400">{f.count}</span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <p className="text-[11px] font-bold uppercase tracking-wide text-ink-400">{t.sliceCounts}</p>
        <div className="mt-1.5 space-y-2">
          {ALL_BIAS_DIMENSIONS.map((dim) => (
            <div key={dim}>
              <p className="text-[11px] font-semibold text-ink-500">{BIAS_DIMENSION_LABELS[dim]}</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {Object.entries(manifest.sliceCounts[dim] ?? {}).map(([value, count]) => (
                  <span key={value} className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-medium text-ink-600">
                    {value}: <span className="tabular-nums">{count}</span>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
