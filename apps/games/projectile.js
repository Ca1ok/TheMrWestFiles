// Minigame: Projectile Launch — Hit the target
Games.register({ id: "projectile", play(content, api){
  const targetX = 120 + Math.random() * 260;
  content.innerHTML = `
    <h3>Projectile Launch</h3>
    <p class="cc-desc">Hit the flag by choosing the right launch angle and speed (no air resistance, g = 9.8 m/s²).</p>
    <canvas id="projCanvas" width="420" height="220" style="background:rgba(0,0,0,0.25); border:1px solid var(--line); max-width:100%;"></canvas><br>
    <label>Angle: <input type="range" id="projAngle" min="10" max="80" value="45"> <span id="projAngleVal">45</span>°</label><br>
    <label>Speed: <input type="range" id="projSpeed" min="10" max="40" value="25"> <span id="projSpeedVal">25</span> m/s</label><br>
    <button class="nav-btn" id="projFireBtn" style="margin-top:0.5rem;">Fire</button>
    <div id="projResult"></div>`;
  const canvas = document.getElementById('projCanvas');
  const ctx = canvas.getContext('2d');
  const scale = 4; // px per meter
  function drawScene(landingXpx){
    ctx.clearRect(0, 0, 420, 220);
    ctx.strokeStyle = 'rgba(244,236,216,0.4)'; ctx.beginPath(); ctx.moveTo(0, 200); ctx.lineTo(420, 200); ctx.stroke();
    // target flag
    const flagPx = targetX * scale / 10;
    ctx.fillStyle = '#4fae5c'; ctx.fillRect(flagPx, 180, 4, 20); ctx.fillRect(flagPx, 178, 14, 8);
    if(landingXpx !== undefined){
      ctx.fillStyle = landingXpx !== null ? '#d97a3f' : '#c23b3b';
    }
  }
  drawScene();
  const angleInput = document.getElementById('projAngle'), speedInput = document.getElementById('projSpeed');
  angleInput.addEventListener('input', () => document.getElementById('projAngleVal').textContent = angleInput.value);
  speedInput.addEventListener('input', () => document.getElementById('projSpeedVal').textContent = speedInput.value);
  document.getElementById('projFireBtn').addEventListener('click', () => {
    const angleDeg = parseFloat(angleInput.value), speed = parseFloat(speedInput.value);
    const rad = angleDeg * Math.PI / 180, g = 9.8;
    const range = (speed * speed * Math.sin(2 * rad)) / g; // meters
    drawScene();
    // draw trajectory
    ctx.strokeStyle = '#d97a3f'; ctx.beginPath();
    for(let x = 0; x <= range; x += 0.5){
      const t = x / (speed * Math.cos(rad));
      const y = speed * Math.sin(rad) * t - 0.5 * g * t * t;
      const px = x * scale / 10, py = 200 - y * scale / 2;
      if(x === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    const resultEl = document.getElementById('projResult');
    const diff = Math.abs(range - targetX);
    if(diff <= 8) api.win('projectile', 5, resultEl, `Landed ${range.toFixed(1)}m — target was ${targetX.toFixed(1)}m!`);
    else api.lose(resultEl, `Landed ${range.toFixed(1)}m — target was ${targetX.toFixed(1)}m (off by ${diff.toFixed(1)}m).`);
  });
} });
