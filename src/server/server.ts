import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { createRoom, getRoom, joinRoom, applyMove, subscribe } from './store'
import type { MoveIntent } from './store'

const PORT = Number(process.env.PORT ?? 8787)

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

const server = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const url = new URL(req.url ?? '/', 'http://localhost')

  if (req.method === 'POST' && url.pathname === '/api/games') {
    const room = createRoom()
    sendJson(res, 200, { roomId: room.id })
    return
  }

  const joinMatch = url.pathname.match(/^\/api\/games\/([^/]+)\/join$/)
  if (req.method === 'POST' && joinMatch) {
    const result = joinRoom(joinMatch[1], randomUUID())
    if ('error' in result) sendJson(res, result.error === 'room full' ? 409 : 404, result)
    else sendJson(res, 200, { color: result.color })
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
    if (!room) {
      sendJson(res, 404, { error: 'room not found' })
      return
    }
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
        res.write(`id: ${eventId}\nevent: joined\ndata: ${JSON.stringify({ color: evt.color })}\n\n`)
      }
    }
    send({ type: 'state', state: room.state })
    const unsub = subscribe(room.id, send)
    req.on('close', unsub)
    return
  }

  sendJson(res, 404, { error: 'not found' })
})

server.listen(PORT, () => {
  console.log(`pylos-server listening on :${PORT}`)
})
