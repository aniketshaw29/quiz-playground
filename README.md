# Quizzy ⚡

A no-login, real-time multiplayer quiz game. Create a quiz, share a code / QR code / link, and play together host-paced — like Kahoot without the accounts.

## Quick start

```bash
npm install
npm start
```

Open **http://localhost:3000**

- **Create a quiz** → you're taken to the host screen with a join code, QR code, and share link.
- **Or try a demo** → pick a seeded demo quiz from the home page and host it instantly.
- **Players** → open `/join.html` (or scan the QR) and enter the code + a nickname.

Dev mode with auto-restart: `npm run dev`

## Features

- **No login, no accounts** — anyone can build or join.
- **Share by code, QR, or link** — 6-character join code; QR encodes the join URL with the code pre-filled.
- **Host-paced gameplay** — host starts questions, reveals answers, and advances; auto-reveal when the timer ends.
- **Live scoreboard** — speed-based scoring (100–1000 points per correct answer), final standings with 🥇🥈🥉.
- **Demo quizzes** — 3 seeded quizzes (disable with `SEED=false`) so you can try it without building anything.
- **Host refresh-safe** — reloading the host page resumes the current game state.

## How to play

1. Home → **Create a quiz** (or pick a **demo**).
2. Add a title and questions (2–6 answers each, mark the correct one, set a time limit).
3. **Create quiz** → the share screen shows the join code, QR, and link. Share it.
4. Players join with a nickname. Hit **Start game** when ready.
5. Drive the game: questions auto-reveal on timeout, or click **Reveal answers** early, then **Next question**.

## Requirements

- Node.js 18+ (tested on 22)

## Scripts

| Command | Description |
| --- | --- |
| `npm start` | Run on port 3000 |
| `npm run dev` | Run with auto-restart on file changes |
| `npm test` | End-to-end game simulation (host + 2 players) on port 3999 |

Environment: `PORT` (default `3000`), `SEED` (`false` disables demo quizzes).

## Project structure

```
server.js               HTTP API + Socket.io + game logic (in-memory state)
data/seed-quizzes.js    Demo quizzes loaded at startup
scripts/smoke.js        End-to-end test
public/                 Static frontend (index, create, host, join, styles)
docs/                   product-understanding.md · tech-stack.md · architecture.md
```

## How it works (tl;dr)

- **In-memory store**: quizzes and live sessions live in `Map`s — everything resets on server restart (by design, no DB).
- **Real-time**: Socket.io rooms per session; host controls flow, players join/answer on their phones.
- **API**: `POST /api/quizzes` creates a quiz; `GET /api/quizzes` lists them.

See `docs/architecture.md` for the full event flow and state machine.

## Deploying

This is a single Node.js process — deploy anywhere that runs Node (Render, Railway, Fly.io, a VPS). Just `npm install && npm start` and set `PORT`. Because sessions are in-memory, a single instance (not load-balanced across processes) is expected; scale vertically.

## Roadmap ideas

- Persistent quizzes (SQLite) so they survive restarts
- Multimedia questions, true/false mode
- Player reconnection mid-game
- Mid-game spectating / late join
