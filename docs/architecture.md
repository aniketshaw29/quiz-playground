# Technical Architecture

## Big picture

```
                 ┌──────────────────────────────────────────────┐
                 │                  server.js                   │
                 │  ┌───────────────┐   ┌────────────────────┐  │
                 │  │  HTTP (REST)  │   │  Socket.io (realtime) │
                 │  │  /api/...     │   │  rooms + events    │  │
                 │  └──────┬────────┘   └─────────┬──────────┘  │
                 │         │                      │             │
                 │  ┌──────▼──────────────────────▼───────┐     │
                 │  │         In-memory state              │     │
                 │  │   quizzes (Map) · sessions (Map)     │     │
                 │  └──────────────────────────────────────┘     │
                 └───────────────┬──────────────────────────────┘
                                 │ static files
              ┌──────────────────┼──────────────────┐
              │                  │                  │
     ┌────────▼───────┐  ┌───────▼──────┐  ┌────────▼───────┐
     │  Host browser  │  │  Player phones │  │ Player phones  │
     │  /host.html    │  │  /join.html    │  │  /join.html    │
     └────────────────┘  └───────────────┘  └────────────────┘
```

- One Node.js process. Express serves the static frontend and REST endpoints; Socket.io handles all real-time traffic.
- The host and each player hold their own Socket.io connection. The server is the single source of truth for game state.

## State model

### Quiz (created via `POST /api/quizzes`)
```js
{
  id: 'hj1v8lz0',            // random, from genId()
  title: 'Trivia Night',
  createdAt: 1722860000000,
  questions: [
    {
      prompt: '2 + 2 = ?',
      options: ['3', '4', '5', '6'],   // 2–6 options
      correctIndex: 1,                 // index of the right answer
      timeLimit: 15,                   // seconds, from {5,10,15,20,30}
    },
  ],
}
```
Stored in `quizzes: Map<quizId, Quiz>`. Seeded demos live here too, flagged by `createdAt === 0`.

### Session (created by the host via `create-session`)
```js
{
  code: 'TZLGZR',           // 6 chars, unguessable-ish, from genCode()
  quizId: 'hj1v8lz0',
  quiz: { ... },            // snapshot of the quiz for the game
  state: 'lobby' | 'question' | 'reveal' | 'finished',
  questionIndex: 0,
  questionStartedAt: 0,     // epoch ms, used for scoring + reconnects
  timer: <Timeout>,         // auto-end timer for the current question
  hostSocket: 'socketId',   // who may control this session
  players: Map<socketId, {
    id, nickname, score,
    answer, answered, answerElapsed,
  }>,
  lastReveal, lastStandings, // cached for host reconnect replay
  qrDataUrl, joinUrl,
}
```
Stored in `sessions: Map<code, Session>` plus `quizToSession: Map<quizId, code>` (so a host re-hosting the same quiz resumes the same session).

## Networking model

Two Socket.io rooms per session:

| Room | Members | Purpose |
| --- | --- | --- |
| `game:<code>` | Players | Player-facing broadcasts (question, reveal, standings) |
| `host:<code>` | The host | Control-plane events (answered count, reveal data, state) |

Players also receive **per-socket** personalized events (`question-reveal`) so each person only learns their own result; the host gets the aggregate `reveal-data`.

### REST endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/quizzes` | List all quizzes (demos + this process's creations) |
| `POST` | `/api/quizzes` | Validate + create a quiz; returns `{ id, title, questionCount }` |
| `GET` | `/api/quizzes/:id` | Fetch quiz metadata |

### Socket events

