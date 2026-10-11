import { ArrowDown, ArrowUp } from 'lucide-react'
import { useMemo, useState } from 'react'
import { cx } from '../ui'
import { BIAS_DIMENSION_LABELS, BIAS_METRIC_LABELS, BIAS_SECTION_LABELS } from '../../services/safetyPolicy'
import {
  ALL_BIAS_DIMENSIONS,
  ALL_LAYER_IDS,
  LAYER_LABEL,
  type BiasSliceDimension,
  type LayerEvaluation,
  type LayerId,
} from '../../types/modelcard.types'

type Lang = 'en' | 'hi' | 'or'

type SortKey = 'layer' | 'slice' | 'sampleCount' | 'precision' | 'recall' | 'f1'

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

/**
 * Per-layer, per-slice evaluation metrics. Sortable by any numeric column and
 * filterable by layer and dimension. Read-only.
 */
export function BiasMetricsTable({ layers, lang = 'en' }: { layers: LayerEvaluation[]; lang?: Lang }) {
  const t = BIAS_SECTION_LABELS[lang]
  const [layerFilter, setLayerFilter] = useState<'all' | LayerId>('all')
  const [dimFilter, setDimFilter] = useState<'all' | BiasSliceDimension>('all')
  const [sortKey, setSortKey] = useState<SortKey>('layer')
  const [asc, setAsc] = useState(true)

  const rows = useMemo(() => {
    const filtered = layers.filter(
      (l) => (layerFilter === 'all' || l.layerId === layerFilter) && (dimFilter === 'all' || l.slice.dimension === dimFilter),
    )
    const value = (l: LayerEvaluation, key: SortKey): number | string => {
      switch (key) {
        case 'layer':
          return l.layerId
        case 'slice':
          return `${l.slice.dimension}=${l.slice.value}`
        case 'sampleCount':
          return l.sampleCount
        case 'precision':
          return l.metric.precision
        case 'recall':
          return l.metric.recall
        case 'f1':
          return l.metric.f1
      }
    }
    return [...filtered].sort((a, b) => {
      const av = value(a, sortKey)
      const bv = value(b, sortKey)
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv))
      return asc ? cmp : -cmp
    })
  }, [layers, layerFilter, dimFilter, sortKey, asc])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setAsc((v) => !v)
    else {
      setSortKey(key)
      setAsc(true)
    }
  }

  const header = (key: SortKey, label: string, align: 'left' | 'right' = 'left') => (
    <th className={cx('px-3 py-2.5 font-bold', align === 'right' && 'text-right')}>
      <button type="button" onClick={() => toggleSort(key)} className="inline-flex items-center gap-1 hover:text-ink-700">
        {label}
        {sortKey === key && (asc ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
      </button>
    </th>
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <select value={layerFilter} onChange={(e) => setLayerFilter(e.target.value as 'all' | LayerId)} className="inp w-auto py-1.5 text-[11px]">
          <option value="all">{t.allLayers}</option>
          {ALL_LAYER_IDS.map((id) => (
            <option key={id} value={id}>
              {LAYER_LABEL[id]}
            </option>
          ))}
        </select>
        <select value={dimFilter} onChange={(e) => setDimFilter(e.target.value as 'all' | BiasSliceDimension)} className="inp w-auto py-1.5 text-[11px]">
          <option value="all">{t.allDimensions}</option>
          {ALL_BIAS_DIMENSIONS.map((d) => (
            <option key={d} value={d}>
              {BIAS_DIMENSION_LABELS[d]}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-xl ring-1 ring-inset ring-ink-200">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="border-b border-ink-200 bg-ink-50/70 text-[10px] uppercase tracking-[0.08em] text-ink-500">
              {header('layer', t.layer)}
              {header('slice', t.slice)}
              {header('sampleCount', t.sampleCount, 'right')}
              {header('precision', BIAS_METRIC_LABELS.precision, 'right')}
              {header('recall', BIAS_METRIC_LABELS.recall, 'right')}
              {header('f1', BIAS_METRIC_LABELS.f1, 'right')}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {rows.map((row) => (
              <tr key={row.evaluationId} className="transition-colors hover:bg-ink-50/60">
                <td className="px-3 py-2.5 text-[12px] font-medium text-ink-700">{LAYER_LABEL[row.layerId]}</td>
                <td className="px-3 py-2.5 text-[12px] text-ink-600">
                  <span className="text-ink-400">{BIAS_DIMENSION_LABELS[row.slice.dimension]}</span> = {row.slice.value}
                </td>
                <td className="px-3 py-2.5 text-right text-[12px] tabular-nums text-ink-500">{row.sampleCount}</td>
                <td className="px-3 py-2.5 text-right text-[12px] tabular-nums text-ink-600">{pct(row.metric.precision)}</td>
                <td className="px-3 py-2.5 text-right text-[12px] tabular-nums text-ink-600">{pct(row.metric.recall)}</td>
                <td className="px-3 py-2.5 text-right text-[12px] font-semibold tabular-nums text-ink-800">{pct(row.metric.f1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
