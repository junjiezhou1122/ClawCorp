# ClawCorp Constitution

## Core Principles

### I. Chairman is Passive
The Chairman (user) creates missions and answers escalations. All other work is autonomous.
No agent may ask the Chairman a question unless every other option has been exhausted.
Agents escalate up the hierarchy first — peers, then supervisor, then chairman.

### II. Agents Never Ask, They Decide
Every agent MUST make assumptions and proceed when facing ambiguity.
Questions are only allowed via the `escalate` MCP tool, and only for genuine blockers — not clarifications.
The system prompt for every agent must include "NEVER ask clarifying questions."

### III. File System is the Database
All state — missions, messages, agent profiles, memory, artifacts — lives in the local file system as JSON or Markdown.
No external databases. No cloud sync. Git is the history.
Any piece of state must be readable by a human opening the file directly.

### IV. Teams Own Their Boards
Each department (Engineering, Research Lab, Product) has its own mission board and workflow stages.
Missions belong to a team. Cross-team work is handled via delegation between agents, not by putting a mission on multiple boards.
The Chairman has a global view across all team boards.

### V. Observability Over Convenience
Every agent action must be visible in the Live Log in real time.
No silent failures. If an agent crashes, the exit code and stderr are broadcast.
Artifacts produced by agents are linked from the Inbox report, not buried in the filesystem.

### VI. Spec Before Code (NON-NEGOTIABLE)
Every new feature starts as a spec in `.specify/specs/{feature}/spec.md`.
No implementation begins without a corresponding spec that has been reviewed.
The spec defines acceptance scenarios. Done means the scenarios pass.

### VII. Simplicity
No external libraries unless unavoidable.
No abstraction layers for single-use code.
Prefer 3 clear lines over 1 clever line.
The dashboard must load instantly — no spinners on initial render.

## Agent Protocol Constraints

- Every agent profile MUST have: `id`, `title`, `department`, `driver`, `reports_to`
- `driver.type` MUST be `claude-code` for all production agents
- System prompts MUST include the three rules: never ask, escalate if blocked, report when done
- Memory files (`memory.md`) are append-only; agents write, never delete

## Governance

This constitution supersedes all other documentation when conflicts arise.
Amendments require updating this file with a rationale comment and bumping the version.
All feature specs must reference which principles they uphold or intentionally relax (with justification).

**Version**: 1.0.0 | **Ratified**: 2026-02-22
