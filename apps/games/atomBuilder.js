// Minigame: Atom Builder — Build the atom
Games.register({ id: "atomBuilder", play(content, api){
  const targetP = 1 + Math.floor(Math.random() * 10);
  const targetN = targetP + Math.floor(Math.random() * 3);
  const targetE = targetP;
  let p = 0, n = 0, e = 0;
  function render(){
    content.innerHTML = `
      <h3>Atom Builder</h3>
      <p class="cc-desc">Build a neutral atom with ${targetP} protons and ${targetN} neutrons.</p>
      <div style="display:flex; gap:1.5rem; justify-content:center; margin:1rem 0;">
        <div>Protons: ${p}<br><button class="tool-btn ab-btn" data-part="p" data-d="1">+</button> <button class="tool-btn ab-btn" data-part="p" data-d="-1">-</button></div>
        <div>Neutrons: ${n}<br><button class="tool-btn ab-btn" data-part="n" data-d="1">+</button> <button class="tool-btn ab-btn" data-part="n" data-d="-1">-</button></div>
        <div>Electrons: ${e}<br><button class="tool-btn ab-btn" data-part="e" data-d="1">+</button> <button class="tool-btn ab-btn" data-part="e" data-d="-1">-</button></div>
      </div>
      <button class="nav-btn" id="abCheck">Check</button>
      <div id="abResult"></div>`;
    content.querySelectorAll('.ab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const d = parseInt(btn.dataset.d, 10);
        if(btn.dataset.part === 'p') p = Math.max(0, p + d);
        if(btn.dataset.part === 'n') n = Math.max(0, n + d);
        if(btn.dataset.part === 'e') e = Math.max(0, e + d);
        render();
      });
    });
    document.getElementById('abCheck').addEventListener('click', () => {
      const resultEl = document.getElementById('abResult');
      if(p === targetP && n === targetN && e === targetE){ const t = api.elapsed(); api.score('atomBuilder', Math.min(1000, 200 + 25 * (targetP + targetN) + Math.max(0, 250 - 5 * Math.max(0, t - 15))), resultEl, 'Correct atom built in ' + t.toFixed(0) + ' s!'); }          // bigger atoms and faster builds score more
      else api.lose(resultEl, `Needed ${targetP}p/${targetN}n/${targetE}e — you had ${p}p/${n}n/${e}e.`);
    });
  }
  render();
} });
