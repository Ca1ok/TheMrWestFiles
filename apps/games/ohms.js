// Minigame: Ohm's Law — Quick circuit math
Games.register({ id: "ohms", play(content, api){
  const V = Math.floor(2 + Math.random() * 22), R = [2, 4, 5, 10, 20][Math.floor(Math.random() * 5)];
  const correctI = Math.round((V / R) * 100) / 100;
  content.innerHTML = `
    <h3>Ohm's Law Quick Math</h3>
    <p class="cc-desc">A circuit has V = ${V}V and R = ${R}Ω. What's the current I (in amps)? (V = IR)</p>
    <input type="number" step="0.01" id="ohmsInput" placeholder="amps" style="width:140px;">
    <button class="nav-btn" id="ohmsSubmit" style="margin-left:0.5rem;">Submit</button>
    <div id="ohmsResult"></div>`;
  document.getElementById('ohmsSubmit').addEventListener('click', () => {
    const guess = parseFloat(document.getElementById('ohmsInput').value);
    const resultEl = document.getElementById('ohmsResult');
    if(!isNaN(guess) && Math.abs(guess - correctI) <= 0.05) api.win('ohms', 2, resultEl, `Correct — I = ${correctI}A.`);
    else api.lose(resultEl, `Correct answer was I = ${correctI}A.`);
  });
} });
