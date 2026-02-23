#!/usr/bin/env bun
/**
 * ClawCorp MCP Server (stdio transport)
 * Spawned by Claude Code agents via .claude/settings.json
 * Communicates with ClawCorp main server via HTTP
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'

const BASE_URL = process.env.CLAWCORP_SERVER ?? 'http://localhost:3001'
const AGENT_ID = process.env.CLAWCORP_AGENT_ID ?? 'unknown'
const MISSION_ID = process.env.CLAWCORP_MISSION_ID ?? 'unknown'
const AGENTS_DIR = process.env.CLAWCORP_AGENTS_DIR ?? join(import.meta.dir, '../../../agents')

// Track whether delegate was called in this session
let delegateCalled = false

async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  return res.json()
}

const server = new Server(
  { name: 'clawcorp', version: '1.0.0' },
  { capabilities: { tools: {} } }
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'escalate',
      description: 'Ask your supervisor when you are blocked. Do NOT use this for simple decisions — make assumptions instead. Only escalate genuine blockers.',
      inputSchema: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'The specific question or blocker' },
          context: { type: 'string', description: 'Relevant context for the supervisor' },
        },
        required: ['question'],
      },
    },
    {
      name: 'delegate',
      description: 'Assign a sub-task to one of your subordinate agents.',
      inputSchema: {
        type: 'object',
        properties: {
          agent_id: { type: 'string', description: 'ID of the subordinate agent' },
          task: { type: 'string', description: 'Full task description for the agent' },
          workspace: { type: 'string', description: 'Workspace directory for the task (optional)' },
        },
        required: ['agent_id', 'task'],
      },
    },
    {
      name: 'report',
      description: 'Report task completion to your supervisor. Call this when your work is done.',
      inputSchema: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'Summary of what was accomplished' },
          artifacts: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of file paths created/modified',
          },
        },
        required: ['summary'],
      },
    },
    {
      name: 'memory_read',
      description: 'Read your long-term memory (past learnings and preferences).',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'memory_write',
      description: 'Write to your long-term memory. Use this to save important learnings.',
      inputSchema: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'Content to append to memory' },
        },
        required: ['content'],
      },
    },
    {
      name: 'send_message',
      description: 'Send a message to a channel (#channel-name) or another agent (@agent-id). Non-blocking, fire-and-forget. Use this for FYIs, questions, coordination — anything that is not an escalation, report, or delegation.',
      inputSchema: {
        type: 'object',
        properties: {
          to: { type: 'string', description: 'Destination: "#channel-name" for a channel or "@agent-id" for a direct message' },
          text: { type: 'string', description: 'Message content (markdown ok, max 4000 chars)' },
          reply_to: { type: 'string', description: 'Optional message ID to reply to (creates a thread)' },
        },
        required: ['to', 'text'],
      },
    },
    {
      name: 'read_messages',
      description: 'Read recent messages. Specify a channel to read that channel, or omit to get all unread messages mentioning you.',
      inputSchema: {
        type: 'object',
        properties: {
          channel: { type: 'string', description: 'Channel to read: "#engineering" or "@agent-id" for DMs. Omit to get all unread messages mentioning you.' },
          limit: { type: 'number', description: 'Max messages to return (default 20)' },
        },
      },
    },
    {
      name: 'cross_team_delegate',
      description: 'Delegate a task to another department\'s head with full context. Only callable by agents with rank "director" or "executive". Sends a structured context packet so the receiving team knows what to do, why, and what is already known.',
      inputSchema: {
        type: 'object',
        properties: {
          to_team: { type: 'string', description: 'Target team ID (e.g. "research-lab", "engineering")' },
          task: { type: 'string', description: 'What the receiving team should do' },
          why: { type: 'string', description: 'Why this is needed — business context' },
          known: { type: 'string', description: 'Relevant context, prior work, or constraints' },
          expected_output: { type: 'string', description: 'What format or type of result is expected' },
        },
        required: ['to_team', 'task', 'why', 'expected_output'],
      },
    },
  ],
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params
  const a = (args ?? {}) as Record<string, unknown>

  try {
    switch (name) {
      case 'escalate': {
        // Create escalation message
        const msg = await api('POST', '/api/messages', {
          from: AGENT_ID,
          missionId: MISSION_ID,
          type: 'escalate',
          question: a.question,
          context: a.context ?? '',
        })

        // Poll for answer (max 10 minutes)
        const maxWait = 10 * 60 * 1000
        const interval = 4000
        const start = Date.now()

        while (Date.now() - start < maxWait) {
          await Bun.sleep(interval)
          const updated = await api('GET', `/api/messages/${msg.id}`)
          if (updated.status === 'answered') {
            return { content: [{ type: 'text', text: `Supervisor answered: ${updated.answer}` }] }
          }
        }

        return {
          content: [{ type: 'text', text: 'No answer received in time. Make your best judgment and proceed.' }],
        }
      }

      case 'delegate': {
        const result = await api('POST', '/api/delegate', {
          fromAgentId: AGENT_ID,
          toAgentId: a.agent_id,
          missionId: MISSION_ID,
          task: a.task,
          workspace: a.workspace,
        })
        delegateCalled = true
        return {
          content: [{ type: 'text', text: `Delegated to ${a.agent_id}. Sub-mission: ${result.subMissionId}. Waiting for completion...` }],
        }
      }

      case 'report': {
        // Mechanical enforcement: executives/directors must delegate before reporting
        if (!delegateCalled) {
          let callerProfile: Record<string, unknown> = {}
          try {
            callerProfile = JSON.parse(await readFile(join(AGENTS_DIR, AGENT_ID, 'profile.json'), 'utf-8'))
          } catch {}
          const rank = (callerProfile.rank as string) ?? 'member'
          const subs = (callerProfile.subordinates as string[]) ?? []
          if ((rank === 'executive' || rank === 'director') && subs.length > 0) {
            return {
              content: [{ type: 'text', text: `BLOCKED: You are a ${rank} with subordinates (${subs.join(', ')}). You MUST call 'delegate' at least once before reporting. Delegate implementation work to your subordinates first, then call report again.` }],
              isError: true,
            }
          }
        }

        await api('POST', '/api/messages', {
          from: AGENT_ID,
          missionId: MISSION_ID,
          type: 'report',
          summary: a.summary,
          artifacts: a.artifacts ?? [],
        })
        return {
          content: [{ type: 'text', text: `Report submitted. Mission ${MISSION_ID} marked complete.` }],
        }
      }

      case 'memory_read': {
        const memPath = join(AGENTS_DIR, AGENT_ID, 'memory.md')
        const content = await readFile(memPath, 'utf-8').catch(() => '(empty)')
        return { content: [{ type: 'text', text: content }] }
      }

      case 'memory_write': {
        const memPath = join(AGENTS_DIR, AGENT_ID, 'memory.md')
        const existing = await readFile(memPath, 'utf-8').catch(() => '')
        const timestamp = new Date().toISOString()
        await writeFile(memPath, `${existing}\n\n## ${timestamp}\n${a.content}`)
        return { content: [{ type: 'text', text: 'Memory saved.' }] }
      }

      case 'send_message': {
        const result = await api('POST', '/api/channels/send', {
          from: AGENT_ID,
          to: a.to,
          text: a.text,
          replyTo: a.reply_to,
        })
        if (result.error) {
          return { content: [{ type: 'text', text: `Error: ${result.error}` }], isError: true }
        }
        return { content: [{ type: 'text', text: `Message sent (${result.messageId})` }] }
      }

      case 'read_messages': {
        const limit = (a.limit as number) ?? 20
        const channel = a.channel as string | undefined

        if (channel) {
          // Read specific channel
          let channelId: string
          if (channel.startsWith('#')) {
            channelId = channel.slice(1)
          } else if (channel.startsWith('@')) {
            const targetAgent = channel.slice(1)
            channelId = `dm-${[AGENT_ID, targetAgent].sort().join('-')}`
          } else {
            channelId = channel
          }
          const messages = await api('GET', `/api/channels/${channelId}/messages?limit=${limit}`)
          if (!Array.isArray(messages) || messages.length === 0) {
            return { content: [{ type: 'text', text: 'No messages in this channel.' }] }
          }
          const formatted = messages.map((m: Record<string, string>) =>
            `[${m.ts}] ${m.from}: ${m.text}${m.replyTo ? ` (reply to ${m.replyTo})` : ''}`
          ).join('\n')
          return { content: [{ type: 'text', text: formatted }] }
        }

        // No channel specified — get unread messages mentioning this agent
        const unread = await api('GET', `/api/channels/unread/${AGENT_ID}`)
        if (!Array.isArray(unread) || unread.length === 0) {
          return { content: [{ type: 'text', text: 'No unread messages.' }] }
        }
        const formatted = unread.slice(0, limit).map((m: Record<string, string>) =>
          `[${m.channel}] [${m.ts}] ${m.from}: ${m.text}`
        ).join('\n')
        return { content: [{ type: 'text', text: `${unread.length} unread message(s):\n${formatted}` }] }
      }

      case 'cross_team_delegate': {
        // Check caller's rank — only director+ can cross-team delegate
        let callerProfile: Record<string, unknown> = {}
        try {
          const profilePath = join(AGENTS_DIR, AGENT_ID, 'profile.json')
          callerProfile = JSON.parse(await readFile(profilePath, 'utf-8'))
        } catch {}

        const rank = (callerProfile.rank as string) ?? 'member'
        if (rank !== 'director' && rank !== 'executive') {
          return {
            content: [{ type: 'text', text: 'Error: Only agents with rank "director" or "executive" can delegate cross-team. Your rank: ' + rank }],
            isError: true,
          }
        }

        // Find the target team's head
        let targetTeam: Record<string, unknown> = {}
        try {
          const teamRes = await api('GET', `/api/teams/${a.to_team}`)
          targetTeam = teamRes
        } catch {}

        const targetHead = targetTeam.head as string
        if (!targetHead) {
          return {
            content: [{ type: 'text', text: `Error: Team "${a.to_team}" not found or has no head.` }],
            isError: true,
          }
        }

        // Create a cross-team message
        await api('POST', '/api/messages', {
          from: AGENT_ID,
          missionId: MISSION_ID,
          type: 'escalate',
          question: `[Cross-team from ${callerProfile.team ?? 'unknown'}] Task: ${a.task}\n\nWhy: ${a.why}\nKnown: ${a.known ?? 'N/A'}\nExpected output: ${a.expected_output}`,
          context: `Cross-team delegation to ${a.to_team}`,
          to: targetHead,
        })

        // Delegate the task to the target head
        const result = await api('POST', '/api/delegate', {
          fromAgentId: AGENT_ID,
          toAgentId: targetHead,
          missionId: MISSION_ID,
          task: `[Cross-team request from ${callerProfile.title ?? AGENT_ID}]\n\nTask: ${a.task}\nWhy: ${a.why}\nKnown context: ${a.known ?? 'N/A'}\nExpected output: ${a.expected_output}`,
        })

        return {
          content: [{ type: 'text', text: `Cross-team task delegated to ${targetHead} (${a.to_team}). Sub-mission: ${result.subMissionId}` }],
        }
      }

      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true }
    }
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Tool error: ${(err as Error).message}` }],
      isError: true,
    }
  }
})

const transport = new StdioServerTransport()
await server.connect(transport)
