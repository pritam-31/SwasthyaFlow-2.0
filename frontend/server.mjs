/**
 * Production web server for the SwasthyaFlow SPA.
 *
 * The app talks to the backend through same-origin `/api` so that httpOnly
 * auth cookies and the readable CSRF cookie stay first-party (see
 * src/services/api.ts). A static host (e.g. Railway's static site) cannot do
 * that, which breaks login on deploy. This tiny server serves the built SPA and
 * reverse-proxies `/api/*` and `/health` to the backend, keeping everything
 * same-origin.
 *
 * Zero runtime dependencies (Node built-ins only) so it runs anywhere.
 * Configure the backend with BACKEND_URL (defaults to the production backend).
 *   BACKEND_URL=http://<backend>.railway.internal:4000   # private networking
 *   BACKEND_URL=https://swasthyaflow-20-production.up.railway.app
 */
import { createServer, request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('.', import.meta.url))
const DIST = join(ROOT, 'dist')
const BACKEND_URL = (process.env.BACKEND_URL || 'https://swasthyaflow-20-production.up.railway.app').replace(/\/+$/, '')
const PORT = Number(process.env.PORT || 4173)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
}

function isApiPath(pathname) {
  return pathname === '/health' || pathname === '/api' || pathname.startsWith('/api/')
}

/** Streams a request/response straight through to the backend (supports SSE). */
function proxy(req, res) {
  let target
  try {
    target = new URL(req.url || '/', BACKEND_URL)
  } catch {
    res.writeHead(502, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: 'Invalid BACKEND_URL configuration.' }))
    return
  }

  const isHttps = target.protocol === 'https:'
  const send = isHttps ? httpsRequest : httpRequest

  const upstream = send(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || (isHttps ? 443 : 80),
      path: `${target.pathname}${target.search}`,
      method: req.method,
      headers: { ...req.headers, host: target.host },
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers)
      upstreamRes.pipe(res)
    },
  )

  upstream.on('error', (err) => {
    if (!res.headersSent) {
      res.writeHead(502, { 'content-type': 'application/json' })
    }
    res.end(JSON.stringify({ error: 'Upstream backend unavailable.', detail: String((err && err.message) || err) }))
  })

  // Relay client aborts so the backend socket is released promptly.
  res.on('close', () => upstream.destroy())
  req.pipe(upstream)
}

function streamFile(res, filePath) {
  const type = MIME[extname(filePath).toLowerCase()] || 'application/octet-stream'
  const headers = { 'content-type': type }
  // Hashed build assets are immutable; the HTML shell must never be cached.
  if (filePath.includes(`${sep}assets${sep}`)) headers['cache-control'] = 'public, max-age=31536000, immutable'
  else if (filePath.endsWith('.html')) headers['cache-control'] = 'no-cache'
  res.writeHead(200, headers)
  createReadStream(filePath)
    .on('error', () => res.end())
    .pipe(res)
}

async function serveStatic(res, pathname) {
  let rel = decodeURIComponent(pathname)
  if (rel.endsWith('/')) rel += 'index.html'
  const candidate = normalize(join(DIST, rel))
  if (candidate !== DIST && !candidate.startsWith(DIST + sep)) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('Forbidden')
    return
  }
  try {
    const info = await stat(candidate)
    if (info.isFile()) {
      streamFile(res, candidate)
      return
    }
  } catch {
    /* fall through to SPA fallback */
  }
  const indexPath = join(DIST, 'index.html')
  try {
    const info = await stat(indexPath)
    if (info.isFile()) {
      streamFile(res, indexPath)
      return
    }
  } catch {
    /* no build output */
  }
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
  res.end('Not found')
}

const server = createServer((req, res) => {
  let pathname
  try {
    pathname = new URL(req.url || '/', 'http://localhost').pathname
  } catch {
    res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('Bad request')
    return
  }

  // Local liveness probe for the platform health check (never proxied).
  if (pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end('{"status":"ok"}')
    return
  }

  if (isApiPath(pathname)) {
    proxy(req, res)
    return
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'content-type': 'application/json' })
    res.end('{"error":"Method not allowed."}')
    return
  }

  void serveStatic(res, pathname)
})

server.on('clientError', (_err, socket) => {
  if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n')
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[web] SwasthyaFlow SPA served from ${DIST} on http://0.0.0.0:${PORT}`)
  console.log(`[web] proxying /api and /health -> ${BACKEND_URL}`)
})
