import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { record } from '../services/securityEventService'

/**
 * Suspicious user-agent detection (P1-12).
 *
 * A cheap, high-signal screen for automated scanners and obviously malformed
 * clients. Detection is *soft*: the request still proceeds (the IP blocklist and
 * rate limiter are the enforcing controls), but a `security.suspicious-ua` event
 * is recorded — one of the few event types permitted to keep the raw user agent
 * for triage. A throttle keeps a single attacker from flooding the trail.
 */

const SCANNER_SIGNATURES = [
  'sqlmap',
  'nikto',
  'nmap',
  'masscan',
  'acunetix',
  'nessus',
  'dirbuster',
  'gobuster',
  'wpscan',
  'zgrab',
  'nuclei',
]

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/
const MAX_UA_LENGTH = 512

const recent = new Map<string, number>()
const THROTTLE_MS = 60_000

function shouldEmit(key: string): boolean {
  const now = Date.now()
  const last = recent.get(key) ?? 0
  if (now - last < THROTTLE_MS) return false
  recent.set(key, now)
  if (recent.size > 5000) recent.clear()
  return true
}

function suspiciousReason(userAgent: string): string | undefined {
  if (userAgent.length > MAX_UA_LENGTH) return 'oversized user agent'
  if (CONTROL_CHARS.test(userAgent)) return 'control characters in user agent'
  const lower = userAgent.toLowerCase()
  const hit = SCANNER_SIGNATURES.find((signature) => lower.includes(signature))
  if (hit) return `known scanner signature (${hit})`
  return undefined
}

export const anomalyDetection: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  const userAgent = req.header('user-agent') ?? ''
  const reason = suspiciousReason(userAgent)
  if (reason && shouldEmit(`${req.ip}:${reason}`)) {
    void record({
      type: 'security.suspicious-ua',
      ip: req.ip,
      userAgent,
      requestId: req.requestId,
      detail: `Suspicious client detected: ${reason}.`,
    })
  }
  next()
}
