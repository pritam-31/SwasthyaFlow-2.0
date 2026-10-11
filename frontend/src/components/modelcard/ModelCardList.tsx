import { motion } from 'framer-motion'
import { Layers, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Badge, cx, EmptyState, EASE } from '../ui'
import { MODEL_CARD_SECTION_LABELS } from '../../services/safetyPolicy'
import { LAYER_LABEL, type ModelCard } from '../../types/modelcard.types'

type Lang = 'en' | 'hi' | 'or'

const STATUS_TONE: Record<ModelCard['status'], string> = {
  active: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  deprecated: 'bg-amber-50 text-amber-700 ring-amber-200',
  retired: 'bg-ink-100 text-ink-500 ring-ink-200',
}

/**
 * Selectable list of the eight model cards. Presentation only — the page owns
 * data loading and selection; this component owns the search filter.
 */
export function ModelCardList({
  cards,
  selectedId,
  onSelect,
  lang = 'en',
}: {
  cards: ModelCard[]
  selectedId: string | null
  onSelect: (cardId: string) => void
  lang?: Lang
}) {
  const t = MODEL_CARD_SECTION_LABELS[lang]
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return cards
    return cards.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        LAYER_LABEL[c.layerId].toLowerCase().includes(q) ||
        c.summary.toLowerCase().includes(q),
    )
  }, [cards, query])

  const statusLabel = (status: ModelCard['status']) =>
    status === 'active' ? t.active : status === 'deprecated' ? t.deprecated : t.retired

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.searchPlaceholder}
          className="inp pl-9"
          aria-label={t.searchPlaceholder}
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<Layers size={18} />} title={t.noCards} />
      ) : (
        <div className="space-y-2">
          {filtered.map((card) => {
            const selected = card.cardId === selectedId
            return (
              <motion.button
                key={card.cardId}
                type="button"
                onClick={() => onSelect(card.cardId)}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, ease: EASE }}
                className={cx(
                  'w-full rounded-xl border px-3.5 py-3 text-left transition-colors',
                  selected
                    ? 'border-brand-300 bg-brand-50/70 ring-1 ring-inset ring-brand-200'
                    : 'border-ink-200 bg-white hover:border-brand-200 hover:bg-brand-50/40',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold leading-tight text-ink-800">{card.name}</p>
                  <Badge className={STATUS_TONE[card.status]}>{statusLabel(card.status)}</Badge>
                </div>
                <p className="mt-0.5 text-[11px] font-medium text-ink-400">{LAYER_LABEL[card.layerId]}</p>
                <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-ink-500">{card.summary}</p>
                <p className="mt-1.5 font-mono text-[10px] text-ink-400">v{card.modelVersion}</p>
              </motion.button>
            )
          })}
        </div>
      )}
    </div>
  )
}
