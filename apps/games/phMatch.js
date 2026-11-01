// Minigame: pH Match — Acid or base?
Games.register({ id: "phMatch", play(content, api){
  const items = [
    { name: 'Battery acid', range: [0, 1] }, { name: 'Lemon juice', range: [2, 3] },
    { name: 'Black coffee', range: [5, 5] }, { name: 'Pure water', range: [7, 7] },
    { name: 'Sea water', range: [8, 8] }, { name: 'Baking soda solution', range: [9, 9] },
    { name: 'Ammonia', range: [11, 12] }, { name: 'Drain cleaner', range: [13, 14] },
  ];
  const item = items[Math.floor(Math.random() * items.length)];
  const choices = ['0–2 (strong acid)', '3–6 (weak acid)', '7 (neutral)', '8–11 (weak base)', '12–14 (strong base)'];
  const correctIdx = item.range[0] <= 2 ? 0 : item.range[0] <= 6 ? 1 : item.range[0] === 7 ? 2 : item.range[0] <= 11 ? 3 : 4;
  content.innerHTML = `
    <h3>pH Match</h3>
    <p class="cc-desc">What pH range does <b>${item.name}</b> fall into?</p>
    <div style="display:flex; flex-direction:column; gap:0.5rem;">
      ${choices.map((c, i) => `<button class="tool-btn ph-choice" data-i="${i}">${c}</button>`).join('')}
    </div>
    <div id="phResult"></div>`;
  content.querySelectorAll('.ph-choice').forEach(btn => {
    btn.addEventListener('click', () => {
      const resultEl = document.getElementById('phResult');
      if(parseInt(btn.dataset.i, 10) === correctIdx) api.win('phMatch', 2, resultEl, 'Correct!');
      else api.lose(resultEl, `${item.name} is actually ${choices[correctIdx]}.`);
    });
  });
} });
