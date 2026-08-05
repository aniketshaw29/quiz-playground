const express = require('express');
const http = require('http');
const path = require('path');
const QRCode = require('qrcode');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// ---- limits ----
const QUIZ_TITLE_MAX = 120;
const QUIZ_COUNT_MIN = 1;
const QUIZ_COUNT_MAX = 60;
const PROMPT_MAX = 300;
const OPTION_COUNT_MIN = 2;
const OPTION_COUNT_MAX = 6;
const OPTION_MAX = 80;
const NICKNAME_MAX = 20;
const TIME_LIMITS = [5, 10, 15, 20, 30];

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---- in-memory stores (cleared on restart) ----
const quizzes = new Map(); // quizId -> quiz
const sessions = new Map(); // joinCode -> session
const quizToSession = new Map(); // quizId -> joinCode

function genCode(len = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I confusion
  let code;
  do {
    code = Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (sessions.has(code));
  return code;
}

function genId(len = 8) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function cleanStr(v, max) {
  return String(v ?? '').trim().slice(0, max);
}

// ---- validation ----
function validateQuiz(rawTitle, rawQuestions) {
  const title = cleanStr(rawTitle, QUIZ_TITLE_MAX);
  if (!title) return { error: 'Give your quiz a title.' };
  if (!Array.isArray(rawQuestions) || rawQuestions.length < QUIZ_COUNT_MIN) {
    return { error: 'Add at least one question.' };
  }
  if (rawQuestions.length > QUIZ_COUNT_MAX) {
    return { error: `A quiz can have at most ${QUIZ_COUNT_MAX} questions.` };
  }
  const questions = [];
  for (const rq of rawQuestions) {
    const prompt = cleanStr(rq?.prompt, PROMPT_MAX);
    if (!prompt) return { error: 'Every question needs a prompt.' };
    const options = (Array.isArray(rq?.options) ? rq.options : [])
      .map((o) => cleanStr(o, OPTION_MAX))
      .filter(Boolean);
    if (options.length < OPTION_COUNT_MIN) return { error: 'Each question needs at least 2 answers.' };
    if (options.length > OPTION_COUNT_MAX) return { error: 'A question can have at most 6 answers.' };
    const correctIndex = Number(rq?.correctIndex);
    if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length) {
      return { error: 'Each question needs a correct answer selected.' };
    }
    const timeLimit = Number(rq?.timeLimit);
    if (!TIME_LIMITS.includes(timeLimit)) return { error: 'Pick a valid time limit.' };
    questions.push({ prompt, options, correctIndex, timeLimit });
  }
  return { title, questions };
}

// ---- HTTP API ----
app.post('/api/quizzes', (req, res) => {
  const { title, questions } = req.body || {};
  const result = validateQuiz(title, questions);
  if (result.error) return res.status(400).json({ error: result.error });
  const id = genId();
  quizzes.set(id, { id, title: result.title, questions: result.questions, createdAt: Date.now() });
  res.json({ id, title: result.title, questionCount: result.questions.length });
});

app.get('/api/quizzes/:id', (req, res) => {
  const quiz = quizzes.get(req.params.id);
  if (!quiz) return res.status(404).json({ error: 'Quiz not found.' });
  res.json({ id: quiz.id, title: quiz.title, questionCount: quiz.questions.length, createdAt: quiz.createdAt });
});

// ---- Socket.io helpers ----
const gameRoom = (code) => `game:${code}`;
const hostRoom = (code) => `host:${code}`;

function emitPlayers(session) {
  const players = [...session.players.values()].map((p) => ({ id: p.id, nickname: p.nickname, score: p.score }));
  io.to(gameRoom(session.code)).emit('players-updated', { players });
  io.to(hostRoom(session.code)).emit('players-updated', { players });
}

// Kahoot-style scoring: faster = more points (100..1000)
function pointsFor(elapsedMs, timeLimitMs) {
  const t = Math.max(0, Math.min(1, elapsedMs / timeLimitMs));
  return Math.round(100 + 900 * (1 - t));
}

function startQuestion(session) {
  const q = session.quiz.questions[session.questionIndex];
  session.state = 'question';
  session.questionStartedAt = Date.now();
  for (const p of session.players.values()) {
    p.answer = null;
    p.answered = false;
    p.answerElapsed = 0;
  }
  const payload = {
    questionIndex: session.questionIndex,
    total: session.quiz.questions.length,
    prompt: q.prompt,
    options: q.options,
    timeLimit: q.timeLimit,
    questionStartedAt: session.questionStartedAt,
  };
  io.to(gameRoom(session.code)).emit('question-start', payload);
  io.to(hostRoom(session.code)).emit('question-started', payload);
  session.timer = setTimeout(() => endQuestion(session), q.timeLimit * 1000);
}

