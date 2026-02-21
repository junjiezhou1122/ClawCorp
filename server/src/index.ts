import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import type { ServerWebSocket } from 'bun'
import { agentRoutes } from './routes/agents'
import { missionRoutes } from './routes/missions'

const app = new Hono()

app.use('*', cors({ origin: 'http://localhost:5173' }))
app.use('*', logger())

app.route('/api/agents', agentRoutes)
app.route('/api/missions', missionRoutes)

app.get('/health', (c) => c.json({ status: 'ok', time: new Date().toISOString() }))

// WebSocket client hub
const clients = new Set<ServerWebSocket<unknown>>()

export function broadcast(event: string, data: unknown) {
  const msg = JSON.stringify({ event, data, ts: Date.now() })
  for (const ws of clients) ws.send(msg)
}

const server = Bun.serve({
  port: 3001,
  fetch(req, server) {
    // Upgrade WebSocket connections
    if (req.headers.get('upgrade') === 'websocket') {
      const ok = server.upgrade(req)
      if (ok) return undefined
      return new Response('WebSocket upgrade failed', { status: 400 })
    }
    return app.fetch(req)
  },
  websocket: {
    open(ws) { clients.add(ws) },
    close(ws) { clients.delete(ws) },
    message() {}
  }
})

console.log(`ClawCorp server running on http://localhost:${server.port}`)
