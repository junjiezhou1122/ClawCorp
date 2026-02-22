# Feature Specification: Agent Hierarchy & Team Structure

**Feature Branch**: `004-hierarchy`
**Created**: 2026-02-22
**Status**: Draft
**Authors**: Chairman + Claude

---

## Context

ClawCorp currently stores a flat list of agents with `reports_to` and `subordinates` fields. The Agents tab shows an org-chart tree rooted at Chairman, but the tree is flat — every agent is a direct report or one level deep. There is no formal concept of **executive roles**, **departments as groups**, or **rank levels** within a department.

This spec introduces a **corporate hierarchy** with three layers:

```
Chairman (you)
├── CEO
│   ├── Engineering          ← department (clickable)
│   │   ├── VP of Engineering
│   │   │   ├── Senior Engineer
│   │   │   ├── Engineer
│   │   │   └── Intern
│   │   └── ...
│   └── Product              ← department (clickable)
│       ├── Head of Product
│       └── ...
├── CTO
│   └── Research Lab          ← department (clickable)
│       ├── Principal Investigator
│       │   ├── Research Scientist
│       │   └── Research Intern
│       └── ...
└── [Other C-suite]
```

**Key UX**: The top-level view shows Chairman → C-suite → Departments as collapsed nodes. Clicking a department expands it into its own internal tree showing the full team hierarchy (leaders, employees, interns).

---

## Architecture

### Three-tier hierarchy

1. **Chairman** — the user. Root of the tree. Passive observer.
2. **C-suite** — executive agents (CEO, CTO, COO, etc.) that report directly to Chairman. Each oversees one or more departments.
3. **Departments** — organizational units (Engineering, Research Lab, Product, etc.). Each department is a **team** with internal hierarchy.

### Agent rank levels

Within a department, agents have a `rank` field:

| Rank | Level | Description |
|---|---|---|
| `executive` | 0 | C-suite (CEO, CTO). Reports to Chairman. |
| `director` | 1 | Department head (VP Engineering, Head of Product). Reports to a C-suite exec. |
| `lead` | 2 | Team lead within a department. Reports to director. |
| `senior` | 3 | Senior individual contributor. Reports to lead or director. |
| `member` | 4 | Regular contributor. Reports to lead or director. |
| `intern` | 5 | Entry-level. Reports to any senior+ agent. |

### Department as a group entity

A department is a named group stored as `teams/{id}/team.json`. It references:
- A **department head** (director-level agent)
- An **executive sponsor** (C-suite agent it reports into)
- A list of **member agent IDs**

The internal tree structure within a department is derived from `reports_to` chains — not flattened.

### Communication rules

- **Within a department**: agents report up through the chain (intern → lead → director)
- **Cross-department**: director → director only. Lower-rank agents do NOT directly contact other departments
- **To Chairman**: only C-suite executives escalate to Chairman. Lower agents escalate up through the chain
- **Cross-team context**: when a director passes work to another department, a context packet travels with it (same as before)

---

## User Scenarios & Testing

### User Story 1 — View the corporate org chart (Priority: P1)

As Chairman, I want to see the organization as a multi-level tree: Chairman → C-suite → Departments (collapsed) — so I can quickly understand the structure.

**Independent Test**: Open the Agents tab. See Chairman at top, C-suite below, departments as collapsed nodes with member count badges. No need to scroll through every agent.

**Acceptance Scenarios**:

1. **Given** 2 C-suite agents (CEO, CTO) and 3 departments, **When** I open the Agents tab, **Then** I see Chairman → CEO/CTO → their respective departments as labeled nodes
2. **Given** a department node shows "Engineering (4)", **When** I see it, **Then** the "(4)" indicates 4 agents within that department
3. **Given** an agent is running in a department, **When** I view the top-level tree, **Then** that department node shows a green activity dot

---

### User Story 2 — Drill into a department (Priority: P1)

As Chairman, I want to click on a department (e.g. "Research Lab") to see its internal team tree — showing the hierarchy from director down to interns.

**Independent Test**: Click "Research Lab" node. The view expands (or navigates) to show the department's internal tree: Principal Investigator → Research Scientists → Interns.

**Acceptance Scenarios**:

1. **Given** I click on "Research Lab", **When** it expands, **Then** I see a tree rooted at the department head (e.g. Principal Investigator), with all members arranged by `reports_to`
2. **Given** a department has 3 levels (director → lead → intern), **When** expanded, **Then** the tree shows all 3 levels with proper indentation
3. **Given** I click the department again (or a "collapse" button), **When** it collapses, **Then** I return to the top-level view
4. **Given** an agent within the department is running, **When** I view the expanded tree, **Then** that agent shows a green dot and running status

---

### User Story 3 — Create and manage teams (Priority: P1)

As Chairman, I want to create a new department, assign an executive sponsor and department head, and add members.

**Independent Test**: Click "New Department", enter name "Data Science", assign executive sponsor "CTO", assign department head, confirm. A new department node appears.

**Acceptance Scenarios**:

