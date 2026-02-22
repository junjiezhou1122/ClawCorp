import Anthropic from '@anthropic-ai/sdk'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import { broadcast } from './hub'

const AGENTS_DIR = join(import.meta.dir, '../../../agents')
const ARCHIVE_DIR = join(import.meta.dir, '../../../archive')

const TEST_TASKS: Record<string, string> = {
  Engineering:
    'Write a TypeScript function isPalindrome(s: string): boolean with 3 test cases',
  'Research Lab':
    'List 5 open research questions in the field of autonomous AI agents',
  Product:
    'Write 3 Given/When/Then acceptance scenarios for a user login feature',
}

type Candidate = {
  id: string
  title: string
  department: string
  description: string
  reports_to: string
  system_prompt: string
}

type InterviewResult = {
  candidate: Candidate
  output: string
  exitCode: number
  scores?: {
    task_completion: number
    output_quality: number
    autonomy: number
    conciseness: number
    weighted: number
  }
}

export async function runSmartHire(description: string, hireId: string) {
  const anthropic = new Anthropic()

  try {
    broadcast('hire:start', { hireId, description })

    // Phase 1: Generate candidates
    const candidates = await generateCandidates(anthropic, description)
    broadcast('hire:candidates', {
      hireId,
      candidates: candidates.map((c) => ({ id: c.id, title: c.title })),
    })

    // Phase 2: Run interviews in parallel
    const results: InterviewResult[] = []
    const interviews = candidates.map(async (candidate) => {
      broadcast('hire:interview_start', { hireId, candidateId: candidate.id })
      const result = await runInterview(candidate)
      broadcast('hire:interview_done', {
        hireId,
        candidateId: candidate.id,
        exitCode: result.exitCode,
      })
      return result
    })

    const interviewResults = await Promise.all(interviews)
    results.push(...interviewResults)

    // Phase 3: Score candidates
    const scored = await scoreCandidates(anthropic, description, results)
    broadcast('hire:scores', {
      hireId,
      scores: scored.map((r) => ({
        candidateId: r.candidate.id,
        weighted: r.scores!.weighted,
      })),
    })

    // Find winner (highest weighted score; tiebreak: shorter system_prompt)
    const sorted = [...scored]
      .filter((r) => r.scores)
      .sort((a, b) => {
        const diff = b.scores!.weighted - a.scores!.weighted
        if (Math.abs(diff) > 0.01) return diff
        return a.candidate.system_prompt.length - b.candidate.system_prompt.length
      })

    if (sorted.length === 0) {
      broadcast('hire:error', { hireId, message: 'All candidates failed scoring' })
      return
    }

    const winner = sorted[0]

    // Phase 4: Hire winner
    const profile = await hireWinner(winner.candidate)
    broadcast('hire:complete', { hireId, agent: profile })

    // Phase 5: Archive results
    await archiveResults(hireId, description, results)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    broadcast('hire:error', { hireId, message })
  }
}

async function generateCandidates(
  anthropic: Anthropic,
  description: string
): Promise<Candidate[]> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: `You are a hiring manager at ClawCorp, an autonomous AI organization.

The Chairman needs: "${description}"

Generate 3 distinct agent profiles in JSON array format. Each should have:
- id: a short kebab-case slug (e.g. "sql-optimizer")
- title: a human-readable job title
- department: one of "Engineering", "Research Lab", or "Product"
- description: one sentence describing this agent's specialty
- reports_to: infer from department — "principal-investigator" for Research Lab, "chairman" for others
- system_prompt: specific, actionable instructions including the 3 mandatory rules:
  1. Never ask clarifying questions — make assumptions and proceed
  2. Use escalate tool if blocked
  3. Use report tool when done

Each candidate should have a different specialization angle or prompting strategy.
Return ONLY a JSON array, no explanation or markdown fences.`,
      },
    ],
  })

  const text =
    response.content[0].type === 'text' ? response.content[0].text : ''
  // Extract JSON array from response (handle possible markdown fences)
  const jsonMatch = text.match(/\[[\s\S]*\]/)
  if (!jsonMatch) throw new Error('Failed to parse candidates from LLM response')
  return JSON.parse(jsonMatch[0])
}

