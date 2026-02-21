import { Hono } from 'hono'
import { readdir, readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import { broadcast } from '../lib/hub'

export const messageRoutes = new Hono()

const MISSIONS_DIR = join(import.meta.dir, '../../../missions')

let msgCounter = 0

function msgId() {
  return `MSG-${Date.now()}-${++msgCounter}`
}

// GET /api/messages?missionId=&status=&to=
messageRoutes.get('/', async (c) => {
  const { missionId, status, to } = c.req.query()
  const results: unknown[] = []

  if (!existsSync(MISSIONS_DIR)) return c.json([])
  const dirs = await readdir(MISSIONS_DIR, { withFileTypes: true })

  for (const d of dirs.filter((d) => d.isDirectory())) {
    if (missionId && d.name !== missionId) continue
    const msgDir = join(MISSIONS_DIR, d.name, 'messages')
    if (!existsSync(msgDir)) continue
    const files = await readdir(msgDir).catch(() => [])
    for (const f of files.filter((f) => f.endsWith('.json'))) {
      const msg = JSON.parse(await readFile(join(msgDir, f), 'utf-8'))
      if (status && msg.status !== status) continue
      if (to && msg.to !== to) continue
      results.push(msg)
    }
  }

  return c.json(results)
})

// GET /api/messages/:id
messageRoutes.get('/:id', async (c) => {
  const id = c.req.param('id')
  if (!existsSync(MISSIONS_DIR)) return c.json({ error: 'not found' }, 404)
  const dirs = await readdir(MISSIONS_DIR, { withFileTypes: true })

  for (const d of dirs.filter((d) => d.isDirectory())) {
    const path = join(MISSIONS_DIR, d.name, 'messages', `${id}.json`)
    if (existsSync(path)) {
      return c.json(JSON.parse(await readFile(path, 'utf-8')))
    }
  }
  return c.json({ error: 'not found' }, 404)
})

// POST /api/messages — create escalation or report
messageRoutes.post('/', async (c) => {
  const body = await c.req.json()
  const { from, missionId, type, question, context, summary, artifacts } = body

  // Resolve supervisor
  const AGENTS_DIR = join(import.meta.dir, '../../../agents')
  let to = 'chairman'
  try {
    const profile = JSON.parse(await readFile(join(AGENTS_DIR, from, 'profile.json'), 'utf-8'))
    to = profile.reports_to ?? 'chairman'
  } catch {}

  const id = msgId()
  const msg = {
    id,
    from,
    to,
    missionId,
    type,
    question: question ?? null,
    context: context ?? null,
    summary: summary ?? null,
    artifacts: artifacts ?? [],
    status: type === 'report' ? 'done' : 'pending',
    answer: null,
    created_at: new Date().toISOString(),
    answered_at: null,
  }

  const msgDir = join(MISSIONS_DIR, missionId, 'messages')
  await mkdir(msgDir, { recursive: true })
  await writeFile(join(msgDir, `${id}.json`), JSON.stringify(msg, null, 2))

  broadcast('message:new', msg)

  // Auto-update mission state if report
  if (type === 'report') {
    const statePath = join(MISSIONS_DIR, missionId, 'state.json')
    if (existsSync(statePath)) {
      const state = JSON.parse(await readFile(statePath, 'utf-8'))
      state.status = 'done'
      state.current_stage = 'done'
      state.history.push({ at: new Date().toISOString(), event: 'reported', summary })
      await writeFile(statePath, JSON.stringify(state, null, 2))
      broadcast('mission:done', { missionId, summary })
    }
  }

  return c.json(msg, 201)
})

// POST /api/messages/:id/answer — Chairman or supervisor answers
messageRoutes.post('/:id/answer', async (c) => {
  const id = c.req.param('id')
  const { answer } = await c.req.json()

  if (!existsSync(MISSIONS_DIR)) return c.json({ error: 'not found' }, 404)
  const dirs = await readdir(MISSIONS_DIR, { withFileTypes: true })

  for (const d of dirs.filter((d) => d.isDirectory())) {
    const path = join(MISSIONS_DIR, d.name, 'messages', `${id}.json`)
    if (existsSync(path)) {
      const msg = JSON.parse(await readFile(path, 'utf-8'))
      msg.answer = answer
      msg.status = 'answered'
      msg.answered_at = new Date().toISOString()
      await writeFile(path, JSON.stringify(msg, null, 2))
      broadcast('message:answered', msg)
      return c.json(msg)
    }
  }

  return c.json({ error: 'not found' }, 404)
})
