# Product Understanding

## What we're building

**Quizzy** — a no-login, multiplayer quiz game. A host creates (or picks) a quiz, a live game session is created with a short join code, and anyone with that code — or who scans the QR code / opens the share link — can join and play on their own device in real time.

Think "Kahoot, minus the accounts."

## Core principles

| Principle | Why |
| --- | --- |
| **No login, no accounts** | The lowest-friction possible start. Anyone can build or join a quiz instantly. |
| **Share by code, QR, or link** | Players join by typing a 6-character code, scanning a QR code, or tapping a shared link (code pre-filled). |
| **Host-paced gameplay** | The host controls the flow: start, reveal, and advance to the next question. Groups play together at the same rhythm. |
| **Real-time by design** | Scores, player joins, answer counts, and reveals update live over WebSockets. |
| **Zero setup to run** | One Node.js process. No database, no auth service, no external infra. |

## Users & personas

- **Host (creator + presenter)** — builds a quiz on the computer, projects the screen, and drives the game.
- **Player** — joins on their own device (usually a phone), enters a nickname, and answers questions.
- **Demo user** — wants to try the product without building anything; picks a seeded demo quiz.

There is no admin or moderator concept — every participant is either the host or a player in a session.

## User flows

### 1. Create a quiz
1. Home → **Create a quiz**.
2. Give it a title.
3. Add questions: prompt, 2–6 answers, mark the correct one, pick a time limit (5/10/15/20/30 s).
4. **Create quiz** → the quiz is saved in memory and the host is taken to the share screen.

### 2. Share & start a session
1. A live session is created automatically for the quiz, producing a **6-character join code**.
2. The share screen shows the code big, a **QR code** that encodes the join URL (with the code pre-filled), and a copyable **link**.
3. The host watches players join live and clicks **Start game** when ready.

### 3. Play a game (host-paced)
1. Players join with code + nickname. Duplicate nicknames are rejected.
2. Host starts → question 1 appears on every device with a countdown timer.
3. Players pick an answer; the host sees a live **answered count**.
4. The question auto-reveals when the timer ends, or the host clicks **Reveal answers** early.
5. The host sees who got it right; each player sees their own result + points earned (faster = more points).
6. Host clicks **Next question** → repeat. After the last question → **final standings** with 🥇🥈🥉.
7. Host can **Play again** (scores reset, players return to the lobby).

## Game rules

- Points per correct answer: **100–1000**, scaled by speed (`100 + 900 × (1 − elapsed/timeLimit)`).
- Wrong or unanswered answers earn **0 points** and don't penalize.
- One answer per question per player; the first answer counts.
- Players can only join while the session is in the **lobby**.

## Scope & constraints

### In scope (v1)
- Quiz creation (in-memory, lost on server restart)
- Live host-paced sessions with shareable code / QR / link
- Real-time player join, answering, reveals, and leaderboard
- Host reconnect (refreshing the host page resumes the game state)
- Demo/seed quizzes for instant try-it-out
- Manual player join only while in the lobby (no mid-game join)

### Out of scope for v1 (deliberate)
- Accounts, profiles, persistent storage, user libraries
- Mid-game joining, reconnection for players
- Multimedia questions (images/audio/video), true/false-only mode
- Anti-cheat, per-room chat, private scores

## Success criteria

- A first-time user can create a quiz and have friends playing in under 2 minutes.
- Join friction is minimal: code, QR, or one tap on a link.
- A full game (join → play all questions → results) works end-to-end with multiple players.
- Host and player screens stay in sync with no reloads.
