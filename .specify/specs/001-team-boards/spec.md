# Feature Specification: Team Boards

**Feature Branch**: `001-team-boards`
**Created**: 2026-02-22
**Status**: Draft
**Authors**: Chairman + Claude

---

## Context

Currently ClawCorp has a single global Kanban board showing all missions regardless of which team owns them. Engineering missions, research experiments, and product tasks are all mixed together.

Each department runs a different workflow:
- **Engineering**: backlog → analysis → design → development → testing → done
- **Research Lab**: hypothesis → literature → experiment → analysis → paper → done
- **Product**: backlog → discovery → spec → validation → done

A single board with a single set of stages cannot represent all three workflows correctly. Teams need their own boards with their own stages.

---

## User Scenarios & Testing

### User Story 1 — Switch between team boards (Priority: P1)

As Chairman, I want to click on a team name (Engineering / Research Lab / Product) and see only that team's missions on a board with the correct stages for that team's workflow.

**Why this priority**: This is the core navigation model. Without it, teams cannot have independent workflows.

**Independent Test**: Can open the Engineering board and see only engineering missions in stages: backlog → analysis → design → development → testing → done. Research missions do not appear.

**Acceptance Scenarios**:

1. **Given** the dashboard is open, **When** I click "Engineering", **Then** I see a Kanban with 6 columns: Backlog, Analysis, Design, Build, QA, Done — containing only engineering missions
2. **Given** the dashboard is open, **When** I click "Research Lab", **Then** I see a Kanban with 6 columns: Hypothesis, Literature, Experiment, Analysis, Paper, Done — containing only research missions
3. **Given** the dashboard is open, **When** I click "Product", **Then** I see a Kanban with 5 columns: Backlog, Discovery, Spec, Validation, Done — containing only product missions
4. **Given** I am on the Research Lab board, **When** a new engineering mission is created, **Then** it does NOT appear on the Research Lab board

---

### User Story 2 — Create a mission on the correct team board (Priority: P1)

As Chairman, when I create a new mission, I want it to be associated with the current team board I'm viewing, so it appears in the right place with the right workflow.

**Why this priority**: Without this, missions have no team and cannot be placed correctly.

**Independent Test**: Create a mission while on the Research Lab board. The mission appears in the Research Lab's "Hypothesis" column, not in Engineering's "Backlog".

**Acceptance Scenarios**:

1. **Given** I am on the Research Lab board, **When** I create mission "Study meta-learning", **Then** the mission appears in the "Hypothesis" column of the Research Lab board
2. **Given** I am on the Engineering board, **When** I create mission "Fix auth bug", **Then** the mission appears in the "Backlog" column of the Engineering board
3. **Given** a mission has `team: "research"`, **When** I drag it to a new stage on the Research board, **Then** the stage updates correctly within the Research Lab's stage list (not Engineering's)

---

### User Story 3 — Global view across all teams (Priority: P2)

As Chairman, I want a "All Teams" view that shows the total mission count and running agents across all teams without navigating between boards.

**Why this priority**: Chairman needs situational awareness of the whole org, not just one team.

**Independent Test**: The "All Teams" view shows missions from Engineering, Research, and Product in a single list grouped by team, each showing current stage and assignee.

**Acceptance Scenarios**:

1. **Given** there are missions on all three boards, **When** I select "All Teams", **Then** I see all missions grouped by team with team headers
2. **Given** an agent is running on a Research mission, **When** I view "All Teams", **Then** the running indicator appears on that mission card regardless of which team board it belongs to
3. **Given** I am on "All Teams", **When** I click a mission card, **Then** I navigate to that mission's team board with the mission visible

---

### User Story 4 — Team-aware agent assignment (Priority: P2)

As Chairman, when I click "Run" on a mission, the agent dropdown should default to showing agents from the same department as the mission's team.

**Why this priority**: Research missions should default to PI / Research Assistant. Engineering missions should default to Senior Engineer. Reduces wrong agent selection.

**Independent Test**: Open Run modal on a Research mission. The agent dropdown shows PI and Research Assistant first (still shows all agents, but in order).

**Acceptance Scenarios**:

1. **Given** a Research mission, **When** I open the Run modal, **Then** Research Lab agents (PI, Research Assistant) appear first in the dropdown
2. **Given** an Engineering mission, **When** I open the Run modal, **Then** Engineering agents appear first
3. **Given** any mission, **When** I open the Run modal, **Then** I can still select any agent regardless of department (cross-team assignment allowed)

---

### Edge Cases

- What happens to existing missions that have no `team` field? → Assign to Engineering (default) on migration
- What if a mission is delegated from Engineering to Research? → Sub-missions inherit the parent's team, unless explicitly overridden
- What if a user drags a mission to a stage that doesn't exist on the current board? → Not possible — drop targets are the current board's stages only
- What if all agents in a team are busy? → Show them as disabled in the dropdown with "(busy)" label; cross-team agents are available

---

## Requirements

### Functional Requirements

- **FR-001**: Each mission MUST have a `team` field: `"engineering" | "research" | "product"`
- **FR-002**: Each team MUST have a fixed, ordered list of stages defined in configuration
- **FR-003**: The Board tab MUST show a team selector (Engineering / Research Lab / Product / All Teams)
- **FR-004**: The Kanban board MUST render the stages for the selected team only
- **FR-005**: The "New Mission" form MUST pre-fill the team based on the currently selected board
- **FR-006**: Mission `current_stage` MUST be validated against the team's stage list on write
- **FR-007**: Drag-and-drop MUST only allow dropping onto stages valid for the mission's team
- **FR-008**: The global header stats (mission count, running agents) MUST aggregate across all teams

### Key Entities

- **Team**: `{ id: string, name: string, department: string, stages: Stage[] }`
- **Stage**: `{ id: string, label: string, defaultAgent?: string }`
- **Mission** (updated): adds `team: "engineering" | "research" | "product"`

### Team Stage Definitions

```
Engineering:  backlog → analysis → design → development → testing → done
Research Lab: hypothesis → literature → experiment → analysis → paper → done
Product:      backlog → discovery → spec → validation → done
```

---

## Success Criteria

- **SC-001**: Navigating between team boards takes < 100ms (client-side filter, no network request)
- **SC-002**: A mission created on the Research board never appears on the Engineering board
- **SC-003**: Existing missions without a `team` field continue to work (defaulted to `engineering`)
- **SC-004**: The correct stage columns appear immediately on team switch with no layout shift
- **SC-005**: All missions remain visible in "All Teams" view
