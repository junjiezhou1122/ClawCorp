# Feature Specification: Agent Hierarchy & Team Structure

**Feature Branch**: `004-hierarchy`
**Created**: 2026-02-22
**Status**: Draft
**Authors**: Chairman + Claude

---

## Context

ClawCorp currently stores a flat list of agents with `reports_to` and `subordinates` fields, but there is no formal concept of a **team**. The Agents tab shows agents as a grid of cards with no visual hierarchy. Cross-agent delegation is individual-to-individual with no team boundary.

This spec introduces:
1. **Teams** as first-class entities — dynamic, chairman-created, extensible
2. **Hierarchical Agents view** — org chart showing team structure
3. **Cross-team collaboration** — structured task + context passing between team leads

The key constraint: **teams are dynamic**. The Chairman can add new teams at any time. No team names or structures are hardcoded.

---

## Architecture

### Team as a first-class entity

A team is a named group with one **lead** and any number of **members**. The lead is the external interface of the team — all cross-team tasks enter and exit through the lead.

```
Chairman
├── Research Team          ← team entity
│   ├── Lead: Principal Investigator
│   └── Members: Research Assistant, ...
├── Engineering Team       ← team entity
│   ├── Lead: Product Manager
│   └── Members: Architect, Senior Engineer, QA Engineer, Intern, ...
└── [New Team]             ← Chairman can add at any time
    ├── Lead: [agent]
    └── Members: [agents]
```

### Communication rules

- **Within a team**: members report to lead; lead reports to Chairman
- **Cross-team**: Lead → Lead only. Team members do NOT directly contact agents in other teams
- **Escalation**: always goes up within the team first, then to Chairman if the lead is also blocked
- **Chairman**: passive observer; only contacted when all leads are blocked

### Context packet (cross-team handoff)

When a lead passes a task to another team's lead, a **context packet** travels with it:

```json
{
  "from_team": "engineering",
  "to_team": "research",
  "task": "...",
  "why": "We need this to complete the auth module",
  "known": "JWT is the chosen approach, user table schema is attached",
  "expected_output": "A security analysis report in markdown"
}
```

---

## User Scenarios & Testing

### User Story 1 — View the org chart (Priority: P1)

As Chairman, I want to see the entire organization as a hierarchy tree so I can understand who reports to whom and which team is doing what.

**Why this priority**: This is the primary visualization goal of the feature.

**Independent Test**: Open the Agents tab. See a tree layout with Chairman at top, teams as branches, leads below Chairman, members below leads. Running agents show a green dot.

**Acceptance Scenarios**:

1. **Given** 3 teams exist (Research, Engineering, a new custom team), **When** I open the Agents tab, **Then** I see a tree with 3 branches under Chairman, each showing the team name and lead
2. **Given** an agent is currently running, **When** I view the org chart, **Then** that agent's node shows a live green dot
3. **Given** I add a new team via the UI, **When** I return to the org chart, **Then** the new team appears as a new branch without page reload
4. **Given** an agent has no team assigned, **When** I view the org chart, **Then** it appears in an "Unassigned" section below the tree (not lost)

---

### User Story 2 — Create and manage teams (Priority: P1)

As Chairman, I want to create a new team by giving it a name and assigning a lead agent, so the org can grow without any hardcoded limits.

**Why this priority**: The entire feature is built on dynamic teams. Without this, hierarchy is static.

**Independent Test**: Click "New Team", enter name "Data Team", assign lead "data-analyst", confirm. The org chart gains a new branch.

**Acceptance Scenarios**:

1. **Given** I click "New Team" and fill in name + lead, **When** I confirm, **Then** a new team appears in the org chart immediately
2. **Given** a team exists, **When** I add an agent to it as a member, **Then** that agent appears as a child of the team lead in the org chart
3. **Given** a team has a lead, **When** I change the lead to a different agent, **Then** the old lead becomes a regular member and the new lead is elevated
4. **Given** I delete a team, **When** confirmed, **Then** member agents become "Unassigned" (not deleted) and the team branch is removed

---

### User Story 3 — Cross-team task delegation with context (Priority: P2)

As a team lead agent, I want to pass a task to another team's lead with a structured context packet, so the receiving team understands not just *what* to do but *why* and *what's already known*.

**Why this priority**: Without context, cross-team handoffs lose information and produce misaligned results.

**Independent Test**: Engineering Lead delegates to Research Lead via MCP `cross_team_delegate` tool. Research Lead receives task + context packet. Engineering Lead gets a result back when Research Team is done.

**Acceptance Scenarios**:

