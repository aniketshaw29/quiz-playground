// Demo quizzes loaded into the in-memory store on server start.
// Fixed ids so the home page can link straight to them.

const seedQuizzes = [
  {
    id: 'demo-capitals',
    title: 'World Capitals',
    description: 'How well do you know your world capitals?',
    questions: [
      { prompt: 'What is the capital of Australia?', options: ['Sydney', 'Melbourne', 'Canberra', 'Perth'], correctIndex: 2, timeLimit: 15 },
      { prompt: 'Which city is the capital of Japan?', options: ['Osaka', 'Kyoto', 'Tokyo', 'Hiroshima'], correctIndex: 2, timeLimit: 15 },
      { prompt: 'What is the capital of Canada?', options: ['Toronto', 'Vancouver', 'Montreal', 'Ottawa'], correctIndex: 3, timeLimit: 15 },
      { prompt: 'Nairobi is the capital of which country?', options: ['Kenya', 'Nigeria', 'Egypt', 'South Africa'], correctIndex: 0, timeLimit: 15 },
      { prompt: 'What is the capital of Brazil?', options: ['Rio de Janeiro', 'Sao Paulo', 'Brasilia', 'Salvador'], correctIndex: 2, timeLimit: 15 },
    ],
  },
  {
    id: 'demo-general',
    title: 'General Knowledge',
    description: 'A bit of everything for everyone.',
    questions: [
      { prompt: 'How many continents are there on Earth?', options: ['5', '6', '7', '8'], correctIndex: 2, timeLimit: 10 },
      { prompt: 'What is the largest planet in our solar system?', options: ['Earth', 'Saturn', 'Jupiter', 'Neptune'], correctIndex: 2, timeLimit: 10 },
      { prompt: 'Which element has the chemical symbol "O"?', options: ['Gold', 'Oxygen', 'Osmium', 'Ozone'], correctIndex: 1, timeLimit: 10 },
      { prompt: 'What is the smallest prime number?', options: ['0', '1', '2', '3'], correctIndex: 2, timeLimit: 10 },
      { prompt: 'Which ocean is the largest?', options: ['Atlantic', 'Indian', 'Arctic', 'Pacific'], correctIndex: 3, timeLimit: 10 },
      { prompt: 'Who painted the Mona Lisa?', options: ['Michelangelo', 'Leonardo da Vinci', 'Raphael', 'Van Gogh'], correctIndex: 1, timeLimit: 10 },
    ],
  },
  {
    id: 'demo-music',
    title: 'Music Hits',
    description: 'Name that song era.',
    questions: [
      { prompt: 'Which band released "Bohemian Rhapsody"?', options: ['The Beatles', 'Queen', 'Pink Floyd', 'ABBA'], correctIndex: 1, timeLimit: 20 },
      { prompt: 'Who is known as the "King of Pop"?', options: ['Elvis Presley', 'Prince', 'Michael Jackson', 'Stevie Wonder'], correctIndex: 2, timeLimit: 20 },
      { prompt: '"Rolling in the Deep" is a hit by which artist?', options: ['Beyonce', 'Rihanna', 'Adele', 'Lady Gaga'], correctIndex: 2, timeLimit: 20 },
      { prompt: 'The band "Coldplay" is from which country?', options: ['USA', 'Canada', 'Australia', 'UK'], correctIndex: 3, timeLimit: 20 },
      { prompt: 'Which song won the first Grammy for Record of the Year?', options: ['Nel Blu Dipinto Di Blu (Volare)', 'Mack the Knife', 'Don’t Be Cruel', 'The Great Pretender'], correctIndex: 0, timeLimit: 20 },
    ],
  },
];

module.exports = seedQuizzes;
