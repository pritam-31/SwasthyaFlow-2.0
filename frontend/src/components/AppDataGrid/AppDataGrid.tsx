import { Box, Skeleton, TextField, Typography, useMediaQuery } from '@mui/material'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  DataGridPro,
  GridToolbarColumnsButton,
  GridToolbarContainer,
  GridToolbarDensitySelector,
  GridToolbarExport,
  GridToolbarFilterButton,
  useGridApiRef,
  type GridColDef,
  type GridColumnVisibilityModel,
  type GridDensity,
  type GridFilterModel,
  type GridInitialState,
  type GridPaginationModel,
  type GridRowId,
  type GridRowSelectionModel,
  type GridSortModel,
  type GridValidRowModel,
} from '@mui/x-data-grid-pro'

/**
 * ONE place for every table in the app.
 *
 * Wraps MUI X `DataGridPro` (Pro) with the product's look, responsive
 * behaviour, persisted state, loading/empty/error handling and an optional
 * mobile card list. To move to the free Community build, change the import of
 * `DataGridPro` above to `'@mui/x-data-grid'` and drop the Pro-only flags
 * (`pinned` columns)  -  everything else is shared.
 */

const STORAGE_PREFIX = 'sf-grid:'

export interface AppDataGridProps<Row extends GridValidRowModel> {
  rows: readonly Row[]
  columns: GridColDef<Row>[]
  /** Stable id accessor. Defaults to `row.id`. */
  getRowId?: (row: Row) => GridRowId
  /** Required  -  used as the grid's accessible name. */
  ariaLabel: string
  /** localStorage key (without prefix) for persisted sort/filter/columns/page. */
  storageKey?: string
  loading?: boolean
  error?: string | null
  onRetry?: () => void
  /** Row click handler (typically navigate to detail). */
  onRowClick?: (row: Row) => void
  /** Per-row class name (e.g. highlight the selected/active row). */
  getRowClassName?: (row: Row) => string
  pageSizeOptions?: number[]
  defaultPageSize?: number
  defaultDensity?: GridDensity
  checkboxSelection?: boolean
  /** Rendered in the toolbar when rows are selected; return inline controls. */
  bulkActions?: (selectedIds: RowId[], selectedRows: Row[]) => ReactNode
  /** Always-visible toolbar content (left side) when nothing is selected. */
  toolbarStart?: ReactNode
  quickFilterPlaceholder?: string
  /** Hide the built-in search box (e.g. when the page owns search/filter state). */
  disableQuickFilter?: boolean
  /** Called whenever selection changes (role-based action enablement). */
  onSelectionChange?: (ids: RowId[]) => void
  /** Controlled column visibility from the parent (role / responsive rules). */
  columnVisibilityModel?: GridColumnVisibilityModel
  /** Tabs etc. can drive the filter model. */
  filterModel?: GridFilterModel
  onFilterModelChange?: (model: GridFilterModel) => void
  autoHeight?: boolean
  height?: number | string
  maxHeight?: number
  rowHeight?: number
  disableColumnFilter?: boolean
  hideToolbar?: boolean
  /** Hide the footer entirely (small embedded tables). */
  hideFooter?: boolean
  /** Card renderer  -  when provided, screens < 768px show a card list instead. */
  mobileCardRenderer?: (row: Row) => ReactNode
  emptyTitle?: string
  emptyBody?: string
  emptyAction?: ReactNode
  sx?: object
}

type RowId = GridRowId
type RowSelection = GridRowSelectionModel

