# Feature Specification: Task Detail View — Per-Task Progress Dashboard

**Feature Branch**: `007-task-detail-view`
**Created**: 2026-02-23
**Status**: Draft
**Authors**: Chairman + Claude

---

## Context

### The Problem

The current UI has a **global Live Log** sidebar on the right — a single firehose of all agent output mixed together. When 3 agents are running across 2 tasks, the log becomes unreadable noise. Worse, the Chairman has no way to ask *"what's happening with THIS task specifically?"*

The task card on the board shows only: title, ID, status, and a Dispatch button. Once dispatched, the Chairman is blind — they have to mentally correlate log lines from different agents, check the Inbox tab for escalations, switch to the Chat tab for agent conversations, and somehow piece together the full picture of one task's progress.

**This is the wrong information architecture.** The task is the unit of work the Chairman cares about. Everything related to a task — its status, the agents working on it, their output, their conversations, the artifacts produced, the escalation chain — should be visible in **one place**.

### The Vision

Click a task card → enter a full-screen detail view → see everything about this task:

```
┌──────────────────────────────────────────────────────────┐
│  ← Back to Board          "Build user auth REST API"     │
│  Status: in_progress       Dispatched to: product-manager│
├────────────┬─────────────────────────────────────────────┤
│            │                                             │
│  Activity  │  [Live Log]                                 │
│  --------  │  [dispatch] Routing: "Build user auth..."   │
│            │  [dispatch] → product-manager: software...  │
│  Agents    │  [product-manager] > started in ~/project   │
│  --------  │  [product-manager] Analyzing task...        │
│  PM  ●     │  [product-manager] Delegating to architect  │
│  Arch ●    │  [architect] > started in ~/project         │
│  SE   ●    │  [architect] Designing JWT auth schema...   │
│            │  [senior-engineer] > started in ~/project   │
│  Artifacts │  [senior-engineer] Implementing routes...   │
│  --------  │                                             │
│  auth.ts   │                                             │
│  jwt.ts    │                                             │
│  schema.sql│                                             │
│            │                                             │
│  Comms     │                                             │
│  --------  │                                             │
│  3 msgs    │                                             │
│  1 pending │                                             │
│            │                                             │
├────────────┴─────────────────────────────────────────────┤
│  Feedback: "Add rate limiting to login endpoint"         │
└──────────────────────────────────────────────────────────┘
```

### What Changes

| Before | After |
|---|---|
| Global Live Log sidebar (right rail) | **Removed** — replaced by per-task live log |
| Task card click: nothing | Task card click → **full detail view** |
| Agent output mixed together | Output **filtered by task** (mission + sub-missions) |
| Artifacts invisible | Artifacts **listed and browsable** in task detail |
| Agent comms scattered across Inbox + Chat | **Aggregated per task** in the detail sidebar |
| Chairman mentally correlates across tabs | **Everything in one screen** |

---

## Architecture

### Data Flow: Task → Mission Tree

A dispatched task creates a **mission tree** via auto-dispatch and delegation:

```
Task: T-1234 "Build user auth REST API"
  │
  └─ Mission: M-1001 (product-manager)        ← root mission
       ├─ Sub-mission: M-1001-architect-xxx    ← delegate
       │    └─ Sub-mission: M-1001-architect-xxx-senior-engineer-xxx
       └─ Sub-mission: M-1001-qa-engineer-xxx  ← delegate
```

The task detail view must **resolve the full mission tree** by following `parent_mission` links. All log output, agents, artifacts, and messages from any mission in this tree belong to the task.

### Key Concept: Task Scope

A task's "scope" is defined as:
- The **root mission** (stored as `task.mission_id`)
- All **sub-missions** whose `parent_mission` chain traces back to the root
- All **agents** that have been assigned to any mission in the tree
- All **artifacts** in any mission's `artifacts/` directory
- All **messages** (escalate/report) referencing any mission in the tree
- All **chat messages** from agents involved in the tree

---

## UI Design

### 1. Task Card Enhancement (Board View)

Task cards on the board gain a **click target**. The entire card is clickable (except the action buttons).

Visual additions to the card:
- **Assigned agent badge**: if dispatched, show small colored pill with agent name
- **Activity indicator**: if any agent in the task's tree is running, show a pulsing dot
- **Sub-agent count**: e.g. "3 agents" if multiple agents are working on the tree
- **Latest log line**: last line of output from any agent, truncated to 1 line, as a subtle preview

### 2. Task Detail View (Full-Screen Overlay)

Clicking a task card opens a **full-width overlay** (not a new page — preserves board state) with three zones:

#### Header Bar

```
← Back to Board    |    "Build user auth REST API"    |    Status: in_progress
                   |    T-1234                        |    Dispatched to: product-manager
                   |    Created: Feb 23, 2026         |    Routing: "software task → PM"
```

