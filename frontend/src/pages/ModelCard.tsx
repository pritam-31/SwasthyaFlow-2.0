import { Languages, Layers } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Card, cx, EmptyState, PageHeader } from '../components/ui'
import { ModelCardList } from '../components/modelcard/ModelCardList'
import { ModelCardView } from '../components/modelcard/ModelCardView'
import { ModelCardEditor } from '../components/modelcard/ModelCardEditor'
import { FailureModeList } from '../components/modelcard/FailureModeList'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../store/AppStore'
import { MODEL_CARD_SECTION_LABELS } from '../services/safetyPolicy'
import { permissionsFor } from '../services/rbacService'
import { listFailureModes, listModelCards } from '../services/modelCardApi'
import type { FailureMode, ModelCard } from '../types/modelcard.types'

type Lang = 'en' | 'hi' | 'or'
type Tab = 'cards' | 'failures'

const LANG_KEY = 'swasthyaflow.modelcard.lang'

function readLang(): Lang {
  const saved = typeof localStorage === 'undefined' ? null : localStorage.getItem(LANG_KEY)
  return saved === 'hi' || saved === 'or' ? saved : 'en'
}

/**
 * Model-card + failure-mode catalogue (P2-13). Readable by every signed-in
 * account; only a system administrator may update a card or the catalogue.
 * Card bodies are authored in English by the backend (documented); this page
 * chrome is multilingual.
 */
export default function ModelCardPage() {
  const { user } = useAuth()
  const { pushToast } = useApp()
  const [lang, setLang] = useState<Lang>(readLang)
  const [tab, setTab] = useState<Tab>('cards')
  const [cards, setCards] = useState<ModelCard[]>([])
  const [failures, setFailures] = useState<FailureMode[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const t = MODEL_CARD_SECTION_LABELS[lang]

  const perms = user ? permissionsFor(user.role) : null
  const canEdit = perms?.canEditModelCard ?? false

  const loadCards = useCallback(async () => {
    try {
      const next = await listModelCards()
      setCards(next)
      setSelectedId((current) => {
        if (current && next.some((c) => c.cardId === current)) return current
        return next[0]?.cardId ?? null
      })
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the model cards.')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadFailures = useCallback(async () => {
    try {
      setFailures(await listFailureModes())
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Could not load the failure modes.')
    }
  }, [pushToast])

  useEffect(() => {
    void loadCards()
  }, [loadCards])

  useEffect(() => {
    void loadFailures()
  }, [loadFailures])

  const switchLang = (next: Lang) => {
    setLang(next)
    if (typeof localStorage !== 'undefined') localStorage.setItem(LANG_KEY, next)
  }

  const selected = cards.find((c) => c.cardId === selectedId) ?? null

  if (!user) return null

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="P2-13 · Model governance"
        title={t.title}
        subtitle={t.subtitle}
        icon={<Layers size={18} />}
        action={
          <div className="flex items-center gap-2">
            <div className="flex gap-1 rounded-xl bg-ink-100/80 p-1">
              {(['en', 'hi', 'or'] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => switchLang(l)}
                  className={cx(
                    'rounded-lg px-2.5 py-1 text-[11px] font-bold uppercase transition-colors',
                    lang === l ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-800',
                  )}
                >
                  {l}
                </button>
              ))}
            </div>
            <Languages size={14} className="text-ink-400" />
          </div>
        }
      />

      <div className="flex gap-1.5 rounded-xl bg-ink-100/70 p-1">
        {(['cards', 'failures'] as const).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cx(
              'rounded-lg px-3.5 py-1.5 text-[12px] font-semibold transition-colors',
              tab === id ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-800',
            )}
          >
            {id === 'cards' ? t.tabCards : t.tabFailures}
          </button>
        ))}
      </div>

      {error && (
        <p className="rounded-xl bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-700 ring-1 ring-inset ring-rose-200">{error}</p>
      )}

      {tab === 'cards' ? (
        <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
          <Card title={t.tabCards} subtitle={`${cards.length} ${t.cardCount}`}>
            <ModelCardList cards={cards} selectedId={selectedId} onSelect={setSelectedId} lang={lang} />
          </Card>
          <div>
            {loading && !selected ? (
              <p className="text-[12px] text-ink-400">{t.loading}</p>
            ) : selected ? (
              <ModelCardView card={selected} lang={lang} canEdit={canEdit} onEdit={() => setEditing(true)} />
            ) : (
              <EmptyState icon={<Layers size={18} />} title={t.noCards} hint={t.selectCard} />
            )}
          </div>
        </div>
      ) : (
        <FailureModeList failureModes={failures} lang={lang} canEdit={perms?.canEditFailureModes ?? false} onChanged={() => void loadFailures()} />
      )}

      {editing && selected && (
        <ModelCardEditor
          card={selected}
          open
          lang={lang}
          onClose={() => setEditing(false)}
          onSaved={(updated) => {
            setCards((prev) => prev.map((c) => (c.cardId === updated.cardId ? updated : c)))
          }}
        />
      )}
    </div>
  )
}
