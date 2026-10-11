import 'dotenv/config'
import { connectMongo, disconnectMongo, mongoUri } from '../src/db/mongoose'
import * as models from '../src/db/models'

/**
 * Rebuilds every declared index (`syncIndexes`) so a fresh cluster gets the
 * same query performance as the schema intends. Safe to run repeatedly.
 */
async function run(): Promise<void> {
  await connectMongo()
  console.log(`[db:indexes] connected to ${mongoUri()}`)
  for (const model of Object.values(models)) {
    await model.syncIndexes()
    const indexes = await model.collection.indexes()
    console.log(`[db:indexes] ${model.collection.collectionName}: ${indexes.length} index(es)`)
  }
  console.log('[db:indexes] done')
  await disconnectMongo()
}

run().catch((err) => {
  console.error('[db:indexes] failed:', err)
  process.exit(1)
})
