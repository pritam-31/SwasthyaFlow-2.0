import { useEffect } from 'react'
import { ListChecks } from 'lucide-react'
import { useTriage } from '../../context/TriageContext'
import { ANONYMISATION_SECTION_LABELS } from '../../services/safetyPolicy'
import { Badge, Card, EmptyState } from '../ui'

/**
 * Pattern inventory (P0-7, admin). Counts only — the backend never exposes the
 * raw regex, so the inventory cannot become an evasion guide.
 */
export default function PatternInventoryTable({ language = 'en' }: { language?: 'en' | 'hi' | 'or' }) {
  const { permissions, anonymisationPatterns, refreshAnonymisationPatterns } = useTriage()
  const t = ANONYMISATION_SECTION_LABELS[language]

  useEffect(() => {
    if (permissions.canViewPatternInventory) void refreshAnonymisationPatterns()
  }, [permissions.canViewPatternInventory, refreshAnonymisationPatterns])

  if (!permissions.canViewPatternInventory) return null

  const inventory = anonymisationPatterns ?? {}
  const total = inventory['total:patterns'] ?? 0
  const languages = Object.entries(inventory).filter(([key]) => key.startsWith('language:'))
  const categories = Object.entries(inventory)
    .filter(([key]) => key.startsWith('category:'))
    .sort((a, b) => b[1] - a[1])

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <ListChecks size={14} className="text-brand-600" /> {t.patternHeading}
        </span>
      }
      subtitle="Rules grouped by language and PII category. Counts only — never the raw expression."
      action={<Badge className="bg-brand-50 text-brand-700 ring-brand-200">{total} {t.patternsTotal}</Badge>}
    >
      {total === 0 ? (
        <EmptyState icon={<ListChecks size={20} />} title={t.empty} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400">{t.language}</p>
            <ul className="divide-y divide-ink-100 overflow-hidden rounded-xl border border-ink-200 bg-white">
              {languages.map(([key, count]) => (
                <li key={key} className="flex items-center justify-between bg-white px-3 py-2 text-xs text-ink-600 odd:bg-brand-50/40">
                  <span className="font-medium uppercase">{key.replace('language:', '')}</span>
                  <span className="font-mono text-ink-500">{count}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400">{t.category}</p>
            <ul className="divide-y divide-ink-100 overflow-hidden rounded-xl border border-ink-200 bg-white">
              {categories.map(([key, count]) => (
                <li key={key} className="flex items-center justify-between bg-white px-3 py-2 text-xs text-ink-600 odd:bg-brand-50/40">
                  <span className="font-medium">{key.replace('category:', '')}</span>
                  <span className="font-mono text-ink-500">{count}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Card>
  )
}
