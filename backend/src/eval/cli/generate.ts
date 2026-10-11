import { writeDataset } from '../generators/generateDataset'

const manifest = writeDataset()
console.log(`[eval:generate] wrote ${manifest.files.length} files (dataset v${manifest.version}, seed ${manifest.seed})`)
for (const file of manifest.files) {
  console.log(`  ${file.fileName} — ${file.count} record(s) — sha256 ${file.sha256.slice(0, 12)}`)
}
console.log(`[eval:generate] checksum ${manifest.checksum}`)
