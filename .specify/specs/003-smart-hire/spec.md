# Feature Specification: Smart Hire

**Feature Branch**: `003-smart-hire`
**Created**: 2026-02-22
**Status**: Draft
**Authors**: Chairman + Claude

---

## Context

Currently, hiring an agent requires the Chairman to manually fill in a form: ID, title, department, description, reports_to, system_prompt. This is friction. The Chairman knows *what they need*, not how to write a perfect agent profile.

This spec defines a **Smart Hire** flow: the Chairman describes a need in plain language, and the system autonomously generates candidate agents, tests them against a sample task, evaluates their performance, and hires the best one — or presents the top candidates for final Chairman approval.

**The analogy is real hiring:** post a job description → receive applicants → run interviews → extend offer.

```
Chairman: "I need someone who can write SQL queries and optimize slow database queries"
    ↓
System generates 3 candidates (different specializations, prompting styles, tool sets)
    ↓
Each candidate runs a standardized test task in an isolated sandbox
    ↓
Results scored on: task completion, output quality, conciseness, no hallucination
    ↓
Top candidate auto-hired (or Chairman picks from ranked shortlist)
```

---

## User Scenarios & Testing

### User Story 1 — Describe a need, get a hired agent (Priority: P1)

As Chairman, I want to type "I need a data scientist who specializes in time series forecasting" and have the system automatically hire a suitable agent without me writing any JSON.

**Why this priority**: This is the entire feature — natural language in, hired agent out.

**Independent Test**: Enter a description. Wait for the process to complete. A new agent card appears in the Agents tab with a sensible profile that matches the description.

**Acceptance Scenarios**:

1. **Given** I type "I need an agent to review pull requests and find security vulnerabilities", **When** I submit, **Then** within a few minutes a new agent appears in the Agents tab with a relevant title, department, and system prompt tailored to security review
2. **Given** the hire process completes, **When** I view the new agent's profile, **Then** the system_prompt contains specific, relevant instructions (not just generic "you are an assistant")
3. **Given** I describe a research role, **When** the agent is hired, **Then** `reports_to` is set to `principal-investigator` and `department` is `Research Lab` (correct hierarchy inferred)
4. **Given** I describe an engineering role, **When** hired, **Then** it is placed under the correct engineering supervisor

---

### User Story 2 — Watch the interview process live (Priority: P1)

As Chairman, I want to watch the candidate generation and interview process happen in real time — seeing which candidates were generated, what test task they ran, and how they scored.

**Why this priority**: Transparency. The Chairman needs to trust the hiring decision. A black box is not acceptable.

**Independent Test**: Start a smart hire. The Live Log shows: candidates generated → test task dispatched → outputs received → scores computed → winner selected.

**Acceptance Scenarios**:

1. **Given** a smart hire is running, **When** I look at the Live Log, **Then** I see events: `[hire] Generating 3 candidates...`, `[hire] Running interview for candidate-1...`, `[hire] Scores: 8.5 / 7.2 / 9.1`, `[hire] Hired: candidate-3`
2. **Given** the interview for a candidate fails (process crashes), **When** I look at the Live Log, **Then** I see `[hire] candidate-2 failed interview (exit 1)` and the process continues with remaining candidates
3. **Given** all candidates fail the interview, **When** the process ends, **Then** I see an error message and no agent is hired

---

### User Story 3 — Review and approve before hiring (Priority: P2)

As Chairman, I want the option to review the top candidate's profile and test output before confirming the hire — rather than fully automatic hiring.

**Why this priority**: For important roles, the Chairman may want human sign-off before a new agent joins the organization.

**Independent Test**: Enable "Review before hire" toggle. After interviews complete, a modal shows the top candidate's profile + test output. Chairman clicks "Hire" or "Reject and retry".

**Acceptance Scenarios**:

1. **Given** "Review before hire" is enabled, **When** interviews complete, **Then** a modal appears showing: candidate profile, test task given, test output, score breakdown
2. **Given** I review the candidate and click "Hire", **Then** the agent is created and appears in the Agents tab
3. **Given** I review and click "Reject — try again", **Then** the system generates a new batch of candidates and runs new interviews
4. **Given** "Review before hire" is disabled (default), **Then** the top-scoring candidate is hired automatically with no modal

---

### User Story 4 — View interview history (Priority: P3)

