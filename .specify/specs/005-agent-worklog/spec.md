# Feature Specification: Agent Work Log (inspired by Entire.io)

**Feature Branch**: `005-agent-worklog`
**Created**: 2026-02-22
**Status**: Draft
**Authors**: Chairman + Claude

---

## Context

ClawCorp agents run missions, produce code, and make commits — but we lose everything in between. The Live Log streams ephemeral stdout and vanishes on refresh. Agent `memory.md` is a self-reported notepad. There's no structured record of:

- **What the agent was thinking** — full conversation transcript with the LLM
- **What files it touched** and when
- **What commits it made** and which lines were agent-written vs. from existing code
- **How long it worked**, how many tokens it burned, how many tool calls it made
- **What went wrong** — errors, retries, dead ends, escalations

This is the "dark matter" of AI development. GitHub founder Thomas Dohmke recognized this gap and built [Entire.io](https://entire.io) — a CLI that captures full AI agent sessions alongside git commits. Its thesis: **git tracks the "what" (final code), Entire tracks the "why" (the context, prompts, and reasoning that produced the code)**.

We borrow Entire's core ideas — **sessions, checkpoints, attribution** — and implement them natively inside ClawCorp, tailored for our multi-agent autonomous org.

### Why not just install Entire CLI?

1. Entire captures **one agent at a time** in a single repo. ClawCorp runs **multiple agents in parallel** across missions, each in different workspaces.
2. Entire's session data lives on a git branch. We want work logs in ClawCorp's own data layer, queryable by agent, mission, time range, and team.
3. Entire has no API yet (CLI-only, launched Feb 2026). We need programmatic access from our server.
4. We want **cross-agent visibility**: the Chairman should see all agents' work logs in one dashboard, not per-repo.

So we implement the concepts natively: **sessions**, **checkpoints**, **attribution**, **summaries** — but stored in ClawCorp's `worklogs/` directory and surfaced in the Control Panel UI.

---

## Architecture

### Core Concepts (inspired by Entire.io)

```
Session          = one agent run on one mission (start → done/error)
├── Transcript   = full conversation: every prompt sent, every response received
├── Checkpoints  = snapshots at meaningful moments (commit, file save, escalation)
├── File Changes = list of files created/modified/deleted, with diffs
├── Metrics      = tokens used, duration, tool calls, lines written
└── Summary      = AI-generated summary: intent, outcome, learnings, friction
```

### Data Flow

```
AgentRunner spawns agent
    ↓
Session created: worklogs/{agentId}/S-{timestamp}.json
    ↓
Agent works: stdout/stderr captured → transcript grows
    ↓
Agent makes commit → checkpoint recorded (sha, files, diff stats)
    ↓
Agent calls MCP tool → tool call logged (name, args, result)
    ↓
Agent finishes → session closed
    ↓
Post-session: AI summary generated, attribution calculated
    ↓
broadcast('worklog:session_complete', session)
```

### Storage

```
worklogs/
├── architect/
│   ├── S-1740200000000.json    ← one session per agent run
│   └── S-1740300000000.json
├── senior-engineer/
│   └── S-1740200000000.json
└── _index.json                 ← lightweight index for fast queries
```

Each session file:

```json
{
  "id": "S-1740200000000",
  "agentId": "senior-engineer",
  "missionId": "M-1740100000000",
  "workspace": "/path/to/project",
  "startedAt": "2026-02-22T10:00:00Z",
  "endedAt": "2026-02-22T10:03:42Z",
  "exitCode": 0,
  "status": "completed",

  "transcript": [
    { "role": "system", "content": "You are a Senior Engineer...", "ts": "..." },
    { "role": "assistant", "content": "I'll start by reading...", "ts": "..." },
    { "role": "tool_use", "name": "bash", "input": "cat src/index.ts", "ts": "..." },
    { "role": "tool_result", "content": "...", "ts": "..." }
  ],

  "checkpoints": [
    {
      "id": "cp-a1b2c3",
      "type": "commit",
      "sha": "abc1234",
      "message": "feat: add login endpoint",
      "filesChanged": 3,
      "insertions": 45,
      "deletions": 12,
      "ts": "2026-02-22T10:02:15Z"
    },
    {
      "id": "cp-d4e5f6",
      "type": "escalation",
      "question": "Should I use JWT or session cookies?",
      "ts": "2026-02-22T10:01:30Z"
    }
  ],

  "fileChanges": [
    { "path": "src/auth/login.ts", "action": "created", "lines": 45 },
    { "path": "src/routes/index.ts", "action": "modified", "insertions": 8, "deletions": 2 },
    { "path": "tests/auth.test.ts", "action": "created", "lines": 32 }
  ],

  "metrics": {
    "durationMs": 222000,
    "tokensIn": 12400,
    "tokensOut": 8200,
    "toolCalls": 23,
    "linesWritten": 85,
    "linesDeleted": 14,
    "commits": 1,
    "escalations": 1,
    "delegations": 0
  },

  "summary": {
    "intent": "Implement user login endpoint with JWT authentication",
    "outcome": "Created login route with password hashing and JWT token generation. All 3 tests passing.",
    "learnings": "bcrypt.hash needs explicit salt rounds parameter in Bun",
    "friction": "Initial attempt used session cookies, escalated to Chairman who confirmed JWT",
    "openItems": "Token refresh endpoint not yet implemented"
  },

  "attribution": {
    "agentLines": 77,
    "totalLines": 85,
    "percentage": 90.6
  }
}
```

---

## User Scenarios & Testing

### User Story 1 — View an agent's work history (Priority: P1)

As Chairman, I want to see a timeline of everything an agent has done — every mission it ran, what it produced, how long it took, how many tokens it used — so I can evaluate agent performance over time.

**Independent Test**: Click on an agent in the org chart. See a "Work Log" section with a list of past sessions sorted by date. Each session shows: mission name, duration, lines written, commit count, status.

**Acceptance Scenarios**:

1. **Given** senior-engineer has completed 3 missions, **When** I view their work log, **Then** I see 3 session entries with timestamps, durations, and outcome summaries
2. **Given** a session had errors, **When** I view it, **Then** the status shows "error" with the exit code and the friction section explains what went wrong
3. **Given** I click on a session entry, **When** expanded, **Then** I see the full summary: intent, outcome, learnings, friction, open items

---

### User Story 2 — Read the full conversation transcript (Priority: P1)

As Chairman, I want to read the exact conversation between an agent and the LLM — every prompt, every response, every tool call — to understand how the agent approached a task.

**Why this priority**: This is the "why" that git doesn't capture. Without transcripts, agent behavior is a black box.

**Independent Test**: Open a session. Click "View Transcript". See a chat-like view with system prompts, assistant responses, tool calls, and tool results in chronological order.

**Acceptance Scenarios**:

1. **Given** a completed session, **When** I open its transcript, **Then** I see messages in chronological order with role labels (system, assistant, tool_use, tool_result)
2. **Given** the agent made 3 tool calls, **When** I view the transcript, **Then** each tool call shows the tool name, input arguments, and the result returned
3. **Given** a long transcript (100+ messages), **When** I view it, **Then** it loads quickly with virtualized scrolling and I can search within it

---

### User Story 3 — See commit attribution (Priority: P1)

As Chairman, I want to know what percentage of a commit's code was written by the agent vs. existing code — so I can understand the agent's actual contribution.

**Independent Test**: View a session with commits. See attribution: "Agent wrote 77 of 85 lines (90.6%)".

**Acceptance Scenarios**:

1. **Given** an agent made a commit during a session, **When** I view the session, **Then** I see "Agent wrote X of Y lines (Z%)" attribution
2. **Given** multiple commits in a session, **When** I view checkpoints, **Then** each commit shows its own file change stats (insertions, deletions, files changed)

---

### User Story 4 — AI-generated session summary (Priority: P1)

As Chairman, I want each session to have an auto-generated summary — intent, outcome, learnings, friction, open items — so I can quickly scan what happened without reading the full transcript.

**Independent Test**: An agent completes a mission. The session file includes a `summary` field with 5 sections. The work log UI shows this summary prominently.

**Acceptance Scenarios**:

1. **Given** an agent completes a session, **When** the session closes, **Then** an AI summary is auto-generated within 10 seconds
2. **Given** the summary is generated, **When** I view the session, **Then** I see: intent (what was the goal), outcome (what was achieved), learnings (what was discovered), friction (what went wrong or was hard), openItems (what's left to do)
3. **Given** a session ended in error, **When** I read the summary, **Then** the friction section explains the failure clearly

---

### User Story 5 — Org-wide work log dashboard (Priority: P2)

As Chairman, I want to see a dashboard showing all agents' recent work across the organization — not just one agent at a time — to get an at-a-glance view of productivity.

**Acceptance Scenarios**:

1. **Given** 5 agents have worked today, **When** I open the work log tab, **Then** I see a combined timeline of all sessions sorted by time
2. **Given** I filter by team "Engineering", **When** filtered, **Then** I only see sessions from agents in the Engineering department
3. **Given** the dashboard, **When** I look at metrics, **Then** I see aggregate stats: total sessions, total tokens, total lines written, total commits

---

### User Story 6 — Session checkpoints for recovery (Priority: P3)

As Chairman, I want to rewind an agent's work to a specific checkpoint if it went wrong — restoring the repo to a known-good state.

**Acceptance Scenarios**:

1. **Given** a session has 3 checkpoints, **When** I click "rewind" on checkpoint 2, **Then** the workspace is restored to the state at that checkpoint
2. **Given** I rewind, **When** I start a new agent run, **Then** it picks up from the restored state (not the corrupted state)

---

### Edge Cases

- What if an agent is killed mid-session? → Session saved with status "killed", transcript up to that point is preserved, no summary generated (or partial summary if possible)
- What if stdout capture fails? → Session still records checkpoints (commits) and metrics from MCP tool calls. Transcript may be incomplete — mark it as `transcriptPartial: true`
- What about long-running agents (>10 min)? → Stream session data to disk incrementally, don't buffer in memory. Append to session file every 30 seconds.
- What if the workspace has no git? → Skip commit checkpoints and attribution. Still record transcript and tool calls.
- Privacy: should transcripts be auto-deleted after X days? → Configurable retention policy. Default: keep forever. P3 feature to add TTL.
- How much disk space do worklogs use? → Estimate ~50KB per session (transcript is the bulk). 100 sessions/day = 5MB/day. Negligible.

---

## Requirements

### Data Model

**Session schema** — stored as `worklogs/{agentId}/S-{timestamp}.json` (see Architecture section above for full schema).

**Index file** — `worklogs/_index.json`:
```json
{
  "sessions": [
    {
      "id": "S-1740200000000",
      "agentId": "senior-engineer",
      "missionId": "M-1740100000000",
      "status": "completed",
      "startedAt": "2026-02-22T10:00:00Z",
      "durationMs": 222000,
      "commits": 1,
      "linesWritten": 85
    }
  ]
}
```

### Server Changes

**`server/src/lib/WorkLog.ts`** (new) — session lifecycle:
- `startSession(agentId, missionId, workspace)` → creates session file, returns sessionId
- `appendTranscript(sessionId, entry)` → appends to transcript array (buffered writes)
- `addCheckpoint(sessionId, checkpoint)` → adds commit/escalation checkpoint
- `closeSession(sessionId, exitCode)` → computes metrics, triggers summary generation, calculates attribution
- `generateSummary(sessionId)` → calls Claude API to summarize the transcript
- `computeAttribution(sessionId)` → diffs pre/post commit to calculate agent vs. existing lines

**`server/src/lib/AgentRunner.ts`** (edit) — integrate work log:
- On agent start → call `startSession()`
- On stdout line → call `appendTranscript()` with role "assistant"
- On stderr line → call `appendTranscript()` with role "error"
- On agent done → call `closeSession()`
- Capture tool calls from MCP server → log as `tool_use` / `tool_result` entries

**`server/src/routes/worklogs.ts`** (new) — API endpoints:
- `GET /api/worklogs` → list all sessions (with filters: agentId, missionId, team, date range)
- `GET /api/worklogs/:agentId` → list sessions for a specific agent
- `GET /api/worklogs/:agentId/:sessionId` → full session with transcript
- `GET /api/worklogs/:agentId/:sessionId/transcript` → transcript only (for large sessions)

**`server/src/mcp/server.ts`** (edit) — track tool calls:
- On each MCP tool call → POST to a new endpoint `/api/worklogs/tool-call` to record the call in the active session
- Or: AgentRunner intercepts MCP traffic and logs it directly

### Client Changes

**`client/src/App.tsx`** (edit) — add work log UI:
- New "worklogs" tab (or sub-view within agents tab when clicking an agent)
- Session list view: timeline of sessions with status, duration, lines, commits
- Session detail view: summary card + checkpoints + expandable transcript
- Transcript viewer: chat-like UI with role-colored messages
- Metrics display: tokens, duration, tool calls, attribution percentage

### WebSocket Events

- `worklog:session_start` → `{ sessionId, agentId, missionId }`
- `worklog:session_complete` → `{ sessionId, agentId, summary, metrics }`
- `worklog:checkpoint` → `{ sessionId, checkpoint }`

### .gitignore

Add `worklogs/` to .gitignore (runtime data, not committed).

---

## Implementation Strategy

### Phase 1 — Capture (P1)
1. Create `WorkLog.ts` with session lifecycle
2. Integrate into `AgentRunner.ts` — start/append/close sessions
3. Create `worklogs.ts` route with basic GET endpoints
4. Stream stdout/stderr into transcript

### Phase 2 — Intelligence (P1)
1. Post-session summary generation via Claude API
2. Commit checkpoint recording with git diff stats
3. Attribution calculation (agent lines vs. total lines)

### Phase 3 — UI (P1)
1. Add work log views to client
2. Session list with filters
3. Session detail with summary + transcript viewer

### Phase 4 — Dashboard (P2)
1. Org-wide work log timeline
2. Aggregate metrics per agent, team, time range
3. Filter and search across all sessions

---

## Entire.io Feature Comparison

| Feature | Entire.io | ClawCorp Work Log |
|---|---|---|
| Session capture | Single agent, single repo | Multi-agent, multi-workspace |
| Transcript | Full conversation | Full conversation + tool calls |
| Checkpoints | Git commits on shadow branch | Commits + escalations + delegations |
| Attribution | Lines agent vs. human | Lines agent-written per session |
| Summary | AI-generated at commit time | AI-generated at session close |
| Storage | JSON on git branch | JSON in worklogs/ directory |
| Rewind | Git checkout of checkpoint | P3 — workspace restore |
| Multi-agent | Not supported | Native — all agents tracked |
| Dashboard | Per-repo | Org-wide with team filters |
| API | CLI only (no API yet) | REST API + WebSocket |

---

## Success Criteria

- **SC-001**: Every agent run produces a session file with transcript, metrics, and summary
- **SC-002**: Chairman can read any agent's full conversation within 2 clicks
- **SC-003**: Attribution shows exactly how many lines an agent wrote per commit
- **SC-004**: AI summaries accurately capture intent, outcome, learnings, and friction
- **SC-005**: Work log UI loads within 1 second even with 100+ sessions
- **SC-006**: Session data persists across server restarts (file-based, not in-memory)
