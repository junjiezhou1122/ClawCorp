import { broadcast } from './hub'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'

const AGENTS_DIR = join(import.meta.dir, '../../../agents')
const MISSIONS_DIR = join(import.meta.dir, '../../../missions')

// Track running processes
const running = new Map<string, ReturnType<typeof Bun.spawn>>()

export function isRunning(agentId: string) {
  return running.has(agentId)
}

export interface RunOptions {
  workspace?: string   // cwd to run in
  sessionId?: string   // resume specific session
  resume?: boolean     // -c: continue last session in workspace
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

  // Resolve workspace: options > mission state > profile default > cwd
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

  broadcast('agent:start', { agentId, missionId, workspace: cwd })

  let cmd: string[]
  const driver = profile.driver

  if (driver.type === 'cli' || driver.type === 'code') {
    const baseArgs = (driver.args as string[]).map((a: string) =>
      a.replace('{{prompt}}', prompt)
    )

    // Inject session flags for opencode
    if (driver.command === 'opencode') {
      const sessionFlags: string[] = []
      if (options.sessionId) {
        sessionFlags.push('-s', options.sessionId)
      } else if (options.resume) {
        sessionFlags.push('-c')
      }
      // baseArgs is ["run", "{{prompt}}"] → inject flags between run and message
      const [subcommand, ...rest] = baseArgs
      cmd = [driver.command, subcommand, ...sessionFlags, ...rest]
    } else {
      // claude or other CLIs: inject --resume if session provided
      if (options.sessionId && driver.command === 'claude') {
        cmd = [driver.command, '--resume', options.sessionId, ...baseArgs]
      } else {
        cmd = [driver.command, ...baseArgs]
      }
    }
  } else if (driver.type === 'llm') {
    cmd = ['claude', '-p', prompt]
  } else {
    throw new Error(`Unknown driver type: ${driver.type}`)
  }

  const proc = Bun.spawn(cmd, {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env }
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
    } finally {
      reader.releaseLock()
    }
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
    } finally {
      reader.releaseLock()
    }
  })()

  // On exit: capture session ID + update state
  proc.exited.then(async (code) => {
    running.delete(agentId)

    // Try to capture latest opencode session ID
    let sessionId: string | undefined
    if (driver.command === 'opencode') {
      sessionId = await getLatestOpenCodeSession(cwd)
    }

    // Persist session ID to mission state
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

async function getLatestOpenCodeSession(cwd: string): Promise<string | undefined> {
  try {
    const proc = Bun.spawn(['opencode', 'session', 'list'], {
      cwd,
      stdout: 'pipe',
      stderr: 'pipe',
    })
    await proc.exited
    const text = await new Response(proc.stdout).text()
    // Parse first session ID from output (most recent is first)
    const match = text.match(/([a-z0-9]{20,})/i)
    return match?.[1]
  } catch {
    return undefined
  }
}

export function killAgent(agentId: string) {
  const proc = running.get(agentId)
  if (proc) {
    proc.kill()
    running.delete(agentId)
    broadcast('agent:killed', { agentId })
  }
}
