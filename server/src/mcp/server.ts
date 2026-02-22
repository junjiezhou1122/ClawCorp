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
        return {
          content: [{ type: 'text', text: `Delegated to ${a.agent_id}. Sub-mission: ${result.subMissionId}. Waiting for completion...` }],
        }
      }

      case 'report': {
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
