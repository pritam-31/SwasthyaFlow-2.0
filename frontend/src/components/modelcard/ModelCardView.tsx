import { AlertTriangle, Pencil, Printer, Scale, ShieldCheck } from 'lucide-react'
import { Badge, Button, Card, InfoBanner } from '../ui'
import { MODEL_CARD_SECTION_LABELS } from '../../services/safetyPolicy'
import { LANGUAGE_NATIVE_LABEL } from '../../types/language.types'
import { LAYER_LABEL, type ModelCard } from '../../types/modelcard.types'

type Lang = 'en' | 'hi' | 'or'

const STATUS_TONE: Record<ModelCard['status'], string> = {
  active: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  deprecated: 'bg-amber-50 text-amber-700 ring-amber-200',
  retired: 'bg-ink-100 text-ink-500 ring-ink-200',
}

function formatDate(value: string): string {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

/**
 * Read-only rendering of one model card. Every card carries the system-authored
 * non-diagnostic and human-in-the-loop statements; they are shown verbatim and
 * are never editable here.
 */
export function ModelCardView({
  card,
  lang = 'en',
  canEdit,
  onEdit,
}: {
  card: ModelCard
  lang?: Lang
  canEdit: boolean
  onEdit: () => void
}) {
  const t = MODEL_CARD_SECTION_LABELS[lang]
  const statusLabel = card.status === 'active' ? t.active : card.status === 'deprecated' ? t.deprecated : t.retired

  return (
    <div className="space-y-5">
      <Card
        title={
          <span className="flex flex-wrap items-center gap-2">
            {card.name}
            <Badge className={STATUS_TONE[card.status]}>{statusLabel}</Badge>
          </span>
        }
        subtitle={`${LAYER_LABEL[card.layerId]} · v${card.modelVersion}`}
        action={
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" onClick={() => window.print()} title={t.print}>
              <Printer size={14} />
            </Button>
            {canEdit && (
              <Button variant="secondary" size="sm" onClick={onEdit}>
                <Pencil size={13} /> {t.edit}
              </Button>
            )}
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-ink-700">{card.summary}</p>
          <p className="text-[13px] leading-relaxed text-ink-600">{card.description}</p>

          <div className="grid gap-2 text-[11px] text-ink-500 sm:grid-cols-2">
            <p>
              <span className="font-semibold text-ink-600">{t.updated}:</span> {formatDate(card.updatedAt)}
            </p>
            <p>
              <span className="font-semibold text-ink-600">{t.updatedBy}:</span> {card.updatedBy}
            </p>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <section className="rounded-xl border border-ink-200 p-3.5">
              <p className="text-[11px] font-bold uppercase tracking-wide text-ink-400">{t.intendedUse}</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-700">{card.intendedUse}</p>
            </section>
            <section className="rounded-xl border border-amber-200 bg-amber-50/50 p-3.5">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-700">
                <AlertTriangle size={12} /> {t.outOfScope}
              </p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-amber-900">{card.outOfScopeUse}</p>
            </section>
          </div>

          <section className="rounded-xl border border-ink-200 p-3.5">
            <p className="text-[11px] font-bold uppercase tracking-wide text-ink-400">{t.trainingData}</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-700">{card.trainingData.description}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge className="bg-brand-50 text-brand-700 ring-brand-200">
                <ShieldCheck size={11} /> {t.syntheticOnly}
              </Badge>
              <Badge className="bg-ink-100 text-ink-600 ring-ink-200">
                {t.volume}: {card.trainingData.volume}
              </Badge>
              {card.trainingData.languages.map((code) => (
                <Badge key={code} className="bg-sky-50 text-sky-700 ring-sky-200">
                  {LANGUAGE_NATIVE_LABEL[code]}
                </Badge>
              ))}
              {card.trainingData.modalities.map((m) => (
                <Badge key={m} className="bg-violet-50 text-violet-700 ring-violet-200">
                  {m}
                </Badge>
              ))}
            </div>
          </section>

          <div className="grid gap-3 lg:grid-cols-2">
            <ListSection title={t.intendedUsers} items={card.intendedUsers} />
            <ListSection title={t.risks} items={card.risksAndLimitations} tone="rose" />
          </div>
        </div>
      </Card>

      <InfoBanner tone="rose">
        <p className="font-bold">{t.nonDiagnosticTitle}</p>
        <p className="mt-0.5">{card.nonDiagnosticStatement}</p>
      </InfoBanner>

      <InfoBanner tone="brand">
        <p className="flex items-center gap-1.5 font-bold">
          <Scale size={13} /> {t.humanInLoopTitle}
        </p>
        <p className="mt-0.5">{card.humanInTheLoopStatement}</p>
      </InfoBanner>

      <Card title={t.versionHistory} subtitle={`${t.changelog} · ${card.versionHistory.length}`}>
        <ol className="space-y-3">
          {[...card.versionHistory].reverse().map((entry) => (
            <li key={`${entry.version}-${entry.date}`} className="flex gap-3">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
              <div className="min-w-0">
                <p className="flex flex-wrap items-baseline gap-2">
                  <span className="font-mono text-[12px] font-bold text-ink-800">v{entry.version}</span>
                  <span className="text-[11px] text-ink-400">{formatDate(entry.date)}</span>
                </p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-ink-600">{entry.changelog}</p>
              </div>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  )
}

function ListSection({ title, items, tone }: { title: string; items: string[]; tone?: 'rose' }) {
  return (
    <section className="rounded-xl border border-ink-200 p-3.5">
      <p className="text-[11px] font-bold uppercase tracking-wide text-ink-400">{title}</p>
      <ul className="mt-1.5 space-y-1.5">
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-[13px] leading-relaxed text-ink-700">
            <span className={tone === 'rose' ? 'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400' : 'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400'} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
