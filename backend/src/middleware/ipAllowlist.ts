import type { NextFunction, Request, RequestHandler, Response } from 'express'
import ipaddr from 'ipaddr.js'
import { getEffectivePolicy } from '../services/passwordPolicyService'
import { facilityContext } from './facilityScope'
import { record } from '../services/securityEventService'

/**
 * Per-facility IP allowlist (P1-12).
 *
 * When a facility enables its allowlist, only requests whose client IP falls
 * inside one of the configured CIDR ranges proceed; everything else is rejected
 * with a generic 403 and a `security.ip-not-allowed` event. Runs after
 * `facilityScope`, so the facility is always known. Disabled by default — an
 * empty allowlist never locks a facility out.
 */

function normalise(ip: string): ipaddr.IPv4 | ipaddr.IPv6 | undefined {
  try {
    const parsed = ipaddr.parse(ip)
    if (parsed.kind() === 'ipv6' && (parsed as ipaddr.IPv6).isIPv4MappedAddress()) {
      return (parsed as ipaddr.IPv6).toIPv4Address()
    }
    return parsed
  } catch {
    return undefined
  }
}

export function ipMatchesCidrs(ip: string, cidrs: string[]): boolean {
  const address = normalise(ip)
  if (!address) return false
  for (const cidr of cidrs) {
    try {
      const [range, bits] = ipaddr.parseCIDR(cidr)
      if (address.kind() !== range.kind()) continue
      if (address.match(range, bits)) return true
    } catch {
      // A malformed CIDR is ignored rather than treated as a match.
    }
  }
  return false
}

export const ipAllowlist: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const facility = facilityContext(req)
    const policy = await getEffectivePolicy(facility.facilityId)
    if (!policy.ipAllowlist.enabled || policy.ipAllowlist.cidrs.length === 0) {
      next()
      return
    }
    const ip = req.ip ?? ''
    if (ipMatchesCidrs(ip, policy.ipAllowlist.cidrs)) {
      next()
      return
    }
    await record({
      type: 'security.ip-not-allowed',
      actorId: req.user?.id,
      facilityId: facility.facilityId,
      ip,
      requestId: req.requestId,
      detail: `Client IP is not in the ${facilityName(facility.facilityId)} allowlist.`,
    })
    res.status(403).json({ error: 'Access from this network is not permitted.' })
  } catch (err) {
    next(err)
  }
}

function facilityName(facilityId: string): string {
  return facilityId === 'global' ? 'global' : facilityId
}
