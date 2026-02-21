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
