import { useEffect, useRef, useState } from 'react'
import { useWebSocket } from './hooks/useWebSocket'

type Agent = {
  id: string
  title: string
  department: string
  description: string
  status: 'idle' | 'running' | 'error'
  reports_to?: string
  subordinates?: string[]
}

type Mission = {
  id: string
  title: string
  type: 'engineering' | 'research'
  status: string
  current_stage: string
  assignee: string | null
  workspace: string | null
  sessions: Record<string, string>
  parent_mission?: string
}

type Message = {
  id: string
  from: string
  to: string
  missionId: string
  type: 'escalate' | 'report'
  question: string | null
  context: string | null
  summary: string | null
  artifacts: string[] | null
  status: 'pending' | 'answered' | 'done'
  answer: string | null
  created_at: string
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
  development: 'Build',
  testing: 'QA',
  done: 'Done',
}

const STAGE_THEME: Record<string, { lane: string; badge: string; empty: string }> = {
  backlog: {
    lane: 'border-[#f0d4bf] bg-[#fff4ea]',
    badge: 'bg-[#ffd8b8] text-[#9b5824]',
    empty: 'text-[#ad7b56] border-[#efc8a6] bg-[#fff0e0]',
  },
  analysis: {
    lane: 'border-[#c9e7cd] bg-[#edfef0]',
    badge: 'bg-[#c9f0ce] text-[#2f7a41]',
    empty: 'text-[#598468] border-[#badfbe] bg-[#e9faeb]',
  },
  design: {
    lane: 'border-[#cbe7e2] bg-[#ecfbfa]',
    badge: 'bg-[#caeff0] text-[#296f73]',
    empty: 'text-[#4f8082] border-[#bfe3e1] bg-[#e9f8f8]',
  },
  development: {
    lane: 'border-[#c7e0f2] bg-[#ecf8ff]',
    badge: 'bg-[#cae8ff] text-[#2d638f]',
    empty: 'text-[#507895] border-[#bdd9ee] bg-[#e9f4fd]',
  },
  testing: {
    lane: 'border-[#ebe0b5] bg-[#fffbea]',
    badge: 'bg-[#f8ecbc] text-[#8d7122]',
    empty: 'text-[#8f7a3b] border-[#e9dcaa] bg-[#fdf8e4]',
  },
  done: {
    lane: 'border-[#c3e8c8] bg-[#edfff1]',
    badge: 'bg-[#c8f0cd] text-[#2d7940]',
    empty: 'text-[#5f8f6a] border-[#bae1c0] bg-[#eaf9ee]',
  },
}

const MESSAGE_THEME: Record<Message['type'], string> = {
  escalate: 'border-[#f0c593] bg-[#fff6ea]',
  report: 'border-[#bee0c4] bg-[#f2fcf4]',
}

const DEPT_THEME: Record<string, string> = {
  Product: 'bg-[#ffe8c8] text-[#8d5e1f]',
  Engineering: 'bg-[#d2f0d8] text-[#25683a]',
  'Research Lab': 'bg-[#cfeafd] text-[#285f84]',
}

let logId = 0

