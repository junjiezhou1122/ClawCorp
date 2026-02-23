# Feature Specification: Agent Messaging — Direct Communication & Chat History

**Feature Branch**: `006-agent-messaging`
**Created**: 2026-02-22
**Status**: Draft
**Authors**: Chairman + Claude

---

## Context

### The Problem

Today, ClawCorp agents can only communicate through **formal MCP tools**:

| Tool | Direction | Use Case |
|---|---|---|
| `escalate` | Up (to supervisor) | Blocking question, waits for answer |
| `report` | Up (to supervisor) | Task completion notification |
| `delegate` | Down (to subordinate) | Assigns work, spawns sub-mission |
| `cross_team_delegate` | Lateral (director→director) | Cross-department task handoff |

This is **command-and-control**, not **communication**. Every interaction is either "I'm blocked, help" or "I'm done, here's what I did" or "Go do this."

What's missing is the **everyday workplace conversation** — the kind that happens in Slack, Teams, or walking over to someone's desk:

- "Hey, I noticed the auth module uses bcrypt — was there a reason you didn't pick argon2?"
- "FYI: I refactored the database schema, your migration scripts might need updating"
- "Quick question — what format does your API return dates in?"
- "Can you review this approach before I implement it?"

These aren't escalations (not blocked), reports (not done), or delegations (not assigning work). They're **peer conversations** — the glue of any functioning organization.

### The Vision

Replace the rigid MCP-tool-only communication with a **messaging system**:

1. **Any agent can message any agent** — not just up/down the chain
2. **Messages are persistent** — stored in a shared channel-like structure, browsable by Chairman
3. **No blocking** — unlike `escalate` which polls for 10 minutes, messages are fire-and-forget. The recipient reads them on their next run.
4. **Thread support** — reply to a specific message, creating a conversation thread
5. **Chairman can see everything** — all inter-agent communication is transparent, browsable, searchable
6. **Future-proof for Slack integration** — the data model mirrors Slack's channel/thread structure so we can bridge to Slack later

### Analogy

Think of it like an internal company Slack:

```
#general            → org-wide announcements
#engineering        → engineering team channel
#research-lab       → research team channel
@senior-engineer    → direct messages to a specific agent
```

Agents post messages. Other agents read them on their next run. Chairman watches everything in real time from the Control Panel.

---

## Architecture

### Channels

A **channel** is a named conversation stream. Three types:

| Type | Naming | Who can read/write | Example |
|---|---|---|---|
| `org` | `#general` | All agents + Chairman | Org-wide announcements |
| `team` | `#engineering`, `#research-lab` | Team members + Chairman | Team discussions |
| `direct` | `@senior-engineer:qa-engineer` | The two agents + Chairman | 1:1 conversations |

Channels are created automatically:
- `#general` exists by default
- `#engineering`, `#research-lab`, `#product` created when teams exist
- Direct channels created on first message between two agents

### Messages

```json
{
  "id": "CM-1740200000000-1",
  "channel": "#engineering",
  "from": "senior-engineer",
  "text": "Heads up: I refactored the auth module to use JWT. If your code imports from auth/session.ts, it's now auth/jwt.ts",
  "replyTo": null,
  "mentions": ["qa-engineer", "intern"],
  "ts": "2026-02-22T10:15:00Z"
}
```

Replies form threads:
```json
{
  "id": "CM-1740200000001-2",
  "channel": "#engineering",
  "from": "qa-engineer",
  "text": "Got it — I'll update my test imports. Do the function signatures stay the same?",
  "replyTo": "CM-1740200000000-1",
  "mentions": ["senior-engineer"],
  "ts": "2026-02-22T10:15:30Z"
}
```

### Storage

```
channels/
├── _channels.json          ← channel registry
├── general/
│   └── messages.jsonl      ← append-only log (one JSON per line)
├── engineering/
│   └── messages.jsonl
├── research-lab/
│   └── messages.jsonl
└── dm-senior-engineer-qa-engineer/
    └── messages.jsonl
```

Using **JSONL** (one JSON object per line) for channels because:
- Append-only (no rewrite on every message)
- Efficiently tail-able for recent messages
- Each line is a self-contained message

### Agent Interface — `send_message` MCP Tool

Agents get a new, simple MCP tool:

```
send_message(
  to: string,        // channel "#engineering" or agent "@qa-engineer"
  text: string,       // message content (markdown ok)
  reply_to?: string   // optional message ID to thread on
) → { messageId: string }
```

This replaces **nothing** — escalate/report/delegate stay as they are for their specific workflows. `send_message` is for everything else.

### Agent Interface — `read_messages` MCP Tool

```
read_messages(
  channel?: string,    // "#engineering" or "@architect" — omit for all unread
  limit?: number       // default 20
) → { messages: Message[] }
```

Returns recent messages in a channel, or all unread messages across channels mentioning this agent.

### How Agents Discover Messages

On each agent run, the system prompt is augmented with:

```
You have {N} unread messages. Use read_messages() to check them before starting work.
```

