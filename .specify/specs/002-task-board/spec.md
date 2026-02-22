# Feature Specification: Task Board

**Feature Branch**: `002-task-board`
**Created**: 2026-02-22
**Status**: Draft
**Authors**: Chairman + Claude

---

## Context

The current Kanban has 6 workflow stages (backlog → analysis → design → development → testing → done). These stages represent *how agents collaborate internally* — they are a pipeline, not a task status.

From the Chairman's perspective, what matters is simpler: **is this thing being worked on, and is it good enough?**

This spec defines a **Task Board** — a separate, simple board where the Chairman tracks tasks by their human-visible status. The board mirrors real-world review workflows: work moves forward, but can also be pushed back with feedback.

**Columns (in order):** `Backlog → Todo → In Progress → Review → Done`

The **Review** column is the quality gate. The Chairman (or a designated reviewer) inspects completed work here before it moves to Done. If it's not good enough, it gets **pushed back** to In Progress with written feedback — the assignee sees what needs to change and tries again.

**Key separation:**
- **Team Boards** (spec 001): show missions flowing through agent pipelines — *for agents*
- **Task Board** (this spec): show tasks by status with a review gate — *for the Chairman*

---

## User Scenarios & Testing

### User Story 1 — View tasks by status (Priority: P1)

As Chairman, I want a 5-column board: Backlog, Todo, In Progress, Review, Done — so I can see what needs attention and what's waiting for approval.

**Why this priority**: This is the entire feature. Without it, nothing else works.

**Independent Test**: Navigate to the Task Board tab. See 5 columns. Cards can exist in any column.

**Acceptance Scenarios**:

1. **Given** the Task Board tab is open, **When** I look at the board, **Then** I see exactly 5 columns in order: Backlog, Todo, In Progress, Review, Done
2. **Given** a task exists with `status: "review"`, **When** I view the board, **Then** it appears in the Review column
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

1. **Given** a card is in Backlog, **When** I drag it to In Progress, **Then** it moves and persists after refresh
2. **Given** a card is in Done, **When** I drag it back to Todo, **Then** it moves back (no one-way restriction)
3. **Given** I drag a card to the same column, **Then** nothing changes
4. **Given** a card is in In Progress, **When** I drag it to Review, **Then** it enters the review queue
5. **Given** a card is in Review, **When** I drag it to Done, **Then** it is marked complete

---

### User Story 4 — Push back from Review with feedback (Priority: P1)

As Chairman, when a task in Review is not good enough, I want to push it back to In Progress with written feedback so the assignee knows exactly what to fix.

**Why this priority**: Without push-back, Review is just a waiting room. The feedback loop is what makes review meaningful.

**Independent Test**: Click "Push Back" on a Review card, write "needs unit tests", confirm. Card moves to In Progress. The feedback text is visible on the card.

**Acceptance Scenarios**:

1. **Given** a task is in Review, **When** I click "Push Back" and enter feedback "The summary is incomplete", **Then** the card moves to In Progress and displays the feedback text prominently
2. **Given** a task has been pushed back, **When** I view the card in In Progress, **Then** I see a "Feedback:" section with the reviewer's comment and a timestamp
3. **Given** a task has been pushed back once and then moved back to Review, **When** I push it back again, **Then** the new feedback is shown and the old feedback is preserved in a history list
4. **Given** I click "Push Back" but leave the feedback empty, **Then** I cannot confirm (feedback is required — no silent rejections)
5. **Given** a task in Review has received feedback, **When** the task is eventually moved to Done, **Then** the feedback history is preserved on the card (visible as a collapsed log)

---

### User Story 5 — Delete a task (Priority: P2)

As Chairman, I want to delete a task that is no longer relevant.

**Why this priority**: Without cleanup, the board fills up with noise.

**Independent Test**: Click delete on a card. It disappears. It does not reappear on refresh.

**Acceptance Scenarios**:

1. **Given** a task exists, **When** I click the delete button and confirm, **Then** the card is removed permanently
2. **Given** I accidentally click delete, **When** I cancel the confirmation, **Then** the card remains

---

### Edge Cases

- What if a task has the same title as an existing one? → Allowed, IDs are unique
- Can a task skip Review and go directly to Done? → Yes, drag-and-drop allows it (not all tasks need formal review)
- Can a task be pushed back from Review to Backlog (not just In Progress)? → No. Push-back always goes to In Progress — the work exists, it just needs revision
- What if feedback is very long? → Truncate to 500 chars on the card, full text in a tooltip/expand
- Can a task be pushed back more than once? → Yes. Each push-back appends to the feedback history. No limit.
- Are tasks linked to missions or agents? → No. Tasks are independent. If a task grows into a mission, the Chairman creates a mission separately.

---

## Requirements

### Functional Requirements

- **FR-001**: Task Board MUST be accessible as a top-level tab in the dashboard
- **FR-002**: Tasks MUST be stored separately from missions (`tasks/` directory or `tasks.json`)
- **FR-003**: Task schema:
  ```
  {
    id: string,
    title: string,
    status: "backlog" | "todo" | "in_progress" | "review" | "done",
    created_at: string,
    feedback: Array<{ text: string, at: string }>   // push-back history
  }
  ```
- **FR-004**: Tasks MUST NOT have agent, workspace, type, or workflow fields
- **FR-005**: Status update (drag-and-drop) MUST persist to disk immediately
- **FR-006**: Task creation MUST require only a title
- **FR-007**: "Push Back" action MUST require non-empty feedback text before confirming
- **FR-008**: Push-back MUST set `status` to `"in_progress"` and append to `feedback[]`
- **FR-009**: Feedback history MUST be visible on the card in In Progress (not hidden)
- **FR-010**: Push-back is ONLY available on cards in the Review column

### What is explicitly OUT OF SCOPE

- Assigning agents to tasks (that's a mission)
- Due dates, priorities, labels
- Linking tasks to missions
- Automated push-back (Review is always a human action)

---

## Success Criteria

- **SC-001**: A task can be created in 1 keypress (Enter) from the input field
- **SC-002**: Dragging a card to a new column persists in < 200ms
- **SC-003**: The board renders with zero loading states — data is fetched once on mount
- **SC-004**: The Task Board has no knowledge of agents, missions, or MCP tools
- **SC-005**: A pushed-back task shows feedback immediately — no page refresh needed
- **SC-006**: Feedback text is always visible on the card without clicking to expand
