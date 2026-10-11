import { useState } from 'react'
import { Download, PackageOpen } from 'lucide-react'
import { Button, Card, EmptyState } from '../ui'
import { downloadRetentionExport } from '../../services/retentionUiApi'
import { formatAuditTime } from '../../lib/format'
import type { RetentionExportSummary } from '../../types/retentionUi.types'

export function RetentionExportsList({ exports, canDownload }: { exports: RetentionExportSummary[]; canDownload: boolean }) {
  const [busyRef, setBusyRef] = useState<string | null>(null);

  async function download(ref: string) {
    setBusyRef(ref)
    try {
      const url = await downloadRetentionExport(ref)
      const a = document.createElement('a')
      a.href = url
      a.download = `${ref}.json`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setBusyRef(null)
    }
  }

  return (
    <Card
      title={
        <>
          <PackageOpen size={15} className="text-brand-600" /> Stored exports
        </>
      }
      subtitle="Portable, non-diagnostic JSON copies built for this facility. Purged after 1 day."
    >
      {exports.length === 0 ? (
        <EmptyState icon={<PackageOpen size={18} />} title="No exports built yet." />
      ) : (
        <ul className="space-y-2">
          {exports.map((row) => (
            <li
              key={row.ref}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink-100 bg-white px-3 py-2"
            >
              <div className="min-w-0">
                <p className="font-mono text-[11px] text-ink-700">{row.ref}</p>
                <p className="mt-0.5 text-[11px] text-ink-400">
                  {formatAuditTime(row.createdAt)} · {Math.max(1, Math.round(row.bytes / 1024))} KB
                  {row.sessionId ? ` · ${row.sessionId}` : ''}
                </p>
              </div>
              {canDownload && (
                <Button variant="secondary" size="sm" disabled={busyRef === row.ref} onClick={() => download(row.ref)}>
                  <Download size={13} /> {busyRef === row.ref ? 'Preparing…' : 'Download'}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