- **Back button**: returns to board (ESC key also works)
- **Status badge**: current task status (backlog/todo/in_progress/review/done)
- **Routing info**: shows who was picked and why
- **Action buttons**: Delete, Push Back (if in review)

#### Left Sidebar — Summary Panels

Stacked panels, each collapsible:

**A. Agent Tree**

Shows all agents involved in this task as a mini org-tree, with live status:

```
product-manager     ● running
  └─ architect      ● running
       └─ senior-engineer  ● running
  └─ qa-engineer    ○ idle
```

Each agent node shows:
- Status dot (green pulsing = running, gray = idle/done)
- Agent name + role
- Click to filter log to only that agent's output

**B. Artifacts**

Lists all files produced by agents in this task's mission tree, read from `missions/<id>/artifacts/`:

```
missions/M-1001-architect-xxx/artifacts/
  ├─ auth-schema.sql
  ├─ api-design.md
  └─ jwt-flow.png

missions/M-1001-architect-xxx-senior-engineer-xxx/artifacts/
  ├─ src/auth/routes.ts
  ├─ src/auth/middleware.ts
  └─ tests/auth.test.ts
```

Each artifact shows:
- File name (truncated)
- Size
- Last modified time
- Click to preview (text files shown inline, images rendered, others download)

**C. Communications**

Aggregated messages (escalate/report) from this task's mission tree:

- Unread escalations shown with orange badge and "Answer" button
- Reports shown with green badge
- Each message shows: from → to, type, time, content
- Clicking "Answer" opens inline reply (no modal needed)

**D. Feedback History**

Chairman's push-back feedback for this task, ordered newest-first.

#### Main Area — Live Log (Per-Task)

The main content area is a **live-streaming log** filtered to this task only:

**Filtering logic:**
1. Collect all mission IDs in the task's tree
2. Show only `LogLine` entries whose `missionId` is in that set
3. Also show `dispatch:*` events matching this task's ID
4. Also show `hire:*` events if relevant (future)

**Log rendering:**
- Each line prefixed with `[agent-id]` in a colored badge matching the agent
- System lines (started/done/delegated) styled differently from output lines
- Error lines highlighted in red
- Auto-scroll to bottom (with "scroll lock" toggle if user scrolls up)
- Search/filter bar at the top of the log area (filter by agent, by text)

**Empty state:**
- Before dispatch: "Click Dispatch to start this task"
- Dispatching: "Routing task to the right executive..."
- After dispatch, before agent output: "Waiting for {agent} to start..."

### 3. Global Live Log Removal

The right sidebar "Live Log" panel is **removed from the main layout**. The sidebar area is freed up, allowing the board to use the full width.

If the user wants a global view of all agent activity, they can still see agent status on the Agents tab. But the primary workflow is: **board → click task → see task detail**.

### 4. Navigation & State

