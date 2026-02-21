import { useEffect, useState, useRef } from 'react'
import { useWebSocket } from './hooks/useWebSocket'

type Agent = {
  id: string
  title: string
  department: string
  description: string
  status: 'idle' | 'running' | 'error'
}

type Mission = {
  id: string
  title: string
  type: 'engineering' | 'research'
  status: string
  current_stage: string
  assignee: string | null
}

type LogLine = {
  id: number
  agentId: string
  missionId: string
  text: string
  kind: 'output' | 'error' | 'system'
}

const STAGES = ['backlog', 'analysis', 'design', 'development', 'testing', 'done']
const STAGE_LABELS: Record<string, string> = {
  backlog: 'Backlog',
  analysis: 'Analysis',
  design: 'Design',
  development: 'Dev',
  testing: 'QA',
  done: 'Done',
}
const DEPT_COLOR: Record<string, string> = {
  Product: 'bg-violet-600',
  Engineering: 'bg-blue-600',
  'Research Lab': 'bg-emerald-600',
}

let logId = 0

export default function App() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [missions, setMissions] = useState<Mission[]>([])
  const [logs, setLogs] = useState<LogLine[]>([])
  const [newTitle, setNewTitle] = useState('')
  const [newType, setNewType] = useState<'engineering' | 'research'>('engineering')
  const [runTarget, setRunTarget] = useState<{ missionId: string; prompt: string } | null>(null)
  const [selectedAgent, setSelectedAgent] = useState('')
  const logsEndRef = useRef<HTMLDivElement>(null)

  // Fetch initial data
  useEffect(() => {
    fetch('/api/agents').then((r) => r.json()).then((data) =>
      setAgents(data.map((a: Agent) => ({ ...a, status: 'idle' })))
    )
    fetch('/api/missions').then((r) => r.json()).then(setMissions)
  }, [])

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  // WebSocket — live agent events
  useWebSocket((msg) => {
    const { event, data } = msg
    const d = data as Record<string, string>

    if (event === 'agent:start') {
      setAgents((prev) =>
        prev.map((a) => (a.id === d.agentId ? { ...a, status: 'running' } : a))
      )
      appendLog(d.agentId, d.missionId, `▶ Agent started`, 'system')
    }

    if (event === 'agent:output') {
      appendLog(d.agentId, d.missionId, d.text, 'output')
    }

    if (event === 'agent:error') {
      appendLog(d.agentId, d.missionId, d.text, 'error')
    }

    if (event === 'agent:done') {
      setAgents((prev) =>
        prev.map((a) => (a.id === d.agentId ? { ...a, status: 'idle' } : a))
      )
      setMissions((prev) =>
        prev.map((m) =>
          m.id === d.missionId ? { ...m, current_stage: 'done', status: 'done' } : m
        )
      )
      appendLog(d.agentId, d.missionId, `■ Agent done (exit ${d.exitCode})`, 'system')
    }

    if (event === 'agent:killed') {
      setAgents((prev) =>
        prev.map((a) => (a.id === d.agentId ? { ...a, status: 'idle' } : a))
      )
      appendLog(d.agentId, '', `✕ Agent killed`, 'error')
    }
  })

  function appendLog(agentId: string, missionId: string, text: string, kind: LogLine['kind']) {
    setLogs((prev) => [...prev.slice(-500), { id: logId++, agentId, missionId, text, kind }])
  }

  async function createMission() {
    if (!newTitle.trim()) return
    const res = await fetch('/api/missions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle, type: newType }),
    })
    const m = await res.json()
    setMissions((prev) => [...prev, m])
    setNewTitle('')
  }

  async function startRun() {
    if (!runTarget || !selectedAgent) return
    await fetch('/api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: selectedAgent,
        missionId: runTarget.missionId,
        prompt: runTarget.prompt,
      }),
    })
    setMissions((prev) =>
      prev.map((m) =>
        m.id === runTarget.missionId
          ? { ...m, current_stage: 'development', assignee: selectedAgent }
          : m
      )
    )
    setRunTarget(null)
    setSelectedAgent('')
  }

  const missionsByStage = STAGES.reduce(
    (acc, s) => {
      acc[s] = missions.filter((m) => m.current_stage === s)
      return acc
    },
    {} as Record<string, Mission[]>
  )

  const runningAgents = agents.filter((a) => a.status === 'running')

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-mono flex flex-col">
      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-3 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-lg font-bold tracking-tight">ClawCorp</h1>
          <p className="text-xs text-zinc-500">Self-Evolving AI Organization</p>
        </div>
        <div className="flex items-center gap-3">
          {runningAgents.length > 0 && (
            <span className="text-xs text-emerald-400 animate-pulse">
              {runningAgents.length} agent{runningAgents.length > 1 ? 's' : ''} running
            </span>
          )}
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Agents + Board */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* Agent Roster */}
          <section>
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3">
              Team ({agents.length})
            </h2>
            <div className="flex flex-wrap gap-2">
              {agents.map((agent) => (
                <div
                  key={agent.id}
                  className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2"
                >
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      agent.status === 'running'
                        ? 'bg-emerald-400 animate-pulse'
                        : 'bg-zinc-600'
                    }`}
                  />
                  <div>
                    <p className="text-xs font-medium">{agent.title}</p>
                    <p className="text-xs text-zinc-500">{agent.id}</p>
                  </div>
                  <span
                    className={`text-xs text-white px-1.5 py-0.5 rounded ${
                      DEPT_COLOR[agent.department] ?? 'bg-zinc-700'
                    }`}
                  >
                    {agent.status === 'running' ? 'running' : agent.department}
                  </span>
                  {agent.status === 'running' && (
                    <button
                      onClick={() =>
                        fetch(`/api/run/${agent.id}`, { method: 'DELETE' })
                      }
                      className="text-xs text-red-400 hover:text-red-300 ml-1"
                    >
                      kill
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* New Mission */}
          <section>
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3">
              New Mission
            </h2>
            <div className="flex gap-2">
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createMission()}
                placeholder="Mission title..."
                className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-400"
              />
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as 'engineering' | 'research')}
                className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm"
              >
                <option value="engineering">Engineering</option>
                <option value="research">Research</option>
              </select>
              <button
                onClick={createMission}
                className="bg-zinc-100 text-zinc-900 rounded px-4 py-2 text-sm font-semibold hover:bg-white transition-colors"
              >
                + Create
              </button>
            </div>
          </section>

          {/* Kanban */}
          <section>
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3">
              Board
            </h2>
            <div className="grid grid-cols-3 lg:grid-cols-6 gap-2">
              {STAGES.map((stage) => (
                <div
                  key={stage}
                  className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 min-h-[160px]"
                >
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-semibold text-zinc-400">
                      {STAGE_LABELS[stage]}
                    </span>
                    <span className="text-xs bg-zinc-800 text-zinc-500 rounded px-1">
                      {missionsByStage[stage]?.length ?? 0}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {missionsByStage[stage]?.map((m) => (
                      <div
                        key={m.id}
                        className="bg-zinc-800 border border-zinc-700 rounded p-2 space-y-1.5"
                      >
                        <p className="text-xs font-medium leading-snug">{m.title}</p>
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs text-zinc-500">{m.id}</span>
                          <span
                            className={`text-xs px-1 rounded ${
                              m.type === 'research'
                                ? 'bg-emerald-900 text-emerald-300'
                                : 'bg-blue-900 text-blue-300'
                            }`}
                          >
                            {m.type}
                          </span>
                        </div>
                        {m.assignee && (
                          <p className="text-xs text-zinc-500">→ {m.assignee}</p>
                        )}
                        {stage !== 'done' && (
                          <button
                            onClick={() =>
                              setRunTarget({ missionId: m.id, prompt: m.title })
                            }
                            className="w-full text-xs bg-zinc-700 hover:bg-zinc-600 rounded px-2 py-1 transition-colors"
                          >
                            ▶ Run
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Right: Live Log Panel */}
        <div className="w-96 border-l border-zinc-800 flex flex-col shrink-0">
          <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">
              Live Log
            </h2>
            <button
              onClick={() => setLogs([])}
              className="text-xs text-zinc-600 hover:text-zinc-400"
            >
              clear
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-0.5 text-xs">
            {logs.length === 0 && (
              <p className="text-zinc-600 text-center mt-8">
                Run an agent to see output here...
              </p>
            )}
            {logs.map((line) => (
              <div
                key={line.id}
                className={`leading-relaxed whitespace-pre-wrap break-all ${
                  line.kind === 'system'
                    ? 'text-zinc-500'
                    : line.kind === 'error'
                    ? 'text-red-400'
                    : 'text-zinc-200'
                }`}
              >
                {line.kind === 'system' && (
                  <span className="text-zinc-600">[{line.agentId}] </span>
                )}
                {line.text}
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        </div>
      </div>

      {/* Run Modal */}
      {runTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-full max-w-md space-y-4">
            <h3 className="font-semibold">Run Mission</h3>
            <p className="text-sm text-zinc-400">Mission: {runTarget.missionId}</p>

            <div className="space-y-2">
              <label className="text-xs text-zinc-500">Assign to Agent</label>
              <select
                value={selectedAgent}
                onChange={(e) => setSelectedAgent(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm"
              >
                <option value="">Select agent...</option>
                {agents
                  .filter((a) => a.status === 'idle')
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.title}
                    </option>
                  ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-zinc-500">Prompt</label>
              <textarea
                value={runTarget.prompt}
                onChange={(e) => setRunTarget({ ...runTarget, prompt: e.target.value })}
                rows={4}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm resize-none focus:outline-none focus:border-zinc-500"
              />
            </div>

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setRunTarget(null); setSelectedAgent('') }}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200"
              >
                Cancel
              </button>
              <button
                onClick={startRun}
                disabled={!selectedAgent}
                className="px-4 py-2 text-sm bg-zinc-100 text-zinc-900 rounded font-semibold hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ▶ Run
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
