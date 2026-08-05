const socket = io();
const $ = (id) => document.getElementById(id);

const quizId = new URLSearchParams(location.search).get('quizId');
let sessionCode = null;
let currentOptions = [];
let timerHandle = null;

const screens = ['screen-share', 'screen-question', 'screen-reveal', 'screen-results', 'screen-error'];

function show(name) {
  for (const s of screens) $(s).classList.add('hidden');
  $(name).classList.remove('hidden');
}

function bootError(msg) {
  $('boot-error').textContent = msg;
  show('screen-error');
}

if (!quizId) {
  bootError('No quiz selected. Create a quiz first or pick a demo from the home page.');
}

function startTimer(endsAt) {
  clearInterval(timerHandle);
  const fill = $('timer-fill');
  const total = Math.max(1, endsAt - Date.now());
  fill.style.transition = 'none';
  fill.style.width = '100%';
  // force reflow so the transition applies
  void fill.offsetWidth;
  fill.style.transition = `width ${total}ms linear`;
  fill.style.width = '0%';
  timerHandle = setInterval(() => {
    if (Date.now() >= endsAt) clearInterval(timerHandle);
  }, 200);
}

function buildOptions(container, options) {
  container.innerHTML = '';
  options.forEach((opt, i) => {
    const btn = document.createElement('div');
    btn.className = `answer-btn opt-${i}`;
    const letter = document.createElement('span');
    letter.className = 'letter';
    letter.textContent = String.fromCharCode(65 + i);
    const text = document.createElement('span');
    text.textContent = opt;
    btn.append(letter, text);
    container.append(btn);
  });
}

// ---- connect as host ----
socket.emit('create-session', { quizId, origin: location.origin }, (res) => {
  if (!res || !res.ok) {
    bootError((res && res.error) || 'Could not start a session.');
    return;
  }
  sessionCode = res.code;
  $('code').textContent = res.code;
  $('quiz-title').textContent = res.quizTitle;
  $('qr').src = res.qrDataUrl || '';
  $('join-link').textContent = `Players open: ${res.joinUrl}`;
  $('copy-code').dataset.value = res.code;
  $('copy-link').dataset.url = res.joinUrl;
  show('screen-share');
});

// ---- share screen ----
socket.on('players-updated', ({ players }) => {
  $('player-count').textContent = players.length
    ? `${players.length} player${players.length === 1 ? '' : 's'} joined`
    : 'No players yet';
  const list = $('player-list');
  list.innerHTML = '';
  if (!players.length) {
    const li = document.createElement('li');
    li.className = 'empty-state';
    li.textContent = 'Waiting for players to join…';
    list.append(li);
    return;
  }
  for (const p of players) {
    const li = document.createElement('li');
    li.textContent = p.nickname;
    list.append(li);
  }
});

$('start').onclick = () => socket.emit('start-game', { code: sessionCode });

async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    const original = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = original; }, 1200);
  } catch {
    prompt('Copy this:', text);
  }
}
$('copy-code').onclick = (e) => copyText($('copy-code').dataset.value, e.currentTarget);
$('copy-link').onclick = (e) => copyText($('copy-link').dataset.url, e.currentTarget);

// ---- question ----
socket.on('question-started', ({ questionIndex, total, prompt, options, timeLimit, questionStartedAt }) => {
  currentOptions = options;
  $('q-label').textContent = `Question ${questionIndex + 1} of ${total}`;
  $('hq-prompt').textContent = prompt;
  buildOptions($('hq-options'), options);
  $('hq-answered').textContent = '0 / 0 answered';
  show('screen-question');
  const endsAt = questionStartedAt + timeLimit * 1000;
  startTimer(endsAt);
});

socket.on('answered-count', ({ answered, total }) => {
  $('hq-answered').textContent = `${answered} / ${total} answered`;
});

$('reveal').onclick = () => socket.emit('end-question', { code: sessionCode });

// ---- reveal ----
socket.on('reveal-data', ({ questionIndex, total, correctIndex, players }) => {
  $('r-label').textContent = `Question ${questionIndex + 1} of ${total}`;
  const banner = $('r-correct');
  banner.className = `correct-banner opt-${correctIndex}`;
  banner.textContent = '✓ ' + (currentOptions[correctIndex] || '');

  const list = $('r-list');
  list.innerHTML = '';
  for (const p of players) {
    const li = document.createElement('li');
    li.className = p.correct ? 'correct-row' : 'wrong-row';
    const name = document.createElement('span');
    name.textContent = p.nickname;
    const pts = document.createElement('span');
    pts.className = 'pts ' + (p.correct ? 'pos' : '');
    pts.textContent = p.correct ? `+${p.points}` : `${p.score} pts`;
    li.append(name, pts);
    list.append(li);
  }
  $('next').textContent = questionIndex === total - 1 ? 'See results 🏁' : 'Next question →';
  show('screen-reveal');
});

$('next').onclick = () => socket.emit('next-question', { code: sessionCode });

// ---- final results ----
socket.on('game-finished', ({ standings }) => {
  const ol = $('standings');
  ol.innerHTML = '';
  standings.forEach((p, i) => {
    const li = document.createElement('li');
    const rank = document.createElement('span');
    rank.className = 'rank';
    rank.textContent = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = p.nickname;
    const score = document.createElement('span');
    score.className = 'score';
    score.textContent = `${p.score} pts`;
    li.append(rank, name, score);
    ol.append(li);
  });
  show('screen-results');
});

$('play-again').onclick = () => {
  socket.emit('play-again', { code: sessionCode }, () => show('screen-share'));
};