As Chairman, I want to see past hiring decisions: who was hired, what candidates were rejected, and their scores — so I can learn what makes a good agent profile.

**Why this priority**: Institutional knowledge. Over time, the Chairman can see patterns in what works.

**Independent Test**: Open the Agents tab. Click on a hired agent. See an "Interview Record" section with candidate scores and the winning profile.

**Acceptance Scenarios**:

1. **Given** an agent was hired via Smart Hire, **When** I view their profile, **Then** I see an "Interview Record" section showing: date, description used, number of candidates, scores, why this one won
2. **Given** I click "Show rejected candidates", **Then** I see the profiles and scores of agents that lost the interview

---

### Edge Cases

- What if the description is too vague ("I need help")? → System asks one clarifying question before generating candidates: "What kind of work? (engineering / research / product / other)"
- What if two candidates score exactly the same? → Pick the one with the shorter, simpler system prompt (Occam's razor — simpler prompts tend to be more reliable)
- What if the Chairman describes a role that already exists? → Warn: "You already have a Senior Engineer. Hire anyway?" (duplicate detection by title similarity)
- What is the test task? → A standardized task per department. Engineering: "Write a function to reverse a linked list". Research: "Summarize this abstract in 3 bullet points". Product: "Write 3 acceptance criteria for a login feature". The test is always the same for a given department so scores are comparable.
- How long does the interview take? → Each candidate gets a 60-second timeout. Total: ~3 minutes for 3 candidates (run in parallel).
- Can the Chairman define a custom test task? → Not in v1. Standardized tests only.

---

## Requirements

### Functional Requirements

- **FR-001**: A "Smart Hire" button MUST be accessible from the Agents tab
- **FR-002**: The input MUST accept a free-text natural language description (no form fields)
- **FR-003**: The system MUST generate exactly 3 candidate profiles per hire request
- **FR-004**: Each candidate MUST receive the same standardized test task for their inferred department
- **FR-005**: Candidates MUST run in parallel (not sequentially) to minimize wait time
- **FR-006**: Each candidate run MUST be time-bounded (default: 60 seconds timeout)
- **FR-007**: Scoring MUST be done by an LLM evaluator (not regex/heuristics) using a fixed rubric
- **FR-008**: The winning candidate MUST be automatically hired via the existing `POST /api/hire` route
- **FR-009**: Interview events MUST be broadcast via WebSocket and appear in the Live Log
- **FR-010**: Interview results (profiles, scores, test outputs) MUST be stored in `archive/interviews/{id}.json`

### Scoring Rubric (for LLM evaluator)

Each candidate is scored 0–10 on four dimensions:

| Dimension | Weight | Description |
|---|---|---|
| Task Completion | 40% | Did it actually do what was asked? |
| Output Quality | 30% | Is the output correct, precise, useful? |
| Autonomy | 20% | Did it make decisions without asking questions? |
| Conciseness | 10% | Did it avoid unnecessary verbosity? |

Final score = weighted average. Tiebreak: simpler system prompt wins.

### Candidate Generation Prompt (meta-prompt sent to Claude)

```
You are a hiring manager at ClawCorp, an autonomous AI organization.

The Chairman needs: "{description}"

Generate 3 distinct agent profiles in JSON array format. Each should have:
- A different specialization angle or prompting strategy
- A system_prompt that is specific, actionable, and includes the 3 mandatory rules:
  1. Never ask clarifying questions
  2. Use escalate tool if blocked
  3. Use report tool when done

Infer the correct department and reports_to from the description.
Return only a JSON array, no explanation.
```

### Standardized Test Tasks (per department)

```
Engineering:   "Write a TypeScript function isPalindrome(s: string): boolean with 3 test cases"
Research Lab:  "List 5 open research questions in the field of: {topic inferred from description}"
Product:       "Write 3 Given/When/Then acceptance scenarios for a user login feature"
```

---

## Success Criteria

- **SC-001**: Chairman can go from description to hired agent in under 5 minutes
- **SC-002**: The hired agent's system_prompt is more specific and relevant than what a human would write in a hire form
- **SC-003**: All 3 candidates run in parallel — total interview time ≤ 3× single candidate time
- **SC-004**: The Chairman can always see what happened (no black box) via Live Log
- **SC-005**: Rejected candidates are archived, not lost — available for review
