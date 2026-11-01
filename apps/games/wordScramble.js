// Minigame: Word Scramble — Unscramble the term
Games.register({ id: "wordScramble", play(content, api){
  const words = ['CATALYST', 'ISOTOPE', 'MOLECULE', 'ELECTRON', 'SOLVENT', 'OXIDATION', 'POLYMER', 'VALENCE'];
  const word = words[Math.floor(Math.random() * words.length)];
  const scrambled = word.split('').sort(() => Math.random() - 0.5).join('');
  content.innerHTML = `
    <h3>Word Scramble</h3>
    <p class="cc-desc">Unscramble this chemistry term: <b style="letter-spacing:0.2em;">${scrambled}</b></p>
    <input type="text" id="scrambleInput" style="width:180px; text-transform:uppercase;">
    <button class="nav-btn" id="scrambleSubmit" style="margin-left:0.5rem;">Submit</button>
    <div id="scrambleResult"></div>`;
  document.getElementById('scrambleSubmit').addEventListener('click', () => {
    const resultEl = document.getElementById('scrambleResult');
    if(document.getElementById('scrambleInput').value.trim().toUpperCase() === word) api.win('wordScramble', 2, resultEl, 'Correct!');
    else api.lose(resultEl, `The word was ${word}.`);
  });
} });
