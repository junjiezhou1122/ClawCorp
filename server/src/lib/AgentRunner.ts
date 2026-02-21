import { broadcast } from './hub'
import { readFile } from 'fs/promises'
import { join } from 'path'

const AGENTS_DIR = join(import.meta.dir, '../../../agents')

// Track running processes so we can kill them
const running = new Map<string, ReturnType<typeof Bun.spawn>>()

export function isRunning(agentId: string) {
  return running.has(agentId)
}

export async function runAgent(agentId: string, missionId: string, prompt: string) {
  if (running.has(agentId)) {
    throw new Error(`Agent ${agentId} is already running`)
  }

  // Load agent profile
  const profilePath = join(AGENTS_DIR, agentId, 'profile.json')
  const profile = JSON.parse(await readFile(profilePath, 'utf-8'))

  broadcast('agent:start', { agentId, missionId })

  let cmd: string[]

  if (profile.driver.type === 'cli') {
    // e.g. claude -p "<prompt>"
    const args = (profile.driver.args as string[]).map((a: string) =>
      a.replace('{{prompt}}', prompt)
    )
    cmd = [profile.driver.command, ...args]
  } else if (profile.driver.type === 'llm') {
    // Fallback: use claude CLI with system prompt injected
    cmd = ['claude', '-p', `[${profile.title}]\n${prompt}`]
  } else if (profile.driver.type === 'code') {
    cmd = ['python3', '-c', prompt]
  } else {
    throw new Error(`Unknown driver type: ${profile.driver.type}`)
  }

  const proc = Bun.spawn(cmd, {
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env }
  })

  running.set(agentId, proc)

  // Stream stdout token by token
  ;(async () => {
    const decoder = new TextDecoder()
    const reader = proc.stdout.getReader()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const text = decoder.decode(value)
        broadcast('agent:output', { agentId, missionId, text })
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
        const text = decoder.decode(value)
        broadcast('agent:error', { agentId, missionId, text })
      }
    } finally {
      reader.releaseLock()
    }
  })()

  // Wait for exit
  proc.exited.then((code) => {
    running.delete(agentId)
    broadcast('agent:done', { agentId, missionId, exitCode: code })
  })
}

export function killAgent(agentId: string) {
  const proc = running.get(agentId)
  if (proc) {
    proc.kill()
    running.delete(agentId)
    broadcast('agent:killed', { agentId })
  }
}
