# Plan: Implement Spec 006 — Agent Messaging

## Summary

Add a persistent messaging system where agents can send messages to peers, teams, or the whole org. Chairman sees all conversations in a new Chat tab. Future-proof for Slack bridge.

## Implementation (4 commits)

### Commit 1: Server — Channels route + message storage

**File: `server/src/routes/channels.ts`** (new)

Channel and message API with JSONL storage:

- `GET /api/channels` — list all channels with metadata (last message, message count)
- `GET /api/channels/:id/messages?limit=50&before=` — paginated messages
- `POST /api/channels/:id/messages` — post message (Chairman UI)
- `POST /api/channels/send` — agent sends message (MCP tool calls this)
- `GET /api/channels/unread/:agentId` — unread messages mentioning agent

Storage: `channels/{channelId}/messages.jsonl` (append-only, one JSON per line).

Auto-create channels:
- `#general` on first access
- Team channels from existing teams on server start
- DM channels on first direct message

Helper functions:
- `ensureChannel(id, name, type)` — create channel dir + registry entry if not exists
- `appendMessage(channelId, msg)` — append to JSONL
- `readMessages(channelId, limit, before)` — tail JSONL for recent messages
- `getUnread(agentId)` — scan channels for messages mentioning agent since last read

**File: `server/src/index.ts`** (edit)
- Mount `channelRoutes` at `/api/channels`

**File: `.gitignore`** (edit)
- Add `channels/`

### Commit 2: MCP — send_message + read_messages tools

**File: `server/src/mcp/server.ts`** (edit)

Add two new MCP tools:

1. `send_message(to, text, reply_to?)`:
   - `to` is either `"#channel-name"` or `"@agent-id"`
   - For `@agent-id`, auto-creates DM channel `dm-{sorted-pair}`
   - Calls `POST /api/channels/send` internally
   - Returns `{ messageId }`

2. `read_messages(channel?, limit?)`:
   - If channel specified, reads that channel
   - If omitted, returns unread messages across all channels mentioning this agent
   - Calls `GET /api/channels/:id/messages` or `GET /api/channels/unread/:agentId`
   - Returns formatted message list

**File: `server/src/lib/AgentRunner.ts`** (edit)

Before spawning agent, check unread count:
- Call internal `getUnreadCount(agentId)`
- If > 0, append to full prompt: `"\n\nYou have {N} unread messages. Use read_messages() to check them before starting work."`

### Commit 3: Client — Chat tab

**File: `client/src/App.tsx`** (edit)

Add `chat` as a fourth tab:

- **Channel sidebar** (left): list of channels with names, unread dots, last activity
- **Message timeline** (main area): messages for selected channel, chronological, chat-bubble style
- **Thread support**: messages with replies show "N replies" — click to expand inline
- **Message input**: textarea at bottom for Chairman to send messages to the selected channel
- **WebSocket**: handle `chat:message` and `chat:channel_created` events

State additions:
- `channels: Channel[]` — fetched from `/api/channels`
- `selectedChannel: string | null` — currently viewing
- `channelMessages: Message[]` — messages for selected channel
- `chatInput: string` — Chairman's message draft

New types:
```typescript
type Channel = {
  id: string
  name: string
  type: 'org' | 'team' | 'direct'
  lastActivity?: string
  messageCount?: number
}

type ChatMessage = {
  id: string
  channel: string
  from: string
  text: string
  replyTo: string | null
  mentions: string[]
  ts: string
}
```

### Commit 4: Auto-create team channels + polish

- On server start, scan existing teams and create `#engineering`, `#research-lab`, `#product` channels
- When a new team is created (`POST /api/teams`), auto-create its channel
- Add team channel creation to teams route

## Files to modify

| File | Action |
|---|---|
| `server/src/routes/channels.ts` | **Create** — channels + messages API |
| `server/src/index.ts` | **Edit** — mount channel routes |
| `server/src/mcp/server.ts` | **Edit** — add send_message + read_messages tools |
| `server/src/lib/AgentRunner.ts` | **Edit** — unread message prompt hint |
| `server/src/routes/teams.ts` | **Edit** — auto-create team channel on team creation |
| `client/src/App.tsx` | **Edit** — add Chat tab |
| `.gitignore` | **Edit** — add channels/ |

## Key decisions

- **JSONL storage** — append-only, no full-file rewrite on each message
- **Non-blocking** — `send_message` returns immediately, no polling
- **Open channels** — any agent can post to any channel (trust model)
- **DM auto-creation** — direct channels created on first message, sorted pair for consistency
- **Unread tracking** — simple approach: store last-read timestamp per agent per channel
- **No message editing/deletion** — messages are immutable (append-only log)
