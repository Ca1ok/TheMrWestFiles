// Minigame: Wanted Poster Trivia — Site lore quiz
Games.register({ id: "trivia", play(content, api){
  const questions = [
    { q: 'How many days has Colin West been missing, according to the poster?', a: String(WANTED_DATA.missingDays) },
    { q: 'How many charges are listed against Colin West?', a: String(WANTED_DATA.charges.length) },
  ];
  const item = questions[Math.floor(Math.random() * questions.length)];
  content.innerHTML = `
    <h3>Wanted Poster Trivia</h3>
    <p class="cc-desc">${item.q}</p>
    <input type="text" id="triviaInput" style="width:140px;">
    <button class="nav-btn" id="triviaSubmit" style="margin-left:0.5rem;">Submit</button>
    <div id="triviaResult"></div>`;
  document.getElementById('triviaSubmit').addEventListener('click', () => {
    const resultEl = document.getElementById('triviaResult');
    if(document.getElementById('triviaInput').value.trim() === item.a) api.win('trivia', 2, resultEl, 'Correct!');
    else api.lose(resultEl, `Correct answer was ${item.a}.`);
  });
} });
