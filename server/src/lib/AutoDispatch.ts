import { readdir, readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { broadcast } from './hub'
import { runAgent } from './AgentRunner'

const AGENTS_DIR = join(import.meta.dir, '../../../agents')
const MISSIONS_DIR = join(import.meta.dir, '../../../missions')
const TEAMS_DIR = join(import.meta.dir, '../../../teams')

type RoutingResult = {
  executive_id: string
  reasoning: string
  suggested_approach: string
}

async function loadExecutives(): Promise<Array<{ id: string; title: string; department: string; description: string }>> {
  const dirs = await readdir(AGENTS_DIR, { withFileTypes: true })
  const profiles = await Promise.all(
    dirs
      .filter((d) => d.isDirectory())
      .map(async (d) => {
        try {
          return JSON.parse(await readFile(join(AGENTS_DIR, d.name, 'profile.json'), 'utf-8'))
        } catch {
          return null
        }
      })
  )
  return profiles.filter((p) => p?.rank === 'executive')
}

async function loadTeams(): Promise<Array<{ id: string; name: string; head: string; members: string[] }>> {
  try {
    const dirs = await readdir(TEAMS_DIR, { withFileTypes: true })
    return await Promise.all(
      dirs
        .filter((d) => d.isDirectory())
        .map(async (d) => {
          try {
            return JSON.parse(await readFile(join(TEAMS_DIR, d.name, 'team.json'), 'utf-8'))
          } catch {
            return null
          }
        })
    ).then((ts) => ts.filter(Boolean))
  } catch {
    return []
  }
}

async function routeWithLLM(
  taskTitle: string,
  executives: Array<{ id: string; title: string; department: string; description: string }>,
  teams: Array<{ id: string; name: string; head: string; members: string[] }>
): Promise<RoutingResult> {
  const execSummary = executives
    .map((e) => `- ${e.id}: ${e.title} (${e.department}) — ${e.description}`)
    .join('\n')

  const teamSummary = teams
    .map((t) => `- ${t.name}: head=${t.head}, ${t.members.length} members`)
    .join('\n')

  const prompt = `You are a task router for an AI company. Given a task, pick the best executive to handle it.

Available executives:
${execSummary}

Teams:
${teamSummary}

Routing rules:
- Software, code, architecture, technical implementation, building features → product-manager (manages engineering)
- Research, analysis, experiments, literature review, investigation → principal-investigator
- If unclear → default to product-manager

Task: "${taskTitle}"

Respond with ONLY valid JSON (no markdown, no explanation):
{"executive_id": "...", "reasoning": "one sentence why", "suggested_approach": "one sentence how"}`

  // Spawn claude CLI (same mechanism as all other agents)
  const proc = Bun.spawn(['claude', '--dangerously-skip-permissions', '-p', prompt, '--output-format', 'text'], {
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      CLAUDE_CODE_ENTRYPOINT: undefined as unknown as string,
    },
  })

  const text = await new Response(proc.stdout).text()
  const exitCode = await proc.exited

  if (exitCode !== 0) {
    const errText = await new Response(proc.stderr).text()
    throw new Error(`Claude routing failed (exit ${exitCode}): ${errText.slice(0, 200)}`)
  }

  // Extract JSON from response (may have surrounding text)
  const jsonMatch = text.match(/\{[\s\S]*"executive_id"[\s\S]*\}/)
  const jsonStr = jsonMatch ? jsonMatch[0] : text.trim()

  try {
    const parsed = JSON.parse(jsonStr)
    if (parsed.executive_id && executives.some((e) => e.id === parsed.executive_id)) {
      return parsed as RoutingResult
    }
    return {
      executive_id: executives[0]?.id ?? 'product-manager',
      reasoning: parsed.reasoning ?? 'Fallback: invalid executive in LLM response',
      suggested_approach: parsed.suggested_approach ?? 'Delegated to first available executive',
    }
  } catch {
    // Try regex extraction
    const match = text.match(/"executive_id"\s*:\s*"([^"]+)"/)
    const execId = match?.[1]
    if (execId && executives.some((e) => e.id === execId)) {
      return {
        executive_id: execId,
        reasoning: 'Extracted from partial LLM response',
        suggested_approach: 'Auto-routed',
      }
    }
    return {
      executive_id: 'product-manager',
      reasoning: 'Fallback: could not parse LLM response',
      suggested_approach: 'Defaulting to product-manager',
    }
  }
}

export async function autoDispatch(
  taskId: string,
  taskTitle: string,
  workspace?: string
): Promise<{ missionId: string; executiveId: string; reasoning: string }> {
  broadcast('dispatch:start', { taskId, title: taskTitle })

  // 1. Load executives and teams
  const executives = await loadExecutives()
  if (executives.length === 0) {
    throw new Error('No executives found in the organization')
  }

  const teams = await loadTeams()

  // 2. LLM routing via Claude CLI
  const routing = await routeWithLLM(taskTitle, executives, teams)
  broadcast('dispatch:routed', {
    taskId,
    executiveId: routing.executive_id,
    reasoning: routing.reasoning,
  })

  // 3. Create mission linked to task
  const missionId = `M-${Date.now()}`
  const missionDir = join(MISSIONS_DIR, missionId)
  await mkdir(missionDir, { recursive: true })
  await mkdir(join(missionDir, 'artifacts'), { recursive: true })

  const missionState = {
    id: missionId,
    title: taskTitle,
    type: 'engineering',
    status: 'in_progress',
    current_stage: 'development',
    assignee: routing.executive_id,
    workspace: workspace ?? null,
    sessions: {},
    created_at: new Date().toISOString(),
    task_id: taskId,
    history: [{ at: new Date().toISOString(), event: 'auto-dispatched', to: routing.executive_id }],
  }

  await writeFile(join(missionDir, 'state.json'), JSON.stringify(missionState, null, 2))
  broadcast('mission:updated', missionState)

  // 4. Build prompt for the executive
  const prompt = `The Chairman has assigned this task to you via auto-dispatch.

Task: ${taskTitle}
Routing reasoning: ${routing.reasoning}
Suggested approach: ${routing.suggested_approach}

IMPORTANT: You are an EXECUTIVE. Your job is to PLAN and DELEGATE, not to implement.
- Break the task into sub-tasks
- Use 'delegate' to assign each sub-task to the appropriate subordinate
- Do NOT write code, designs, or artifacts yourself — that is your team's job
- You may write a brief plan/PRD before delegating, but implementation MUST be delegated
- Use 'report' when all sub-tasks have been delegated and you have a summary of the plan`

  // 5. Spawn the executive agent
  broadcast('dispatch:spawning', { taskId, executiveId: routing.executive_id, missionId })

  runAgent(routing.executive_id, missionId, prompt, { workspace }).catch((err) => {
    broadcast('dispatch:error', { taskId, message: `Failed to spawn ${routing.executive_id}: ${err.message}` })
  })

  return {
    missionId,
    executiveId: routing.executive_id,
    reasoning: routing.reasoning,
  }
}
