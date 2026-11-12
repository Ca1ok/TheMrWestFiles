// Minigame: Reaction Timer — Test your reflexes
Games.register({ id: "reaction", play(content, api){
  content.innerHTML = `
    <h3>Reaction Timer</h3>
    <p class="cc-desc">Click the box the instant it turns green. Faster reactions pay more — but click too early and you get nothing.</p>
    <div id="reactBox" style="width:100%; height:120px; background:#7a1f1f; display:flex; align-items:center; justify-content:center; color:#fff; cursor:pointer; border-radius:8px;">Wait for green...</div>
    <div id="reactResult"></div>`;
  const box = document.getElementById('reactBox');
  let startTime = null, armed = false;
  const delay = 1000 + Math.random() * 3000;
  setTimeout(() => {
    armed = true; startTime = performance.now();
    box.style.background = '#4fae5c'; box.textContent = 'CLICK NOW!';
  }, delay);
  box.addEventListener('click', () => {
    const resultEl = document.getElementById('reactResult');
    if(!armed){ api.lose(resultEl, 'Too early! Wait for green.'); box.style.background = '#7a1f1f'; box.textContent = 'Too early'; return; }
    const rt = performance.now() - startTime;
    box.textContent = `${rt.toFixed(0)} ms`;
    if(rt <= 400) api.score('reaction', rt <= 150 ? 1000 : Math.round(1000 * (450 - rt) / 300), resultEl, `${rt.toFixed(0)}ms reaction time!`);
    else api.lose(resultEl, `${rt.toFixed(0)}ms — need 400ms or under to earn cash.`);
    armed = false;
  });
} });
