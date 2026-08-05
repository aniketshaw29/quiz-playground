const socket = io();
const $ = (id) => document.getElementById(id);

let sessionCode = null;
let playerId = null;
let currentQuestionIndex = 0;
let lastOptions = [];
let timerHandle = null;

const screens = ['screen-join', 'screen-lobby', 'screen-question', 'screen-result', 'screen-finished'];

function show(name) {
  for (const s of screens) $(s).classList.add('hidden');
  $(name).classList.remove('hidden');
}

function showJoinError(msg) {
  $('join-error').textContent = msg;
  $('join-error').classList.remove('hidden');
}

function startTimer(endsAt) {
  clearInterval(timerHandle);
  const fill = $('timer-fill');
  const total = Math.max(1, endsAt - Date.now());
  fill.style.transition = 'none';
  fill.style.width = '100%';
  void fill.offsetWidth;
  fill.style.transition = `width ${total}ms linear`;
  fill.style.width = '0%';
  timerHandle = setInterval(() => {
    if (Date.now() >= endsAt) clearInterval(timerHandle);
  }, 200);
}

// ---- join form ----
const codeParam = new URLSearchParams(location.search).get('code');
if (codeParam) $('code-input').value = codeParam.toUpperCase();

$('code-input').addEventListener('input', () => {
  $('code-input').value = $('code-input').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  $('join-error').classList.add('hidden');
});
$('name-input').addEventListener('input', () => $('join-error').classList.add('hidden'));

function doJoin() {
  const code = $('code-input').value.trim();
  const nickname = $('name-input').value.trim();
  if (!code) return showJoinError('Enter the game code.');
  if (!nickname) return showJoinError('Enter a nickname.');

  $('join-btn').disabled = true;
  socket.emit('join-game', { code, nickname }, (res) => {
    $('join-btn').disabled = false;
    if (!res || !res.ok) return showJoinError((res && res.error) || 'Could not join.');
    sessionCode = code;
    playerId = res.playerId;
    $('lobby-title').textContent = res.quizTitle;
    show('screen-lobby');
  });
}

$('join-btn').onclick = doJoin;
$('code-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('name-input').focus(); });
$('name-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') doJoin(); });

// ---- lobby ----
socket.on('players-updated', ({ players }) => {
  $('lobby-count').textContent = `${players.length} player${players.length === 1 ? '' : 's'} in this game`;
});

// ---- question ----
socket.on('question-start', ({ questionIndex, total, prompt, options, timeLimit, questionStartedAt }) => {
  currentQuestionIndex = questionIndex;
  lastOptions = options;
  $('p-label').textContent = `Question ${questionIndex + 1} of ${total}`;
  $('p-prompt').textContent = prompt;
  $('p-status').textContent = 'Pick an answer!';

  const grid = $('p-options');
  grid.innerHTML = '';
  options.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = `answer-btn opt-${i}`;
    const letter = document.createElement('span');
    letter.className = 'letter';
    letter.textContent = String.fromCharCode(65 + i);
    const text = document.createElement('span');
    text.textContent = opt;
    btn.append(letter, text);
    btn.onclick = () => submitAnswer(i, btn);
    grid.append(btn);
  });

  show('screen-question');
  startTimer(questionStartedAt + timeLimit * 1000);
});

function submitAnswer(index, btn) {
  const buttons = document.querySelectorAll('#p-options .answer-btn');
  buttons.forEach((b) => (b.disabled = true));
  btn.classList.add('picked');
  $('p-status').textContent = 'Answer locked in — waiting for others…';
  socket.emit('submit-answer', { code: sessionCode, questionIndex: currentQuestionIndex, optionIndex: index }, (res) => {
    if (!res || !res.ok) {
      $('p-status').textContent = 'Too late — that answer was not counted.';
    }
  });
}

// ---- result ----
socket.on('question-reveal', ({ correctIndex, playerAnswer, correct, points, score }) => {
  $('res-headline').textContent = correct ? 'Correct! 🎉' : 'Not quite.';
  const banner = $('res-answer');
  banner.className = `correct-banner opt-${correctIndex}`;
  banner.innerHTML = '';
  const main = document.createElement('div');
  main.textContent = (correct ? '✓ ' : 'The correct answer was: ') + (lastOptions[correctIndex] || '');
  banner.append(main);
  if (!correct && playerAnswer != null) {
    const your = document.createElement('div');
    your.className = 'your-answer';
    your.textContent = 'You picked: ' + (lastOptions[playerAnswer] || '');
    banner.append(your);
  }
  $('res-points').textContent = correct ? `+${points} points` : '+0 points';
  $('res-total').textContent = `Total score: ${score}`;
  show('screen-result');
});

// ---- finished ----
socket.on('game-finished', ({ standings }) => {
  const rank = standings.findIndex((s) => s.id === playerId);
  $('final-rank').textContent = rank === 0 ? 'You won! 🏆' : `You placed #${rank + 1} of ${standings.length}`;
  const ol = $('final-standings');
  ol.innerHTML = '';
  standings.forEach((p, i) => {
    const li = document.createElement('li');
    const rankEl = document.createElement('span');
    rankEl.className = 'rank';
    rankEl.textContent = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = p.nickname;
    const score = document.createElement('span');
    score.className = 'score';
    score.textContent = `${p.score} pts`;
    li.append(rankEl, name, score);
    ol.append(li);
  });
  show('screen-finished');
});

// ---- play again / reset ----
socket.on('game-reset', () => show('screen-lobby'));
