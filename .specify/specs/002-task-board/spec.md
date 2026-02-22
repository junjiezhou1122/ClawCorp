# Feature Specification: Task Board

**Feature Branch**: `002-task-board`
**Created**: 2026-02-22
**Status**: Draft
**Authors**: Chairman + Claude

---

## Context

The current Kanban has 6 workflow stages (backlog → analysis → design → development → testing → done). These stages represent *how agents collaborate internally* — they are a pipeline, not a task status.

From the Chairman's perspective, what matters is simpler: **is this thing being worked on, or not?**

This spec defines a **Task Board** — a separate, simple board where the Chairman tracks tasks by their human-visible status: `Backlog / Todo / In Progress / Done`. Internal agent workflow is invisible here. The Task Board is for the Chairman's own task management, independent of which agents are running or what stage they're in.

**Key separation:**
- **Team Boards** (spec 001): show missions flowing through agent pipelines — *for agents*
- **Task Board** (this spec): show tasks by status — *for the Chairman*

---

## User Scenarios & Testing

### User Story 1 — View tasks by status (Priority: P1)

As Chairman, I want a simple 4-column board: Backlog, Todo, In Progress, Done — so I can see what needs attention at a glance.

**Why this priority**: This is the entire feature. Without it, nothing else works.

**Independent Test**: Navigate to the Task Board tab. See 4 columns. Cards can exist in any column.

**Acceptance Scenarios**:

1. **Given** the Task Board tab is open, **When** I look at the board, **Then** I see exactly 4 columns: Backlog, Todo, In Progress, Done
2. **Given** a task exists with `status: "todo"`, **When** I view the board, **Then** it appears in the Todo column
3. **Given** no tasks exist, **When** I view the board, **Then** each column is empty but visible

---

### User Story 2 — Create a task (Priority: P1)

As Chairman, I want to quickly add a task with just a title. No type, no workspace, no agent assignment needed upfront.

**Why this priority**: A task board is useless if creating a task is slow.

**Independent Test**: Type a title, press Enter or click Add. Card appears in Backlog immediately.

**Acceptance Scenarios**:

1. **Given** I type "Review research output" and press Enter, **Then** a card appears in Backlog instantly
2. **Given** a task is created, **Then** it has an auto-generated ID, title, status `"backlog"`, and `created_at`
3. **Given** I submit an empty title, **Then** nothing happens (no empty cards)

---

### User Story 3 — Move tasks by drag-and-drop (Priority: P1)

As Chairman, I want to drag a task card from one column to another to update its status.

**Why this priority**: Drag-and-drop is the primary interaction model of any task board.

**Independent Test**: Drag a card from Backlog to In Progress. It moves. Refresh page. It stays moved.

**Acceptance Scenarios**:

1. **Given** a card is in Backlog, **When** I drag it to In Progress, **Then** it moves to the In Progress column and persists after refresh
2. **Given** a card is in Done, **When** I drag it back to Todo, **Then** it moves back (no one-way restriction)
3. **Given** I drag a card and drop it in the same column, **Then** nothing changes

---

### User Story 4 — Delete a task (Priority: P2)

As Chairman, I want to delete a task that is no longer relevant.

**Why this priority**: Without cleanup, the board fills up with noise.

**Independent Test**: Click delete on a card. It disappears. It does not reappear on refresh.

**Acceptance Scenarios**:

1. **Given** a task exists, **When** I click the delete button and confirm, **Then** the card is removed from the board permanently
2. **Given** I accidentally click delete, **When** I cancel the confirmation, **Then** the card remains

---

### Edge Cases

- What if a task has the same title as an existing one? → Allowed, IDs are unique
- What is the maximum number of tasks? → No limit enforced; UI scrolls within columns
- Are tasks linked to missions? → No. Tasks and missions are independent. A task is just a task — it does not spawn agents or track stages. If it grows into a mission, the Chairman creates a mission separately.

---

## Requirements

### Functional Requirements

- **FR-001**: Task Board MUST be accessible as a top-level tab in the dashboard
- **FR-002**: Tasks MUST be stored in a separate data store from missions (`tasks/` directory or `tasks.json`)
- **FR-003**: Task schema: `{ id, title, status: "backlog"|"todo"|"in_progress"|"done", created_at }`
- **FR-004**: Tasks MUST NOT have agent, workspace, type, or workflow fields — these belong to missions
- **FR-005**: Status update (drag-and-drop) MUST persist to disk immediately
- **FR-006**: Task creation MUST require only a title

### What is explicitly OUT OF SCOPE

- Assigning agents to tasks (that's a mission)
- Task stages beyond the 4 statuses (that's a team board)
- Due dates, priorities, labels (keep it simple)
- Linking tasks to missions (separate concerns)

---

## Success Criteria

- **SC-001**: A task can be created in 1 keypress (Enter) from the input field
- **SC-002**: Dragging a card to a new column persists in < 200ms
- **SC-003**: The board renders with zero loading states — data is fetched once on mount
- **SC-004**: The Task Board has no knowledge of agents, missions, or MCP tools
