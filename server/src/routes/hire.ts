import { Hono } from 'hono'
import { readFile, writeFile, mkdir, rename } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import { runSmartHire } from '../lib/SmartHire'

export const hireRoutes = new Hono()

const AGENTS_DIR = join(import.meta.dir, '../../../agents')
const ARCHIVE_DIR = join(import.meta.dir, '../../../archive')

// POST /api/hire — create new agent
hireRoutes.post('/', async (c) => {
  const body = await c.req.json()
  const { id, title, department, description, reports_to, system_prompt, cost_model, rank, team } = body

  if (!id || !title) return c.json({ error: 'id and title required' }, 400)

  const agentDir = join(AGENTS_DIR, id)
  if (existsSync(agentDir)) return c.json({ error: `Agent ${id} already exists` }, 409)

  await mkdir(agentDir, { recursive: true })

  const profile = {
    id,
    title,
    department: department ?? 'Engineering',
    description: description ?? '',
    driver: {
      type: 'claude-code',
      command: 'claude',
      args: ['--dangerously-skip-permissions', '-p', '{{full_prompt}}'],
      system_prompt: system_prompt ?? `You are ${title} at ClawCorp.\n\nRULES:\n1. Never ask questions. Make assumptions and proceed.\n2. Use escalate tool if blocked.\n3. Use report tool when done.`,
    },
    reports_to: reports_to ?? 'chairman',
    subordinates: [],
    rank: rank ?? 'member',
    team: team ?? '',
    cost_model: cost_model ?? 'medium',
  }

  await writeFile(join(agentDir, 'profile.json'), JSON.stringify(profile, null, 2))
  await writeFile(join(agentDir, 'memory.md'), `# ${title} Memory\n\n`)

  return c.json(profile, 201)
})

// POST /api/hire/smart — smart hire via natural language
hireRoutes.post('/smart', async (c) => {
  const body = await c.req.json()
  const { description } = body

  if (!description?.trim()) return c.json({ error: 'description required' }, 400)

  const hireId = `${Date.now()}`
  // Fire and forget — progress streams via WebSocket
  runSmartHire(description.trim(), hireId)

  return c.json({ ok: true, hireId })
})

// DELETE /api/hire/:id — fire (archive) agent
hireRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const agentDir = join(AGENTS_DIR, id)

  if (!existsSync(agentDir)) return c.json({ error: 'Agent not found' }, 404)

  await mkdir(ARCHIVE_DIR, { recursive: true })
  const archivePath = join(ARCHIVE_DIR, `${id}-${Date.now()}`)
  await rename(agentDir, archivePath)

  return c.json({ ok: true, archived: archivePath })
})
