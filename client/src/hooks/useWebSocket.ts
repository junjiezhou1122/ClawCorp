import { useEffect, useRef, useCallback } from 'react'

export type WsMessage = {
  event: string
  data: Record<string, unknown>
  ts: number
}

export function useWebSocket(onMessage: (msg: WsMessage) => void) {
  const ws = useRef<WebSocket | null>(null)
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  const connect = useCallback(() => {
    const socket = new WebSocket('ws://localhost:3001/ws')

    socket.onopen = () => console.log('[WS] connected')
    socket.onclose = () => {
      console.log('[WS] disconnected, retrying in 2s...')
      setTimeout(connect, 2000)
    }
    socket.onerror = (e) => console.error('[WS] error', e)
    socket.onmessage = (e) => {
      try {
        const msg: WsMessage = JSON.parse(e.data)
        onMessageRef.current(msg)
      } catch {}
    }

    ws.current = socket
  }, [])

  useEffect(() => {
    connect()
    return () => ws.current?.close()
  }, [connect])
}
