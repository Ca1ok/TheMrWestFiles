// Minigame: Lucky Assay — Pick a vial
Games.register({ id: "luckyAssay", play(content, api){
  content.innerHTML = `
    <h3>Lucky Assay</h3>
    <p class="cc-desc">Pick a vial — most have a small payout, one is empty. Pure luck, not chemistry — that's why it's filed under "Other."</p>
    <div style="display:flex; gap:0.6rem; justify-content:center;">
      ${Array.from({ length:5 }).map((_, i) => `<button class="tool-btn assay-vial" data-i="${i}" style="font-size:1.5rem;">🧪</button>`).join('')}
    </div>
    <div id="assayResult"></div>`;
  const emptyIdx = Math.floor(Math.random() * 5);
  content.querySelectorAll('.assay-vial').forEach(btn => {
    btn.addEventListener('click', () => {
      content.querySelectorAll('.assay-vial').forEach(b => b.disabled = true);
      const resultEl = document.getElementById('assayResult');
      const i = parseInt(btn.dataset.i, 10);
      if(i === emptyIdx) api.lose(resultEl, 'That vial was empty!');
      else api.win('luckyAssay', 1 + Math.random() * 2, resultEl, 'Found something!');
    });
  });
} });
