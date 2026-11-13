/* CHRISTMAS — pine-night green, candy red and gold, with falling snow. Automatic from 7 days before Christmas (Dec 18) to 7 days after (Jan 1), every year. */
(function(){
  const svg = s => 'url("data:image/svg+xml,' + encodeURIComponent(s) + '")';
  const tree = (x, y, s) => '<g transform="translate(' + x + ' ' + y + ') scale(' + s + ')"><rect x="-6" y="0" width="12" height="26" fill="#2b1a10"/><path d="M0-120 L38-60 L18-60 L52-6 L-52-6 L-18-60 L-38-60Z" fill="#0f3a27"/><path d="M0-120 L14-96 L-14-96Z M-17-60 L-26-44 L-8-48Z M17-60 L26-44 L8-48Z" fill="#eaf4ff"/></g>';
  const hills = svg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice">'
    + '<path d="M0 760 C220 700 420 690 640 735 C860 780 1060 700 1280 690 C1420 685 1520 710 1600 735 L1600 900 L0 900Z" fill="#c6d8ee"/>'
    + tree(210, 735, 1) + tree(290, 748, .75) + tree(1330, 716, 1.15) + tree(1420, 738, .8) + tree(1180, 728, .6)
    + '<path d="M0 830 C260 790 520 800 780 830 C1040 860 1300 800 1600 820 L1600 900 L0 900Z" fill="#f3f8ff"/></svg>');
  WestThemes.register({
    id: 'christmas', name: 'Christmas', blurb: 'Pine nights, red and gold, snow on the desktop.', mode: 'dark', swatch: ['#e5383b', '#f5c451', '#1c3a2b'],
    schedule: { anchor: [12, 25], before: 7, after: 7 }, priority: 10,
    vars: {
      '--bg': '#0a1511', '--bg2': '#0e1c16', '--card': '#14261d', '--card2': '#1b3226', '--card3': '#243f31',
      '--fill': 'rgba(255,244,226,.08)', '--fill2': 'rgba(255,244,226,.14)', '--sep': 'rgba(255,244,226,.13)',
      '--label': '#fff6e8', '--label2': 'rgba(255,246,232,.66)', '--label3': 'rgba(255,246,232,.38)',
      '--tint': '#e5383b', '--tint2': '#ff6f6f', '--tint-dim': 'rgba(229,56,59,.2)',
      '--good': '#4fcf7c', '--bad': '#ff6b5e', '--warn': '#f5c451', '--blue': '#7cc4ff',
      '--material': 'rgba(11,27,20,.74)', '--scrim': 'rgba(0,10,5,.55)', '--shadow': '0 10px 40px rgba(0,0,0,.5)'
    },
    wall: hills + ' center bottom/cover no-repeat, radial-gradient(circle at 80% 14%,#fff8dc 0,#fff1b8 2.2%,rgba(255,241,184,.25) 4.5%,rgba(255,241,184,0) 12%), linear-gradient(180deg,#071326 0%,#0f2a44 45%,#1d4a63 78%,#2d6a7c 100%)',
    three: { k: .6, bg: '#0a1a2c', fog: '#16384e', sky: '#8fb8d8', ground: '#cfe0f0', dir: '#fff0d6', point: '#ffc65a', pk: .5,
      backdrop: [[0, '#06101f'], [.55, '#10304a'], [.85, '#2a6078'], [1, '#d8e8f2']], stars: true },
    fx: { kind: 'snow', colors: ['#ffffff', '#e8f3ff'], rate: 34, size: .011, fall: .15, dir: -1, shape: 'glow', blend: 'blend', alpha: .92, drag: .9, life: 7 }
  });
})();
