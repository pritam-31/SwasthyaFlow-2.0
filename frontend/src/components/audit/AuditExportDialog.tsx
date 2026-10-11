import { Download, FileDown } from 'lucide-react'
import { useState } from 'react'
import { Button, Modal } from '../ui'
import { useApp } from '../../store/AppStore'
import { downloadAuditExport, exportAudit } from '../../services/auditApi'
import { LANGUAGE_NATIVE_LABEL } from '../../types/language.types'
import { AUDIT_EXPORT_FORMATS, AUDIT_EXPORT_LABELS, type AuditExportFormat, type AuditExportResult, type AuditFilter } from '../../types/auditChain.types'
import type { AuditSectionLabels } from '../../services/safetyPolicy'
import type { LanguageCode } from '../../types/language.types'

interface Props {
  labels: AuditSectionLabels
  open: boolean
  onClose: () => void
  filter: AuditFilter
  onExported?: (result: AuditExportResult) => void
}

const LANGUAGES: LanguageCode[] = ['en', 'hi', 'or']

/** Build a retention-aware export of the filtered trail, then download it. */
export function AuditExportDialog({ labels, open, onClose, filter, onExported }: Props) {
  const { pushToast } = useApp()
  const [format, setFormat] = useState<AuditExportFormat>('csv')
  const [language, setLanguage] = useState<LanguageCode>('en')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<AuditExportResult | null>(null)

  const run = async (): Promise<void> => {
    setBusy(true)
    try {
      const built = await exportAudit({ filter: { ...filter, cursor: undefined }, format, language })
      setResult(built)
      onExported?.(built)
      pushToast('success', labels.exportDone)
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : labels.loadFailed)
    } finally {
      setBusy(false)
    }
  }

  const download = async (): Promise<void> => {
    if (!result) return
    try {
      await downloadAuditExport(result.ref, result.format)
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : labels.loadFailed)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={labels.exportTitle}>
      <div className="space-y-4">
        <p className="text-xs text-ink-500">{labels.exportSubtitle}</p>

        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold text-ink-400">{labels.format}</span>
          <select value={format} onChange={(e) => setFormat(e.target.value as AuditExportFormat)} className="inp">
            {AUDIT_EXPORT_FORMATS.map((f) => (
              <option key={f} value={f}>
                {AUDIT_EXPORT_LABELS[f]}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold text-ink-400">{labels.language}</span>
          <select value={language} onChange={(e) => setLanguage(e.target.value as LanguageCode)} className="inp">
            {LANGUAGES.map((code) => (
              <option key={code} value={code}>
                {LANGUAGE_NATIVE_LABEL[code]}
              </option>
            ))}
          </select>
        </label>

        {result && (
          <div className="rounded-xl border border-brand-200 bg-brand-50/70 px-3.5 py-3 text-xs text-brand-900">
            <p className="font-bold">{labels.exportDone}</p>
            <p className="mt-0.5">
              {result.recordCount} {labels.recordCount} · {(result.sizeBytes / 1024).toFixed(1)} KB
            </p>
          </div>
        )}

        <p className="text-[11px] leading-relaxed text-ink-400">{labels.exportDisclaimer}</p>

        <div className="flex items-center justify-end gap-2">
          {result ? (
            <Button onClick={download}>
              <Download size={14} /> {labels.download}
            </Button>
          ) : (
            <Button onClick={run} disabled={busy}>
              <FileDown size={14} /> {busy ? labels.exporting : labels.export}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}