async function runInterview(candidate: Candidate): Promise<InterviewResult> {
  const testTask =
    TEST_TASKS[candidate.department] ?? TEST_TASKS['Engineering']

  const prompt = `${candidate.system_prompt}\n\nTASK: ${testTask}`

  try {
    const proc = Bun.spawn(
      ['claude', '--dangerously-skip-permissions', '-p', prompt],
      {
        cwd: '/tmp',
        stdout: 'pipe',
        stderr: 'pipe',
        env: {
          ...process.env,
          ANTHROPIC_API_KEY:
            process.env.ANTHROPIC_API_KEY ??
            process.env.ANTHROPIC_AUTH_TOKEN ??
            '',
          CLAUDECODE: undefined as unknown as string,
          CLAUDE_CODE_ENTRYPOINT: undefined as unknown as string,
        },
      }
    )

    // 60s timeout
    const timeout = setTimeout(() => proc.kill(), 60_000)

    const output = await new Response(proc.stdout).text()
    const exitCode = await proc.exited
    clearTimeout(timeout)

    return { candidate, output, exitCode }
  } catch {
    return { candidate, output: '', exitCode: 1 }
  }
}

async function scoreCandidates(
  anthropic: Anthropic,
  description: string,
  results: InterviewResult[]
): Promise<InterviewResult[]> {
  const candidateSummaries = results
    .map(
      (r, i) =>
        `## Candidate ${i + 1}: ${r.candidate.title} (${r.candidate.id})
Department: ${r.candidate.department}
Description: ${r.candidate.description}
Exit Code: ${r.exitCode}

### Test Output:
${r.output.slice(0, 3000)}
`
    )
    .join('\n---\n')

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `You are evaluating candidates for: "${description}"

${candidateSummaries}

Score each candidate 0-10 on these dimensions:
- task_completion (40%): Did they actually do what was asked?
- output_quality (30%): Is the output correct, precise, useful?
- autonomy (20%): Did they make decisions without asking questions?
- conciseness (10%): Did they avoid unnecessary verbosity?

Return ONLY a JSON array of objects with candidateId and the 4 scores. No explanation.
Example: [{"candidateId": "foo", "task_completion": 8, "output_quality": 7, "autonomy": 9, "conciseness": 8}]`,
      },
    ],
  })

  const text =
    response.content[0].type === 'text' ? response.content[0].text : ''
  const jsonMatch = text.match(/\[[\s\S]*\]/)
  if (!jsonMatch) return results

  const scores: Array<{
    candidateId: string
    task_completion: number
    output_quality: number
    autonomy: number
    conciseness: number
  }> = JSON.parse(jsonMatch[0])

  return results.map((r) => {
    const s = scores.find((sc) => sc.candidateId === r.candidate.id)
    if (!s) return r
    const weighted =
      s.task_completion * 0.4 +
      s.output_quality * 0.3 +
      s.autonomy * 0.2 +
      s.conciseness * 0.1
    return {
      ...r,
      scores: { ...s, weighted: Math.round(weighted * 100) / 100 },
    }
  })
}

async function hireWinner(candidate: Candidate) {
  const agentDir = join(AGENTS_DIR, candidate.id)

  // Avoid collision — append timestamp if exists
  const finalId = existsSync(agentDir)
    ? `${candidate.id}-${Date.now()}`
    : candidate.id
  const finalDir = join(AGENTS_DIR, finalId)

  await mkdir(finalDir, { recursive: true })

  const profile = {
    id: finalId,
    title: candidate.title,
    department: candidate.department,
    description: candidate.description,
    driver: {
      type: 'claude-code',
      command: 'claude',
      args: ['--dangerously-skip-permissions', '-p', '{{full_prompt}}'],
      system_prompt: candidate.system_prompt,
    },
    reports_to: candidate.reports_to,
    subordinates: [],
    cost_model: 'medium',
  }

  await writeFile(join(finalDir, 'profile.json'), JSON.stringify(profile, null, 2))
  await writeFile(join(finalDir, 'memory.md'), `# ${candidate.title} Memory\n\n`)

  return profile
}

async function archiveResults(
  hireId: string,
  description: string,
  results: InterviewResult[]
) {
  const dir = join(ARCHIVE_DIR, 'interviews')
  await mkdir(dir, { recursive: true })

  const record = {
    hireId,
    description,
    timestamp: new Date().toISOString(),
    candidates: results.map((r) => ({
      ...r.candidate,
      exitCode: r.exitCode,
      output: r.output,
      scores: r.scores,
    })),
    winner: results
      .filter((r) => r.scores)
      .sort((a, b) => (b.scores?.weighted ?? 0) - (a.scores?.weighted ?? 0))[0]
      ?.candidate.id,
  }

  await writeFile(
    join(dir, `H-${hireId}.json`),
    JSON.stringify(record, null, 2)
  )
}
