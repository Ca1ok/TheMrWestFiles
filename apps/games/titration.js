// Minigame: Titration Drop — Find the endpoint
Games.register({ id: "titration", play(content, api){
  const target = 20 + Math.random() * 60;
  let volume = 0;
  content.innerHTML = `
    <h3>Titration Drop</h3>
    <p class="cc-desc">Add titrant one mL at a time and stop the instant the indicator changes color. You won't see the actual volume until you stop.</p>
    <div style="font-size:2.2rem; margin:1rem 0;" id="titrationColor">🧪 Colorless</div>
    <button class="nav-btn" id="titrationDropBtn" style="display:inline-block; margin:0 0.5rem 0 0;">Add 1 mL</button>
    <button class="tool-btn" id="titrationStopBtn">Stop — it changed!</button>
    <div id="titrationResult"></div>`;
  document.getElementById('titrationDropBtn').addEventListener('click', () => {
    volume += 1;
    document.getElementById('titrationColor').textContent = volume >= target - 3 ? '🌸 Faint pink...' : '🧪 Colorless';
  });
  document.getElementById('titrationStopBtn').addEventListener('click', () => {
    const diff = Math.abs(volume - target);
    const resultEl = document.getElementById('titrationResult');
    if(diff <= 2) api.win('titration', 4, resultEl, `True endpoint was ${target.toFixed(1)} mL — within ${diff.toFixed(1)} mL!`);
    else api.lose(resultEl, `True endpoint was ${target.toFixed(1)} mL — you were off by ${diff.toFixed(1)} mL.`);
  });
} });
