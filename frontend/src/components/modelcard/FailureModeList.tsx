import { Pencil, Plus, ShieldAlert, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button, Card, EmptyState } from '../ui'
import { FailureModeBadge } from './FailureModeBadge'
import { FailureModeEditor } from './FailureModeEditor'
import { FAILURE_MODE_SECTION_LABELS, MODEL_CARD_SECTION_LABELS } from '../../services/safetyPolicy'
import { useApp } from '../../store/AppStore'
import { deleteFailureMode } from '../../services/modelCardApi'
import { ALL_LAYER_IDS, LAYER_LABEL, type FailureMode, type LayerId } from '../../types/modelcard.types'

type Lang = 'en' | 'hi' | 'or'

/**
 * Catalogue of known failure modes with a layer filter. Adding, editing and
 * deleting are gated by `canEdit` — the backend re-checks on every write.
 */
export function FailureModeList({
  failureModes,
  lang = 'en',
  canEdit,
  onChanged,
}: {
  failureModes: FailureMode[]
  lang?: Lang
  canEdit: boolean
  onChanged: () => void
}) {
  const t = FAILURE_MODE_SECTION_LABELS[lang]
  const cardT = MODEL_CARD_SECTION_LABELS[lang]
  const { pushToast } = useApp()
  const [filter, setFilter] = useState<'all' | LayerId>('all')
  const [editing, setEditing] = useState<FailureMode | null>(null)
  const [creating, setCreating] = useState(false)

  const visible = useMemo(
    () => (filter === 'all' ? failureModes : failureModes.filter((f) => f.layerId === filter)),
    [failureModes, filter],
  )

  const remove = async (fm: FailureMode) => {
    if (typeof window !== 'undefined' && !window.confirm(t.deleteConfirm)) return
    try {
      await deleteFailureMode(fm.failureId)
      pushToast('success', t.deleted)
      onChanged()
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : t.delete)
    }
  }

  const defaultLayer: LayerId = filter === 'all' ? ALL_LAYER_IDS[0] : filter

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
          {t.filterLayer}
          <select value={filter} onChange={(e) => setFilter(e.target.value as 'all' | LayerId)} className="inp w-auto py-1.5">
            <option value="all">{t.allLayers}</option>
            {ALL_LAYER_IDS.map((id) => (
              <option key={id} value={id}>
                {LAYER_LABEL[id]}
              </option>
            ))}
          </select>
        </label>
        {canEdit && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus size={14} /> {t.create}
          </Button>
        )}
      </div>

      {!canEdit && <p className="text-[11px] text-ink-400">{t.selectToEdit}</p>}

      {visible.length === 0 ? (
        <EmptyState icon={<ShieldAlert size={18} />} title={t.noFailures} />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {visible.map((fm) => (
            <Card
              key={fm.failureId}
              title={fm.title}
              subtitle={LAYER_LABEL[fm.layerId]}
              action={
                canEdit ? (
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(fm)} title={t.edit}>
                      <Pencil size={13} />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => remove(fm)} title={t.delete}>
                      <Trash2 size={13} />
                    </Button>
                  </div>
                ) : undefined
              }
            >
              <div className="space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  <FailureModeBadge kind="impact" value={fm.impact} lang={lang} />
                  <FailureModeBadge kind="likelihood" value={fm.likelihood} lang={lang} />
                  <FailureModeBadge kind="status" value={fm.status} lang={lang} />
                  <span className="inline-flex items-center rounded-full bg-ink-100 px-2.5 py-1 font-mono text-[10px] font-semibold text-ink-500 ring-1 ring-inset ring-ink-200">
                    {fm.failureId}
                  </span>
                </div>
                <p className="text-[12px] leading-relaxed text-ink-600">{fm.description}</p>
                <div className="rounded-lg bg-ink-50 p-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-ink-400">{t.trigger}</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-ink-600">{fm.triggerExample}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-ink-400">{t.mitigation}</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-ink-600">{fm.mitigation}</p>
                </div>
                <p className="text-[10px] text-ink-400">
                  {cardT.updatedBy}: {fm.updatedBy}
                </p>
              </div>
            </Card>
          ))}
        </div>
      )}

      <FailureModeEditor
        open={creating}
        initial={null}
        defaultLayerId={defaultLayer}
        lang={lang}
        onClose={() => setCreating(false)}
        onSaved={onChanged}
      />
      {editing && (
        <FailureModeEditor
          open
          initial={editing}
          defaultLayerId={editing.layerId}
          lang={lang}
          onClose={() => setEditing(null)}
          onSaved={onChanged}
        />
      )}
    </div>
  )
}