| Event | From | Payload | Effect |
| --- | --- | --- | --- |
| `create-session` | Host | `{ quizId, origin }` | Create/resume a session; ack with `{ code, qrDataUrl, joinUrl, state, ... }` |
| `start-game` | Host | `{ code }` | Reset scores, start question 0 |
| `end-question` | Host | `{ code }` | Score + reveal (also fired by the timer) |
| `next-question` | Host | `{ code }` | Next question or finish the game |
| `play-again` | Host | `{ code }` | Reset to lobby |
| `join-game` | Player | `{ code, nickname }` | Validate + add player; ack `{ playerId, quizTitle }` |
| `submit-answer` | Player | `{ code, questionIndex, optionIndex }` | Record the player's answer once |
| `disconnect` | any | — | Drop the host or remove the player |

Server → clients broadcasts: `players-updated`, `question-start` (players) / `question-started` (host), `answered-count` (host), `question-reveal` (per player), `reveal-data` (host), `game-finished`, `game-reset`.

## Game state machine

```
        create-session
              │
              ▼
┌─────────┐  start-game   ┌────────────┐  timer or   ┌─────────┐  next-question
│  lobby  │──────────────▶│  question  │─────end────▶│ reveal  │───────────────┐
└─────────┘               └────────────┘             └─────────┘               │
   ▲                          │                          │                     │
   │ play-again               ▼ last question            │ more questions      │
   │                       ┌─────────────────────┐       └─────────────────────┘
   └───────────────────────│     finished        │
                           └─────────────────────┘
```

- **question** → answers are accepted; host sees live `answered-count`; a `setTimeout` auto-ends the question at `timeLimit` (host can `end-question` early — a guard makes this idempotent).
- **reveal** → scores are computed once (see scoring), cached in `lastReveal`, personalized events sent to players, aggregate to host.
- **next-question** after the last reveal → **finished** (standings broadcast).

## Scoring

For each question, per player:
```
if answered && answer === correctIndex:
    points = round(100 + 900 × (1 − min(answerElapsed, timeLimitMs) / timeLimitMs))
else:
    points = 0
score += points
```
`answerElapsed` is measured server-side from `questionStartedAt` at the moment `submit-answer` lands — clients can't cheat the clock. Instant correct answers score 1000; correct answers at the buzzer score 100; wrong answers score 0.

## Validation

All untrusted input is trimmed, length-capped, and shape-checked before it touches state:
- Quiz title ≤ 120 chars; 1–60 questions; prompt ≤ 300 chars.
- 2–6 options per question, each ≤ 80 chars; `correctIndex` must be in range; `timeLimit` from a fixed allow-list.
- Nickname ≤ 20 chars, no duplicates (case-insensitive) within a session.
- Join code must match an existing session; joining is blocked once `state !== 'lobby'`.
- A player's identity is always their `socket.id` — the server ignores client-supplied ids.

## Reconnection & resilience

- **Host refresh**: re-emitting `create-session` with the same `quizId` returns the existing session and re-binds `hostSocket`. The server replays the current state (`question-started` / `reveal-data` / `game-finished`) plus the answered count so the host screen re-syncs without a reload.
- **Player disconnect**: the player is removed from `session.players` and `players-updated` is broadcast; rejoin requires a fresh lobby.
- **Server restart**: all state is lost by design (in-memory); clients get clear "not found" errors and can start over.

## Security notes (v1 posture)

- No secrets, no PII, no auth — sessions are "join by code" only.
- The join code is 6 characters from a 32-char alphabet (≈1.1 billion combinations) — enough to deter guessing for a party app, not a security boundary.
- Input is validated server-side; the client is never trusted for correctness, identity, or scoring.

## Testing strategy

`npm test` runs `scripts/smoke.js`, which:
1. Requires `server.js` on a dedicated port (3999).
2. Creates a quiz via REST, lists it, and verifies demos are seeded.
3. Opens a host socket → `create-session`; asserts code length, QR data URL, and join URL.
4. Joins two player sockets, checks duplicate-nickname rejection, and that the host saw `players-updated`.
5. Plays two full questions (start → answer → reveal → next), asserting scoring correctness and final standings.
6. Verifies `play-again` returns everyone to the lobby.