1. **Given** PM (Engineering lead) calls `cross_team_delegate` with task + why + known + expected_output, **Then** PI (Research lead) receives a mission with all four fields visible in the mission context
2. **Given** Research Team completes the delegated task, **When** PI calls `report`, **Then** the result is delivered back to PM's mission (not just to Chairman inbox)
3. **Given** a cross-team task is in flight, **When** I view the Inbox, **Then** I can see the cross-team handoff as a distinct event showing from-team → to-team
4. **Given** the receiving lead is busy (agent running), **When** a cross-team delegate arrives, **Then** it queues and the lead picks it up on their next run

---

### User Story 4 — Hire an agent directly into a team (Priority: P2)

As Chairman, when hiring a new agent (manually or via Smart Hire), I want to assign them to a team immediately so they appear in the org chart in the right place.

**Why this priority**: Without this, hired agents land in "Unassigned" and must be manually placed.

**Independent Test**: In the Hire modal, there is a "Team" dropdown. Select "Research Team". New agent appears under Research Team in org chart.

**Acceptance Scenarios**:

1. **Given** I hire a new agent and select "Research Team", **When** hire completes, **Then** the agent appears as a member under PI in the org chart
2. **Given** Smart Hire infers the department from the description, **When** hire completes, **Then** the agent is automatically placed in the matching team
3. **Given** no matching team exists for the inferred department, **When** hired, **Then** the agent is placed in "Unassigned"

---

### Edge Cases

- What if a lead agent is fired? → Team still exists; needs a new lead assigned before it can function. Show warning in org chart: "Team has no lead"
- What if a member is assigned to two teams? → Not allowed. One agent = one team. Enforce on write.
- What if `reports_to` in `profile.json` contradicts team membership? → Team membership wins. `reports_to` is derived from team structure, not the other way around.
- What is the maximum team size? → No enforced limit.
- Can Chairman be a team lead? → No. Chairman is above all teams.
- Can a team lead be a member of another team? → No. Lead role is exclusive.
- What if cross-team delegate target lead is in a running mission? → Queue the task as a pending message. Lead processes it on next available run.

---

## Requirements

### Data Model

**Team schema** (`teams/{id}/team.json`):
```json
{
  "id": "research-team",
  "name": "Research Team",
  "lead": "principal-investigator",
  "members": ["research-assistant"],
  "created_at": "ISO"
}
```

**Agent profile update** — add `team` field:
```json
{
  "id": "research-assistant",
  "team": "research-team",
  "reports_to": "principal-investigator"
}
```

`reports_to` is now **derived** from team structure (always = team lead), kept for backwards compatibility.

### New MCP Tool: `cross_team_delegate`

```
cross_team_delegate(
  to_team: string,          // team ID
  task: string,             // what to do
  why: string,              // why this is needed
  known: string,            // relevant context / prior work
  expected_output: string   // format or type of result expected
) → { handoff_id: string }
```

Only callable by agents who are team leads. Non-leads get an error: "Only team leads can delegate cross-team."

### Functional Requirements

- **FR-001**: Teams MUST be stored as files in `teams/{id}/team.json` (dynamic, not hardcoded)
- **FR-002**: The Agents tab MUST render a tree layout (org chart) as the primary view
- **FR-003**: Each team node MUST show: team name, lead name, member count, running status
- **FR-004**: The tree MUST update in real time via WebSocket when agent status changes
- **FR-005**: `GET /api/teams` MUST return all teams with their leads and members resolved
- **FR-006**: `POST /api/teams` MUST create a new team (name + lead required)
- **FR-007**: `PATCH /api/teams/:id` MUST allow adding/removing members and changing lead
- **FR-008**: `DELETE /api/teams/:id` MUST move members to "Unassigned", not delete agents
- **FR-009**: New MCP tool `cross_team_delegate` MUST only be callable by team leads
- **FR-010**: Cross-team handoffs MUST appear as a distinct event type in the Inbox
- **FR-011**: Hiring (manual + smart) MUST include a team assignment field
- **FR-012**: An agent with no team MUST appear in an "Unassigned" section in the org chart

---

## Success Criteria

- **SC-001**: Chairman can read the entire org structure in under 5 seconds by looking at the org chart
- **SC-002**: Adding a new team takes < 30 seconds (name + lead, confirm)
- **SC-003**: Cross-team context packet eliminates the "why are we doing this" question — the receiving lead has all information needed to start immediately
- **SC-004**: No agent is ever lost — all agents appear in org chart (tree or Unassigned)
- **SC-005**: The org chart is fully dynamic — reflects real state with no page refresh needed
