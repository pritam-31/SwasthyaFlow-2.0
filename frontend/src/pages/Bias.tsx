import { Languages, Scale } from 'lucide-react'
import { useState } from 'react'
import { cx, PageHeader } from '../components/ui'
import { BiasDashboard } from '../components/bias/BiasDashboard'
import { useAuth } from '../context/AuthContext'
import { BIAS_SECTION_LABELS } from '../services/safetyPolicy'
import { permissionsFor } from '../services/rbacService'

type Lang = 'en' | 'hi' | 'or'

const LANG_KEY = 'swasthyaflow.bias.lang'

function readLang(): Lang {
  const saved = typeof localStorage === 'undefined' ? null : localStorage.getItem(LANG_KEY)
  return saved === 'hi' || saved === 'or' ? saved : 'en'
}

/**
 * Bias-evaluation console (P2-13). Restricted to system administrators (the
 * backend auto-satisfies this for the legacy `admin` role too). A flag always
 * means "review before relying on this layer for that group", never "broken".
 */
export default function BiasPage() {
  const { user } = useAuth()
  const [lang, setLang] = useState<Lang>(readLang)
  const t = BIAS_SECTION_LABELS[lang]

  if (!user) return null
  const perms = permissionsFor(user.role)

  const switchLang = (next: Lang) => {
    setLang(next)
    if (typeof localStorage !== 'undefined') localStorage.setItem(LANG_KEY, next)
  }

  if (!perms.canViewBiasReports) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-6">
        <p className="text-sm font-semibold text-amber-800">{t.adminOnly}</p>
        <p className="mt-1 text-xs text-amber-700">{t.subtitle}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="P2-13 · Model governance"
        title={t.title}
        subtitle={t.subtitle}
        icon={<Scale size={18} />}
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

      <BiasDashboard lang={lang} canRun={perms.canRunBiasEvaluation} canDelete={perms.canDeleteBiasReports} />
    </div>
  )
}