function endQuestion(session) {
  if (session.state !== 'question') return;
  clearTimeout(session.timer);
  session.state = 'reveal';
  const q = session.quiz.questions[session.questionIndex];
  const timeLimitMs = q.timeLimit * 1000;
  const reveal = [];
  for (const player of session.players.values()) {
    const correct = player.answered && player.answer === q.correctIndex;
    let points = 0;
    if (correct) {
      points = pointsFor(player.answerElapsed, timeLimitMs);
      player.score += points;
    }
    reveal.push({
      id: player.id,
      nickname: player.nickname,
      answer: player.answered ? player.answer : null,
      correct,
      points,
      score: player.score,
    });
    io.to(player.id).emit('question-reveal', {
      questionIndex: session.questionIndex,
      correctIndex: q.correctIndex,
      playerAnswer: player.answered ? player.answer : null,
      correct,
      points,
      score: player.score,
    });
  }
  session.lastReveal = reveal;
  io.to(hostRoom(session.code)).emit('reveal-data', {
    questionIndex: session.questionIndex,
    total: session.quiz.questions.length,
    correctIndex: q.correctIndex,
    players: reveal,
  });
}

function finishGame(session) {
  session.state = 'finished';
  clearTimeout(session.timer);
  const standings = [...session.players.values()]
    .map((p) => ({ id: p.id, nickname: p.nickname, score: p.score }))
    .sort((a, b) => b.score - a.score);
  session.lastStandings = standings;
  io.to(gameRoom(session.code)).emit('game-finished', { standings });
  io.to(hostRoom(session.code)).emit('game-finished', { standings });
}

