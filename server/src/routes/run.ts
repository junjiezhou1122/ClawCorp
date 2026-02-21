import { Hono } from 'hono'
import { runAgent, killAgent, isRunning } from '../lib/AgentRunner'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'

export const runRoutes = new Hono()

const MISSIONS_DIR = join(import.meta.dir, '../../../missions')

runRoutes.post('/', async (c) => {
  const { agentId, missionId, prompt } = await c.req.json()

  if (!agentId || !missionId || !prompt) {
    return c.json({ error: 'agentId, missionId, prompt required' }, 400)
  }

  if (isRunning(agentId)) {
    return c.json({ error: `Agent ${agentId} is already busy` }, 409)
  }

  // Update mission state → in_progress
  const statePath = join(MISSIONS_DIR, missionId, 'state.json')
  try {
    const state = JSON.parse(await readFile(statePath, 'utf-8'))
    state.status = 'in_progress'
    state.current_stage = 'development'
    state.assignee = agentId
    state.history.push({ at: new Date().toISOString(), event: 'started', agentId })
    await writeFile(statePath, JSON.stringify(state, null, 2))
  } catch {
    // mission might not exist yet, that's ok
  }

  // Fire and forget — streaming happens via WebSocket
  runAgent(agentId, missionId, prompt).catch((err) => {
    console.error(`Agent ${agentId} failed:`, err.message)
  })

  return c.json({ ok: true, agentId, missionId })
})

runRoutes.delete('/:agentId', (c) => {
  const agentId = c.req.param('agentId')
  killAgent(agentId)
  return c.json({ ok: true })
})
