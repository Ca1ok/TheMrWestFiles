// Minigame: Falling Elements Catch — Quick reflexes
Games.register({ id: "fallingCatch", play(content, api){
  let round = 0, correct = 0;
  const TOTAL = 6;
  function nextRound(){
    round++;
    if(round > TOTAL){
      content.innerHTML = `<h3>Falling Elements — Finished</h3>`;
      const resultEl = document.createElement('div'); content.appendChild(resultEl);
      api.score('fallingCatch', correct * 150 + (correct === TOTAL ? 100 : 0), resultEl, `${correct}/${TOTAL} caught!`);          // 5+ to earn, a clean sweep scores 1000
      return;
    }
    const pool = ELEMENTS.filter(e => e[1]);
    const answer = pool[Math.floor(Math.random() * pool.length)];
    const choices = [answer];
    while(choices.length < 4){ const c = pool[Math.floor(Math.random() * pool.length)]; if(!choices.includes(c)) choices.push(c); }
    choices.sort(() => Math.random() - 0.5);
    content.innerHTML = `
      <h3>Falling Elements Catch (${round}/${TOTAL})</h3>
      <p class="cc-desc">Catch: <b>${answer[2]}</b> — 2 seconds!</p>
      <div style="display:flex; gap:0.6rem; justify-content:center;">
        ${choices.map(c => `<button class="tool-btn fc-choice" data-sym="${c[1]}" style="font-size:1.3rem;">${c[1]}</button>`).join('')}
      </div>`;
    let answered = false;
    const timer = setTimeout(() => { if(!answered){ answered = true; nextRound(); } }, 2000);
    content.querySelectorAll('.fc-choice').forEach(btn => {
      btn.addEventListener('click', () => {
        if(answered) return; answered = true; clearTimeout(timer);
        if(btn.dataset.sym === answer[1]) correct++;
        nextRound();
      });
    });
  }
  nextRound();
} });
