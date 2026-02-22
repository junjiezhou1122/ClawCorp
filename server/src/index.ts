import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { addClient, removeClient } from './lib/hub'
import { agentRoutes } from './routes/agents'
import { missionRoutes } from './routes/missions'
import { runRoutes } from './routes/run'
import { messageRoutes } from './routes/messages'
import { delegateRoutes } from './routes/delegate'
import { hireRoutes } from './routes/hire'
import { taskRoutes } from './routes/tasks'

const app = new Hono()

app.use('*', cors({ origin: 'http://localhost:5173' }))
app.use('*', logger())

app.route('/api/agents', agentRoutes)
app.route('/api/missions', missionRoutes)
app.route('/api/run', runRoutes)
app.route('/api/messages', messageRoutes)
app.route('/api/delegate', delegateRoutes)
app.route('/api/hire', hireRoutes)
app.route('/api/tasks', taskRoutes)

app.get('/health', (c) => c.json({ status: 'ok', time: new Date().toISOString() }))

const server = Bun.serve({
  port: 3001,
  fetch(req, server) {
    if (req.headers.get('upgrade') === 'websocket') {
      const ok = server.upgrade(req)
      if (ok) return undefined
      return new Response('WebSocket upgrade failed', { status: 400 })
    }
    return app.fetch(req)
  },
  websocket: {
    open(ws) { addClient(ws) },
    close(ws) { removeClient(ws) },
    message() {}
  }
})

console.log(`ClawCorp server → http://localhost:${server.port}`)
