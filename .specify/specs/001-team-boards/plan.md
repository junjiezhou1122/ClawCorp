# Implementation Plan: Team Boards

**Branch**: `001-team-boards` | **Date**: 2026-02-22 | **Spec**: `spec.md`

## Summary

Add a `team` field to missions and render a separate Kanban board per team, each with team-specific stages. A top-level team selector switches between boards. An "All Teams" view aggregates across all teams.

## Technical Context

**Language/Version**: TypeScript (Bun + React)
**Primary Dependencies**: Hono (server), React + Tailwind (client) — no new deps
**Storage**: File system — `missions/{id}/state.json` gains `team` field
**Target Platform**: Local dashboard (localhost)
**Constraints**: Board switch must be client-side only (no extra fetch), < 100ms

## Team & Stage Configuration

Defined as a constant in the client (no server config needed):

```typescript
const TEAMS = {
  engineering: {
    name: 'Engineering',
    department: 'Engineering',
    stages: ['backlog','analysis','design','development','testing','done'],
    stageLabels: { backlog:'Backlog', analysis:'Analysis', design:'Design', development:'Build', testing:'QA', done:'Done' }
  },
  research: {
    name: 'Research Lab',
    department: 'Research Lab',
    stages: ['hypothesis','literature','experiment','analysis','paper','done'],
    stageLabels: { hypothesis:'Hypothesis', literature:'Literature', experiment:'Experiment', analysis:'Analysis', paper:'Paper', done:'Done' }
  },
  product: {
    name: 'Product',
    department: 'Product',
    stages: ['backlog','discovery','spec','validation','done'],
    stageLabels: { backlog:'Backlog', discovery:'Discovery', spec:'Spec', validation:'Validation', done:'Done' }
  }
}
```

## Changes Required

### Server

1. **`POST /api/missions`** — accept `team` field (default: `"engineering"`)
2. **`PATCH /api/missions/:id`** — accept `team` field in updates
3. **`missions/{id}/state.json`** — add `team: string` to schema
4. **Migration**: existing missions with no `team` → default `"engineering"` at read time (in GET handler, not file mutation)

### Client (`App.tsx`)

1. Add `team` field to `Mission` type
2. Add `selectedTeam: 'engineering' | 'research' | 'product' | 'all'` state (default `'engineering'`)
3. Replace hardcoded `STAGES` constant with `TEAMS[selectedTeam].stages` lookup
4. Board tab header: team selector tabs above the Kanban grid
5. `missionsByStage` filter: add `m.team === selectedTeam` condition (skip when `'all'`)
6. "All Teams" view: group missions by team, flat list layout (not kanban columns)
7. New Mission form: add hidden `team` field = `selectedTeam` when creating
8. Run modal: sort agents so `agent.department === TEAMS[selectedTeam].department` comes first

## Project Structure

```
server/src/routes/missions.ts    # +team field on create/patch, +default on read
client/src/App.tsx               # team selector, dynamic stages, all-teams view
```

No new files needed.

## Complexity Notes

None. This is a client-side filter + one new field on mission state. No architectural changes.
