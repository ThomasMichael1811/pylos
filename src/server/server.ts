import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { createRoom, getRoom, joinRoom, applyMove, subscribe, setConnected, isPlayer } from './store'
import type { MoveIntent } from './store'

const PORT = Number(process.env.PORT ?? 8787)
const STATIC_DIR = process.env.STATIC_DIR

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
}

function sendJson(res: import('node:http').ServerResponse, code: number, body: unknown) {
  res.writeHead(code, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

function readBody(req: import('node:http').IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (chunk) => { data += chunk })
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')) } catch { resolve({}) }
    })
  })
}

const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const url = new URL(req.url ?? '/', 'http://localhost')

  if (req.method === 'GET' && url.pathname === '/health') {
    sendJson(res, 200, { ok: true })
    return
  }

  if (req.method === 'POST' && url.pathname === '/api/games') {
    const room = createRoom()
    sendJson(res, 200, { roomId: room.id })
    return
  }

  const joinMatch = url.pathname.match(/^\/api\/games\/([^/]+)\/join$/)
  if (req.method === 'POST' && joinMatch) {
    void readBody(req).then((body) => {
      const pid = String(body.playerId ?? randomUUID())
      const result = joinRoom(joinMatch[1], pid)
      if ('error' in result) sendJson(res, result.error === 'room full' ? 409 : 404, result)
      else sendJson(res, 200, { color: result.color, playerId: pid, ready: result.ready })
    })
    return
  }

  const moveMatch = url.pathname.match(/^\/api\/games\/([^/]+)\/move$/)
  if (req.method === 'POST' && moveMatch) {
    void readBody(req).then((body) => {
      const result = applyMove(moveMatch[1], String(body.playerId ?? ''), body.move as MoveIntent)
      if ('error' in result) sendJson(res, 400, result)
      else sendJson(res, 200, { state: getRoom(moveMatch[1])?.state })
    })
    return
  }

  const eventsMatch = url.pathname.match(/^\/api\/games\/([^/]+)\/events$/)
  if (req.method === 'GET' && eventsMatch) {
    const room = getRoom(eventsMatch[1])
    const pid = url.searchParams.get('player') ?? ''
    if (!room || !isPlayer(room, pid)) {
      sendJson(res, 404, { error: 'room not found' })
      return
    }
    setConnected(room.id, pid, true)
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })
    let eventId = 0
    const send = (evt: import('./store').RoomEvent) => {
      eventId++
      if (evt.type === 'state') {
        res.write(`id: ${eventId}\nevent: state\ndata: ${JSON.stringify(evt.state)}\n\n`)
      } else {
        res.write(`id: ${eventId}\nevent: ${evt.type}\ndata: ${JSON.stringify({ color: evt.type === 'aborted' ? undefined : evt.color })}\n\n`)
      }
    }
    send({ type: 'state', state: room.state })
    const unsub = subscribe(room.id, send)
    req.on('close', () => {
      unsub()
      setConnected(room.id, pid, false)
    })
    return
  }

  if (req.method === 'GET' && !url.pathname.startsWith('/api') && STATIC_DIR) {
    const requested = url.pathname === '/' ? 'index.html' : url.pathname.slice(1)
    const base = normalize(STATIC_DIR)
    const safe = normalize(join(base, requested))
    if (!safe.startsWith(base)) {
      sendJson(res, 404, { error: 'not found' })
      return
    }
    try {
      const data = await readFile(safe)
      res.writeHead(200, { 'Content-Type': MIME[extname(safe)] ?? 'application/octet-stream' })
      res.end(data)
    } catch {
      try {
        const idx = await readFile(join(base, 'index.html'))
        res.writeHead(200, { 'Content-Type': MIME['.html'] })
        res.end(idx)
      } catch {
        sendJson(res, 404, { error: 'not found' })
      }
    }
    return
  }

  sendJson(res, 404, { error: 'not found' })
})

server.listen(PORT, () => {
  console.log(`pylos-server listening on :${PORT}${STATIC_DIR ? ` (static: ${STATIC_DIR})` : ''}`)
})

process.on('SIGTERM', () => {
  console.log('SIGTERM — closing server')
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 5000).unref()
})
