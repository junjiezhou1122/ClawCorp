<p align="center">
  <img src="https://img.shields.io/badge/status-active-brightgreen" alt="Status" />
  <img src="https://img.shields.io/badge/runtime-Bun-f9f1e1?logo=bun" alt="Bun" />
  <img src="https://img.shields.io/badge/agents-Claude_Code-7c5cfc" alt="Claude Code" />
  <img src="https://img.shields.io/badge/protocol-MCP-blue" alt="MCP" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License" />
</p>

<h1 align="center">ClawCorp</h1>

<p align="center">
  <strong>An autonomous AI organization you command as Chairman.</strong><br/>
  Dispatch tasks, watch agents self-organize, delegate, and deliver — with full real-time observability.
</p>

---

## Overview

ClawCorp is a local-first control plane for orchestrating a hierarchy of AI agents that operate as a virtual company. You sit at the top as **Chairman** — create tasks on a Kanban board, hit **Dispatch**, and the system automatically routes work to the right executive, who plans, delegates to subordinates, and delivers artifacts. Every step is observable in real-time through per-task live logs, agent trees, and communication timelines.

### Key Capabilities

- **Auto-Dispatch** — One-click task routing via LLM-powered executive selection
- **Hierarchical Delegation** — Executives plan and delegate; ICs implement. Enforced mechanically, not just by prompt.
- **Real-Time Observability** — Per-task detail overlay with filtered live logs, agent tree with status dots, artifacts panel, and communication history
- **Smart Hire** — Describe the role you need; the system generates candidates, interviews them in parallel, scores, and hires the best
- **Persistent Memory** — Each agent maintains a `memory.md` that persists across missions
- **Inter-Agent Communication** — Channels, DMs, threaded replies, cross-team delegation
- **File-Based State** — No database. Everything is human-readable JSON on disk.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Chairman (You)                            │
│                   Browser Dashboard                         │
└──────────────┬──────────────────────────────┬───────────────┘
               │  HTTP + WebSocket            │
┌──────────────▼──────────────────────────────▼───────────────┐
│                    Hono Server (Bun)                         │
│  ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌────────────────┐  │
│  │ Routes  │ │ WS Hub   │ │ Agent    │ │ Auto-Dispatch  │  │
│  │ REST API│ │ Broadcast│ │ Runner   │ │ LLM Router     │  │
│  └─────────┘ └──────────┘ └────┬─────┘ └────────────────┘  │
└────────────────────────────────┼────────────────────────────┘
                                 │  Spawn claude CLI processes
               ┌─────────────────┼─────────────────┐
               ▼                 ▼                  ▼
        ┌─────────────┐  ┌─────────────┐  ┌──────────────┐
        │ Executive    │  │ Director    │  │ IC Agent     │
        │ (e.g. PM)   │  │ (Architect) │  │ (Sr. Eng)    │
        │              │  │             │  │              │
        │ MCP: delegate│  │ MCP: delegate│ │ MCP: report  │
        │       report │  │       report │ │    escalate  │
        └─────────────┘  └─────────────┘  └──────────────┘
               │                 │
               └── Shared Workspace (missions/<id>/artifacts/) ──┘
```

### Tech Stack

| Layer | Technology |
|---|---|
| Runtime | [Bun](https://bun.sh) |
| Server | [Hono](https://hono.dev) + Bun native WebSocket |
| Client | React 19 + Vite + Tailwind CSS v4 |
| Agent Runtime | `claude --dangerously-skip-permissions` (Claude Code CLI) |
| Agent Tools | [Model Context Protocol](https://modelcontextprotocol.io) (MCP, stdio transport) |
| State | File system — JSON + Markdown, no database |

---

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) v1.0+
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed globally
- Anthropic API key

### Setup

```bash
git clone https://github.com/your-org/ClawCorp.git
cd ClawCorp

# Install dependencies
cd server && bun install && cd ..
cd client && bun install && cd ..
```

### Configuration

Create `server/.env`:

```env
ANTHROPIC_API_KEY=sk-ant-...
# Optional: custom base URL
# ANTHROPIC_BASE_URL=https://...
```

### Run

```bash
# Terminal 1 — Server (port 3001)
cd server && bun run dev

# Terminal 2 — Client (port 5173)
cd client && bun run dev
```

Open [http://localhost:5173](http://localhost:5173). You're the Chairman now.

---

## How It Works

### Task Lifecycle

```
Create Task → Dispatch → Route to Executive → Plan & Delegate → ICs Implement → Report → Review
```

1. **Create** a task on the Kanban board (Backlog → Todo → In Progress → Review → Done)
2. **Dispatch** with one click — the Auto-Dispatch engine uses an LLM to pick the right executive
3. The **executive** receives the task, writes a brief plan, and delegates implementation to subordinates via MCP tools
4. **Subordinates** execute in isolated workspaces, producing artifacts and reporting back
5. Click any task card to open the **Detail View** — see the full agent tree, filtered live log, artifacts, and communications
6. **Review** the output and either advance to Done or Push Back with feedback

### Delegation Enforcement

Executives are mechanically prevented from implementing work themselves:

| Layer | Mechanism |
|---|---|
| Prompt | Explicit delegation instructions with subordinate list |
| `CLAUDE.md` | Injected into workspace — role-based rules Claude Code reads automatically |
| MCP Tool Gate | `report` tool rejects if `delegate` was never called (for executives/directors) |

### Mission Directory Structure

```
missions/
  M-1771835083864/              # Root mission (created by Dispatch)
    state.json                  # Mission metadata, status, assignee
    messages/                   # Escalations, reports
    artifacts/                  # Shared workspace — all deliverables land here
      CLAUDE.md                 # Auto-injected role rules
      PRD.md                    # Executive's plan
      architecture.md           # Director's design
      index.html                # IC's implementation
    architect/                  # Sub-mission (nested, not flat)
      state.json
      messages/
    senior-engineer/
      state.json
      messages/