export function AppDataGrid<Row extends GridValidRowModel>({
  rows,
  columns,
  getRowId,
  ariaLabel,
  storageKey,
  loading = false,
  error = null,
  onRetry,
  onRowClick,
  getRowClassName,
  pageSizeOptions = [10, 20, 50, 100],
  defaultPageSize = 20,
  defaultDensity = 'standard',
  checkboxSelection = false,
  bulkActions,
  toolbarStart,
  quickFilterPlaceholder = 'Search...',
  disableQuickFilter = false,
  onSelectionChange,
  columnVisibilityModel,
  filterModel: filterModelProp,
  onFilterModelChange,
  autoHeight = false,
  height,
  maxHeight,
  rowHeight = 56,
  disableColumnFilter = false,
  hideToolbar = false,
  hideFooter = false,
  mobileCardRenderer,
  emptyTitle = 'Nothing here yet',
  emptyBody = 'Rows will appear here once there is data to show.',
  emptyAction,
  sx,
}: AppDataGridProps<Row>) {
  const apiRef = useGridApiRef()

  const isMobile = useMediaQuery('(max-width: 767px)')
  const isTablet = useMediaQuery('(min-width: 768px) and (max-width: 1023px)')

  // ---- controlled models ------------------------------------------------
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    pageSize: defaultPageSize,
  })
  const [sortModel, setSortModel] = useState<GridSortModel>([])
  const [innerFilterModel, setInnerFilterModel] = useState<GridFilterModel>({ items: [] })
  const [density, setDensity] = useState<GridDensity>(defaultDensity)
  const [userVisibility, setUserVisibility] = useState<GridColumnVisibilityModel>({})
  const [selection, setSelection] = useState<RowSelection>({ type: 'include', ids: new Set() })

  const filterModel = filterModelProp ?? innerFilterModel
  const setFilterModel = (model: GridFilterModel) => {
    if (filterModelProp === undefined) setInnerFilterModel(model)
    onFilterModelChange?.(model)
  }

  // ---- responsive column visibility (< 1024 hides Language + Reports) ----
  const responsiveVisibility = useMemo<GridColumnVisibilityModel>(() => {
    if (!isTablet) return {}
    const hidden: GridColumnVisibilityModel = {}
    for (const c of columns) {
      if (c.field === 'language' || c.field === 'reports' || c.field === 'reportCount') hidden[c.field] = false
    }
    return hidden
  }, [isTablet, columns])

  const effectiveVisibility = useMemo<GridColumnVisibilityModel>(
    () => ({ ...columnVisibilityModel, ...userVisibility, ...responsiveVisibility }),
    [columnVisibilityModel, userVisibility, responsiveVisibility],
  )

  // ---- persistence (sort / filter / columns / page size) ----------------
  const restored = useMemo<GridInitialState | undefined>(() => readPersisted(storageKey), [storageKey])
  const persistTimer = useRef<number | undefined>(undefined)

  const handleStateChange = useCallback(() => {
    if (!storageKey) return
    window.clearTimeout(persistTimer.current)
    persistTimer.current = window.setTimeout(() => {
      const api = apiRef.current
      if (!api) return
      try {
        writePersisted(storageKey, api.exportState() as GridInitialState)
      } catch {
        /* ignore quota / private-mode errors */
      }
    }, 300)
  }, [apiRef, storageKey])

  useEffect(() => () => window.clearTimeout(persistTimer.current), [])

  useEffect(() => {
    onSelectionChange?.(Array.from(selection.ids))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection])

  const selectedRows = useMemo(
    () => rows.filter((r) => selection.ids.has(getRowId?.(r) ?? (r as unknown as { id: RowId }).id)),
    [rows, selection, getRowId],
  )

  // ---- error state ------------------------------------------------------
  if (error) {
    return (
      <div
        role="alert"
        className="flex flex-col items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50/70 px-6 py-10 text-center"
      >
        <p className="text-sm font-bold text-rose-800">Could not load this table</p>
        <p className="max-w-md text-[12px] text-rose-700">{error}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg bg-rose-600 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-rose-700"
          >
            Retry
          </button>
        )}
      </div>
    )
  }

  // ---- mobile card mode -------------------------------------------------
  if (isMobile && mobileCardRenderer) {
    return (
      <MobileCardView<Row>
        rows={rows}
        columns={columns}
        getRowId={getRowId}
        loading={loading}
        filterModel={filterModel}
        setFilterModel={setFilterModel}
        onRowClick={onRowClick}
        placeholder={quickFilterPlaceholder}
        ariaLabel={ariaLabel}
        renderCard={mobileCardRenderer}
        emptyTitle={emptyTitle}
        emptyBody={emptyBody}
        emptyAction={emptyAction}
      />
    )
  }

  const Toolbar = () => (
    <GridToolbarContainer sx={{ gap: 0.5, px: 1, py: 0.75, borderBottom: '1px solid', borderColor: 'divider' }}>
      {checkboxSelection && selection.ids.size > 0 && bulkActions ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1 }}>
          <Typography variant="caption" sx={{ fontWeight: 700 }}>
            {selection.ids.size} selected
          </Typography>
          {bulkActions(Array.from(selection.ids), selectedRows)}
        </Box>
      ) : (
        toolbarStart
      )}
      <Box sx={{ flex: 1 }} />
      <GridToolbarColumnsButton />
      {!disableColumnFilter && <GridToolbarFilterButton />}
      <GridToolbarDensitySelector />
      <GridToolbarExport csvOptions={{ allColumns: true, fileName: storageKey ?? 'export' }} />
      {!disableQuickFilter && (
        <TextField
          size="small"
          value={(filterModel.quickFilterValues ?? []).join(' ')}
          placeholder={quickFilterPlaceholder}
          onChange={(e) => {
            const value = e.target.value
            setFilterModel({ ...filterModel, quickFilterValues: value ? value.split(' ').filter(Boolean) : [] })
          }}
          slotProps={{ htmlInput: { 'aria-label': quickFilterPlaceholder } }}
          sx={{ width: 240, '& .MuiInputBase-root': { fontSize: 13, height: 34 } }}
        />
      )}
    </GridToolbarContainer>
  )

  const gridHeight = height ?? (autoHeight ? undefined : 600)

  return (
    <section aria-label={ariaLabel} className="w-full">
      <div style={{ width: '100%', minHeight: 0 }}>
        <DataGridPro<Row>
          apiRef={apiRef}
          rows={rows as Row[]}
          columns={columns}
          getRowId={getRowId ?? ((row) => (row as unknown as { id: RowId }).id)}
          loading={loading}
          aria-label={ariaLabel}
          checkboxSelection={checkboxSelection}
          disableRowSelectionOnClick
          rowSelectionModel={selection}
          onRowSelectionModelChange={(model) => setSelection(model)}
          paginationModel={paginationModel}
          onPaginationModelChange={setPaginationModel}
          pageSizeOptions={pageSizeOptions}
          sortModel={sortModel}
          onSortModelChange={setSortModel}
          filterModel={filterModel}
          onFilterModelChange={setFilterModel}
          columnVisibilityModel={effectiveVisibility}
          onColumnVisibilityModelChange={setUserVisibility}
          density={density}
          onDensityChange={setDensity}
          onRowClick={onRowClick ? (params) => onRowClick(params.row) : undefined}
          getRowClassName={getRowClassName ? (params) => getRowClassName(params.row) : undefined}
          onStateChange={handleStateChange}
          rowHeight={rowHeight}
          autoHeight={autoHeight}
          hideFooter={hideFooter}
          initialState={restored}
          localeText={LOCALE_TEXT}
          showToolbar={!hideToolbar}
          slots={{
            toolbar: Toolbar,
            loadingOverlay: GridSkeletonOverlay,
            noRowsOverlay: () => <NoRowsOverlay title={emptyTitle} body={emptyBody} action={emptyAction} />,
            noResultsOverlay: () => <NoRowsOverlay title="No matching rows" body="Try a different search or filter." />,
          }}
          sx={{
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: '16px',
            backgroundColor: 'background.paper',
            ...(maxHeight ? { maxHeight } : {}),
            height: gridHeight,
            '--DataGrid-containerBackground': 'transparent',
            '& .MuiDataGrid-columnHeaders': {
              backgroundColor: 'action.hover',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              fontSize: 11,
              color: 'text.secondary',
            },
            '& .MuiDataGrid-columnHeaderTitle': { fontWeight: 800 },
            '& .MuiDataGrid-cell': {
              borderBottom: '1px solid',
              borderColor: 'divider',
              display: 'flex',
              alignItems: 'center',
            },
            '& .MuiDataGrid-cell:focus, & .MuiDataGrid-cell:focus-within': { outline: 'none' },
            '& .MuiDataGrid-columnHeader:focus, & .MuiDataGrid-columnHeader:focus-within': { outline: 'none' },
            '& .MuiDataGrid-columnHeader--moving': { backgroundColor: 'action.selected' },
            '& .MuiDataGrid-row:hover': { backgroundColor: 'action.hover' },
            '& .MuiDataGrid-row.Mui-selected': {
              backgroundColor: 'color-mix(in srgb, currentColor 6%, transparent)',
            },
            '& .MuiDataGrid-footerContainer': { borderTop: '1px solid', borderColor: 'divider' },
            '& .MuiDataGrid-cell:focus-visible, & .MuiDataGrid-columnHeader:focus-visible': {
              outline: '2px solid',
              outlineColor: 'primary.main',
              outlineOffset: -2,
            },
            ...sx,
          }}
        />
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/*  Overlays                                                           */
/* ------------------------------------------------------------------ */

function GridSkeletonOverlay() {
  return (
    <div className="flex h-full w-full flex-col gap-2 bg-white/60 p-3" aria-hidden="true">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} variant="rounded" height={40} sx={{ borderRadius: '10px' }} />
      ))}
    </div>
  )
}

