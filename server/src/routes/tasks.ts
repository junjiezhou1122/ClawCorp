import { Hono } from 'hono'
import { readdir, readFile, writeFile, mkdir, rm } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import { broadcast } from '../lib/hub'
import { autoDispatch } from '../lib/AutoDispatch'

export const taskRoutes = new Hono()

const TASKS_DIR = join(import.meta.dir, '../../../tasks')
const MISSIONS_DIR = join(import.meta.dir, '../../../missions')
const AGENTS_DIR = join(import.meta.dir, '../../../agents')

// Collect mission tree: root + subdirectories (new nested layout)
// Also checks legacy flat layout (M-xxx-agent-ts) for backward compat
async function buildMissionTree(rootMissionId: string): Promise<string[]> {
  const tree: string[] = [rootMissionId]
  const rootDir = join(MISSIONS_DIR, rootMissionId)

  if (!existsSync(rootDir)) return tree

  // New layout: scan subdirs inside root mission dir for state.json
  const entries = await readdir(rootDir, { withFileTypes: true })
  for (const e of entries.filter(e => e.isDirectory() && e.name !== 'artifacts' && e.name !== 'messages')) {
    const subState = join(rootDir, e.name, 'state.json')
    if (existsSync(subState)) {
      tree.push(`${rootMissionId}/${e.name}`)
    }
  }

  // Legacy layout: scan top-level missions starting with rootMissionId-
  if (existsSync(MISSIONS_DIR)) {
    const allDirs = await readdir(MISSIONS_DIR, { withFileTypes: true })
    for (const d of allDirs.filter(d => d.isDirectory() && d.name.startsWith(rootMissionId + '-'))) {
      tree.push(d.name)
    }
  }

  return tree
}

async function scanArtifacts(missionId: string): Promise<string[]> {
  // Only root missions have artifacts (shared workspace)
  const dir = join(MISSIONS_DIR, missionId, 'artifacts')
  if (!existsSync(dir)) return []
  try {
    const entries = await readdir(dir)
    // Filter out sub-agent directories and meta files
    return entries.filter(e => e !== '.claude')
  } catch { return [] }
}

async function collectMessages(missionId: string): Promise<unknown[]> {
  const dir = join(MISSIONS_DIR, missionId, 'messages')
  if (!existsSync(dir)) return []
  try {
    const files = await readdir(dir)
    const msgs = await Promise.all(
      files.filter(f => f.endsWith('.json')).map(async f => {
        try { return JSON.parse(await readFile(join(dir, f), 'utf-8')) }
        catch { return null }
      })
    )
    return msgs.filter(Boolean)
  } catch { return [] }
}

async function loadAgentProfile(agentId: string): Promise<Record<string, unknown> | null> {
  const profilePath = join(AGENTS_DIR, agentId, 'profile.json')
  try { return JSON.parse(await readFile(profilePath, 'utf-8')) }
  catch { return null }
}

taskRoutes.get('/', async (c) => {
  if (!existsSync(TASKS_DIR)) return c.json([])
  const dirs = await readdir(TASKS_DIR, { withFileTypes: true })
  const tasks = await Promise.all(
    dirs
      .filter(d => d.isDirectory())
      .map(async d => {
        const statePath = join(TASKS_DIR, d.name, 'state.json')
        try {
          return JSON.parse(await readFile(statePath, 'utf-8'))
        } catch {
          return { id: d.name }
        }
      })
  )
  return c.json(tasks)
})

taskRoutes.post('/', async (c) => {
  const body = await c.req.json()
  const id = `T-${Date.now()}`
  const taskDir = join(TASKS_DIR, id)
  await mkdir(taskDir, { recursive: true })
  const state = {
    id,
    title: body.title,
    status: 'backlog',
    created_at: new Date().toISOString(),
    feedback: []
  }
  await writeFile(join(taskDir, 'state.json'), JSON.stringify(state, null, 2))
  broadcast('task:created', state)
  return c.json(state, 201)
})

