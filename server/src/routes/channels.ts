import { Hono } from 'hono'
import { readdir, readFile, writeFile, mkdir, appendFile } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import { broadcast } from '../lib/hub'

export const channelRoutes = new Hono()

const CHANNELS_DIR = join(import.meta.dir, '../../../channels')
const TEAMS_DIR = join(import.meta.dir, '../../../teams')

type ChannelEntry = {
  id: string
  name: string
  type: 'org' | 'team' | 'direct'
  teamId?: string
  participants?: string[]
  created_at: string
}

type ChatMessage = {
  id: string
  channel: string
  from: string
  text: string
  replyTo: string | null
  mentions: string[]
  ts: string
}

let msgCounter = 0

// --- Helpers ---

async function readRegistry(): Promise<{ channels: ChannelEntry[] }> {
  const regPath = join(CHANNELS_DIR, '_channels.json')
  if (!existsSync(regPath)) return { channels: [] }
  return JSON.parse(await readFile(regPath, 'utf-8'))
}

async function writeRegistry(reg: { channels: ChannelEntry[] }) {
  await mkdir(CHANNELS_DIR, { recursive: true })
  await writeFile(join(CHANNELS_DIR, '_channels.json'), JSON.stringify(reg, null, 2))
}

export async function ensureChannel(
  id: string,
  name: string,
  type: ChannelEntry['type'],
  extra?: Partial<ChannelEntry>
): Promise<ChannelEntry> {
  const reg = await readRegistry()
  const existing = reg.channels.find((c) => c.id === id)
  if (existing) return existing

  const entry: ChannelEntry = {
    id,
    name,
    type,
    ...extra,
    created_at: new Date().toISOString(),
  }

  reg.channels.push(entry)
  await writeRegistry(reg)

  const channelDir = join(CHANNELS_DIR, id)
  await mkdir(channelDir, { recursive: true })

  broadcast('chat:channel_created', entry)
  return entry
}

async function appendMessage(channelId: string, msg: ChatMessage) {
  const channelDir = join(CHANNELS_DIR, channelId)
  await mkdir(channelDir, { recursive: true })
  await appendFile(join(channelDir, 'messages.jsonl'), JSON.stringify(msg) + '\n')
  broadcast('chat:message', { channel: channelId, message: msg })
}

async function readChannelMessages(
  channelId: string,
  limit = 50,
  before?: string
): Promise<ChatMessage[]> {
  const filePath = join(CHANNELS_DIR, channelId, 'messages.jsonl')
  if (!existsSync(filePath)) return []

  const raw = await readFile(filePath, 'utf-8')
  const lines = raw.trim().split('\n').filter(Boolean)
  let messages: ChatMessage[] = lines.map((l) => JSON.parse(l))

  if (before) {
    const idx = messages.findIndex((m) => m.id === before)
    if (idx > 0) messages = messages.slice(0, idx)
  }

  return messages.slice(-limit)
}

async function countMessages(channelId: string): Promise<number> {
  const filePath = join(CHANNELS_DIR, channelId, 'messages.jsonl')
  if (!existsSync(filePath)) return 0
  const raw = await readFile(filePath, 'utf-8')
  return raw.trim().split('\n').filter(Boolean).length
}

async function getLastMessage(channelId: string): Promise<ChatMessage | null> {
  const filePath = join(CHANNELS_DIR, channelId, 'messages.jsonl')
  if (!existsSync(filePath)) return null
  const raw = await readFile(filePath, 'utf-8')
  const lines = raw.trim().split('\n').filter(Boolean)
  if (lines.length === 0) return null
  return JSON.parse(lines[lines.length - 1])
}

function makeDmChannelId(a: string, b: string): string {
  return `dm-${[a, b].sort().join('-')}`
}

function extractMentions(text: string): string[] {
  const matches = text.match(/@([\w-]+)/g)
  return matches ? matches.map((m) => m.slice(1)) : []
}

// --- Init: ensure #general exists ---

export async function initChannels() {
  await mkdir(CHANNELS_DIR, { recursive: true })
  await ensureChannel('general', '#general', 'org')

  // Auto-create team channels from existing teams
  if (existsSync(TEAMS_DIR)) {
    const dirs = await readdir(TEAMS_DIR, { withFileTypes: true })
    for (const d of dirs) {
      if (!d.isDirectory()) continue
      try {
        const team = JSON.parse(await readFile(join(TEAMS_DIR, d.name, 'team.json'), 'utf-8'))
        await ensureChannel(team.id, `#${team.id}`, 'team', { teamId: team.id })
      } catch {}
    }
  }
}

