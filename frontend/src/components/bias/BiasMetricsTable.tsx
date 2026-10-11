import type { GridColDef } from '@mui/x-data-grid-pro'
import { useMemo, useState } from 'react'
import { AppDataGrid } from '../AppDataGrid'
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

  const rows = useMemo(
    () =>
      layers.filter(
        (l) => (layerFilter === 'all' || l.layerId === layerFilter) && (dimFilter === 'all' || l.slice.dimension === dimFilter),
      ),
    [layers, layerFilter, dimFilter],
  )

  const columns: GridColDef<LayerEvaluation>[] = [
    {
      field: 'layer',
      headerName: t.layer,
      flex: 1,
      minWidth: 170,
      valueGetter: (_value, row) => LAYER_LABEL[row.layerId],
      renderCell: (p) => <span className="text-[12px] font-medium text-ink-700">{LAYER_LABEL[p.row.layerId]}</span>,
    },
    {
      field: 'slice',
      headerName: t.slice,
      flex: 1,
      minWidth: 200,
      valueGetter: (_value, row) => `${row.slice.dimension}=${row.slice.value}`,
      renderCell: (p) => (
        <span className="text-[12px] text-ink-600">
          <span className="text-ink-400">{BIAS_DIMENSION_LABELS[p.row.slice.dimension]}</span> = {p.row.slice.value}
        </span>
      ),
    },
    {
      field: 'sampleCount',
      headerName: t.sampleCount,
      width: 120,
      align: 'right',
      headerAlign: 'right',
      renderCell: (p) => <span className="text-[12px] tabular-nums text-ink-500">{p.row.sampleCount}</span>,
    },
    {
      field: 'precision',
      headerName: BIAS_METRIC_LABELS.precision,
      width: 130,
      align: 'right',
      headerAlign: 'right',
      valueGetter: (_value, row) => row.metric.precision,
      renderCell: (p) => <span className="text-[12px] tabular-nums text-ink-600">{pct(p.row.metric.precision)}</span>,
    },
    {
      field: 'recall',
      headerName: BIAS_METRIC_LABELS.recall,
      width: 130,
      align: 'right',
      headerAlign: 'right',
      valueGetter: (_value, row) => row.metric.recall,
      renderCell: (p) => <span className="text-[12px] tabular-nums text-ink-600">{pct(p.row.metric.recall)}</span>,
    },
    {
      field: 'f1',
      headerName: BIAS_METRIC_LABELS.f1,
      width: 130,
      align: 'right',
      headerAlign: 'right',
      valueGetter: (_value, row) => row.metric.f1,
      renderCell: (p) => <span className="text-[12px] font-semibold tabular-nums text-ink-800">{pct(p.row.metric.f1)}</span>,
    },
  ]

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

      <AppDataGrid<LayerEvaluation>
        rows={rows}
        columns={columns}
        ariaLabel={t.layerMetrics}
        getRowId={(r) => r.evaluationId}
        hideToolbar
        hideFooter
        defaultDensity="compact"
      />
    </div>
  )
}
