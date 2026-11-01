// Minigame: Element Memory Match — Flip and match
Games.register({ id: "memoryMatch", play(content, api){
  const pool = ELEMENTS.filter(e => e[1] && e[2]).slice();
  const chosen = [];
  while(chosen.length < 6){
    const e = pool[Math.floor(Math.random() * pool.length)];
    if(!chosen.includes(e)) chosen.push(e);
  }
  let cards = [];
  chosen.forEach(e => { cards.push({ key:e[1], label:e[1] }); cards.push({ key:e[1], label:e[2] }); });
  cards.sort(() => Math.random() - 0.5);
  let first = null, matchedCount = 0, lock = false;
  content.innerHTML = `
    <h3>Element Memory Match</h3>
    <p class="cc-desc">Match each symbol to its element name.</p>
    <div id="memGrid" style="display:grid; grid-template-columns:repeat(4,1fr); gap:0.5rem; max-width:420px;">
      ${cards.map((c, i) => `<button class="tool-btn mem-card" data-i="${i}">?</button>`).join('')}
    </div>
    <div id="memResult"></div>`;
  const btns = content.querySelectorAll('.mem-card');
  btns.forEach((btn, i) => {
    btn.addEventListener('click', () => {
      if(lock || btn.classList.contains('matched') || btn === first) return;
      btn.textContent = cards[i].label;
      if(!first){ first = btn; first._idx = i; return; }
      lock = true;
      const secondIdx = i;
      if(cards[first._idx].key === cards[secondIdx].key){
        btn.classList.add('matched'); first.classList.add('matched');
        matchedCount++;
        first = null; lock = false;
        if(matchedCount === 6) api.win('memoryMatch', 4, document.getElementById('memResult'), 'All matched!');
      } else {
        const firstRef = first;
        setTimeout(() => { btn.textContent = '?'; firstRef.textContent = '?'; }, 700);
        first = null; lock = false;
      }
    });
  });
} });
