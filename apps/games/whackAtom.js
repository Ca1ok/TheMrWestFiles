// Minigame: Whack-an-Atom — Fast clicking
Games.register({ id: "whackAtom", play(content, api){
  let score = 0, timeLeft = 15;
  content.innerHTML = `
    <h3>Whack-an-Atom</h3>
    <p class="cc-desc"><span id="whackTime">${timeLeft}</span>s left. Score: <span id="whackScore">0</span></p>
    <div id="whackGrid" style="display:grid; grid-template-columns:repeat(3,1fr); gap:0.5rem; max-width:300px;">
      ${Array.from({ length:9 }).map((_, i) => `<div class="whack-cell" data-i="${i}"></div>`).join('')}
    </div>
    <div id="whackResult"></div>`;
  const cells = content.querySelectorAll('.whack-cell');
  let activeIdx = -1;
  function spawn(){
    if(activeIdx >= 0) cells[activeIdx].textContent = '';
    activeIdx = Math.floor(Math.random() * 9);
    cells[activeIdx].textContent = '⚛️';
  }
  cells.forEach((cell, i) => {
    cell.addEventListener('click', () => {
      if(i === activeIdx){ score++; document.getElementById('whackScore').textContent = score; cell.textContent = ''; activeIdx = -1; spawn(); }
    });
  });
  spawn();
  const spawnTimer = setInterval(spawn, 900);
  const countdownTimer = setInterval(() => {
    timeLeft--;
    const timeEl = document.getElementById('whackTime');
    if(timeEl) timeEl.textContent = timeLeft;
    if(timeLeft <= 0){
      clearInterval(spawnTimer); clearInterval(countdownTimer);
      cells.forEach(c => c.textContent = '');
      const resultEl = document.getElementById('whackResult');
      api.score('whackAtom', score * 100, resultEl, `Hit ${score} atom${score === 1 ? '' : 's'}.`);          // 100 points per atom; 8+ to earn
    }
  }, 1000);
} });
