import { useEffect, useState } from 'react'

type Agent = {
  id: string
  title: string
  department: string
  description: string
  status: 'idle' | 'running' | 'error'
  driver?: { type: string; command: string }
}

type Mission = {
  id: string
  title: string
  type: 'engineering' | 'research'
  status: string
  current_stage: string
  assignee: string | null
}

const STAGES = ['backlog', 'analysis', 'design', 'development', 'testing', 'done']
const STAGE_LABELS: Record<string, string> = {
  backlog: 'Backlog',
  analysis: 'Analysis (PM)',
  design: 'Design (Arch)',
  development: 'Dev',
  testing: 'QA',
  done: 'Done'
}

const DEPT_COLORS: Record<string, string> = {
  Product: 'bg-violet-500',
  Engineering: 'bg-blue-500',
  'Research Lab': 'bg-emerald-500'
}

export default function App() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [missions, setMissions] = useState<Mission[]>([])
  const [newTitle, setNewTitle] = useState('')
  const [newType, setNewType] = useState<'engineering' | 'research'>('engineering')

  useEffect(() => {
    fetch('/api/agents').then(r => r.json()).then(setAgents)
    fetch('/api/missions').then(r => r.json()).then(setMissions)
  }, [])

  async function createMission() {
    if (!newTitle.trim()) return
    const res = await fetch('/api/missions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle, type: newType })
    })
    const m = await res.json()
    setMissions(prev => [...prev, m])
    setNewTitle('')
  }

  const missionsByStage = STAGES.reduce((acc, s) => {
    acc[s] = missions.filter(m => m.current_stage === s)
    return acc
  }, {} as Record<string, Mission[]>)

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-mono">
      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">ClawCorp</h1>
          <p className="text-xs text-zinc-500">Self-Evolving AI Organization</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs text-zinc-400">Server online</span>
        </div>
      </header>

      <main className="px-6 py-6 space-y-8">

        {/* Agents Roster */}
        <section>
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-widest mb-3">
            Team — {agents.length} agents
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
            {agents.map(agent => (
              <div key={agent.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${agent.status === 'running' ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`} />
                  <span className={`text-xs px-1.5 py-0.5 rounded text-white ${DEPT_COLORS[agent.department] ?? 'bg-zinc-700'}`}>
                    {agent.department}
                  </span>
                </div>
                <p className="text-sm font-medium leading-tight">{agent.title}</p>
                <p className="text-xs text-zinc-500 leading-snug line-clamp-2">{agent.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* New Mission */}
        <section>
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-widest mb-3">New Mission</h2>
          <div className="flex gap-2">
            <input
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createMission()}
              placeholder="Mission title..."
              className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500"
            />
            <select
              value={newType}
              onChange={e => setNewType(e.target.value as 'engineering' | 'research')}
              className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm"
            >
              <option value="engineering">Engineering</option>
              <option value="research">Research</option>
            </select>
            <button
              onClick={createMission}
              className="bg-zinc-100 text-zinc-900 rounded px-4 py-2 text-sm font-medium hover:bg-white transition-colors"
            >
              + Create
            </button>
          </div>
        </section>

        {/* Kanban Board */}
        <section>
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-widest mb-3">Kanban Board</h2>
          <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
            {STAGES.map(stage => (
              <div key={stage} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 min-h-[200px]">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-zinc-400">{STAGE_LABELS[stage]}</span>
                  <span className="text-xs bg-zinc-800 text-zinc-500 rounded px-1.5">
                    {missionsByStage[stage]?.length ?? 0}
                  </span>
                </div>
                <div className="space-y-2">
                  {missionsByStage[stage]?.map(m => (
                    <div key={m.id} className="bg-zinc-800 border border-zinc-700 rounded p-2 space-y-1 cursor-pointer hover:border-zinc-500 transition-colors">
                      <p className="text-xs font-medium leading-snug">{m.title}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-500">{m.id}</span>
                        <span className={`text-xs px-1 rounded ${m.type === 'research' ? 'bg-emerald-900 text-emerald-300' : 'bg-blue-900 text-blue-300'}`}>
                          {m.type}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

      </main>
    </div>
  )
}