function formatMessageTime(ts: string) {
  const date = new Date(ts)
  if (Number.isNaN(date.getTime())) return ts
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function App() {
  const [tab, setTab] = useState<'board' | 'inbox' | 'agents'>('board')
  const [agents, setAgents] = useState<Agent[]>([])
  const [missions, setMissions] = useState<Mission[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [logs, setLogs] = useState<LogLine[]>([])

  const [newTitle, setNewTitle] = useState('')
  const [showQuickAdd, setShowQuickAdd] = useState(false)

  const [runTarget, setRunTarget] = useState<{
    missionId: string
    prompt: string
    workspace: string
    sessions: Record<string, string>
  } | null>(null)
  const [selectedAgent, setSelectedAgent] = useState('')
  const [resumeSession, setResumeSession] = useState(false)

  const [showHire, setShowHire] = useState(false)
  const [hireForm, setHireForm] = useState({
    id: '',
    title: '',
    department: 'Engineering',
    description: '',
    reports_to: 'chairman',
    system_prompt: '',
  })

  const [answerTarget, setAnswerTarget] = useState<Message | null>(null)
  const [answerText, setAnswerText] = useState('')

  const [dragMission, setDragMission] = useState<string | null>(null)

  const logScrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/agents')
      .then((r) => r.json())
      .then((d) => setAgents(d.map((a: Agent) => ({ ...a, status: 'idle' }))))
      .then(() =>
        fetch('/api/run')
          .then((r) => r.json())
          .then((running: string[]) => {
            if (running.length > 0)
              setAgents((p) => p.map((a) => (running.includes(a.id) ? { ...a, status: 'running' } : a)))
          })
      )
      .catch(console.error)

    fetch('/api/missions').then((r) => r.json()).then(setMissions).catch(console.error)
    fetch('/api/messages').then((r) => r.json()).then(setMessages).catch(console.error)
  }, [])

  useEffect(() => {
    if (!logScrollRef.current) return
    logScrollRef.current.scrollTop = logScrollRef.current.scrollHeight
  }, [logs])

  function appendLog(agentId: string, missionId: string, text: string, kind: LogLine['kind']) {
    setLogs((p) => [...p.slice(-500), { id: logId++, agentId, missionId, text, kind }])
  }

  useWebSocket((msg) => {
    const { event, data } = msg
    const d = data as Record<string, string>

    if (event === 'agent:start') {
      setAgents((p) => p.map((a) => (a.id === d.agentId ? { ...a, status: 'running' } : a)))
      appendLog(d.agentId, d.missionId, `> started in ${d.workspace ?? 'cwd'}`, 'system')
    }

    if (event === 'agent:output') appendLog(d.agentId, d.missionId, d.text, 'output')
    if (event === 'agent:error') appendLog(d.agentId, d.missionId, d.text, 'error')

    if (event === 'agent:done') {
      setAgents((p) => p.map((a) => (a.id === d.agentId ? { ...a, status: 'idle' } : a)))
      setMissions((p) =>
        p.map((m) => {
          if (m.id !== d.missionId) return m
          const updated = { ...m, current_stage: 'done', status: 'done' }
          if (d.sessionId) updated.sessions = { ...m.sessions, [d.agentId]: d.sessionId }
          return updated
        })
      )
      appendLog(d.agentId, d.missionId, `< done (exit ${d.exitCode})`, 'system')
    }

    if (event === 'agent:killed') {
      setAgents((p) => p.map((a) => (a.id === d.agentId ? { ...a, status: 'idle' } : a)))
      appendLog(d.agentId, '', 'x killed', 'error')
    }

    if (event === 'message:new') {
      const m = data as unknown as Message
      setMessages((p) => [...p, m])
      if (m.type === 'escalate') {
        appendLog(m.from, m.missionId, `! escalated to ${m.to}: ${m.question}`, 'system')
      } else if (m.type === 'report') {
        appendLog(m.from, m.missionId, `+ report to ${m.to}: ${m.summary}`, 'system')
      }
    }

    if (event === 'mission:done') {
      setMissions((p) => p.map((m) => (m.id === d.missionId ? { ...m, current_stage: 'done', status: 'done' } : m)))
    }

    if (event === 'mission:updated') {
      const updated = data as unknown as Mission
      setMissions((p) => p.map((m) => (m.id === updated.id ? updated : m)))
    }
  })

  async function createMission() {
    if (!newTitle.trim()) return false
    const res = await fetch('/api/missions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle, type: 'engineering', workspace: null }),
    })

    const mission = await res.json()
    setMissions((p) => [...p, mission])
    setNewTitle('')
    return true
  }

  async function startRun() {
    if (!runTarget || !selectedAgent) return
    const sessionId = resumeSession ? runTarget.sessions[selectedAgent] : undefined

    await fetch('/api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: selectedAgent,
        missionId: runTarget.missionId,
        prompt: runTarget.prompt,
        workspace: runTarget.workspace || undefined,
        resume: resumeSession && !sessionId,
        sessionId,
      }),
    })

    setMissions((p) =>
      p.map((m) =>
        m.id === runTarget.missionId ? { ...m, current_stage: 'development', assignee: selectedAgent } : m
      )
    )

    setRunTarget(null)
    setSelectedAgent('')
    setResumeSession(false)
  }

  async function hireAgent() {
    if (!hireForm.id || !hireForm.title) return
    const res = await fetch('/api/hire', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(hireForm),
    })

    const agent = await res.json()
    setAgents((p) => [...p, { ...agent, status: 'idle' }])
    setShowHire(false)
    setHireForm({
      id: '',
      title: '',
      department: 'Engineering',
      description: '',
      reports_to: 'chairman',
      system_prompt: '',
    })
  }

  async function fireAgent(id: string) {
    if (!confirm(`Fire agent "${id}"? They will be archived.`)) return
    await fetch(`/api/hire/${id}`, { method: 'DELETE' })
    setAgents((p) => p.filter((a) => a.id !== id))
  }

  async function answerMessage() {
    if (!answerTarget || !answerText.trim()) return
    await fetch(`/api/messages/${answerTarget.id}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer: answerText }),
    })

    setMessages((p) =>
      p.map((m) => (m.id === answerTarget.id ? { ...m, status: 'answered', answer: answerText } : m))
    )

    setAnswerTarget(null)
    setAnswerText('')
  }

  async function dropOnStage(stage: string) {
    if (!dragMission) return

    const dragged = missions.find((m) => m.id === dragMission)
    if (!dragged || dragged.current_stage === stage) {
      setDragMission(null)
      return
    }

    await fetch(`/api/missions/${dragMission}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_stage: stage }),
    })

    setMissions((p) => p.map((m) => (m.id === dragMission ? { ...m, current_stage: stage } : m)))
    setDragMission(null)
  }

  const missionsByStage = STAGES.reduce((acc, stage) => {
    acc[stage] = missions.filter((m) => m.current_stage === stage && !m.parent_mission)
    return acc
  }, {} as Record<string, Mission[]>)

  const pendingMessages = messages.filter((m) => m.status === 'pending')
  const runningAgents = agents.filter((a) => a.status === 'running')

  return (
    <div className="app-shell">
      <div className="shell-card">
        <header className="border-b border-[var(--line-soft)] px-4 pb-3 pt-4 lg:px-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-xl">
              <h1 className="font-display text-[1.9rem] leading-[1] text-[#1e3127]">ClawCorp Control</h1>
              <p className="mt-1 text-sm text-[var(--text-muted)]">Operate missions across the task board with minimum friction.</p>
            </div>

            <div className="flex flex-wrap gap-2 lg:justify-end">
              <span className="metric-pill">{missions.length} missions</span>
              <span className="metric-pill warm">{pendingMessages.length} pending inbox</span>
              <span className="metric-pill sky">{agents.length} active agents</span>
              <span className="metric-pill">
                {runningAgents.length} running
                {runningAgents.length > 0 && (
                  <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-[#2fb060] align-middle animate-dot" />
                )}
              </span>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {(['board', 'inbox', 'agents'] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`tab-chip ${tab === t ? 'active' : ''}`}>
                {t}
                {t === 'inbox' && pendingMessages.length > 0 ? ` (${pendingMessages.length})` : ''}
              </button>
            ))}
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
          <main className="min-h-0 flex-1 overflow-y-auto p-2 lg:p-3">
            {tab === 'board' && (
              <div className="flex min-h-full flex-col">
                <section className="panel animate-rise flex min-h-0 flex-1 flex-col p-2 lg:p-3">
                  <div className="kanban-scroll h-full min-h-0 flex-1">
                    {STAGES.map((stage, stageIndex) => {
                      const stageMissions = missionsByStage[stage] ?? []
                      const stageTheme = STAGE_THEME[stage]

                      return (
                        <div
                          key={stage}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => dropOnStage(stage)}
                          className={`lane-card panel flex h-full min-h-0 flex-col p-3 ${stageTheme.lane} ${dragMission ? 'ring-1 ring-[#74b388]/70' : ''}`}
                          style={{ animationDelay: `${stageIndex * 0.03}s` }}
                        >
                          <div className="mb-2 flex items-center justify-between">
                            <span className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.08em] ${stageTheme.badge}`}>
                              {STAGE_LABELS[stage]}
                            </span>
                            <div className="flex items-center gap-1.5">
                              {stage === 'backlog' && (
                                <button
                                  onClick={() => setShowQuickAdd((p) => !p)}
                                  className="flex h-6 w-6 items-center justify-center rounded-full border border-[#caa882] bg-[#ffe4ca] text-sm font-bold text-[#8d5920] hover:bg-[#ffd7b3]"
                                  title="Quick add mission"
                                >
                                  +
                                </button>
                              )}
                              <span className="rounded-full bg-white/80 px-2 py-0.5 text-xs font-semibold text-[#55695f]">
                                {stageMissions.length}
                              </span>
                            </div>
                          </div>

                          <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto pr-1">
                            {stage === 'backlog' && showQuickAdd && (
                              <div className="rounded-xl border border-[#efc8a6] bg-[#fff2e3] p-2">
                                <div className="flex items-center gap-2">
                                  <input
                                    value={newTitle}
                                    onChange={(e) => setNewTitle(e.target.value)}
                                    onKeyDown={async (e) => {
                                      if (e.key !== 'Enter') return
                                      const ok = await createMission()
                                      if (ok) setShowQuickAdd(false)
                                    }}
                                    placeholder="Quick add mission"
                                    className="input-base h-9 min-w-0 flex-1 bg-white"
                                  />
                                  <button
                                    onClick={async () => {
                                      const ok = await createMission()
                                      if (ok) setShowQuickAdd(false)
                                    }}
                                    disabled={!newTitle.trim()}
                                    className="btn-base btn-primary h-9 px-3 py-0 text-xs"
                                  >
                                    Add
                                  </button>
                                </div>
                              </div>
                            )}

                            {stageMissions.length === 0 && (
                              <div className={`rounded-xl border border-dashed p-3 text-xs ${stageTheme.empty}`}>
                                Drop missions here
                              </div>
                            )}

                            {stageMissions.map((m, missionIndex) => (
                              <article
                                key={m.id}
                                draggable
                                onDragStart={() => setDragMission(m.id)}
                                onDragEnd={() => setDragMission(null)}
                                className="mission-card animate-rise cursor-grab p-3 active:cursor-grabbing"
                                style={{ animationDelay: `${missionIndex * 0.02}s` }}
                              >
                                <div className={`mb-2 h-1.5 rounded-full ${m.type === 'research' ? 'bg-[#77c4f7]' : 'bg-[#5fd68e]'}`} />

                                <p className="text-sm font-bold leading-snug text-[#24342b]">{m.title}</p>

                                <div className="mt-1 flex items-center justify-between gap-2">
                                  <span className="font-mono text-[10.5px] text-[#6c8578]">{m.id}</span>
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                      m.type === 'research' ? 'bg-[#def0fd] text-[#2c668d]' : 'bg-[#dcf7e4] text-[#26673b]'
                                    }`}
                                  >
                                    {m.type}
                                  </span>
                                </div>

                                {m.workspace && (
                                  <p className="mt-1 truncate font-mono text-[11px] text-[#72897d]" title={m.workspace}>
                                    {m.workspace}
                                  </p>
                                )}

                                {m.assignee && <p className="mt-1 text-[11px] text-[#3f6f53]">Assignee: {m.assignee}</p>}

                                {Object.keys(m.sessions ?? {}).length > 0 && (
                                  <p className="mt-1 text-[11px] text-[#4f7b62]">
                                    Resume ready ({Object.keys(m.sessions).length} session
                                    {Object.keys(m.sessions).length > 1 ? 's' : ''})
                                  </p>
                                )}

                                {stage !== 'done' && (
                                  <button
                                    onClick={() =>
                                      setRunTarget({
                                        missionId: m.id,
                                        prompt: m.title,
                                        workspace: m.workspace ?? '',
                                        sessions: m.sessions ?? {},
                                      })
                                    }
                                    className="btn-base btn-secondary mt-2 w-full py-1.5 text-xs"
                                  >
                                    Run now
                                  </button>
                                )}
                              </article>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </section>
              </div>
            )}

            {tab === 'inbox' && (
              <section className="space-y-3 pt-1">
                <div className="section-label">Organization Inbox</div>

                {messages.length === 0 && (
                  <div className="panel p-5 text-sm text-[var(--text-muted)]">No messages yet. Escalations and reports will appear here.</div>
                )}

                <div className="space-y-3">
                  {messages.map((msg, idx) => (
                    <article
                      key={msg.id}
                      className={`panel animate-rise p-4 ${MESSAGE_THEME[msg.type]}`}
                      style={{ animationDelay: `${idx * 0.03}s` }}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-semibold text-[#305e42]">{msg.from}</span>
                          <span className="text-[#70897c]">to {msg.to}</span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                              msg.type === 'report' ? 'bg-[#d8f0dd] text-[#2f7044]' : 'bg-[#f7e3c8] text-[#8d5b1d]'
                            }`}
                          >
                            {msg.type}
                          </span>
                          <span className="font-mono text-[11px] text-[#6c8578]">{msg.missionId}</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10.5px] text-[#759083]">{formatMessageTime(msg.created_at)}</span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                              msg.status === 'pending' ? 'bg-[#fff2dd] text-[#97631f]' : 'bg-[#e4f5e9] text-[#3b6f49]'
                            }`}
                          >
                            {msg.status}
                          </span>
                        </div>
                      </div>

                      <p className="mt-2 text-sm text-[#2b3a31]">{msg.type === 'report' ? msg.summary : msg.question}</p>

                      {msg.context && <p className="mt-1 text-xs italic text-[#678074]">{msg.context}</p>}

                      {msg.artifacts && msg.artifacts.length > 0 && (
                        <div className="mt-2 space-y-1 rounded-lg bg-white/70 p-2 font-mono text-[11px] text-[#6b8277]">
                          {msg.artifacts.map((a, i) => (
                            <div key={i}>{a}</div>
                          ))}
                        </div>
                      )}

                      {msg.status === 'answered' && msg.answer && (
                        <p className="mt-2 rounded-lg bg-[#e9f7ed] px-2.5 py-2 text-sm text-[#376b47]">Answer: {msg.answer}</p>
                      )}

                      {msg.status === 'pending' && msg.type === 'escalate' && (
                        <button onClick={() => setAnswerTarget(msg)} className="btn-base btn-primary mt-3 py-1.5 text-xs">
                          Answer escalation
                        </button>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            )}

            {tab === 'agents' && (
              <section className="space-y-3 pt-1">
                <div className="flex items-center justify-between">
                  <div className="section-label">Team ({agents.length})</div>
                  <button onClick={() => setShowHire(true)} className="btn-base btn-primary py-1.5 text-xs">
                    + Hire Agent
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
                  {agents.map((agent, idx) => (
                    <article key={agent.id} className="panel animate-rise overflow-hidden p-0" style={{ animationDelay: `${idx * 0.02}s` }}>
                      <div className={`h-1.5 ${agent.status === 'running' ? 'bg-[#39c96f]' : 'bg-[#badac5]'}`} />
                      <div className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span
                              className={`h-2.5 w-2.5 rounded-full ${
                                agent.status === 'running' ? 'bg-[#35bf68] animate-dot' : 'bg-[#abc8b4]'
                              }`}
                            />
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                DEPT_THEME[agent.department] ?? 'bg-[#e7f2ea] text-[#446658]'
                              }`}
                            >
                              {agent.department}
                            </span>
                          </div>

                          <button onClick={() => fireAgent(agent.id)} className="text-xs font-semibold text-[#9d5d52] hover:text-[#b44136]">
                            fire
                          </button>
                        </div>

                        <p className="mt-2 text-base font-bold text-[#26372d]">{agent.title}</p>
                        <p className="mt-1 font-mono text-[11px] text-[#6f887b]">{agent.id}</p>
                        <p className="mt-1 text-xs leading-relaxed text-[#647d71]">{agent.description}</p>

                        {agent.reports_to && <p className="mt-2 text-xs text-[#527163]">reports to {agent.reports_to}</p>}

                        {agent.status === 'running' && (
                          <button
                            onClick={() => fetch(`/api/run/${agent.id}`, { method: 'DELETE' })}
                            className="btn-base btn-danger mt-3 w-full py-1.5 text-xs"
                          >
                            Kill session
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}
          </main>

          <aside className="flex min-h-[220px] flex-col border-t border-[var(--line-soft)] bg-white/60 xl:w-[260px] xl:shrink-0 xl:border-l xl:border-t-0">
            <div className="flex items-center justify-between border-b border-[var(--line-soft)] px-4 py-3">
              <div className="section-label">Live Log</div>
              <button onClick={() => setLogs([])} className="text-xs font-bold text-[#688173] hover:text-[#365945]">
                clear
              </button>
            </div>

            <div ref={logScrollRef} className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3 text-xs">
              {logs.length === 0 && <p className="mt-6 text-center text-[#738d80]">Run an agent to stream output.</p>}

              {logs.map((line) => (
                <div
                  key={line.id}
                  className={`whitespace-pre-wrap break-all font-mono leading-relaxed ${
                    line.kind === 'system' ? 'log-line-system' : line.kind === 'error' ? 'log-line-error' : 'log-line-output'
                  }`}
                >
                  {line.kind === 'system' && <span className="text-[#819b8d]">[{line.agentId}] </span>}
                  {line.text}
                </div>
              ))}

            </div>
          </aside>
        </div>
      </div>

      {runTarget && (
        <div className="modal-mask fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="panel modal-card w-full max-w-xl p-5 lg:p-6">
            <h3 className="font-display text-xl text-[#224232]">Run Mission</h3>
            <p className="mt-1 font-mono text-xs text-[#6f877b]">{runTarget.missionId}</p>

            <div className="mt-4 space-y-3">
              <label className="block text-xs font-semibold text-[#668074]">
                Workspace
                <input
                  value={runTarget.workspace}
                  onChange={(e) => setRunTarget({ ...runTarget, workspace: e.target.value })}
                  placeholder="/path/to/project"
                  className="input-base mt-1 font-mono text-sm"
                />
              </label>

              <label className="block text-xs font-semibold text-[#668074]">
                Agent
                <select
                  value={selectedAgent}
                  onChange={(e) => {
                    setSelectedAgent(e.target.value)
                    setResumeSession(false)
                  }}
                  className="select-base mt-1"
                >
                  <option value="">Select agent...</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id} disabled={a.status === 'running'}>
                      {a.title}
                      {a.status === 'running' ? ' (busy)' : ''}
                    </option>
                  ))}
                </select>
              </label>

              {selectedAgent && (
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-[#cce7d5] bg-[#f1fff4] p-2 text-xs text-[#466858]">
                  <input
                    type="checkbox"
                    checked={resumeSession}
                    onChange={(e) => setResumeSession(e.target.checked)}
                    className="accent-[#35b562]"
                  />
                  Resume session
                  {runTarget.sessions[selectedAgent]
                    ? ` (${runTarget.sessions[selectedAgent].slice(0, 8)}...)`
                    : ' (continue latest)'}
                </label>
              )}

              <label className="block text-xs font-semibold text-[#668074]">
                Prompt
                <textarea
                  value={runTarget.prompt}
                  onChange={(e) => setRunTarget({ ...runTarget, prompt: e.target.value })}
                  rows={4}
                  className="textarea-base mt-1 resize-none"
                />
              </label>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => {
                  setRunTarget(null)
                  setSelectedAgent('')
                  setResumeSession(false)
                }}
                className="btn-base btn-secondary"
              >
                Cancel
              </button>
              <button onClick={startRun} disabled={!selectedAgent} className="btn-base btn-primary">
                Run
              </button>
            </div>
          </div>
        </div>
      )}

      {showHire && (
        <div className="modal-mask fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="panel modal-card w-full max-w-xl p-5 lg:p-6">
            <h3 className="font-display text-xl text-[#224232]">Hire New Agent</h3>

            <div className="mt-4 space-y-3">
              {[
                { key: 'id', label: 'ID (slug)', placeholder: 'data-scientist' },
                { key: 'title', label: 'Title', placeholder: 'Data Scientist' },
                { key: 'description', label: 'Description', placeholder: 'Analyzes data and provides insights' },
                { key: 'reports_to', label: 'Reports To', placeholder: 'chairman' },
              ].map(({ key, label, placeholder }) => (
                <label key={key} className="block text-xs font-semibold text-[#668074]">
                  {label}
                  <input
                    value={hireForm[key as keyof typeof hireForm]}
                    onChange={(e) => setHireForm((p) => ({ ...p, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="input-base mt-1"
                  />
                </label>
              ))}

              <label className="block text-xs font-semibold text-[#668074]">
                Department
                <select
                  value={hireForm.department}
                  onChange={(e) => setHireForm((p) => ({ ...p, department: e.target.value }))}
                  className="select-base mt-1"
                >
                  <option>Engineering</option>
                  <option>Product</option>
                  <option>Research Lab</option>
                </select>
              </label>

              <label className="block text-xs font-semibold text-[#668074]">
                System Prompt (optional)
                <textarea
                  value={hireForm.system_prompt}
                  onChange={(e) => setHireForm((p) => ({ ...p, system_prompt: e.target.value }))}
                  rows={3}
                  placeholder="You are a Data Scientist. Never ask questions..."
                  className="textarea-base mt-1 resize-none"
                />
              </label>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setShowHire(false)} className="btn-base btn-secondary">
                Cancel
              </button>
              <button onClick={hireAgent} disabled={!hireForm.id || !hireForm.title} className="btn-base btn-primary">
                Hire Agent
              </button>
            </div>
          </div>
        </div>
      )}

      {answerTarget && (
        <div className="modal-mask fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="panel modal-card w-full max-w-xl p-5 lg:p-6">
            <h3 className="font-display text-xl text-[#224232]">Answer Escalation</h3>

            <div className="mt-3 rounded-xl border border-[#ebcda9] bg-[#fff6e9] p-3">
              <p className="text-xs font-semibold text-[#8e5b1f]">{answerTarget.from} asks</p>
              <p className="mt-1 text-sm text-[#2d4034]">{answerTarget.question}</p>
              {answerTarget.context && <p className="mt-2 text-xs italic text-[#658073]">{answerTarget.context}</p>}
            </div>

            <textarea
              value={answerText}
              onChange={(e) => setAnswerText(e.target.value)}
              rows={4}
              placeholder="Your answer"
              className="textarea-base mt-4 resize-none"
            />

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => {
                  setAnswerTarget(null)
                  setAnswerText('')
                }}
                className="btn-base btn-secondary"
              >
                Cancel
              </button>
              <button onClick={answerMessage} disabled={!answerText.trim()} className="btn-base btn-primary">
                Send Answer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
