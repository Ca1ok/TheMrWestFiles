// Minigame: Balance the Equation — Stoichiometry
Games.register({ id: "balance", play(content, api){
  const equations = [
    { text: '__ N2 + __ H2 → __ NH3', answer: [1, 3, 2] },
    { text: '__ H2 + __ O2 → __ H2O', answer: [2, 1, 2] },
    { text: '__ Fe + __ O2 → __ Fe2O3', answer: [4, 3, 2] },
    { text: '__ CH4 + __ O2 → __ CO2 + __ H2O', answer: [1, 2, 1, 2] },
    { text: '__ Na + __ Cl2 → __ NaCl', answer: [2, 1, 2] },
  ];
  const eq = equations[Math.floor(Math.random() * equations.length)];
  const parts = eq.text.split('__');
  let html = '<h3>Balance the Equation</h3><p class="cc-desc">Fill in the coefficients (whole numbers).</p><div style="font-size:1.1rem; line-height:2.2;">';
  parts.forEach((p, i) => {
    html += p;
    if(i < eq.answer.length) html += `<input type="number" min="1" class="bal-input" data-i="${i}" style="width:44px; text-align:center;">`;
  });
  html += '</div><button class="nav-btn" id="balSubmit" style="margin-top:0.8rem;">Check</button><div id="balResult"></div>';
  content.innerHTML = html;
  document.getElementById('balSubmit').addEventListener('click', () => {
    const inputs = content.querySelectorAll('.bal-input');
    const guess = Array.from(inputs).map(i => parseInt(i.value, 10));
    const resultEl = document.getElementById('balResult');
    if(guess.every((v, i) => v === eq.answer[i])){ const t = api.elapsed(); api.score('balance', 400 + Math.round(600 * Math.max(0, Math.min(1, 1 - (t - 6) / 54))), resultEl, 'Balanced in ' + t.toFixed(1) + ' s!'); }          // 400 for a correct answer, up to 1000 for a fast one
    else api.lose(resultEl, `Correct coefficients were: ${eq.answer.join(', ')}.`);
  });
} });