1. **Given** I click "New Department" and fill in name + executive sponsor + department head, **When** I confirm, **Then** a new department node appears under the chosen executive
2. **Given** a department exists, **When** I add an agent to it, **Then** that agent appears within the department's internal tree
3. **Given** I want to restructure, **When** I move an agent between departments, **Then** their `reports_to` updates and they appear in the new department
4. **Given** I delete a department, **When** confirmed, **Then** member agents become "Unassigned" (not deleted)

---

### User Story 4 — Cross-department delegation with context (Priority: P2)

As a department head, I want to pass a task to another department's head with structured context, so the receiving department understands what to do, why, and what's already known.

**Acceptance Scenarios**:

1. **Given** Engineering director calls `cross_team_delegate` with task + context, **Then** Research director receives the task with full context
2. **Given** a cross-department task completes, **When** the research director reports, **Then** the result goes back to the engineering director (not Chairman)
3. **Given** a cross-department handoff is in flight, **When** I view the Inbox, **Then** I see it as a distinct event showing department→department

---

### User Story 5 — Hire into the hierarchy (Priority: P2)

As Chairman, when hiring a new agent (manually or Smart Hire), I want to place them in a department at the right rank level.

**Acceptance Scenarios**:

1. **Given** Smart Hire infers department "Engineering" and rank "member", **When** hired, **Then** the agent appears in Engineering under the correct lead
2. **Given** I hire a C-suite agent (e.g. COO), **When** hired, **Then** they appear as a direct report of Chairman at the top level

---

### Edge Cases

- What if a C-suite agent is fired? → Their departments become "unsponsored" — show warning. Chairman must reassign.
- What if a department head is fired? → Department still exists but shows "No Head" warning. Chairman must assign a new one.
- What if an agent's `reports_to` points to someone outside their department? → Department membership wins. `reports_to` is corrected to the department head.
- Can an agent be in multiple departments? → No. One agent = one department.
- Can Chairman be a department head? → No. Chairman is above all departments and executives.
- Maximum depth of hierarchy within a department? → No enforced limit, but typical is 2-3 levels.

---

## Requirements

### Data Model

**Team/Department schema** (`teams/{id}/team.json`):
```json
{
  "id": "engineering",
  "name": "Engineering",
  "executive_sponsor": "ceo",
  "head": "vp-engineering",
  "members": ["senior-engineer", "engineer-1", "intern-1"],
  "created_at": "ISO"
}
```

**Agent profile update** — add `rank` and `team` fields:
```json
{
  "id": "senior-engineer",
  "rank": "senior",
  "team": "engineering",
  "reports_to": "vp-engineering"
}
```

### UI Layout

**Top-level view (collapsed)**:
```
Chairman ────────────────────── [You]
├── CEO ──────────────────── executive
│   ├── Engineering (4) ──── [click to expand]
│   └── Product (2) ──────── [click to expand]
└── CTO ──────────────────── executive
    └── Research Lab (3) ─── [click to expand]
```

**Expanded department view** (e.g. click "Engineering"):
```
← Back to Org Chart

Engineering
├── VP of Engineering ──── director
│   ├── Senior Engineer ── senior
│   ├── Engineer ────────── member
│   └── Intern ──────────── intern
```

### MCP Tool: `cross_team_delegate`

```
cross_team_delegate(
  to_team: string,
  task: string,
  why: string,
  known: string,
  expected_output: string
) → { handoff_id: string }
```

Only callable by agents with rank `director` or `executive`. Others get an error.

### Functional Requirements

- **FR-001**: Teams/departments MUST be stored in `teams/{id}/team.json`
- **FR-002**: The Agents tab MUST show a top-level tree: Chairman → C-suite → Departments (collapsed)
- **FR-003**: Clicking a department MUST expand/navigate to show its internal hierarchy tree
- **FR-004**: Each department node MUST show: name, member count, running status indicator
- **FR-005**: Each agent node MUST show: title, rank badge, running status
- **FR-006**: `GET /api/teams` MUST return all departments with resolved members and hierarchy
- **FR-007**: `POST /api/teams` MUST create a new department (name + executive sponsor + head required)
- **FR-008**: `PATCH /api/teams/:id` MUST allow adding/removing members and changing head
- **FR-009**: `DELETE /api/teams/:id` MUST move members to "Unassigned", not delete agents
- **FR-010**: `cross_team_delegate` MUST only be callable by director+ rank agents
- **FR-011**: Cross-department handoffs MUST appear as distinct events in Inbox
- **FR-012**: Hiring MUST include department + rank assignment (inferred by Smart Hire, manual for regular hire)
- **FR-013**: Agents with no department MUST appear in "Unassigned" section
- **FR-014**: The tree MUST update in real time via WebSocket

---

## Success Criteria

- **SC-001**: Chairman can see the full org structure at a glance in < 3 seconds (collapsed view)
- **SC-002**: Drilling into a department to see team details takes one click
- **SC-003**: Adding a new department takes < 30 seconds
- **SC-004**: No agent is ever lost — all appear in tree or Unassigned
- **SC-005**: Org chart is fully dynamic — no page refresh needed
