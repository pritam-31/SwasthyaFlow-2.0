import 'dotenv/config'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import mongoose from 'mongoose'
import { connectMongo, disconnectMongo, mongoUri } from '../src/db/mongoose'

/**
 * Dumps every collection to JSON under `backups/<timestamp>/`. Anonymous data
 * only — the writers already strip raw PII, so a backup never reintroduces it.
 */
async function run(): Promise<void> {
  await connectMongo()
  console.log(`[db:backup] connected to ${mongoUri()}`)
  const db = mongoose.connection.db
  if (!db) throw new Error('No MongoDB connection.')

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dir = join(process.cwd(), 'backups', stamp)
  mkdirSync(dir, { recursive: true })

  const collections = await db.listCollections().toArray()
  for (const { name } of collections) {
    const docs = await db.collection(name).find({}).toArray()
    writeFileSync(join(dir, `${name}.json`), JSON.stringify(docs, null, 2))
    console.log(`[db:backup] ${name}: ${docs.length} document(s)`)
  }
  console.log(`[db:backup] written to ${dir}`)
  await disconnectMongo()
}

run().catch((err) => {
  console.error('[db:backup] failed:', err)
  process.exit(1)
})
