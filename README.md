# ClawCorp

**A local dashboard for running an autonomous AI organization.**

You are the Chairman. You create missions, assign agents, and watch them work.
Agents never ask you questions — they escalate only when genuinely blocked.

---

## Current Stack

| Layer | Tech |
|---|---|
| Server | Bun + Hono (port 3001) |
| Client | React + Vite + Tailwind v4 (port 5173) |
| Real-time | WebSocket (Bun native) |
| Agent runtime | `claude --dangerously-skip-permissions -p` |
| Agent tools | MCP (stdio, injected via `.claude/settings.json`) |
| State | File system (`agents/`, `missions/`, `archive/`) |

## Quick Start

```bash
# Terminal 1
cd server && bun run dev

# Terminal 2
cd client && bun run dev
```

Set `server/.env`:
```
ANTHROPIC_BASE_URL=https://...
ANTHROPIC_API_KEY=sk-...
```

---

## Directory Layout

```
ClawCorp/
├── agents/                   # Agent roster
│   └── {id}/
│       ├── profile.json      # Identity, driver config, hierarchy
│       └── memory.md         # Persistent memory across missions
├── missions/                 # Runtime (gitignored)
│   └── {id}/
│       ├── state.json        # Status, stage, assignee, sessions
│       ├── messages/         # Escalations and reports
│       └── artifacts/        # Files produced by agents
├── archive/                  # Fired agents (gitignored)
├── server/src/
│   ├── index.ts              # Hono app + Bun WebSocket
│   ├── lib/
│   │   ├── AgentRunner.ts    # Spawn + stream claude processes
│   │   └── hub.ts            # WebSocket broadcast hub
│   ├── mcp/server.ts         # MCP stdio server (5 tools)
│   └── routes/
│       ├── agents.ts         # GET /api/agents
│       ├── missions.ts       # CRUD /api/missions
│       ├── run.ts            # POST/DELETE /api/run
│       ├── messages.ts       # Message queue /api/messages
│       ├── delegate.ts       # POST /api/delegate
│       └── hire.ts           # POST/DELETE /api/hire
└── client/src/
    ├── App.tsx               # Full dashboard (Board / Inbox / Agents)
    └── hooks/useWebSocket.ts # Auto-reconnecting WS hook
```

---

## Agent Profile Schema

```json
{
  "id": "senior-engineer",
  "title": "Senior Software Engineer",
  "department": "Engineering",
  "description": "...",
  "driver": {
    "type": "claude-code",
    "command": "claude",
    "args": ["--dangerously-skip-permissions", "-p", "{{full_prompt}}"],
    "system_prompt": "You are Senior Software Engineer at ClawCorp.\n\nRULES:\n1. Never ask questions.\n2. Use escalate tool if blocked.\n3. Use report tool when done."
  },
  "reports_to": "product-manager",
  "subordinates": ["qa-engineer", "intern"],
  "cost_model": "high"
}
```

`{{full_prompt}}` → `{system_prompt}\n\n---\nMission ID: {id}\nTask: {title}`

## Mission State Schema

```json
{
  "id": "M-1740000000000",
  "title": "Implement auth flow",
  "type": "engineering",
  "status": "backlog | in_progress | done",
  "current_stage": "backlog | analysis | design | development | testing | done",
  "assignee": "senior-engineer | null",
  "workspace": "/path/to/project | null",
  "sessions": { "senior-engineer": "<claude-session-id>" },
  "parent_mission": "M-... | null",
  "history": [{ "at": "ISO", "event": "started | reported | updated", ... }]
}
```

## MCP Tools (available to all agents)

| Tool | Description |
|---|---|
| `escalate` | Block and ask supervisor. Polls for answer up to 10 min. |
| `delegate` | Spawn a subordinate agent on a sub-mission. |
| `report` | Mark mission done, notify supervisor. |
| `memory_read` | Read `agents/{id}/memory.md` |
| `memory_write` | Append to `agents/{id}/memory.md` |

## Agent Hierarchy

```
chairman (you)
├── principal-investigator
│   └── research-assistant
└── product-manager
    └── architect
        └── senior-engineer
            ├── qa-engineer
            └── intern
```

## Kanban Stages

`backlog → analysis → design → development → testing → done`

Engineering track: PM → Architect → Senior Engineer → QA
Research track: PI → Research Assistant → PI (review)

---

## WebSocket Events

| Event | Payload |
|---|---|
| `agent:start` | `{ agentId, missionId, workspace }` |
| `agent:output` | `{ agentId, missionId, text }` |
| `agent:error` | `{ agentId, missionId, text }` |
| `agent:done` | `{ agentId, missionId, exitCode, sessionId? }` |
| `agent:killed` | `{ agentId }` |
| `message:new` | Full message object |
| `mission:updated` | Full mission state object |
| `mission:done` | `{ missionId }` |