taskRoutes.patch('/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const statePath = join(TASKS_DIR, id, 'state.json')
  if (!existsSync(statePath)) return c.json({ error: 'not found' }, 404)

  const state = JSON.parse(await readFile(statePath, 'utf-8'))
  if (body.status) state.status = body.status
  if (body.push_back) {
    state.status = 'in_progress'
    state.feedback.push({ text: body.push_back, at: new Date().toISOString() })
  }
  await writeFile(statePath, JSON.stringify(state, null, 2))
  broadcast('task:updated', state)
  return c.json(state)
})

taskRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const taskDir = join(TASKS_DIR, id)
  if (!existsSync(taskDir)) return c.json({ error: 'not found' }, 404)
  await rm(taskDir, { recursive: true })
  broadcast('task:deleted', { id })
  return c.json({ ok: true })
})

taskRoutes.post('/:id/dispatch', async (c) => {
  const id = c.req.param('id')
  const statePath = join(TASKS_DIR, id, 'state.json')
  if (!existsSync(statePath)) return c.json({ error: 'not found' }, 404)

  const state = JSON.parse(await readFile(statePath, 'utf-8'))
  const body = await c.req.json().catch(() => ({}))

  // Update task to in_progress immediately
  state.status = 'in_progress'
  await writeFile(statePath, JSON.stringify(state, null, 2))
  broadcast('task:updated', state)

  // Fire-and-forget dispatch
  autoDispatch(id, state.title, body.workspace)
    .then(async (result) => {
      // Write dispatch result back to task state
      const fresh = JSON.parse(await readFile(statePath, 'utf-8'))
      fresh.mission_id = result.missionId
      fresh.assigned_to = result.executiveId
      fresh.routing_reasoning = result.reasoning
      await writeFile(statePath, JSON.stringify(fresh, null, 2))
      broadcast('task:updated', fresh)
    })
    .catch(async (err) => {
      // Revert task to backlog on failure
      const fresh = JSON.parse(await readFile(statePath, 'utf-8'))
      fresh.status = 'backlog'
      fresh.dispatch_error = err.message
      await writeFile(statePath, JSON.stringify(fresh, null, 2))
      broadcast('task:updated', fresh)
      broadcast('dispatch:error', { taskId: id, message: err.message })
    })

  return c.json({ ok: true, taskId: id, status: 'dispatching' })
})

taskRoutes.get('/:id/detail', async (c) => {
  const id = c.req.param('id')
  const statePath = join(TASKS_DIR, id, 'state.json')
  if (!existsSync(statePath)) return c.json({ error: 'not found' }, 404)

  const task = JSON.parse(await readFile(statePath, 'utf-8'))

  if (!task.mission_id) {
    return c.json({ task, missions: [], agents: {}, artifacts: {}, messages: {} })
  }

  // BFS mission tree
  const missionIds = await buildMissionTree(task.mission_id)

  // Load all mission states
  const missions = await Promise.all(
    missionIds.map(async mid => {
      try { return JSON.parse(await readFile(join(MISSIONS_DIR, mid, 'state.json'), 'utf-8')) }
      catch { return { id: mid, status: 'unknown' } }
    })
  )

  // Collect unique assignees → load agent profiles
  const assigneeIds = [...new Set(missions.map(m => m.assignee).filter(Boolean))]
  const agentEntries = await Promise.all(
    assigneeIds.map(async aid => {
      const profile = await loadAgentProfile(aid)
      return profile ? [aid, profile] as const : null
    })
  )
  const agents: Record<string, unknown> = {}
  for (const entry of agentEntries) {
    if (entry) agents[entry[0]] = entry[1]
  }

  // Scan artifacts + messages per mission
  const artifactsMap: Record<string, string[]> = {}
  const messagesMap: Record<string, unknown[]> = {}
  await Promise.all(
    missionIds.map(async mid => {
      artifactsMap[mid] = await scanArtifacts(mid)
      messagesMap[mid] = await collectMessages(mid)
    })
  )

  return c.json({ task, missions, agents, artifacts: artifactsMap, messages: messagesMap })
})
