import { Hono } from 'hono'
import { readdir, readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

export const missionRoutes = new Hono()

const MISSIONS_DIR = join(import.meta.dir, '../../../missions')

missionRoutes.get('/', async (c) => {
  if (!existsSync(MISSIONS_DIR)) return c.json([])
  const dirs = await readdir(MISSIONS_DIR, { withFileTypes: true })
  const missions = await Promise.all(
    dirs
      .filter(d => d.isDirectory())
      .map(async d => {
        const statePath = join(MISSIONS_DIR, d.name, 'state.json')
        try {
          return JSON.parse(await readFile(statePath, 'utf-8'))
        } catch {
          return { id: d.name }
        }
      })
  )
  return c.json(missions)
})

missionRoutes.post('/', async (c) => {
  const body = await c.req.json()
  const id = `M-${Date.now()}`
  const missionDir = join(MISSIONS_DIR, id)
  await mkdir(join(missionDir, 'artifacts'), { recursive: true })
  const state = {
    id,
    title: body.title,
    type: body.type ?? 'engineering',
    status: 'backlog',
    current_stage: 'backlog',
    assignee: null,
    workspace: body.workspace ?? null,
    sessions: {},
    created_at: new Date().toISOString(),
    history: []
  }
  await writeFile(join(missionDir, 'state.json'), JSON.stringify(state, null, 2))
  return c.json(state, 201)
})
