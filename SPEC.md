# ClawCorp — Product Spec

**Status:** Living document. Updated before each feature is built.

---

## Principles

1. **Chairman is passive.** You create missions and answer escalations. Everything else is autonomous.
2. **Agents never ask. They decide.** If truly blocked, they escalate up the hierarchy — not to you directly (unless they report to you).
3. **File system is the database.** All state is readable JSON + Markdown. No external DB.
4. **Observability first.** Every agent action is visible in the live log.
5. **Spec before code.** Each feature below must be fully specced before implementation begins.

---

## Feature Areas

### A. Mission Lifecycle (核心流程)

#### A1. Auto-Stage Advancement
**Status:** Not built

When an agent calls `report`, the mission should automatically advance to the next Kanban stage and trigger the next agent in the workflow.

**Spec:**
- Engineering track: `analysis → design → development → testing → done`
- When `report` arrives at stage N, server creates a new run for stage N+1 with the next agent
- Each stage has a default agent mapping (configurable per mission type)
- Stage agent map:
  ```
  analysis   → product-manager
  design     → architect
  development → senior-engineer
  testing    → qa-engineer
  ```
- If mission has no `workflow: auto`, stage advancement is manual (current behavior)
- Add `workflow: "manual" | "auto"` field to mission state

**Open questions:**
- What is the handoff prompt from stage to stage? The report summary becomes the next stage's input?
- What if QA fails? Should it loop back to development?

---

#### A2. Mission Templates
**Status:** Not built

Pre-defined mission types that pre-set workflow, agents, and prompt templates.

**Spec:**
- Store templates in `templates/` directory as JSON files
- Template schema:
  ```json
  {
    "id": "feature-request",
    "name": "Feature Request",
    "type": "engineering",
    "workflow": "auto",
    "stages": [
      { "stage": "analysis", "agent": "product-manager", "prompt_template": "Write a PRD for: {{title}}" },
      { "stage": "design", "agent": "architect", "prompt_template": "Design the architecture for: {{prd}}" },
      { "stage": "development", "agent": "senior-engineer", "prompt_template": "Implement: {{design}}" },
      { "stage": "testing", "agent": "qa-engineer", "prompt_template": "Test: {{implementation}}" }
    ]
  }
  ```
- Each stage receives the previous stage's report summary as context
- UI: template picker in "New Mission" form

---

### B. Agent Communication (智能协作)

#### B1. Supervisor Notification on Report
**Status:** Partial — report is saved but supervisor isn't auto-notified

When an agent reports to supervisor X, and X is idle, X should be automatically triggered to review the report.

**Spec:**
- When `POST /api/messages` with `type: "report"` is received:
  - Look up the `to` agent's profile
  - If `to` agent is in the hierarchy AND the mission has a next stage: trigger auto-stage (see A1)
  - If `to` is `chairman`: do nothing (human reviews in Inbox)
- For now: only auto-trigger if the mission has `workflow: "auto"`

---

#### B2. Parallel Delegation
**Status:** Not built — delegate creates sub-mission but doesn't track completion

When an agent delegates to multiple subordinates, it should wait for all to complete before proceeding.

**Spec:**
- `delegate` tool returns immediately with a sub-mission ID
- Agent can call `wait_for_missions` tool with a list of IDs (new tool needed)
- `wait_for_missions` polls until all listed sub-missions are `done`
- Timeout: 30 minutes, then returns partial results

**New MCP tool:**
```
wait_for_missions(mission_ids: string[]) → { completed: string[], failed: string[], summaries: Record<string, string> }
```

---

### C. Dashboard UI (控制台)

#### C1. Artifact Viewer
**Status:** Not built — artifacts are listed in Inbox but can't be read

Display agent-produced files directly in the dashboard.

**Spec:**
- In Inbox, each report card with `artifacts` shows a file list
- Clicking a file path opens a modal with the file content rendered:
  - `.md` → rendered Markdown
  - `.py`, `.ts`, `.json` → syntax-highlighted code
  - `.txt` → plain text
- Route: `GET /api/missions/:id/artifacts/:filename`
- Size limit: 500KB, warn if larger

---

#### C2. Org Chart View
**Status:** Not built — hierarchy only shown as text in agent cards

Visual org chart of the agent hierarchy.

**Spec:**
- New tab: "Org" (alongside Board / Inbox / Agents)
- Tree layout: chairman at top, branches down
- Each node shows: agent name, department color, running/idle status dot
- Clicking a node opens the agent's profile details and recent messages
- Render using CSS flexbox tree (no external library)

---

#### C3. Mission Timeline
**Status:** Not built

