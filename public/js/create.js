const questionsEl = document.getElementById('questions');
const addBtn = document.getElementById('add-question');
const saveBtn = document.getElementById('save');
const titleEl = document.getElementById('title');
const errorEl = document.getElementById('error');

const TIME_LIMITS = [5, 10, 15, 20, 30];

let questions = [makeQuestion()];

function makeQuestion() {
  return { prompt: '', options: ['', '', '', ''], correct: 0, timeLimit: 15 };
}

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.classList.remove('hidden');
}

function hideError() {
  errorEl.classList.add('hidden');
}

function render() {
  questionsEl.innerHTML = '';
  questions.forEach((q, qi) => {
    const card = document.createElement('div');
    card.className = 'question-card';

    const head = document.createElement('div');
    head.className = 'q-head';
    const num = document.createElement('span');
    num.className = 'q-num';
    num.textContent = `Question ${qi + 1}`;
    const del = document.createElement('button');
    del.className = 'btn icon danger';
    del.textContent = '✕';
    del.title = 'Remove question';
    del.onclick = () => {
      questions.splice(qi, 1);
      if (!questions.length) questions.push(makeQuestion());
      render();
    };
    head.append(num, del);

    const prompt = document.createElement('textarea');
    prompt.className = 'q-prompt';
    prompt.placeholder = 'Type your question…';
    prompt.maxLength = 300;
    prompt.value = q.prompt;
    prompt.addEventListener('input', () => { q.prompt = prompt.value; });

    const meta = document.createElement('div');
    meta.className = 'q-meta';
    const timeLabel = document.createElement('span');
    timeLabel.className = 'muted';
    timeLabel.textContent = 'Time per question';
    const timeSelect = document.createElement('select');
    for (const t of TIME_LIMITS) {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = `${t} seconds`;
      opt.selected = t === q.timeLimit;
      timeSelect.append(opt);
    }
    timeSelect.addEventListener('change', () => { q.timeLimit = Number(timeSelect.value); });
    meta.append(timeLabel, timeSelect);

    const optionsBox = document.createElement('div');
    optionsBox.className = 'options-box';
    q.options.forEach((_, oi) => {
      const row = document.createElement('div');
      row.className = 'option-row';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = `correct-${qi}`;
      radio.checked = q.correct === oi;
      radio.title = 'Mark as correct answer';
      radio.addEventListener('change', () => { q.correct = oi; });
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'option-input';
      input.placeholder = `Answer ${String.fromCharCode(65 + oi)}`;
      input.maxLength = 80;
      input.value = q.options[oi];
      input.addEventListener('input', () => { q.options[oi] = input.value; });
      row.append(radio, input);
      if (q.options.length > 2) {
        const rem = document.createElement('button');
        rem.className = 'btn icon ghost';
        rem.textContent = '✕';
        rem.title = 'Remove answer';
        rem.onclick = () => {
          q.options.splice(oi, 1);
          if (q.correct >= q.options.length) q.correct = q.options.length - 1;
          render();
        };
        row.append(rem);
      }
      optionsBox.append(row);
    });
    const addOpt = document.createElement('button');
    addOpt.className = 'btn ghost small';
    addOpt.textContent = '+ Add answer';
    addOpt.onclick = () => {
      if (q.options.length < 6) {
        q.options.push('');
        render();
      }
    };
    optionsBox.append(addOpt);

    card.append(head, prompt, meta, optionsBox);
    questionsEl.append(card);
  });
}

addBtn.onclick = () => {
  questions.push(makeQuestion());
  render();
};

saveBtn.onclick = async () => {
  hideError();
  saveBtn.disabled = true;
  const payload = { title: titleEl.value, questions };
  try {
    const res = await fetch('/api/quizzes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      showError(data.error || 'Something went wrong. Please try again.');
      return;
    }
    const saved = JSON.parse(localStorage.getItem('quizzy.quizzes') || '[]');
    saved.unshift({ id: data.id, title: data.title, questionCount: data.questionCount });
    localStorage.setItem('quizzy.quizzes', JSON.stringify(saved.slice(0, 20)));
    location.href = `/host.html?quizId=${data.id}`;
  } catch {
    showError('Could not reach the server. Is it running?');
  } finally {
    saveBtn.disabled = false;
  }
};

render();