function NoRowsOverlay({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 p-8 text-center">
      <p className="text-sm font-bold text-ink-800">{title}</p>
      <p className="max-w-sm text-[12px] text-ink-500">{body}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Mobile card view                                                   */
/* ------------------------------------------------------------------ */

function MobileCardView<Row extends GridValidRowModel>({
  rows,
  columns,
  getRowId,
  loading,
  filterModel,
  setFilterModel,
  onRowClick,
  placeholder,
  ariaLabel,
  renderCard,
  emptyTitle,
  emptyBody,
  emptyAction,
}: {
  rows: readonly Row[]
  columns: GridColDef<Row>[]
  getRowId?: (row: Row) => GridRowId
  loading: boolean
  filterModel: GridFilterModel
  setFilterModel: (model: GridFilterModel) => void
  onRowClick?: (row: Row) => void
  placeholder: string
  ariaLabel: string
  renderCard: (row: Row) => ReactNode
  emptyTitle: string
  emptyBody: string
  emptyAction?: ReactNode
}) {
  const quick = filterModel.quickFilterValues?.join(' ') ?? ''
  const idOf = (row: Row) => getRowId?.(row) ?? (row as unknown as { id: GridRowId }).id

  const searchable = useMemo(() => columns.filter((c) => c.field !== '__actions'), [columns])

  const filtered = useMemo(() => {
    const q = quick.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((row) =>
      searchable.some((c) => {
        const value = (row as Record<string, unknown>)[c.field]
        return value != null && String(value).toLowerCase().includes(q)
      }),
    )
  }, [rows, quick, searchable])

  return (
    <section aria-label={ariaLabel} className="flex flex-col gap-3">
      <input
        type="search"
        value={quick}
        onChange={(e) => setFilterModel({ ...filterModel, quickFilterValues: e.target.value ? [e.target.value] : [] })}
        placeholder={placeholder}
        aria-label={placeholder}
        className="inp"
      />
      {loading ? (
        <div className="flex flex-col gap-2" aria-hidden="true">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} variant="rounded" height={96} sx={{ borderRadius: '16px' }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <NoRowsOverlay title={emptyTitle} body={emptyBody} action={emptyAction} />
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((row) => (
            <li key={String(idOf(row))}>
              <button
                type="button"
                onClick={() => onRowClick?.(row)}
                className="w-full rounded-2xl border border-ink-100 bg-white p-3.5 text-left shadow-[var(--shadow-card)] transition-colors hover:border-brand-200"
              >
                {renderCard(row)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/* ------------------------------------------------------------------ */
/*  Persistence helpers                                                */
/* ------------------------------------------------------------------ */

function readPersisted(storageKey?: string): GridInitialState | undefined {
  if (!storageKey || typeof window === 'undefined') return undefined
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + storageKey)
    if (!raw) return undefined
    return JSON.parse(raw) as GridInitialState
  } catch {
    return undefined
  }
}

function writePersisted(storageKey: string, state: GridInitialState) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_PREFIX + storageKey, JSON.stringify(state))
  } catch {
    /* ignore */
  }
}

const LOCALE_TEXT = {
  noRowsLabel: 'No rows',
  columnMenuLabel: 'Menu',
  columnMenuShowColumns: 'Show columns',
  columnMenuManageColumns: 'Manage columns',
  columnMenuFilter: 'Filter',
  columnMenuHideColumn: 'Hide column',
  columnMenuUnsort: 'Unsort',
  columnMenuSortAsc: 'Sort by ASC',
  columnMenuSortDesc: 'Sort by DESC',
  columnsButtonLabel: 'Columns',
  filterButtonLabel: 'Filters',
  densityButtonLabel: 'Density',
  exportButtonLabel: 'Export',
  footerRowSelected: (count: number) => `${count} row${count > 1 ? 's' : ''} selected`,
} as const

export { LOCALE_TEXT as APP_GRID_LOCALE_TEXT }
