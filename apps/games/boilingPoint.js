// Minigame: Guess the Boiling Point — Thermal trivia
Games.register({ id: "boilingPoint", play(content, api){
  const keys = Object.keys(BOILING_POINTS);
  const key = keys[Math.floor(Math.random() * keys.length)];
  const correctBp = BOILING_POINTS[key];
  content.innerHTML = `
    <h3>Guess the Boiling Point</h3>
    <p class="cc-desc">What's the boiling point of <b>${key}</b>, in °C? (within 15°C wins)</p>
    <input type="number" id="bpInput" style="width:140px;">
    <button class="nav-btn" id="bpSubmit" style="margin-left:0.5rem;">Submit</button>
    <div id="bpResult"></div>`;
  document.getElementById('bpSubmit').addEventListener('click', () => {
    const guess = parseFloat(document.getElementById('bpInput').value);
    const resultEl = document.getElementById('bpResult');
    if(!isNaN(guess) && Math.abs(guess - correctBp) <= 15) api.win('boilingPoint', 2, resultEl, `Correct — ${correctBp}°C.`);
    else api.lose(resultEl, `Correct answer was ${correctBp}°C.`);
  });
} });
