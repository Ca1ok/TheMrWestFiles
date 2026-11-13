/* The hand-picked themes (no schedule). Copy a block, change the id / colours, and it appears in Settings → Themes. */
(function(){
  const R = WestThemes.register;
  const tokens = (o) => Object.assign({ '--good': '#5cc06e', '--bad': '#ee6259', '--warn': '#f0c04a', '--blue': '#6aaef0' }, o);

  R({ id: 'midnight', name: 'Midnight', blurb: 'Deep blue with a cool cyan glow.', mode: 'dark', swatch: ['#4cc9f0', '#1b2a4a', '#0a1020'],
    vars: tokens({ '--bg': '#080d1a', '--bg2': '#0c1426', '--card': '#121c33', '--card2': '#1a2744', '--card3': '#223256', '--fill': 'rgba(210,230,255,.08)', '--fill2': 'rgba(210,230,255,.14)', '--sep': 'rgba(210,230,255,.12)',
      '--label': '#e8f1ff', '--label2': 'rgba(232,241,255,.62)', '--label3': 'rgba(232,241,255,.36)', '--tint': '#4cc9f0', '--tint2': '#8fdcf7', '--tint-dim': 'rgba(76,201,240,.18)', '--material': 'rgba(10,16,32,.74)', '--scrim': 'rgba(0,4,16,.55)', '--shadow': '0 10px 40px rgba(0,0,0,.5)' }),
    wall: 'radial-gradient(70% 60% at 20% 10%,#1c3b73 0%,transparent 60%),radial-gradient(60% 55% at 85% 90%,#2a1d5c 0%,transparent 60%),linear-gradient(160deg,#0a1226,#060a16)',
    three: { k: .5, bg: '#070c1a', fog: '#0c1a38', sky: '#5b86d6', ground: '#1a2a52', dir: '#cfe4ff', point: '#4cc9f0', backdrop: [[0, '#04070f'], [.6, '#0d1d40'], [1, '#2a5a9a']], stars: true } });

  R({ id: 'forest', name: 'Forest', blurb: 'Moss greens and warm wood.', mode: 'dark', swatch: ['#7bc96f', '#2c4a2b', '#0d1a0f'],
    vars: tokens({ '--bg': '#0b140c', '--bg2': '#101d12', '--card': '#16261a', '--card2': '#1e3322', '--card3': '#28422d', '--fill': 'rgba(225,245,215,.08)', '--fill2': 'rgba(225,245,215,.14)', '--sep': 'rgba(225,245,215,.12)',
      '--label': '#eaf5e0', '--label2': 'rgba(234,245,224,.62)', '--label3': 'rgba(234,245,224,.36)', '--tint': '#7bc96f', '--tint2': '#a6dd9d', '--tint-dim': 'rgba(123,201,111,.18)', '--material': 'rgba(11,22,13,.74)', '--scrim': 'rgba(0,10,2,.5)', '--shadow': '0 10px 40px rgba(0,0,0,.48)' }),
    wall: 'radial-gradient(70% 60% at 15% 15%,#35603a 0%,transparent 60%),radial-gradient(60% 55% at 90% 85%,#4a3a1f 0%,transparent 60%),linear-gradient(160deg,#0f1e11,#070d08)',
    three: { k: .5, bg: '#0a150c', fog: '#143018', sky: '#8fc98a', ground: '#4a3a22', dir: '#f2f0c8', point: '#9be07d', backdrop: [[0, '#07110a'], [.6, '#16341b'], [1, '#5c8a45']] } });

  R({ id: 'sakura', name: 'Sakura', blurb: 'A soft, bright pink-and-cream light theme.', mode: 'light', swatch: ['#d6457a', '#f9dbe4', '#fff6f8'],
    vars: tokens({ '--bg': '#fbeef1', '--bg2': '#fff6f8', '--card': '#fffafb', '--card2': '#f8e4ea', '--card3': '#f1d4dd', '--fill': 'rgba(120,40,70,.07)', '--fill2': 'rgba(120,40,70,.12)', '--sep': 'rgba(120,40,70,.14)',
      '--label': '#3a1824', '--label2': 'rgba(58,24,36,.64)', '--label3': 'rgba(58,24,36,.38)', '--tint': '#d6457a', '--tint2': '#ee7fa5', '--tint-dim': 'rgba(214,69,122,.14)', '--good': '#2f8f55', '--bad': '#c8344a', '--warn': '#b98318', '--blue': '#3b73b8',
      '--material': 'rgba(255,246,248,.76)', '--scrim': 'rgba(70,20,40,.3)', '--shadow': '0 10px 36px rgba(120,40,70,.2)' }),
    wall: 'radial-gradient(70% 60% at 15% 10%,#ffd3e0 0%,transparent 60%),radial-gradient(60% 55% at 90% 90%,#f6c1d4 0%,transparent 60%),linear-gradient(160deg,#fdeff3,#f4d3de)',
    three: { k: .55, bg: '#f6d6e0', fog: '#f6d6e0', sky: '#ffe9f0', ground: '#d9a0b4', dir: '#fff2f5', point: '#ff8fb4', dirMul: 1, backdrop: [[0, '#e9a8c0'], [.6, '#f6cddb'], [1, '#fff3f6']] } });

  R({ id: 'terminal', name: 'Terminal', blurb: 'Black glass, phosphor green.', mode: 'dark', swatch: ['#39ff88', '#0c1a10', '#000000'],
    vars: tokens({ '--bg': '#030604', '--bg2': '#07100a', '--card': '#0b160e', '--card2': '#112016', '--card3': '#182c1e', '--fill': 'rgba(120,255,170,.07)', '--fill2': 'rgba(120,255,170,.13)', '--sep': 'rgba(120,255,170,.14)',
      '--label': '#c8ffdc', '--label2': 'rgba(200,255,220,.62)', '--label3': 'rgba(200,255,220,.36)', '--tint': '#39ff88', '--tint2': '#86ffb5', '--tint-dim': 'rgba(57,255,136,.16)', '--material': 'rgba(4,10,6,.78)', '--scrim': 'rgba(0,0,0,.6)', '--shadow': '0 10px 40px rgba(0,0,0,.6)' }),
    wall: 'repeating-linear-gradient(0deg,rgba(57,255,136,.045) 0 1px,transparent 1px 3px),radial-gradient(80% 70% at 50% 40%,#08260f 0%,#020503 100%)',
    three: { k: .65, bg: '#020603', fog: '#04180a', sky: '#2a8a52', ground: '#0a2a14', dir: '#b8ffd2', point: '#39ff88', backdrop: [[0, '#010302'], [.7, '#04180a'], [1, '#0b4a22']] } });
})();
