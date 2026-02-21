import { useEffect, useState, useRef } from 'react'
import { useWebSocket } from './hooks/useWebSocket'

// ─── Types ───────────────────────────────────────────────────────────────────

type Agent = {
  id: string; title: string; department: string
  description: string; status: 'idle' | 'running' | 'error'
  reports_to?: string; subordinates?: string[]
}

type Mission = {
  id: string; title: string; type: 'engineering' | 'research'
  status: string; current_stage: string; assignee: string | null
  workspace: string | null; sessions: Record<string, string>
  parent_mission?: string
}

type Message = {
  id: string; from: string; to: string; missionId: string
  type: 'escalate' | 'report'; question: string | null
  context: string | null; summary: string | null
  status: 'pending' | 'answered' | 'done'
  answer: string | null; created_at: string
}

type LogLine = {
  id: number; agentId: string; missionId: string
  text: string; kind: 'output' | 'error' | 'system'
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STAGES = ['backlog', 'analysis', 'design', 'development', 'testing', 'done']
const STAGE_LABELS: Record<string, string> = {
  backlog: 'Backlog', analysis: 'Analysis', design: 'Design',
  development: 'Dev', testing: 'QA', done: 'Done',
}
const DEPT_COLOR: Record<string, string> = {
  Product: 'bg-violet-600', Engineering: 'bg-blue-600', 'Research Lab': 'bg-emerald-600',
}

let logId = 0

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [tab, setTab] = useState<'board' | 'inbox' | 'agents'>('board')
  const [agents, setAgents] = useState<Agent[]>([])
  const [missions, setMissions] = useState<Mission[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [logs, setLogs] = useState<LogLine[]>([])

  // New mission
  const [newTitle, setNewTitle] = useState('')
  const [newType, setNewType] = useState<'engineering' | 'research'>('engineering')
  const [newWorkspace, setNewWorkspace] = useState('')

  // Run modal
  const [runTarget, setRunTarget] = useState<{ missionId: string; prompt: string; workspace: string; sessions: Record<string, string> } | null>(null)
  const [selectedAgent, setSelectedAgent] = useState('')
  const [resumeSession, setResumeSession] = useState(false)

  // Hire modal
  const [showHire, setShowHire] = useState(false)
  const [hireForm, setHireForm] = useState({ id: '', title: '', department: 'Engineering', description: '', reports_to: 'chairman', system_prompt: '' })

  // Inbox answer
  const [answerTarget, setAnswerTarget] = useState<Message | null>(null)
  const [answerText, setAnswerText] = useState('')

  // Drag-and-drop
  const [dragMission, setDragMission] = useState<string | null>(null)

  const logsEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/agents').then(r => r.json())
      .then(d => setAgents(d.map((a: Agent) => ({ ...a, status: 'idle' }))))
      .catch(console.error)
    fetch('/api/missions').then(r => r.json()).then(setMissions).catch(console.error)
    fetch('/api/messages?to=chairman').then(r => r.json()).then(setMessages).catch(console.error)
  }, [])

  useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [logs])

  function appendLog(agentId: string, missionId: string, text: string, kind: LogLine['kind']) {
    setLogs(p => [...p.slice(-500), { id: logId++, agentId, missionId, text, kind }])
  }

  useWebSocket((msg) => {
    const { event, data } = msg
    const d = data as Record<string, string>

    if (event === 'agent:start') {
      setAgents(p => p.map(a => a.id === d.agentId ? { ...a, status: 'running' } : a))
      appendLog(d.agentId, d.missionId, `▶ started in ${d.workspace ?? 'cwd'}`, 'system')
    }
    if (event === 'agent:output') appendLog(d.agentId, d.missionId, d.text, 'output')
    if (event === 'agent:error')  appendLog(d.agentId, d.missionId, d.text, 'error')
    if (event === 'agent:done') {
      setAgents(p => p.map(a => a.id === d.agentId ? { ...a, status: 'idle' } : a))
      setMissions(p => p.map(m => {
        if (m.id !== d.missionId) return m
        const u = { ...m, current_stage: 'done', status: 'done' }
        if (d.sessionId) u.sessions = { ...m.sessions, [d.agentId]: d.sessionId }
        return u
      }))
      appendLog(d.agentId, d.missionId, `■ done (exit ${d.exitCode})`, 'system')
    }
    if (event === 'agent:killed') {
      setAgents(p => p.map(a => a.id === d.agentId ? { ...a, status: 'idle' } : a))
      appendLog(d.agentId, '', '✕ killed', 'error')
    }
    if (event === 'message:new') {
      const m = data as unknown as Message
      if (m.to === 'chairman' && m.type === 'escalate') {
        setMessages(p => [...p, m])
        appendLog(m.from, m.missionId, `⚠ escalated: ${m.question}`, 'system')
      }
    }
    if (event === 'mission:done') {
      setMissions(p => p.map(m => m.id === d.missionId ? { ...m, current_stage: 'done', status: 'done' } : m))
    }
    if (event === 'mission:updated') {
      const updated = data as unknown as Mission
      setMissions(p => p.map(m => m.id === updated.id ? updated : m))
    }
  })

  async function createMission() {
    if (!newTitle.trim()) return
    const res = await fetch('/api/missions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle, type: newType, workspace: newWorkspace || null }),
    })
    const m = await res.json()
    setMissions(p => [...p, m])
    setNewTitle(''); setNewWorkspace('')
  }

  async function startRun() {
    if (!runTarget || !selectedAgent) return
    const sessionId = resumeSession ? runTarget.sessions[selectedAgent] : undefined
    await fetch('/api/run', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: selectedAgent, missionId: runTarget.missionId,
        prompt: runTarget.prompt, workspace: runTarget.workspace || undefined,
        resume: resumeSession && !sessionId, sessionId,
      }),
    })
    setMissions(p => p.map(m => m.id === runTarget.missionId
      ? { ...m, current_stage: 'development', assignee: selectedAgent } : m))
    setRunTarget(null); setSelectedAgent(''); setResumeSession(false)
  }

  async function hireAgent() {
    if (!hireForm.id || !hireForm.title) return
    const res = await fetch('/api/hire', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(hireForm),
    })
    const agent = await res.json()
    setAgents(p => [...p, { ...agent, status: 'idle' }])
    setShowHire(false)
    setHireForm({ id: '', title: '', department: 'Engineering', description: '', reports_to: 'chairman', system_prompt: '' })
  }

  async function fireAgent(id: string) {
    if (!confirm(`Fire agent "${id}"? They will be archived.`)) return
    await fetch(`/api/hire/${id}`, { method: 'DELETE' })
    setAgents(p => p.filter(a => a.id !== id))
  }

  async function answerMessage() {
    if (!answerTarget || !answerText.trim()) return
    await fetch(`/api/messages/${answerTarget.id}/answer`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer: answerText }),
    })
    setMessages(p => p.map(m => m.id === answerTarget.id ? { ...m, status: 'answered', answer: answerText } : m))
    setAnswerTarget(null); setAnswerText('')
  }

  async function dropOnStage(stage: string) {
    if (!dragMission || dragMission === stage) return
    await fetch(`/api/missions/${dragMission}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_stage: stage }),
    })
    setMissions(p => p.map(m => m.id === dragMission ? { ...m, current_stage: stage } : m))
    setDragMission(null)
  }

  const missionsByStage = STAGES.reduce((acc, s) => {
    acc[s] = missions.filter(m => m.current_stage === s && !m.parent_mission)
    return acc
  }, {} as Record<string, Mission[]>)

  const pendingMessages = messages.filter(m => m.status === 'pending')
  const runningAgents = agents.filter(a => a.status === 'running')

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-mono flex flex-col">

      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-3 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-lg font-bold tracking-tight">ClawCorp</h1>
          <p className="text-xs text-zinc-500">Self-Evolving AI Organization</p>
        </div>
        <div className="flex items-center gap-4">
          {runningAgents.length > 0 && (
            <span className="text-xs text-emerald-400 animate-pulse">
              {runningAgents.length} running
            </span>
          )}
          {pendingMessages.length > 0 && (
            <span className="text-xs bg-amber-500 text-black font-bold px-2 py-0.5 rounded-full">
              {pendingMessages.length} inbox
            </span>
          )}
          <nav className="flex gap-1">
            {(['board', 'inbox', 'agents'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-3 py-1 rounded text-xs font-medium capitalize transition-colors ${tab === t ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
                {t}{t === 'inbox' && pendingMessages.length > 0 ? ` (${pendingMessages.length})` : ''}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* ── BOARD TAB ── */}
          {tab === 'board' && (<>
            {/* New mission */}
            <section>
              <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3">New Mission</h2>
              <div className="flex gap-2 flex-wrap">
                <input value={newTitle} onChange={e => setNewTitle(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && createMission()}
                  placeholder="Mission title..."
                  className="flex-1 min-w-40 bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-400" />
                <input value={newWorkspace} onChange={e => setNewWorkspace(e.target.value)}
                  placeholder="Workspace path (optional)"
                  className="flex-1 min-w-52 bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm font-mono text-zinc-400 focus:outline-none focus:border-zinc-400" />
                <select value={newType} onChange={e => setNewType(e.target.value as 'engineering' | 'research')}
                  className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm">
                  <option value="engineering">Engineering</option>
                  <option value="research">Research</option>
                </select>
                <button onClick={createMission}
                  className="bg-zinc-100 text-zinc-900 rounded px-4 py-2 text-sm font-semibold hover:bg-white transition-colors">
                  + Create
                </button>
              </div>
            </section>

            {/* Kanban */}
            <section>
              <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3">Board</h2>
              <div className="grid grid-cols-3 lg:grid-cols-6 gap-2">
                {STAGES.map(stage => (
                  <div key={stage}
                    onDragOver={e => e.preventDefault()}
                    onDrop={() => dropOnStage(stage)}
                    className={`bg-zinc-900 border rounded-lg p-3 min-h-[160px] transition-colors ${dragMission ? 'border-zinc-600' : 'border-zinc-800'}`}>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-semibold text-zinc-400">{STAGE_LABELS[stage]}</span>
                      <span className="text-xs bg-zinc-800 text-zinc-500 rounded px-1">
                        {missionsByStage[stage]?.length ?? 0}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {missionsByStage[stage]?.map(m => (
                        <div key={m.id} draggable
                          onDragStart={() => setDragMission(m.id)}
                          onDragEnd={() => setDragMission(null)}
                          className="bg-zinc-800 border border-zinc-700 rounded p-2 space-y-1.5 cursor-grab active:cursor-grabbing">
                          <p className="text-xs font-medium leading-snug">{m.title}</p>
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs text-zinc-500">{m.id}</span>
                            <span className={`text-xs px-1 rounded ${m.type === 'research' ? 'bg-emerald-900 text-emerald-300' : 'bg-blue-900 text-blue-300'}`}>
                              {m.type}
                            </span>
                          </div>
                          {m.workspace && (
                            <p className="text-xs text-zinc-600 font-mono truncate" title={m.workspace}>
                              📁 {m.workspace}
                            </p>
                          )}
                          {m.assignee && <p className="text-xs text-zinc-500">→ {m.assignee}</p>}
                          {Object.keys(m.sessions ?? {}).length > 0 && (
                            <p className="text-xs text-violet-400">
                              ↩ {Object.keys(m.sessions).length} session{Object.keys(m.sessions).length > 1 ? 's' : ''}
                            </p>
                          )}
                          {stage !== 'done' && (
                            <button onClick={() => setRunTarget({ missionId: m.id, prompt: m.title, workspace: m.workspace ?? '', sessions: m.sessions ?? {} })}
                              className="w-full text-xs bg-zinc-700 hover:bg-zinc-600 rounded px-2 py-1 transition-colors">
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
          </>)}

          {/* ── INBOX TAB ── */}
          {tab === 'inbox' && (
            <section>
              <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-4">Chairman Inbox</h2>
              {messages.length === 0 && (
                <p className="text-zinc-600 text-sm">No messages. Agents are working autonomously.</p>
              )}
              <div className="space-y-3">
                {messages.map(msg => (
                  <div key={msg.id} className={`border rounded-lg p-4 space-y-2 ${msg.status === 'pending' ? 'border-amber-700 bg-amber-950/20' : 'border-zinc-800 bg-zinc-900'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-amber-400">{msg.from}</span>
                        <span className="text-xs text-zinc-500">→ escalate</span>
                        <span className="text-xs text-zinc-600">{msg.missionId}</span>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${msg.status === 'pending' ? 'bg-amber-800 text-amber-200' : 'bg-zinc-700 text-zinc-400'}`}>
                        {msg.status}
                      </span>
                    </div>
                    <p className="text-sm text-zinc-200">{msg.question}</p>
                    {msg.context && <p className="text-xs text-zinc-500 italic">{msg.context}</p>}
                    {msg.status === 'answered' && (
                      <p className="text-sm text-emerald-400">✓ {msg.answer}</p>
                    )}
                    {msg.status === 'pending' && (
                      <button onClick={() => setAnswerTarget(msg)}
                        className="text-xs bg-amber-600 hover:bg-amber-500 text-white rounded px-3 py-1.5 transition-colors">
                        Answer
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── AGENTS TAB ── */}
          {tab === 'agents' && (
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">
                  Team ({agents.length})
                </h2>
                <button onClick={() => setShowHire(true)}
                  className="text-xs bg-emerald-700 hover:bg-emerald-600 text-white rounded px-3 py-1.5 transition-colors">
                  + Hire Agent
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {agents.map(agent => (
                  <div key={agent.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${agent.status === 'running' ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`} />
                        <span className={`text-xs text-white px-1.5 py-0.5 rounded ${DEPT_COLOR[agent.department] ?? 'bg-zinc-700'}`}>
                          {agent.department}
                        </span>
                      </div>
                      <button onClick={() => fireAgent(agent.id)}
                        className="text-xs text-zinc-600 hover:text-red-400 transition-colors">
                        fire
                      </button>
                    </div>
                    <p className="text-sm font-semibold">{agent.title}</p>
                    <p className="text-xs text-zinc-500">{agent.id}</p>
                    <p className="text-xs text-zinc-500 leading-snug">{agent.description}</p>
                    {agent.reports_to && (
                      <p className="text-xs text-zinc-600">reports to: {agent.reports_to}</p>
                    )}
                    {agent.status === 'running' && (
                      <button onClick={() => fetch(`/api/run/${agent.id}`, { method: 'DELETE' })}
                        className="w-full text-xs bg-red-900 hover:bg-red-800 text-red-300 rounded px-2 py-1 transition-colors">
                        ✕ Kill
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Live Log */}
        <div className="w-96 border-l border-zinc-800 flex flex-col shrink-0">
          <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Live Log</h2>
            <button onClick={() => setLogs([])} className="text-xs text-zinc-600 hover:text-zinc-400">clear</button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-0.5 text-xs">
            {logs.length === 0 && <p className="text-zinc-600 text-center mt-8">Run an agent to see output...</p>}
            {logs.map(line => (
              <div key={line.id} className={`leading-relaxed whitespace-pre-wrap break-all ${line.kind === 'system' ? 'text-zinc-500' : line.kind === 'error' ? 'text-red-400' : 'text-zinc-200'}`}>
                {line.kind === 'system' && <span className="text-zinc-600">[{line.agentId}] </span>}
                {line.text}
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        </div>
      </div>

      {/* ── Run Modal ── */}
      {runTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-full max-w-md space-y-4">
            <h3 className="font-semibold">Run Mission</h3>
            <p className="text-sm text-zinc-400">{runTarget.missionId}</p>
            <div className="space-y-1.5">
              <label className="text-xs text-zinc-500">Workspace (cwd)</label>
              <input value={runTarget.workspace} onChange={e => setRunTarget({ ...runTarget, workspace: e.target.value })}
                placeholder="/path/to/project"
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm font-mono text-zinc-300 focus:outline-none focus:border-zinc-500" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-zinc-500">Agent</label>
              <select value={selectedAgent} onChange={e => { setSelectedAgent(e.target.value); setResumeSession(false) }}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm">
                <option value="">Select agent...</option>
                {agents.map(a => (
                  <option key={a.id} value={a.id} disabled={a.status === 'running'}>
                    {a.title}{a.status === 'running' ? ' (busy)' : ''}
                  </option>
                ))}
              </select>
            </div>
            {selectedAgent && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={resumeSession} onChange={e => setResumeSession(e.target.checked)} className="accent-violet-500" />
                <span className="text-xs text-zinc-400">
                  Resume session{runTarget.sessions[selectedAgent] ? ` · ${runTarget.sessions[selectedAgent].slice(0, 8)}…` : ' (continue last)'}
                </span>
              </label>
            )}
            <div className="space-y-1.5">
              <label className="text-xs text-zinc-500">Prompt</label>
              <textarea value={runTarget.prompt} onChange={e => setRunTarget({ ...runTarget, prompt: e.target.value })}
                rows={4} className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm resize-none focus:outline-none focus:border-zinc-500" />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setRunTarget(null); setSelectedAgent(''); setResumeSession(false) }}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200">Cancel</button>
              <button onClick={startRun} disabled={!selectedAgent}
                className="px-4 py-2 text-sm bg-zinc-100 text-zinc-900 rounded font-semibold hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed">
                ▶ Run
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Hire Modal ── */}
      {showHire && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-full max-w-md space-y-3">
            <h3 className="font-semibold">Hire New Agent</h3>
            {[
              { key: 'id', label: 'ID (slug)', placeholder: 'data-scientist' },
              { key: 'title', label: 'Title', placeholder: 'Data Scientist' },
              { key: 'description', label: 'Description', placeholder: 'Analyzes data...' },
              { key: 'reports_to', label: 'Reports To', placeholder: 'chairman' },
            ].map(({ key, label, placeholder }) => (
              <div key={key} className="space-y-1">
                <label className="text-xs text-zinc-500">{label}</label>
                <input value={hireForm[key as keyof typeof hireForm]}
                  onChange={e => setHireForm(p => ({ ...p, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500" />
              </div>
            ))}
            <div className="space-y-1">
              <label className="text-xs text-zinc-500">Department</label>
              <select value={hireForm.department} onChange={e => setHireForm(p => ({ ...p, department: e.target.value }))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm">
                <option>Engineering</option>
                <option>Product</option>
                <option>Research Lab</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-zinc-500">System Prompt (optional — auto-generated if empty)</label>
              <textarea value={hireForm.system_prompt} onChange={e => setHireForm(p => ({ ...p, system_prompt: e.target.value }))}
                rows={3} placeholder="You are a Data Scientist. Never ask questions..."
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm resize-none focus:outline-none focus:border-zinc-500" />
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <button onClick={() => setShowHire(false)} className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200">Cancel</button>
              <button onClick={hireAgent} disabled={!hireForm.id || !hireForm.title}
                className="px-4 py-2 text-sm bg-emerald-600 text-white rounded font-semibold hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed">
                Hire
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Answer Modal ── */}
      {answerTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-full max-w-md space-y-4">
            <h3 className="font-semibold">Answer Escalation</h3>
            <div className="bg-zinc-800 rounded p-3 space-y-1">
              <p className="text-xs text-amber-400 font-bold">{answerTarget.from} asks:</p>
              <p className="text-sm text-zinc-200">{answerTarget.question}</p>
              {answerTarget.context && <p className="text-xs text-zinc-500 italic mt-1">{answerTarget.context}</p>}
            </div>
            <textarea value={answerText} onChange={e => setAnswerText(e.target.value)}
              rows={4} placeholder="Your answer..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm resize-none focus:outline-none focus:border-zinc-500" />
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setAnswerTarget(null); setAnswerText('') }}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200">Cancel</button>
              <button onClick={answerMessage} disabled={!answerText.trim()}
                className="px-4 py-2 text-sm bg-amber-600 text-white rounded font-semibold hover:bg-amber-500 disabled:opacity-40">
                Send Answer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
