// Minigame: Element Recall — Symbol → name
Games.register({ id: "elementRecall", play(content, api){
  let correct = 0, round = 0;
  const TOTAL = 5;
  function nextRound(){
    round++;
    if(round > TOTAL){
      content.innerHTML = `<h3>Element Recall — Finished</h3>`;
      const resultEl = document.createElement('div');
      content.appendChild(resultEl);
      if(correct >= 4) api.win('elementRecall', 3, resultEl, `${correct}/${TOTAL} correct!`);
      else api.lose(resultEl, `${correct}/${TOTAL} correct — need 4+ to earn cash.`);
      return;
    }
    const pool = ELEMENTS.filter(e => e[1] && e[2]);
    const answer = pool[Math.floor(Math.random() * pool.length)];
    const choices = [answer];
    while(choices.length < 4){
      const c = pool[Math.floor(Math.random() * pool.length)];
      if(!choices.includes(c)) choices.push(c);
    }
    choices.sort(() => Math.random() - 0.5);
    content.innerHTML = `
      <h3>Element Recall (${round}/${TOTAL})</h3>
      <div style="font-size:2.8rem; margin:1rem 0;">${answer[1]}</div>
      <div style="display:flex; flex-direction:column; gap:0.5rem;">
        ${choices.map(c => `<button class="tool-btn er-choice" data-name="${c[2]}">${c[2]}</button>`).join('')}
      </div>`;
    content.querySelectorAll('.er-choice').forEach(btn => {
      btn.addEventListener('click', () => { if(btn.dataset.name === answer[2]) correct++; nextRound(); });
    });
  }
  nextRound();
} });
