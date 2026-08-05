# Tech Stack

A deliberately small, boring, single-process stack — the whole app is one Node.js server serving static files plus a WebSocket layer.

## Stack overview

| Layer | Technology | Why |
| --- | --- | --- |
| Runtime | **Node.js ≥ 18** (tested on 22) | Built-in `fetch`, `--watch` for dev, zero build tooling. |
| Web server | **Express 4** | Minimal routing + static file serving; the de-facto standard. |
| Real-time layer | **Socket.io 4** | Rooms, broadcasting, and request/ack (callback) semantics that fit the host/player model perfectly. |
| QR generation | **qrcode** (server-side) | Generates the join-link QR as a data URL at session creation — no client library needed. |
| Frontend | **Vanilla HTML/CSS/JS** | No framework, no build step. Pages are separate HTML files; Socket.io client served by the server. |
| Storage | **In-memory Maps** | No database. All data lives in `Map` structures and resets on restart. |
| Fonts | **Google Fonts (Nunito)** | Playful rounded look; graceful fallback to system fonts offline. |
| Testing | **Node's built-in test runner style** | A standalone `scripts/smoke.js` drives a real server + real sockets with `socket.io-client` + `assert`. |

## Why these choices

- **Socket.io over raw WebSockets** — automatic reconnection, rooms (`io.to(room)`), and **ack callbacks** (`socket.emit(event, data, cb)`). Acks let the client wait for server-side validation (e.g., "nickname taken") instead of hand-rolling request/response on top of messages.
- **In-memory storage** — this is a playground/party app. There is no durable user data; a DB would add setup and ops cost with no product value at this stage. The tradeoff is explicit: restarting the server clears quizzes and sessions.
- **Vanilla frontend** — three small independent pages (`home`, `create`, `host`, `join`) with their own JS files. No bundler keeps startup instant and the code readable. This is the right call until the UI grows beyond ~4 screens.

## Dependencies (runtime)

| Package | Purpose |
| --- | --- |
| `express` | HTTP routes + static assets |
| `socket.io` | WebSocket server (and serves `/socket.io/socket.io.js`) |
| `qrcode` | QR code data URL for the share screen |

## Dependencies (dev)

| Package | Purpose |
| --- | --- |
| `socket.io-client` | Used by the smoke test to simulate players/host |

## Directory layout

```
quiz-playground/
├── server.js               # HTTP API + Socket.io + in-memory stores + game logic
├── data/
│   └── seed-quizzes.js     # Demo quizzes loaded at startup (SEED=false disables)
├── scripts/
│   └── smoke.js            # End-to-end test (npm test)
├── public/
│   ├── index.html          # Landing: create / join / demo picker
│   ├── create.html         # Quiz builder
│   ├── host.html           # Share QR/code → lobby → questions → results
│   ├── join.html           # Player join → play
│   ├── styles.css          # Shared design system
│   └── js/                 # home.js, create.js, host.js, join.js
└── docs/                   # Product / architecture docs
```

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP + WebSocket port |
| `SEED` | `true` | Set to `false` to skip loading demo quizzes |

## Scripts

| Command | What it does |
| --- | --- |
| `npm start` | Run the server on port 3000 |
| `npm run dev` | Run with `node --watch` (auto-restart on changes) |
| `npm test` | Start a server on :3999 and run the end-to-end game simulation |

## Future-proofing notes

- If persistence is ever needed, the two `Map` stores in `server.js` are the only place to swap in a DB.
- If the UI grows, the pages are already structured so each can become a framework component without touching server logic.
- Socket.io supports scaling via the Redis adapter if we ever run multiple instances — no client changes required.
