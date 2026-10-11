import { useEffect, useRef } from 'react'
import { getActiveFacilityId, getAuthToken } from '../services/api'
import type { QueueSummary } from '../types/priority.types'

export interface QueueStreamEvent {
  type: string
  facilityId: string
  sessionId?: string
  at: string
  summary?: QueueSummary
}

/** Parse one buffered SSE frame (`event:` + `data:` lines). */
function parseFrame(frame: string): QueueStreamEvent | null {
  let eventType = 'message'
  const dataLines: string[] = []
  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) eventType = line.slice(6).trim()
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
  }
  const raw = dataLines.join('\n')
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<QueueStreamEvent>
    return {
      type: eventType,
      facilityId: parsed.facilityId ?? '',
      sessionId: parsed.sessionId,
      at: parsed.at ?? new Date().toISOString(),
      summary: parsed.summary,
    }
  } catch {
    return null
  }
}

/**
 * Subscribes to the facility SSE queue stream at `/api/queue/stream`.
 *
 * `EventSource` cannot send the `Authorization` header, so this uses `fetch`
 * with a streaming reader instead, sending the same token + facility headers as
 * every other API call. Reconnects with capped exponential backoff.
 */
export function useQueueStream(enabled: boolean, onEvent: (event: QueueStreamEvent) => void): void {
  const handler = useRef(onEvent)

  useEffect(() => {
    handler.current = onEvent
  }, [onEvent])

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return
    const controller = new AbortController()
    let stopped = false
    let attempt = 0
    let timer: number | undefined

    const schedule = () => {
      if (stopped) return
      attempt = Math.min(attempt + 1, 6)
      timer = window.setTimeout(connect, Math.min(attempt * 1000, 15000))
    }

    const connect = async () => {
      if (stopped) return
      const token = getAuthToken()
      if (!token) {
        schedule()
        return
      }
      const facilityId = getActiveFacilityId()
      try {
        const res = await fetch('/api/queue/stream', {
          signal: controller.signal,
          headers: {
            accept: 'text/event-stream',
            authorization: `Bearer ${token}`,
            ...(facilityId ? { 'x-facility-id': facilityId } : {}),
          },
        })
        if (!res.ok || !res.body) {
          schedule()
          return
        }
        attempt = 0
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        for (;;) {
          const { done, value } = await reader.read()
          if (stopped) return
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          let boundary = buffer.indexOf('\n\n')
          while (boundary !== -1) {
            const frame = buffer.slice(0, boundary)
            buffer = buffer.slice(boundary + 2)
            const event = parseFrame(frame)
            if (event) handler.current(event)
            boundary = buffer.indexOf('\n\n')
          }
        }
        if (!stopped) schedule()
      } catch {
        if (!stopped && !controller.signal.aborted) schedule()
      }
    }

    void connect()
    return () => {
      stopped = true
      controller.abort()
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [enabled])
}
