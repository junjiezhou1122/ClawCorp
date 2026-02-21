import type { ServerWebSocket } from 'bun'

const clients = new Set<ServerWebSocket<unknown>>()

export function addClient(ws: ServerWebSocket<unknown>) {
  clients.add(ws)
}

export function removeClient(ws: ServerWebSocket<unknown>) {
  clients.delete(ws)
}

export function broadcast(event: string, data: unknown) {
  const msg = JSON.stringify({ event, data, ts: Date.now() })
  for (const ws of clients) {
    if (ws.readyState === 1) ws.send(msg)
  }
}
