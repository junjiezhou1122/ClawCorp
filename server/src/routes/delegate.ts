import { Hono } from 'hono'
import { runAgent } from '../lib/AgentRunner'
import { readFile, writeFile, mkdir, readdir } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

export const delegateRoutes = new Hono()

const MISSIONS_DIR = join(import.meta.dir, '../../../missions')

// Walk up parent_mission chain to find the root mission ID
async function resolveRootMissionId(missionId: string): Promise<string> {
  let current = missionId
  const visited = new Set<string>()
  while (!visited.has(current)) {
    visited.add(current)
    try {
      const state = JSON.parse(await readFile(join(MISSIONS_DIR, current, 'state.json'), 'utf-8'))
      if (!state.parent_mission) return current
      current = state.parent_mission
    } catch { break }
  }
  return current
}

// POST /api/delegate — manager delegates sub-task to subordinate
delegateRoutes.post('/', async (c) => {
  const { fromAgentId, toAgentId, missionId, task, workspace } = await c.req.json()

  // Find root mission — sub-missions nest inside it
  const rootId = await resolveRootMissionId(missionId)
  const rootDir = join(MISSIONS_DIR, rootId)

  // Determine sub-directory name: agents/<agentId>, deduplicate if needed
  let subDirName = toAgentId
  const subDir = join(rootDir, subDirName)
  if (existsSync(subDir)) {
    // Same agent delegated again — append counter
    let counter = 2
    while (existsSync(join(rootDir, `${toAgentId}-${counter}`))) counter++
    subDirName = `${toAgentId}-${counter}`
  }

  const subMissionDir = join(rootDir, subDirName)
  await mkdir(join(subMissionDir, 'messages'), { recursive: true })

  // Sub-mission ID = rootId/agentId (works with join(MISSIONS_DIR, id) path lookups)
  const subMissionId = `${rootId}/${subDirName}`

  // Shared workspace = root mission's artifacts dir
  const resolvedWorkspace = workspace ?? join(rootDir, 'artifacts')
  await mkdir(resolvedWorkspace, { recursive: true })

  const state = {
    id: subMissionId,
    title: task.slice(0, 80),
    type: 'engineering',
    status: 'in_progress',
    current_stage: 'development',
    assignee: toAgentId,
    parent_mission: missionId,
    delegated_by: fromAgentId,
    workspace: resolvedWorkspace,
    sessions: {},
    created_at: new Date().toISOString(),
    history: [{ at: new Date().toISOString(), event: 'delegated', from: fromAgentId }],
  }

  await writeFile(join(subMissionDir, 'state.json'), JSON.stringify(state, null, 2))

  // Fire sub-agent with shared workspace
  runAgent(toAgentId, subMissionId, task, { workspace: resolvedWorkspace }).catch((err) => {
    console.error(`Delegated agent ${toAgentId} failed:`, err.message)
  })

  return c.json({ ok: true, subMissionId })
})