Show the history of events for a mission in a readable timeline.

**Spec:**
- Accessible from mission card (click to expand or open drawer)
- Renders `state.history` array chronologically
- Shows: timestamp, event type, who triggered it, summary
- Shows messages (escalations/reports) inline in the timeline

---

#### C4. Cost Tracking
**Status:** Not built

Track token usage and estimated cost per mission and per agent.

**Spec:**
- Claude `-p` flag with `--output-format json` returns usage metadata
- Parse `usage.input_tokens` and `usage.output_tokens` from stdout
- Store in mission state: `cost: { [agentId]: { input: number, output: number } }`
- Display in mission card and Agents tab
- Cost formula (configurable): `(input * 3 + output * 15) / 1_000_000` USD (Sonnet pricing)

**Open question:** Does `claude -p` output JSON with usage when streaming? Need to verify.

---

### D. Agent Intelligence (智能体能力)

#### D1. Memory-Augmented Prompts
**Status:** Partial — `memory_read/write` tools exist but agents don't auto-read on start

At agent startup, inject the agent's memory into the system prompt automatically.

**Spec:**
- In `AgentRunner.ts`, before building `fullPrompt`, read `agents/{id}/memory.md`
- Append to system prompt:
  ```
  ---
  Your Memory (from past missions):
  {memory content}
  ```
- If memory is empty, skip injection
- Memory stays under 4000 tokens; if larger, truncate to most recent entries

---

#### D2. Agent Self-Improvement
**Status:** Not built

After each successful mission, the agent reflects on what it learned and writes to memory.

**Spec:**
- Add to system prompt: "After completing a mission, call `memory_write` to record any useful learnings, patterns, or preferences you discovered."
- Format convention for memory entries:
  ```markdown
  ## 2026-02-21 — Mission M-xxx (title)
  - Key learning 1
  - Key learning 2
  ```
- Memory visible in agent card in Agents tab (truncated to 500 chars)

---

#### D3. Agent Profiles via Natural Language (Hire via Chat)
**Status:** Not built — hire modal requires manual form fill

Describe the role in plain English; auto-generate the profile.

**Spec:**
- Hire modal: add "Describe role" textarea as alternative to manual fields
- On submit, POST to `POST /api/hire/generate` with `{ description: string }`
- Server calls claude with a meta-prompt to generate a `profile.json`
- Returns the generated profile for user to review/edit before confirming
- Meta-prompt:
  ```
  Generate a ClawCorp agent profile JSON for this role description: {description}
  The profile must follow this schema exactly: {...}
  Return only valid JSON.
  ```

---

### E. Infrastructure (工程基础)

#### E1. Multi-Concurrent Agents
**Status:** Partially working — `running` Map prevents double-run of same agent, but no limit on total concurrent agents

**Spec:**
- Add global concurrency limit (default: 5 simultaneous agents)
- Configurable via `server/.env`: `MAX_CONCURRENT_AGENTS=5`
- If limit reached, POST /api/run returns 429 with queue position
- Future: implement job queue with priority

---

#### E2. Session Resume UI
**Status:** Partial — checkbox exists but UX is rough

**Spec:**
- In Run modal, if `sessions[selectedAgent]` exists, show the session ID truncated
- Tooltip shows full session ID on hover
- Add "New session" vs "Continue session" toggle, not just a checkbox
- Show timestamp of last session if available (store `sessions_updated_at` in state)

---

#### E3. Agent Output Parsing
**Status:** Streaming raw text — claude outputs structured JSON with `-p` flag

Claude with `-p` outputs newline-delimited JSON events. Currently treated as raw text.

**Spec:**
- Parse each line of stdout as JSON
- Event types from claude:
  - `{ type: "assistant", message: { content: [...] } }` → extract text, broadcast
  - `{ type: "result", subtype: "success", usage: {...} }` → capture usage stats
  - `{ type: "tool_use", ... }` → broadcast as system event
- Display tool use calls in live log with special formatting
- Store final usage stats in mission state

---

## Versioning

| Version | Description |
|---|---|
| 0.1 | Next.js prototype, manual agent run |
| 0.2 | Bun+Hono rebuild, WebSocket streaming |
| 0.3 | MCP server, hierarchy, Inbox, Hire/Fire |
| **0.4** | **Auto-stage advancement (A1) + Artifact viewer (C1)** |
| 0.5 | Org chart (C2) + Memory-augmented prompts (D1) |
| 0.6 | Mission templates (A2) + Cost tracking (C4) |
| 1.0 | Agent self-improvement (D2) + Natural language hire (D3) |
