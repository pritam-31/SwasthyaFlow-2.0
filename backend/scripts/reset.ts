import 'dotenv/config'
import mongoose from 'mongoose'
import { connectMongo, disconnectMongo, mongoUri } from '../src/db/mongoose'

/**
 * Clears every collection (indexes preserved) for a clean re-seed. Destructive:
 * only run against a development / demo database.
 */
async function run(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to reset in production.')
  }
  await connectMongo()
  console.log(`[db:reset] connected to ${mongoUri()}`)
  const db = mongoose.connection.db
  if (!db) throw new Error('No MongoDB connection.')
  const collections = await db.listCollections().toArray()
  for (const { name } of collections) {
    const result = await db.collection(name).deleteMany({})
    console.log(`[db:reset] ${name}: ${result.deletedCount ?? 0} removed`)
  }
  console.log('[db:reset] done')
  await disconnectMongo()
}

run().catch((err) => {
  console.error('[db:reset] failed:', err)
  process.exit(1)
})
