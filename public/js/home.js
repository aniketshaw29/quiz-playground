const quizList = document.getElementById('quiz-list');
const myQuizzesSection = document.getElementById('my-quizzes');
const demoSection = document.getElementById('demo-section');
const demoGrid = document.getElementById('demo-grid');

// Your created quizzes (stored locally; no accounts)
function renderMyQuizzes() {
  const quizzes = JSON.parse(localStorage.getItem('quizzy.quizzes') || '[]');
  if (!quizzes.length) {
    myQuizzesSection.classList.add('hidden');
    return;
  }
  myQuizzesSection.classList.remove('hidden');
  quizList.innerHTML = '';
  for (const q of quizzes) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = `/host.html?quizId=${q.id}`;
    const name = document.createElement('span');
    name.textContent = q.title;
    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = `${q.questionCount} question${q.questionCount === 1 ? '' : 's'}`;
    a.append(name, count);
    li.append(a);
    quizList.append(li);
  }
}

// Demo quizzes from the server
async function renderDemos() {
  try {
    const res = await fetch('/api/quizzes');
    const { quizzes } = await res.json();
    const demos = quizzes.filter((q) => q.demo);
    if (!demos.length) return;
    demoSection.classList.remove('hidden');
    for (const q of demos) {
      const card = document.createElement('a');
      card.className = 'demo-card';
      card.href = `/host.html?quizId=${q.id}`;
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = 'Demo';
      const title = document.createElement('h4');
      title.textContent = q.title;
      const meta = document.createElement('p');
      meta.textContent = `${q.questionCount} questions · host it live`;
      card.append(tag, title, meta);
      demoGrid.append(card);
    }
  } catch {
    // server unreachable; skip demos
  }
}

renderMyQuizzes();
renderDemos();
