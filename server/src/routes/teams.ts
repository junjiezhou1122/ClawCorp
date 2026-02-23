import { Hono } from 'hono'
import { readdir, readFile, writeFile, mkdir, rm } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import { broadcast } from '../lib/hub'
import { ensureChannel } from './channels'

export const teamRoutes = new Hono()

const TEAMS_DIR = join(import.meta.dir, '../../../teams')
const AGENTS_DIR = join(import.meta.dir, '../../../agents')

async function readTeam(id: string) {
  const teamPath = join(TEAMS_DIR, id, 'team.json')
  return JSON.parse(await readFile(teamPath, 'utf-8'))
}

async function writeTeam(id: string, team: Record<string, unknown>) {
  const dir = join(TEAMS_DIR, id)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'team.json'), JSON.stringify(team, null, 2))
}

// GET /api/teams — list all teams with resolved members
teamRoutes.get('/', async (c) => {
  await mkdir(TEAMS_DIR, { recursive: true })
  const dirs = await readdir(TEAMS_DIR, { withFileTypes: true })
  const teams = await Promise.all(
    dirs
      .filter((d) => d.isDirectory())
      .map(async (d) => {
        try {
          return await readTeam(d.name)
        } catch {
          return null
        }
      })
  )
  return c.json(teams.filter(Boolean))
})

// GET /api/teams/:id — single team
teamRoutes.get('/:id', async (c) => {
  const id = c.req.param('id')
  try {
    const team = await readTeam(id)
    return c.json(team)
  } catch {
    return c.json({ error: 'Team not found' }, 404)
  }
})

// POST /api/teams — create a new team
teamRoutes.post('/', async (c) => {
  const body = await c.req.json()
  const { id, name, executive_sponsor, head } = body

  if (!id || !name) return c.json({ error: 'id and name required' }, 400)

  const teamDir = join(TEAMS_DIR, id)
  if (existsSync(teamDir)) return c.json({ error: `Team ${id} already exists` }, 409)

  const team = {
    id,
    name,
    executive_sponsor: executive_sponsor ?? '',
    head: head ?? '',
    members: body.members ?? [],
    created_at: new Date().toISOString(),
  }

  await writeTeam(id, team)
  // Auto-create team channel
  await ensureChannel(id, `#${id}`, 'team', { teamId: id })
  broadcast('team:created', team)
  return c.json(team, 201)
})

// PATCH /api/teams/:id — update team
teamRoutes.patch('/:id', async (c) => {
  const id = c.req.param('id')
  try {
    const team = await readTeam(id)
    const body = await c.req.json()

    if (body.name !== undefined) team.name = body.name
    if (body.executive_sponsor !== undefined) team.executive_sponsor = body.executive_sponsor
    if (body.head !== undefined) team.head = body.head
    if (body.members !== undefined) team.members = body.members

    // Add member
    if (body.add_member) {
      if (!team.members.includes(body.add_member)) {
        team.members.push(body.add_member)
        // Update agent profile
        try {
          const profilePath = join(AGENTS_DIR, body.add_member, 'profile.json')
          const profile = JSON.parse(await readFile(profilePath, 'utf-8'))
          profile.team = id
          profile.reports_to = team.head
          await writeFile(profilePath, JSON.stringify(profile, null, 2))
        } catch {}
      }
    }

    // Remove member
    if (body.remove_member) {
      team.members = team.members.filter((m: string) => m !== body.remove_member)
      try {
        const profilePath = join(AGENTS_DIR, body.remove_member, 'profile.json')
        const profile = JSON.parse(await readFile(profilePath, 'utf-8'))
        delete profile.team
        profile.reports_to = 'chairman'
        await writeFile(profilePath, JSON.stringify(profile, null, 2))
      } catch {}
    }

    await writeTeam(id, team)
    broadcast('team:updated', team)
    return c.json(team)
  } catch {
    return c.json({ error: 'Team not found' }, 404)
  }
})

// DELETE /api/teams/:id — delete team, unassign members
teamRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const teamDir = join(TEAMS_DIR, id)

  if (!existsSync(teamDir)) return c.json({ error: 'Team not found' }, 404)

  // Unassign members
  try {
    const team = await readTeam(id)
    const allMembers = [team.head, ...team.members].filter(Boolean)
    for (const memberId of allMembers) {
      try {
        const profilePath = join(AGENTS_DIR, memberId, 'profile.json')
        const profile = JSON.parse(await readFile(profilePath, 'utf-8'))
        delete profile.team
        await writeFile(profilePath, JSON.stringify(profile, null, 2))
      } catch {}
    }
  } catch {}

  await rm(teamDir, { recursive: true })
  broadcast('team:deleted', { id })
  return c.json({ ok: true })
})
