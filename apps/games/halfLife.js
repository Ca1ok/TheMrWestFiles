// Minigame: Half-Life Guess — Decay math
Games.register({ id: "halfLife", play(content, api){
  const startAmount = [50, 80, 100, 120][Math.floor(Math.random() * 4)];
  const halfLives = 1 + Math.floor(Math.random() * 4);
  const correctAnswer = startAmount / Math.pow(2, halfLives);
  content.innerHTML = `
    <h3>Half-Life Guess</h3>
    <p class="cc-desc">You start with ${startAmount}g of a radioactive isotope. After ${halfLives} half-life period(s), how many grams remain?</p>
    <input type="number" step="0.01" id="halfLifeInput" placeholder="grams remaining" style="width:140px;">
    <button class="nav-btn" id="halfLifeSubmit" style="margin-left:0.5rem;">Submit</button>
    <div id="halfLifeResult"></div>`;
  document.getElementById('halfLifeSubmit').addEventListener('click', () => {
    const guess = parseFloat(document.getElementById('halfLifeInput').value);
    const resultEl = document.getElementById('halfLifeResult');
    if(!isNaN(guess) && Math.abs(guess - correctAnswer) <= correctAnswer * 0.05 + 0.05){
      api.win('halfLife', 3, resultEl, `Correct — ${correctAnswer.toFixed(2)}g remained.`);
    } else api.lose(resultEl, `Correct answer was ${correctAnswer.toFixed(2)}g.`);
  });
} });
