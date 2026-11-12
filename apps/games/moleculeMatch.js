// Minigame: Molecule Speed Match — Name → formula
Games.register({ id: "moleculeMatch", play(content, api){
  let correct = 0, round = 0;
  const TOTAL = 5;
  function nextRound(){
    round++;
    if(round > TOTAL){
      content.innerHTML = `<h3>Molecule Speed Match — Finished</h3>`;
      const resultEl = document.createElement('div');
      content.appendChild(resultEl);
      if(correct >= 4) api.win('moleculeMatch', 3, resultEl, `${correct}/${TOTAL} correct!`);
      else api.lose(resultEl, `${correct}/${TOTAL} correct — need 4+ to earn cash.`);
      return;
    }
    const answer = RECIPES[Math.floor(Math.random() * RECIPES.length)];
    const choices = [answer.formula];
    while(choices.length < 4){
      const c = RECIPES[Math.floor(Math.random() * RECIPES.length)].formula;
      if(!choices.includes(c)) choices.push(c);
    }
    choices.sort(() => Math.random() - 0.5);
    content.innerHTML = `
      <h3>Molecule Speed Match (${round}/${TOTAL})</h3>
      <div style="font-size:1.3rem; margin:1rem 0;">${answer.name}</div>
      <div style="display:flex; flex-direction:column; gap:0.5rem;">
        ${choices.map(c => `<button class="tool-btn mm-choice" data-f="${c}">${c}</button>`).join('')}
      </div>`;
    content.querySelectorAll('.mm-choice').forEach(btn => {
      btn.addEventListener('click', () => { if(btn.dataset.f === answer.formula) correct++; nextRound(); });
    });
  }
  nextRound();
} });