This is a **hint, not a mandate**. Agents can ignore it if their task is urgent. But it encourages agents to stay aware of organizational context.

---

## User Scenarios & Testing

### User Story 1 — Agent sends a message to a peer (Priority: P1)

As an agent, I want to send a message to another agent — not as an escalation or delegation, but as a simple FYI, question, or coordination note.

**Independent Test**: senior-engineer calls `send_message(to: "@qa-engineer", text: "I'm about to refactor the test helpers, hold off on writing new tests")`. Message appears in the direct channel and in the Control Panel.

**Acceptance Scenarios**:

1. **Given** senior-engineer sends a message to @qa-engineer, **When** qa-engineer runs next, **Then** qa-engineer can call `read_messages()` and see the message
2. **Given** a message is sent, **When** Chairman views the inbox, **Then** the message appears in the chat log with sender, recipient, timestamp
3. **Given** a message has `mentions: ["intern"]`, **When** intern runs, **Then** intern sees the message in their unread list

---

### User Story 2 — Team channel discussions (Priority: P1)

As an agent, I want to post a message to my team's channel so all teammates are informed.

**Independent Test**: architect posts to `#engineering`: "Architecture review: I'm moving to a monorepo structure. See /docs/adr-005.md". All engineering team members can read it.

**Acceptance Scenarios**:

1. **Given** architect posts to #engineering, **When** any engineering agent calls `read_messages(channel: "#engineering")`, **Then** they see the message
2. **Given** a message is posted to #engineering, **When** Chairman views the channel, **Then** the message is visible with full context
3. **Given** research-assistant tries to post to #engineering, **When** they're not in the Engineering team, **Then** they still can post (channels are open by default — trust the agents)

---

### User Story 3 — Chairman browses all conversations (Priority: P1)

As Chairman, I want to browse all inter-agent communication — see what agents are discussing, who's talking to whom, what decisions are being made informally.

**Independent Test**: Open a "Chat" tab in Control Panel. See a list of channels. Click a channel to see its messages as a chat timeline. Click a thread to see the replies.

**Acceptance Scenarios**:

1. **Given** 3 channels have messages, **When** I open the Chat tab, **Then** I see all channels listed with message counts and last activity time
2. **Given** I click #engineering, **When** the channel opens, **Then** I see messages in chronological order, each showing: sender avatar, name, timestamp, text
3. **Given** a message has replies (thread), **When** I click "N replies", **Then** the thread expands inline showing all replies

---

### User Story 4 — Message threads for focused discussions (Priority: P2)

As an agent, I want to reply to a specific message (creating a thread) to keep discussions organized.

**Acceptance Scenarios**:

1. **Given** qa-engineer reads a message from senior-engineer, **When** qa-engineer calls `send_message(to: "#engineering", text: "...", reply_to: "CM-xxx")`, **Then** the reply is linked to the original message as a thread
2. **Given** a message has 3 replies, **When** Chairman views the channel, **Then** the original message shows "3 replies" and the thread is collapsible

---

### User Story 5 — Chairman sends messages to agents (Priority: P2)

As Chairman, I want to send a message to an agent or a channel — to give context, instructions, or feedback outside of formal missions.

**Acceptance Scenarios**:

1. **Given** I type a message in #general from the UI, **When** I send it, **Then** it appears in the channel as from "chairman"
2. **Given** I DM @senior-engineer, **When** senior-engineer runs next, **Then** the message appears in their unread

---

### User Story 6 — Slack bridge (Priority: P3, future)

As Chairman, I want agent messages to be mirrored to a real Slack workspace — so I can read agent conversations on my phone and reply from Slack.

**Acceptance Scenarios**:

1. **Given** Slack integration is configured, **When** an agent posts to #engineering, **Then** the message appears in the linked Slack channel
2. **Given** I reply in Slack, **When** the agent runs next, **Then** it sees my Slack reply as a regular message

---

### Edge Cases

- What if an agent sends a message during a mission and the mission fails? → Message is still stored. Messages are independent of mission lifecycle.
- What if two agents message each other simultaneously? → No conflict — JSONL is append-only, timestamps resolve ordering.
- Should agents be required to read messages before working? → No. The prompt hint is advisory. Some tasks are urgent and shouldn't block on catching up.
- Can agents send messages when not running a mission? → No. Agents only exist when spawned by AgentRunner. Messages are sent during active runs.
- Message size limit? → 4000 characters per message (roughly 1 Slack message). Longer content should be written to a file and linked.
- Rate limiting? → No explicit limit. If an agent spams, it wastes its own tokens. The Chairman can see it in logs.
- Do channels need to be created explicitly? → Team channels auto-created from teams. DM channels auto-created on first message. `#general` always exists.

---

## Requirements

### Data Model

**Channel registry** (`channels/_channels.json`):
```json
{
  "channels": [
    { "id": "general", "name": "#general", "type": "org", "created_at": "..." },
    { "id": "engineering", "name": "#engineering", "type": "team", "teamId": "engineering", "created_at": "..." },
    { "id": "dm-senior-engineer-qa-engineer", "name": "@senior-engineer ↔ @qa-engineer", "type": "direct", "participants": ["senior-engineer", "qa-engineer"], "created_at": "..." }
  ]
}
```

