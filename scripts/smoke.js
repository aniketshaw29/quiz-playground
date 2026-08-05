// End-to-end smoke test: spins up the server on port 3999 and simulates
// a host + two players playing a full game over real sockets.
process.env.PORT = '3999';
process.env.SEED = 'true';

const assert = require('assert');
const BASE = 'http://localhost:3999';

// Requiring the server starts it listening on PORT.
require('../server');

const { io } = require('socket.io-client');

function waitUntil(socket, event, predicate, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeoutMs);
    const onEvent = (data) => {
      if (predicate(data)) {
        clearTimeout(t);
        socket.off(event, onEvent);
        resolve(data);
      }
    };
    socket.on(event, onEvent);
  });
}

const waitEvent = (socket, event) => waitUntil(socket, event, () => true);

function emitAck(socket, event, payload) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout ack ${event}`)), 5000);
    socket.emit(event, payload, (res) => {
      clearTimeout(t);
      resolve(res);
    });
  });
}

async function main() {
  await new Promise((r) => setTimeout(r, 300));

  // 1. Create a quiz via HTTP API
  let res = await fetch(`${BASE}/api/quizzes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Smoke Quiz',
      questions: [
        { prompt: '2 + 2 = ?', options: ['3', '4', '5', '6'], correctIndex: 1, timeLimit: 5 },
        { prompt: 'Capital of France?', options: ['Berlin', 'Madrid', 'Paris', 'Rome'], correctIndex: 2, timeLimit: 5 },
      ],
    }),
  });
  const created = await res.json();
  assert.equal(res.status, 200, 'create quiz failed: ' + JSON.stringify(created));
  console.log('✔ POST /api/quizzes ->', created.id);

  // 2. List endpoint includes seeded demos
  res = await fetch(`${BASE}/api/quizzes`);
  const list = await res.json();
  assert(list.quizzes.some((q) => q.demo), 'demos missing from list');
  console.log(`✔ GET /api/quizzes (${list.quizzes.length} quizzes, demos present)`);

  // 3. Host creates a session
  const host = io(BASE, { transports: ['websocket'] });
  await new Promise((r) => host.on('connect', r));
  const cr = await emitAck(host, 'create-session', { quizId: created.id, origin: BASE });
  assert(cr.ok, 'create-session failed: ' + JSON.stringify(cr));
  const code = cr.code;
  assert.equal(cr.code.length, 6, 'bad code length');
  assert(cr.qrDataUrl && cr.qrDataUrl.startsWith('data:image/png'), 'QR missing');
  assert(cr.joinUrl.includes('join.html?code=' + code), 'bad joinUrl: ' + cr.joinUrl);
  console.log('✔ create-session ->', code, '| QR generated | joinUrl ok');

  // 4. Players join; duplicate nickname rejected
  const hostPlayersUpdate = waitUntil(host, 'players-updated', (d) => d.players.length === 2);
  const alice = io(BASE, { transports: ['websocket'] });
  const bob = io(BASE, { transports: ['websocket'] });
  await Promise.all([
    new Promise((r) => alice.on('connect', r)),
    new Promise((r) => bob.on('connect', r)),
  ]);
  const jA = await emitAck(alice, 'join-game', { code, nickname: 'Alice' });
  const jB = await emitAck(bob, 'join-game', { code, nickname: 'Bob' });
  assert(jA.ok, 'alice join failed: ' + JSON.stringify(jA));
  assert(jB.ok, 'bob join failed: ' + JSON.stringify(jB));
  const dup = await emitAck(bob, 'join-game', { code, nickname: 'alice' });
  assert(!dup.ok, 'duplicate nickname should fail');
  await hostPlayersUpdate;
  console.log('✔ players joined (Alice, Bob); duplicate nickname rejected; host notified');

  // 5. Start game -> question 1
  const q1Promise = waitEvent(alice, 'question-start');
  assert((await emitAck(host, 'start-game', { code })).ok);
  const q1 = await q1Promise;
  assert.equal(q1.prompt, '2 + 2 = ?');
  console.log('✔ question 1 started');

  // 6. Both answer; host sees count
  const countPromise = waitUntil(host, 'answered-count', (d) => d.answered === 2);
  assert((await emitAck(alice, 'submit-answer', { code, questionIndex: 0, optionIndex: 1 })).ok);
  assert((await emitAck(bob, 'submit-answer', { code, questionIndex: 0, optionIndex: 0 })).ok);
  await countPromise;
  console.log('✔ answers submitted; host saw 2/2');

  // 7. Reveal: Alice correct, Bob wrong
  const revAPromise = waitEvent(alice, 'question-reveal');
  const revBPromise = waitEvent(bob, 'question-reveal');
  const revHostPromise = waitEvent(host, 'reveal-data');
  assert((await emitAck(host, 'end-question', { code })).ok);
  const revA = await revAPromise;
  const revB = await revBPromise;
  assert(revA.correct && !revB.correct, 'correctness mismatch');
  assert(revA.points > 0 && revA.points <= 1000, 'points out of range: ' + revA.points);
  const revHost = await revHostPromise;
  assert.equal(revHost.players.length, 2);
  console.log(`✔ reveal broadcast; Alice correct (+${revA.points}), Bob wrong`);

  // 8. Next question -> finish -> standings
  const q2Promise = waitEvent(bob, 'question-start');
  assert((await emitAck(host, 'next-question', { code })).ok);
  await q2Promise;
  const count2Promise = waitUntil(host, 'answered-count', (d) => d.answered === 2);
  assert((await emitAck(alice, 'submit-answer', { code, questionIndex: 1, optionIndex: 2 })).ok);
  assert((await emitAck(bob, 'submit-answer', { code, questionIndex: 1, optionIndex: 2 })).ok);
  await count2Promise;
  const revHost2Promise = waitEvent(host, 'reveal-data');
  assert((await emitAck(host, 'end-question', { code })).ok);
  await revHost2Promise;
  const finishedPromise = waitEvent(alice, 'game-finished');
  const finishedHostPromise = waitEvent(host, 'game-finished');
  assert((await emitAck(host, 'next-question', { code })).ok);
  const finished = await finishedPromise;
  await finishedHostPromise;
  assert.equal(finished.standings.length, 2);
  assert.equal(finished.standings[0].nickname, 'Alice', 'alice should be #1');
  console.log('✔ game finished; standings: ' + finished.standings.map((s) => `${s.nickname}=${s.score}`).join(', '));

  // 9. Play again resets to lobby
  const resetPromise = waitEvent(alice, 'game-reset');
  assert((await emitAck(host, 'play-again', { code })).ok);
  await resetPromise;
  console.log('✔ play-again reset to lobby');

  console.log('\nAll smoke tests passed ✅');
  process.exit(0);
}

main().catch((err) => {
  console.error('\nSmoke test FAILED:', err.message);
  process.exit(1);
});