```

---

## Agent Hierarchy

```
Chairman (You)
├── principal-investigator          executive · Research
│   └── research-assistant          member · Research Lab
└── product-manager                 executive · Product
    └── architect                   director · Engineering
        └── senior-engineer         senior · Engineering
            ├── qa-engineer         member · Engineering
            └── intern              intern · Engineering
```

Agents are defined in `agents/{id}/profile.json`. Each profile specifies:

- **Identity** — title, department, rank, description
- **Driver** — CLI command, args, system prompt
- **Hierarchy** — `reports_to`, `subordinates`
- **Memory** — persistent `memory.md` across missions

---

## MCP Tools

Every agent has access to these tools via the ClawCorp MCP server:

| Tool | Description | Access |
|---|---|---|
| `delegate` | Assign a sub-task to a subordinate agent | All with subordinates |
| `report` | Report completion to supervisor | All (gated for executives) |
| `escalate` | Ask supervisor when blocked (polls up to 10 min) | All |
| `memory_read` | Read persistent memory | All |
| `memory_write` | Write to persistent memory | All |
| `send_message` | Send to `#channel` or `@agent` | All |
| `read_messages` | Read channel or unread mentions | All |
| `cross_team_delegate` | Delegate across departments with context | Directors+ only |

---

## WebSocket Events

Real-time events broadcast to all connected clients:

| Event | Payload |
|---|---|
| `agent:start` | `{ agentId, missionId, workspace }` |
| `agent:output` | `{ agentId, missionId, text }` |
| `agent:error` | `{ agentId, missionId, text }` |
| `agent:done` | `{ agentId, missionId, exitCode, sessionId? }` |
| `agent:killed` | `{ agentId }` |
| `mission:updated` | Full mission state |
| `task:created` / `task:updated` / `task:deleted` | Task state |
| `message:new` | Escalation or report |
| `dispatch:start` / `dispatch:routed` / `dispatch:spawning` | Routing progress |
| `hire:start` / `hire:candidates` / `hire:complete` | Smart Hire progress |
| `chat:message` / `chat:channel_created` | Inter-agent chat |

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/agents` | List all agents |
| `GET` | `/api/tasks` | List all tasks |
| `POST` | `/api/tasks` | Create task |
| `PATCH` | `/api/tasks/:id` | Update task status / push back |
| `DELETE` | `/api/tasks/:id` | Delete task |
| `POST` | `/api/tasks/:id/dispatch` | Auto-dispatch task to executive |
| `GET` | `/api/tasks/:id/detail` | Full task detail (missions, agents, artifacts, messages) |
| `GET` | `/api/missions` | List root missions |
| `POST` | `/api/missions` | Create mission |
| `PATCH` | `/api/missions/:id` | Update mission stage |
| `POST` | `/api/delegate` | Delegate sub-task to subordinate |
| `GET/POST` | `/api/messages` | Message queue (escalations, reports) |
| `POST` | `/api/hire/smart` | Start Smart Hire pipeline |
| `GET` | `/api/channels` | List chat channels |
| `GET` | `/api/channels/:id/messages` | Read channel messages |
| `POST` | `/api/channels/send` | Send chat message |
| `GET/POST/DELETE` | `/api/run` | Agent process management |
| `GET/POST/DELETE` | `/api/teams` | Team management |

---

## Project Structure

```
ClawCorp/
├── agents/                       # Agent roster (version controlled)
│   └── {id}/
│       ├── profile.json          # Identity, driver, hierarchy, rank
│       └── memory.md             # Persistent cross-mission memory
├── missions/                     # Runtime state (gitignored)
│   └── {id}/
│       ├── state.json
│       ├── messages/
│       ├── artifacts/            # Shared deliverables workspace
│       └── {sub-agent}/          # Nested sub-mission state
├── tasks/                        # Task board state
│   └── {id}/state.json
├── teams/                        # Team definitions
├── channels/                     # Chat channel state
├── server/
│   └── src/
│       ├── index.ts              # Hono app + WebSocket upgrade
│       ├── lib/
│       │   ├── AgentRunner.ts    # Spawn, stream, manage Claude processes
│       │   ├── AutoDispatch.ts   # LLM-powered task routing engine
│       │   └── hub.ts            # WebSocket broadcast hub
│       ├── mcp/server.ts         # MCP stdio server (8 tools)
│       └── routes/               # REST API routes
└── client/
    └── src/
        ├── App.tsx               # Dashboard (Tasks / Inbox / Agents / Chat)
        └── hooks/useWebSocket.ts # Auto-reconnecting WebSocket hook
```

---

## License

MIT