**Message** (one line in `channels/{channelId}/messages.jsonl`):
```json
{"id":"CM-1740200000000-1","channel":"engineering","from":"architect","text":"...","replyTo":null,"mentions":[],"ts":"2026-02-22T10:15:00Z"}
```

### Server Changes

**`server/src/routes/channels.ts`** (new) — Channel & message API:
- `GET /api/channels` → list all channels with metadata (message count, last activity)
- `GET /api/channels/:id/messages?limit=50&before=` → paginated messages for a channel
- `POST /api/channels/:id/messages` → post a message (from Chairman UI)
- `POST /api/channels/send` → agent sends a message (called by MCP tool)
- `GET /api/channels/unread/:agentId` → get unread messages mentioning an agent

**`server/src/mcp/server.ts`** (edit) — add agent tools:
- `send_message` tool — posts to a channel or DM
- `read_messages` tool — reads recent or unread messages

**`server/src/lib/AgentRunner.ts`** (edit) — unread message hint:
- Before spawning agent, count unread messages for this agent
- If > 0, append to system prompt: `"You have {N} unread messages. Use read_messages() to check them."`

### Client Changes

**`client/src/App.tsx`** (edit) — add Chat tab:
- New `chat` tab alongside tasks, inbox, agents
- Left sidebar: channel list with unread indicators
- Main area: message timeline for selected channel
- Thread expansion (click "N replies" to expand)
- Message input at bottom for Chairman to send messages
- WebSocket handlers for `chat:message` events

### WebSocket Events

- `chat:message` → `{ channel, message }` — real-time message delivery
- `chat:channel_created` → `{ channel }` — new channel appeared

### New Files

| File | Purpose |
|---|---|
| `server/src/routes/channels.ts` | Channel & message REST API |
| `channels/_channels.json` | Channel registry (auto-created) |
| `channels/{id}/messages.jsonl` | Append-only message log per channel |

### .gitignore

Add `channels/` to .gitignore (runtime data).

---

## Implementation Strategy

### Phase 1 — Server infrastructure (P1)
1. Create channel data model and storage (JSONL)
2. Implement channels route with CRUD + message posting
3. Auto-create team channels from existing teams
4. Auto-create `#general` on first access

### Phase 2 — Agent MCP tools (P1)
1. Add `send_message` and `read_messages` MCP tools
2. Add unread message hint to AgentRunner prompt injection
3. Test with manual agent runs

### Phase 3 — Client Chat tab (P1)
1. Add Chat tab with channel list sidebar
2. Message timeline view with sender, timestamp, text
3. Thread collapse/expand
4. Chairman message input
5. Real-time updates via WebSocket

### Phase 4 — Slack bridge (P3, future)
1. Slack app integration (OAuth)
2. Channel mapping: ClawCorp channel ↔ Slack channel
3. Bidirectional message sync
4. Slack reply → ClawCorp message

---

## Relationship to Existing Systems

### What stays the same

| System | Role | Still Used For |
|---|---|---|
| `escalate` MCP tool | Blocking question to supervisor | Agent is stuck, needs answer before continuing |
| `report` MCP tool | Task completion report | Agent finishes mission, sends summary |
| `delegate` MCP tool | Assign work to subordinate | Manager spawns sub-mission for subordinate |
| Inbox tab | Chairman answers escalations | Viewing and responding to escalations |

### What `send_message` adds

| Use Case | Before (workaround) | After |
|---|---|---|
| FYI to teammate | No mechanism (lost context) | `send_message(to: "@qa-engineer", text: "...")` |
| Team announcement | No mechanism | `send_message(to: "#engineering", text: "...")` |
| Ask peer a question | `escalate` (wrong semantics, blocks agent) | `send_message` (non-blocking, no hierarchy required) |
| Coordinate on shared work | Rely on mission descriptions | Real-time channel discussion |
| Chairman gives informal feedback | Create a new mission (overkill) | DM or channel message |

### Future: Slack Bridge Architecture (P3)

```
Agent calls send_message("#engineering", "Refactored auth module")
    ↓
ClawCorp channels route saves message
    ↓
If Slack bridge enabled:
    ↓
POST to Slack API → message appears in #clawcorp-engineering
    ↓
Someone replies in Slack
    ↓
Slack Event API webhook → ClawCorp channels route
    ↓
Message saved with from: "slack:username"
    ↓
Agent reads it on next run via read_messages()
```

---

## Success Criteria

- **SC-001**: Agents can send and read messages to/from any agent or channel
- **SC-002**: Chairman can browse all channels and read all conversations
- **SC-003**: Messages persist across server restarts and agent runs
- **SC-004**: Unread message count is shown to agents on their next run
- **SC-005**: Thread replies are visually grouped in the UI
- **SC-006**: Chat tab loads within 1 second with 500+ messages across channels
- **SC-007**: Data model is compatible with future Slack bridge integration
