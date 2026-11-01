// Minigame: Isotope ID — Protons + neutrons
Games.register({ id: "isotope", play(content, api){
  const pool = ELEMENTS.filter(e => e[0] <= 30);
  const el = pool[Math.floor(Math.random() * pool.length)];
  const protons = el[0];
  const neutrons = protons + Math.floor(Math.random() * 3);
  const massNumber = protons + neutrons;
  content.innerHTML = `
    <h3>Isotope ID</h3>
    <p class="cc-desc">An atom has ${protons} protons and ${neutrons} neutrons — an isotope of ${el[2]} (${el[1]}). What's its mass number?</p>
    <input type="number" id="isoInput" placeholder="mass number" style="width:140px;">
    <button class="nav-btn" id="isoSubmit" style="margin-left:0.5rem;">Submit</button>
    <div id="isoResult"></div>`;
  document.getElementById('isoSubmit').addEventListener('click', () => {
    const guess = parseInt(document.getElementById('isoInput').value, 10);
    const resultEl = document.getElementById('isoResult');
    if(guess === massNumber) api.win('isotope', 2, resultEl, `Correct — mass number ${massNumber}.`);
    else api.lose(resultEl, `Correct mass number was ${massNumber}.`);
  });
} });
