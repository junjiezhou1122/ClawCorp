import { Hono } from 'hono'
import { readdir, readFile } from 'fs/promises'
import { join } from 'path'

export const agentRoutes = new Hono()

const AGENTS_DIR = join(import.meta.dir, '../../../agents')

agentRoutes.get('/', async (c) => {
  const dirs = await readdir(AGENTS_DIR, { withFileTypes: true })
  const agents = await Promise.all(
    dirs
      .filter(d => d.isDirectory())
      .map(async d => {
        const profilePath = join(AGENTS_DIR, d.name, 'profile.json')
        const memPath = join(AGENTS_DIR, d.name, 'memory.md')
        try {
          const profile = JSON.parse(await readFile(profilePath, 'utf-8'))
          const memory = await readFile(memPath, 'utf-8').catch(() => '')
          return { ...profile, memory, status: 'idle' }
        } catch {
          return { id: d.name, title: d.name, status: 'idle' }
        }
      })
  )
  return c.json(agents)
})

agentRoutes.get('/:id', async (c) => {
  const id = c.req.param('id')
  const profilePath = join(AGENTS_DIR, id, 'profile.json')
  const profile = JSON.parse(await readFile(profilePath, 'utf-8'))
  return c.json(profile)
})
