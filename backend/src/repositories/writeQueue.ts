/**
 * Fire-and-forget persistence queue (P1-9).
 *
 * The in-memory stores keep their synchronous signatures; when persistence is
 * enabled each write also enqueues a Mongo operation. Tasks sharing a key run
 * strictly in order, so rapid updates to the same document never race. Errors
 * are logged and swallowed (the in-memory state stays authoritative); call
 * {@link drainWrites} on shutdown to let pending writes finish.
 */

const chains = new Map<string, Promise<void>>()

export function enqueue(key: string, task: () => Promise<unknown>): void {
  const previous = chains.get(key) ?? Promise.resolve()
  const next = previous
    .then(async () => {
      await task()
    })
    .catch((err: unknown) => {
      console.error(`[persist:${key}]`, err instanceof Error ? err.message : err)
    })
  chains.set(key, next)
}

export async function drainWrites(): Promise<void> {
  await Promise.all([...chains.values()])
  chains.clear()
}
