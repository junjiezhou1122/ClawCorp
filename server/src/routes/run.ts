import { Hono } from 'hono'
import { runAgent, killAgent, isRunning } from '../lib/AgentRunner'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

export const runRoutes = new Hono()

const MISSIONS_DIR = join(import.meta.dir, '../../../missions')

runRoutes.post('/', async (c) => {
  const body = await c.req.json()
  const { agentId, missionId, prompt, workspace, resume, sessionId } = body

  if (!agentId || !missionId || !prompt) {
    return c.json({ error: 'agentId, missionId, prompt required' }, 400)
  }

  if (isRunning(agentId)) {
    return c.json({ error: `Agent ${agentId} is already busy` }, 409)
  }

  // Update mission state
  const statePath = join(MISSIONS_DIR, missionId, 'state.json')
  if (existsSync(statePath)) {
    try {
      const state = JSON.parse(await readFile(statePath, 'utf-8'))
      state.status = 'in_progress'
      state.current_stage = 'development'
      state.assignee = agentId
      if (workspace) state.workspace = workspace
      state.history = state.history ?? []
      state.history.push({ at: new Date().toISOString(), event: 'started', agentId, workspace })
      await writeFile(statePath, JSON.stringify(state, null, 2))
    } catch {}
  }

  runAgent(agentId, missionId, prompt, { workspace, resume, sessionId }).catch((err) => {
    console.error(`Agent ${agentId} error:`, err.message)
  })

  return c.json({ ok: true, agentId, missionId, workspace })
})

runRoutes.delete('/:agentId', (c) => {
  const agentId = c.req.param('agentId')
  killAgent(agentId)
  return c.json({ ok: true })
})
