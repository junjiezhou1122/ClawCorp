import { broadcast } from './hub'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

const AGENTS_DIR = join(import.meta.dir, '../../../agents')
const MISSIONS_DIR = join(import.meta.dir, '../../../missions')
const MCP_SERVER_PATH = join(import.meta.dir, '../mcp/server.ts')

const running = new Map<string, ReturnType<typeof Bun.spawn>>()

export function isRunning(agentId: string) {
  return running.has(agentId)
}

export interface RunOptions {
  workspace?: string
  sessionId?: string
  resume?: boolean
}

export async function runAgent(
  agentId: string,
  missionId: string,
  prompt: string,
  options: RunOptions = {}
) {
  if (running.has(agentId)) {
    throw new Error(`Agent ${agentId} is already running`)
  }

  const profilePath = join(AGENTS_DIR, agentId, 'profile.json')
  const profile = JSON.parse(await readFile(profilePath, 'utf-8'))

  // Resolve workspace
  let workspace = options.workspace
  if (!workspace) {
    try {
      const statePath = join(MISSIONS_DIR, missionId, 'state.json')
      const state = JSON.parse(await readFile(statePath, 'utf-8'))
      workspace = state.workspace
    } catch {}
  }
  if (!workspace && profile.default_workspace) {
    workspace = profile.default_workspace.replace('~', process.env.HOME ?? '')
  }
  const cwd = workspace ?? process.cwd()

  // Inject MCP config into workspace
  await injectMcpConfig(cwd, agentId, missionId)

  const driver = profile.driver
  const systemPrompt = driver.system_prompt ?? ''

  // Build full prompt = system prompt + task
  const fullPrompt = systemPrompt
    ? `${systemPrompt}\n\n---\nMission ID: ${missionId}\nTask: ${prompt}`
    : prompt

  broadcast('agent:start', { agentId, missionId, workspace: cwd })

  let cmd: string[]

  if (driver.type === 'claude-code') {
    // Build args, replacing {{full_prompt}} placeholder
    const args = (driver.args as string[]).map((a: string) =>
      a.replace('{{full_prompt}}', fullPrompt).replace('{{prompt}}', prompt)
    )

    // Inject session flags
    if (options.sessionId) {
      const insertAt = args.indexOf('-p')
      if (insertAt !== -1) args.splice(insertAt, 0, '--resume', options.sessionId)
    } else if (options.resume) {
      const insertAt = args.indexOf('-p')
      if (insertAt !== -1) args.splice(insertAt, 0, '--continue')
    }

    cmd = [driver.command, ...args]
  } else if (driver.type === 'cli') {
    // Legacy opencode-style
    const args = (driver.args as string[]).map((a: string) =>
      a.replace('{{prompt}}', fullPrompt)
    )
    if (driver.command === 'opencode' && (options.sessionId || options.resume)) {
      const sessionFlags = options.sessionId ? ['-s', options.sessionId] : ['-c']
      const [sub, ...rest] = args
      cmd = [driver.command, sub, ...sessionFlags, ...rest]
    } else {
      cmd = [driver.command, ...args]
    }
  } else {
    cmd = ['claude', '--dangerously-skip-permissions', '-p', fullPrompt]
  }

  const proc = Bun.spawn(cmd, {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
    env: (() => {
      const env = { ...process.env }
      // Normalize: ANTHROPIC_AUTH_TOKEN (zshrc style) → ANTHROPIC_API_KEY (claude CLI expects)
      env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_AUTH_TOKEN ?? ''
      // Remove nested Claude Code session marker so agents can spawn claude
      delete env.CLAUDECODE
      delete env.CLAUDE_CODE_ENTRYPOINT
      return env
    })()
  })

  running.set(agentId, proc)

  // Stream stdout
  ;(async () => {
    const decoder = new TextDecoder()
    const reader = proc.stdout.getReader()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        broadcast('agent:output', { agentId, missionId, text: decoder.decode(value) })
      }
    } finally { reader.releaseLock() }
  })()

  // Stream stderr
  ;(async () => {
    const decoder = new TextDecoder()
    const reader = proc.stderr.getReader()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        broadcast('agent:error', { agentId, missionId, text: decoder.decode(value) })
      }
    } finally { reader.releaseLock() }
  })()

  proc.exited.then(async (code) => {
    running.delete(agentId)

    // Capture opencode session ID
    let sessionId: string | undefined
    if (driver.command === 'opencode') {
      sessionId = await getLatestOpenCodeSession(cwd)
    }

    // Persist session ID
    if (sessionId) {
      try {
        const statePath = join(MISSIONS_DIR, missionId, 'state.json')
        const state = JSON.parse(await readFile(statePath, 'utf-8'))
        state.sessions = state.sessions ?? {}
        state.sessions[agentId] = sessionId
        await writeFile(statePath, JSON.stringify(state, null, 2))
      } catch {}
    }

    broadcast('agent:done', { agentId, missionId, exitCode: code, sessionId })
  })
}

async function injectMcpConfig(cwd: string, agentId: string, missionId: string) {
  try {
    const claudeDir = join(cwd, '.claude')
    await mkdir(claudeDir, { recursive: true })
    const config = {
      mcpServers: {
        clawcorp: {
          command: 'bun',
          args: ['run', MCP_SERVER_PATH],
          env: {
            CLAWCORP_SERVER: 'http://localhost:3001',
            CLAWCORP_AGENT_ID: agentId,
            CLAWCORP_MISSION_ID: missionId,
            CLAWCORP_AGENTS_DIR: AGENTS_DIR,
            ...(process.env.ANTHROPIC_BASE_URL && { ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL }),
            ...(process.env.ANTHROPIC_AUTH_TOKEN && { ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN }),
            ...(process.env.ANTHROPIC_API_KEY && { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY }),
          },
        },
      },
    }
    // Only write if not already present (don't override user config)
    const configPath = join(claudeDir, 'settings.json')
    if (existsSync(configPath)) {
      const existing = JSON.parse(await readFile(configPath, 'utf-8'))
      existing.mcpServers = { ...existing.mcpServers, ...config.mcpServers }
      await writeFile(configPath, JSON.stringify(existing, null, 2))
    } else {
      await writeFile(configPath, JSON.stringify(config, null, 2))
    }
  } catch (err) {
    console.error('[AgentRunner] Failed to inject MCP config:', err)
  }
}

async function getLatestOpenCodeSession(cwd: string): Promise<string | undefined> {
  try {
    const proc = Bun.spawn(['opencode', 'session', 'list'], { cwd, stdout: 'pipe', stderr: 'pipe' })
    await proc.exited
    const text = await new Response(proc.stdout).text()
    const match = text.match(/([a-z0-9]{20,})/i)
    return match?.[1]
  } catch { return undefined }
}

export function killAgent(agentId: string) {
  const proc = running.get(agentId)
  if (proc) {
    proc.kill()
    running.delete(agentId)
    broadcast('agent:killed', { agentId })
  }
}
