// Minigame: Ideal Gas Law Solver — PV = nRT
Games.register({ id: "gasLaw", play(content, api){
  const R = 0.0821;
  const n = Math.round((0.5 + Math.random() * 4) * 10) / 10;
  const T = Math.round(250 + Math.random() * 100);
  const V = Math.round((5 + Math.random() * 20) * 10) / 10;
  const correctP = Math.round((n * R * T / V) * 100) / 100;
  content.innerHTML = `
    <h3>Ideal Gas Law Solver</h3>
    <p class="cc-desc">n = ${n} mol, T = ${T} K, V = ${V} L. Solve for P (atm) using PV = nRT (R = 0.0821 L·atm/mol·K).</p>
    <input type="number" step="0.01" id="gasInput" placeholder="atm" style="width:140px;">
    <button class="nav-btn" id="gasSubmit" style="margin-left:0.5rem;">Submit</button>
    <div id="gasResult"></div>`;
  document.getElementById('gasSubmit').addEventListener('click', () => {
    const guess = parseFloat(document.getElementById('gasInput').value);
    const resultEl = document.getElementById('gasResult');
    if(!isNaN(guess) && Math.abs(guess - correctP) <= correctP * 0.05 + 0.05) api.win('gasLaw', 4, resultEl, `Correct — P = ${correctP} atm.`);
    else api.lose(resultEl, `Correct answer was P = ${correctP} atm.`);
  });
} });