// ---- Socket.io handlers ----
io.on('connection', (socket) => {
  // HOST
  socket.on('create-session', async ({ quizId, origin } = {}, ack) => {
    if (typeof ack !== 'function') ack = () => {};
    const quiz = quizzes.get(quizId);
    if (!quiz) return ack({ ok: false, error: 'Quiz not found. It may have expired (server restart clears data).' });

    let code = quizToSession.get(quizId);
    let session = code ? sessions.get(code) : null;
    let isNew = false;
    if (!session) {
      code = genCode();
      session = {
        code,
        quizId,
        quiz,
        players: new Map(),
        state: 'lobby',
        questionIndex: 0,
        questionStartedAt: 0,
        timer: null,
        hostSocket: null,
        lastReveal: null,
        lastStandings: null,
        qrDataUrl: null,
        joinUrl: null,
      };
      sessions.set(code, session);
      quizToSession.set(quizId, code);
      isNew = true;
      const base = origin || `http://localhost:${PORT}`;
      session.joinUrl = `${base}/join.html?code=${code}`;
      try {
        session.qrDataUrl = await QRCode.toDataURL(session.joinUrl, { width: 320, margin: 1 });
      } catch {
        session.qrDataUrl = null;
      }
    }
    session.hostSocket = socket.id;
    socket.join(hostRoom(session.code));

    ack({
      ok: true,
      isNew,
      code: session.code,
      quizTitle: quiz.title,
      questionCount: quiz.questions.length,
      state: session.state,
      qrDataUrl: session.qrDataUrl,
      joinUrl: session.joinUrl,
    });
    emitPlayers(session);

    // If the host reloads mid-game, replay the current state to them.
    if (session.state === 'question') {
      const q = session.quiz.questions[session.questionIndex];
      socket.emit('question-started', {
        questionIndex: session.questionIndex,
        total: session.quiz.questions.length,
        prompt: q.prompt,
        options: q.options,
        timeLimit: q.timeLimit,
        questionStartedAt: session.questionStartedAt,
      });
      const answered = [...session.players.values()].filter((p) => p.answered).length;
      socket.emit('answered-count', { answered, total: session.players.size });
    } else if (session.state === 'reveal' && session.lastReveal) {
      const q = session.quiz.questions[session.questionIndex];
      socket.emit('reveal-data', {
        questionIndex: session.questionIndex,
        total: session.quiz.questions.length,
        correctIndex: q.correctIndex,
        players: session.lastReveal,
      });
    } else if (session.state === 'finished' && session.lastStandings) {
      socket.emit('game-finished', { standings: session.lastStandings });
    }
  });

  socket.on('start-game', ({ code } = {}, ack) => {
    if (typeof ack !== 'function') ack = () => {};
    const session = sessions.get(code);
    if (!session) return ack({ ok: false, error: 'Session not found.' });
    if (session.hostSocket !== socket.id) return ack({ ok: false, error: 'Only the host can do that.' });
    if (session.quiz.questions.length === 0) return ack({ ok: false, error: 'This quiz has no questions.' });
    if (session.state !== 'lobby') return ack({ ok: false, error: 'Game already in progress.' });
    for (const p of session.players.values()) {
      p.score = 0;
      p.answer = null;
      p.answered = false;
      p.answerElapsed = 0;
    }
    session.questionIndex = 0;
    startQuestion(session);
    ack({ ok: true });
  });

  socket.on('end-question', ({ code } = {}, ack) => {
    if (typeof ack !== 'function') ack = () => {};
    const session = sessions.get(code);
    if (!session || session.hostSocket !== socket.id) return ack({ ok: false });
    endQuestion(session);
    ack({ ok: true });
  });

  socket.on('next-question', ({ code } = {}, ack) => {
    if (typeof ack !== 'function') ack = () => {};
    const session = sessions.get(code);
    if (!session || session.hostSocket !== socket.id) return ack({ ok: false });
    if (session.state !== 'reveal') return ack({ ok: false });
    session.questionIndex += 1;
    if (session.questionIndex >= session.quiz.questions.length) {
      finishGame(session);
    } else {
      startQuestion(session);
    }
    ack({ ok: true });
  });

  socket.on('play-again', ({ code } = {}, ack) => {
    if (typeof ack !== 'function') ack = () => {};
    const session = sessions.get(code);
    if (!session || session.hostSocket !== socket.id) return ack({ ok: false });
    for (const p of session.players.values()) {
      p.score = 0;
      p.answer = null;
      p.answered = false;
      p.answerElapsed = 0;
    }
    session.questionIndex = 0;
    session.state = 'lobby';
    session.lastReveal = null;
    session.lastStandings = null;
    io.to(gameRoom(session.code)).emit('game-reset');
    ack({ ok: true });
  });

  // PLAYER
  socket.on('join-game', ({ code: rawCode, nickname } = {}, ack) => {
    if (typeof ack !== 'function') ack = () => {};
    const session = sessions.get(String(rawCode || '').trim().toUpperCase());
    if (!session) return ack({ ok: false, error: "That code doesn't match any game. Double-check it." });
    if (session.state !== 'lobby') return ack({ ok: false, error: 'This game has already started.' });
    const name = cleanStr(nickname, NICKNAME_MAX);
    if (!name) return ack({ ok: false, error: 'Enter a nickname.' });
    for (const p of session.players.values()) {
      if (p.nickname.toLowerCase() === name.toLowerCase()) {
        return ack({ ok: false, error: 'That nickname is already taken.' });
      }
    }
    const player = { id: socket.id, nickname: name, score: 0, answer: null, answered: false, answerElapsed: 0 };
    session.players.set(socket.id, player);
    socket.join(gameRoom(session.code));
    ack({ ok: true, playerId: socket.id, nickname: name, quizTitle: session.quiz.title });
    emitPlayers(session);
  });

  socket.on('submit-answer', ({ code, questionIndex, optionIndex } = {}, ack) => {
    if (typeof ack !== 'function') ack = () => {};
    const session = sessions.get(code);
    if (!session) return ack({ ok: false });
    const player = session.players.get(socket.id);
    if (!player || player.answered) return ack({ ok: false });
    if (session.state !== 'question' || questionIndex !== session.questionIndex) return ack({ ok: false });
    const q = session.quiz.questions[session.questionIndex];
    if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= q.options.length) {
      return ack({ ok: false });
    }
    player.answer = optionIndex;
    player.answered = true;
    player.answerElapsed = Math.max(0, Date.now() - session.questionStartedAt);
    const answered = [...session.players.values()].filter((p) => p.answered).length;
    io.to(hostRoom(session.code)).emit('answered-count', { answered, total: session.players.size });
    ack({ ok: true });
  });

  socket.on('disconnect', () => {
    for (const session of sessions.values()) {
      if (session.hostSocket === socket.id) session.hostSocket = null;
      if (session.players.delete(socket.id)) emitPlayers(session);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Quizzy running at http://localhost:${PORT}`);
});