// --- Routes ---

// GET /api/channels — list all channels with metadata
channelRoutes.get('/', async (c) => {
  await initChannels()
  const reg = await readRegistry()

  const channelsWithMeta = await Promise.all(
    reg.channels.map(async (ch) => {
      const messageCount = await countMessages(ch.id)
      const last = await getLastMessage(ch.id)
      return {
        ...ch,
        messageCount,
        lastActivity: last?.ts ?? ch.created_at,
      }
    })
  )

  // Sort: most recently active first
  channelsWithMeta.sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime())

  return c.json(channelsWithMeta)
})

// GET /api/channels/:id/messages — paginated messages for a channel
channelRoutes.get('/:id/messages', async (c) => {
  const id = c.req.param('id')
  const limit = parseInt(c.req.query('limit') ?? '50', 10)
  const before = c.req.query('before') ?? undefined

  const messages = await readChannelMessages(id, limit, before)
  return c.json(messages)
})

// POST /api/channels/:id/messages — Chairman posts a message
channelRoutes.post('/:id/messages', async (c) => {
  const channelId = c.req.param('id')
  const body = await c.req.json()
  const { text, replyTo } = body

  if (!text?.trim()) return c.json({ error: 'text required' }, 400)

  // Ensure channel exists
  const reg = await readRegistry()
  if (!reg.channels.find((ch) => ch.id === channelId)) {
    return c.json({ error: 'Channel not found' }, 404)
  }

  const msg: ChatMessage = {
    id: `CM-${Date.now()}-${++msgCounter}`,
    channel: channelId,
    from: 'chairman',
    text: text.trim(),
    replyTo: replyTo ?? null,
    mentions: extractMentions(text),
    ts: new Date().toISOString(),
  }

  await appendMessage(channelId, msg)
  return c.json(msg, 201)
})

// POST /api/channels/send — agent sends a message (called by MCP tool)
channelRoutes.post('/send', async (c) => {
  const body = await c.req.json()
  const { from, to, text, replyTo } = body

  if (!from || !to || !text?.trim()) {
    return c.json({ error: 'from, to, and text required' }, 400)
  }

  if (text.length > 4000) {
    return c.json({ error: 'Message too long (4000 char max)' }, 400)
  }

  let channelId: string

  if (to.startsWith('#')) {
    // Channel message
    channelId = to.slice(1)
    await ensureChannel(channelId, to, channelId === 'general' ? 'org' : 'team')
  } else if (to.startsWith('@')) {
    // Direct message
    const targetAgent = to.slice(1)
    channelId = makeDmChannelId(from, targetAgent)
    await ensureChannel(channelId, `@${from} / @${targetAgent}`, 'direct', {
      participants: [from, targetAgent].sort(),
    })
  } else {
    return c.json({ error: 'to must start with # (channel) or @ (agent)' }, 400)
  }

  const msg: ChatMessage = {
    id: `CM-${Date.now()}-${++msgCounter}`,
    channel: channelId,
    from,
    text: text.trim(),
    replyTo: replyTo ?? null,
    mentions: extractMentions(text),
    ts: new Date().toISOString(),
  }

  await appendMessage(channelId, msg)
  return c.json({ messageId: msg.id }, 201)
})

// GET /api/channels/unread/:agentId — messages mentioning agent across all channels
channelRoutes.get('/unread/:agentId', async (c) => {
  const agentId = c.req.param('agentId')
  const reg = await readRegistry()

  const unread: ChatMessage[] = []

  for (const ch of reg.channels) {
    // For DM channels, include if agent is a participant
    // For other channels, include messages that mention this agent
    const messages = await readChannelMessages(ch.id, 200)

    for (const msg of messages) {
      if (msg.from === agentId) continue // skip own messages

      const isDmParticipant =
        ch.type === 'direct' && ch.participants?.includes(agentId)
      const isMentioned = msg.mentions.includes(agentId)

      if (isDmParticipant || isMentioned) {
        unread.push(msg)
      }
    }
  }

  // Sort newest first
  unread.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())

  return c.json(unread)
})
