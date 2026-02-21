import { Hono } from 'hono'
import { runAgent } from '../lib/AgentRunner'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'

export const delegateRoutes = new Hono()

const MISSIONS_DIR = join(import.meta.dir, '../../../missions')

// POST /api/delegate — manager delegates sub-task to subordinate
delegateRoutes.post('/', async (c) => {
  const { fromAgentId, toAgentId, missionId, task, workspace } = await c.req.json()

  const subMissionId = `${missionId}-${toAgentId}-${Date.now()}`
  const subDir = join(MISSIONS_DIR, subMissionId)
  await mkdir(join(subDir, 'artifacts'), { recursive: true })

  const state = {
    id: subMissionId,
    title: task.slice(0, 80),
    type: 'engineering',
    status: 'in_progress',
    current_stage: 'development',
    assignee: toAgentId,
    parent_mission: missionId,
    delegated_by: fromAgentId,
    workspace: workspace ?? null,
    sessions: {},
    created_at: new Date().toISOString(),
    history: [{ at: new Date().toISOString(), event: 'delegated', from: fromAgentId }],
  }

  await writeFile(join(subDir, 'state.json'), JSON.stringify(state, null, 2))

  // Fire sub-agent
  runAgent(toAgentId, subMissionId, task, { workspace }).catch((err) => {
    console.error(`Delegated agent ${toAgentId} failed:`, err.message)
  })

  return c.json({ ok: true, subMissionId })
})
