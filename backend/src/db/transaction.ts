import mongoose from 'mongoose'

/**
 * Transaction helper (P1-9).
 *
 * Runs `fn` inside a MongoDB transaction with an explicit retry on
 * `TransientTransactionError` / `UnknownTransactionCommitResult` (max 3
 * attempts — the task limit — rather than Mongoose's unbounded retry loop).
 *
 * Callers must point at a replica set (single-node `replicaSet` is fine). This
 * module surfaces the error verbatim so a misconfigured deployment is obvious
 * at boot time.
 */

const MAX_ATTEMPTS = 3

function isTransient(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const message = err.message ?? ''
  return message.includes('TransientTransactionError') || message.includes('UnknownTransactionCommitResult')
}

export async function withTransaction<T>(fn: (session: mongoose.ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession()
  let attempt = 0
  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      attempt += 1
      session.startTransaction()
      try {
        const result = await fn(session)
        await session.commitTransaction()
        return result
      } catch (err) {
        await session.abortTransaction()
        if (!isTransient(err) || attempt >= MAX_ATTEMPTS) throw err
      }
    }
  } finally {
    await session.endSession()
  }
}