- **URL**: No URL change needed (it's a SPA overlay). State is managed via `selectedTask: Task | null`.
- **ESC key**: closes detail view, returns to board
- **Browser back**: ideally also closes the detail view (optional, nice-to-have)
- **WebSocket**: detail view subscribes to the same WS feed, but filters events client-side
- **Refresh**: if `selectedTask` is set, re-fetch task state + missions on mount

---

## API Additions

### `GET /api/tasks/:id/detail`

Returns the full task detail bundle in one request:

```json
{
  "task": {
    "id": "T-1234",
    "title": "Build user auth REST API",
    "status": "in_progress",
    "mission_id": "M-1001",
    "assigned_to": "product-manager",
    "routing_reasoning": "Software implementation task",
    "feedback": [...]
  },
  "missions": [
    { "id": "M-1001", "assignee": "product-manager", "status": "in_progress", ... },
    { "id": "M-1001-architect-xxx", "assignee": "architect", "parent_mission": "M-1001", ... },
    ...
  ],
  "agents": [
    { "id": "product-manager", "title": "Product Manager", "status": "running", ... },
    ...
  ],
  "artifacts": [
    { "missionId": "M-1001-architect-xxx", "path": "auth-schema.sql", "size": 1234, "modified": "..." },
    ...
  ],
  "messages": [
    { "id": "...", "from": "architect", "to": "product-manager", "type": "report", ... },
    ...
  ]
}
```

This is the **only new endpoint**. It resolves the full mission tree server-side and returns everything the detail view needs in one round-trip.

### Mission Tree Resolution (Server)

The server resolves the tree by:
1. Starting from `task.mission_id` (the root)
2. Scanning all missions where `parent_mission` matches any known mission ID in the tree (BFS/DFS)
3. Collecting all unique `assignee` values → load their profiles
4. Scanning each mission's `artifacts/` directory
5. Filtering messages by mission IDs in the tree

This resolution logic lives in a shared utility function so it can be reused.

---

## WebSocket Event Filtering (Client-Side)

When the detail view is open, the client filters incoming WS events:

| Event | Filter | Action |
|---|---|---|
| `agent:start` | `missionId` in task tree | Add log line, update agent status |
| `agent:output` | `missionId` in task tree | Add log line |
| `agent:error` | `missionId` in task tree | Add log line (red) |
| `agent:done` | `missionId` in task tree | Add log line, update agent status |
| `dispatch:*` | `taskId` matches | Add log line |
| `message:new` | `missionId` in task tree | Add to comms panel, add log line |
| `mission:updated` | `id` in task tree | Update mission state, maybe add to tree |
| `task:updated` | `id` matches | Update header status/info |

New sub-missions (created by `delegate`) are automatically added to the tree when `mission:updated` events arrive with a `parent_mission` pointing to a known tree member.

---

## User Scenarios

### Scenario 1: Dispatch and Watch (Primary Flow)

1. Chairman creates task: "Build user auth REST API"
2. Clicks "Dispatch" on the task card
3. **Task card immediately shows**: pulsing indicator, "product-manager" badge
4. Chairman clicks the task card → detail view opens
5. Live log streams: routing → PM started → PM analyzing → PM delegating to architect → architect started → ...
6. Left sidebar shows agent tree growing as delegates spawn
7. Artifacts appear as agents create files
8. Eventually agents report done → log shows completion → status updates

### Scenario 2: Check Artifacts

1. Chairman opens detail for a completed task
2. Scrolls to Artifacts panel in left sidebar
3. Sees `api-design.md` — clicks to preview
4. Inline viewer shows the markdown rendered
5. Sees `src/auth/routes.ts` — clicks to view code with syntax highlighting

### Scenario 3: Answer Escalation In-Context

1. Chairman sees an orange badge on a task card (pending escalation)
2. Clicks into detail view
3. Communications panel shows: "architect asks: Should auth use JWT or sessions?"
4. Chairman types answer inline → sends
5. Architect receives answer and continues (visible in the live log)

### Scenario 4: Push Back from Detail View

1. Chairman reviews a "review" task in the detail view
2. Reads the artifacts, checks the log — not satisfied
3. Clicks "Push Back" in the header
4. Types feedback: "Add rate limiting to login endpoint"
5. Task moves back to in_progress, feedback visible in the detail view

### Scenario 5: Multi-Agent Monitoring

1. A complex task has 5 agents working across the tree
2. Chairman opens detail view — sees all 5 in the agent tree
3. Log is busy — Chairman clicks on "architect" in the tree to filter
4. Now only architect's log lines are shown
5. Clicks "All" to return to the full view

---

## Edge Cases

- **Task not dispatched yet**: detail view shows task info + "Click Dispatch to start" empty state in the log area. No agents, no artifacts, no comms.
- **Dispatch failed**: detail view shows dispatch error message prominently in the log area. Task is back in backlog.
- **Agent crashes mid-task**: log shows the error, agent tree shows red/error status. Chairman can see what happened and potentially re-dispatch.
- **Very long log**: virtualized scrolling (only render visible lines). Keep max ~2000 lines in memory, older lines discarded.
- **No artifacts yet**: artifacts panel shows "No artifacts produced yet" placeholder.
- **Task has no mission tree** (pre-dispatch): missions array is empty, agent tree is empty.
- **Concurrent tasks**: each detail view is independent. Opening one task's detail while another is running doesn't interfere.

---

## Implementation Approach

### Commit 1: Server — Task Detail Endpoint

- New utility: `resolveTaskTree(taskId)` — given a task, resolve its full mission tree, agents, artifacts, messages
- New route: `GET /api/tasks/:id/detail` — calls the utility, returns the bundle
- Artifact scanning: read each mission's `artifacts/` directory recursively

### Commit 2: Client — Task Detail View Component

- New component: `TaskDetail` — the full-screen overlay
- State: `selectedTask` replaces old detail-less card click
- Agent tree rendering (reuse existing `renderAgentNode` logic)
- Artifacts list with click-to-preview
- Communications panel with inline reply
- Feedback history

### Commit 3: Client — Per-Task Live Log + Remove Global Sidebar

- Move log state from global to per-task (filtered by mission tree)
- WebSocket event filtering by mission IDs
- Agent filter toggle in the log header
- Remove the global Live Log right sidebar
- Board layout goes full-width

---

## Non-Goals (Explicitly Out of Scope)

- **Real-time artifact diffing** — we show the file list, not a live diff view
- **Task-to-task dependencies** — each task is independent for now
- **Agent reassignment** — if the routed executive is wrong, re-dispatch is the solution, not manual reassignment
- **Worklog integration** (spec 005) — the detail view shows live output, not structured worklogs. Worklog integration is a future enhancement
- **Chairman chat in detail view** — Chairman can observe agent comms but cannot send messages from the detail view (use the Chat tab for that)
