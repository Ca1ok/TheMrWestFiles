// Minigame: Wave Match — Wavelength → frequency
Games.register({ id: "waveMatch", play(content, api){
  const c = 3e8; // speed of light, m/s
  const wavelengthNm = Math.floor(200 + Math.random() * 600); // visible-ish spectrum range
  const wavelengthM = wavelengthNm * 1e-9;
  const correctFreqTHz = Math.round((c / wavelengthM) / 1e12 * 100) / 100;
  content.innerHTML = `
    <h3>Wave Match</h3>
    <p class="cc-desc">A light wave has a wavelength of ${wavelengthNm} nm. What's its frequency, in THz? (f = c / λ)</p>
    <input type="number" step="0.01" id="waveInput" placeholder="THz" style="width:140px;">
    <button class="nav-btn" id="waveSubmit" style="margin-left:0.5rem;">Submit</button>
    <div id="waveResult"></div>`;
  document.getElementById('waveSubmit').addEventListener('click', () => {
    const guess = parseFloat(document.getElementById('waveInput').value);
    const resultEl = document.getElementById('waveResult');
    if(!isNaN(guess) && Math.abs(guess - correctFreqTHz) <= correctFreqTHz * 0.03) api.win('waveMatch', 3, resultEl, `Correct — ${correctFreqTHz} THz.`);
    else api.lose(resultEl, `Correct answer was ${correctFreqTHz} THz.`);
  });
} });
