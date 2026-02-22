import { Hono } from 'hono'
import { readdir, readFile, writeFile, mkdir, rm } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import { broadcast } from '../lib/hub'

export const taskRoutes = new Hono()

const TASKS_DIR = join(import.meta.dir, '../../../tasks')

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
