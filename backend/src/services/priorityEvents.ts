import { EventEmitter } from 'node:events'
import type { QueueEvent } from '../types'

/**
 * In-process event bus for queue updates (P1-11).
 *
 * The queue service and the SSE stream share this bus: mutations emit an event,
 * the `/api/queue/stream` route forwards it to connected clients. A leaf module so
 * neither side imports the other.
 */

const emitter = new EventEmitter()
emitter.setMaxListeners(0)

export function emitQueueEvent(event: QueueEvent): void {
  emitter.emit('queue', event)
}

export function onQueueEvent(listener: (event: QueueEvent) => void): () => void {
  emitter.on('queue', listener)
  return () => emitter.off('queue', listener)
}
