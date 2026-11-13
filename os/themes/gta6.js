/* GTA VI — a neon-sunset "Vice City" look: hot pink, orange and teal on deep purple. Automatic from Nov 19 to Nov 26, 2026 (both days included).
 * (Colours and shapes only — no logos or artwork from the game.)  To run it again another year, delete the `years` line. */
(function(){
  const svg = s => 'url("data:image/svg+xml,' + encodeURIComponent(s) + '")';
  const skyline = svg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice">'
    + '<g fill="#12041f"><rect x="40" y="690" width="70" height="210"/><rect x="120" y="640" width="55" height="260"/><rect x="185" y="720" width="80" height="180"/><rect x="300" y="670" width="60" height="230"/><rect x="1180" y="700" width="70" height="200"/><rect x="1260" y="650" width="60" height="250"/><rect x="1330" y="715" width="90" height="185"/><rect x="1440" y="680" width="70" height="220"/></g>'
    + '<g stroke="#0a0214" stroke-width="12" fill="none" stroke-linecap="round"><path d="M1010 900 C1020 760 1050 680 1085 600"/><path d="M1390 900 C1385 800 1360 720 1330 650"/><path d="M230 900 C238 800 262 730 300 668"/></g>'
    + '<g fill="#0a0214"><g transform="translate(1085 600)"><ellipse rx="95" ry="14" transform="rotate(-25)"/><ellipse rx="95" ry="14" transform="rotate(20)"/><ellipse rx="85" ry="13" transform="rotate(-62)"/><ellipse rx="85" ry="13" transform="rotate(58)"/><ellipse rx="70" ry="12" transform="rotate(90)"/></g>'
    + '<g transform="translate(1330 650) scale(.8)"><ellipse rx="95" ry="14" transform="rotate(-25)"/><ellipse rx="95" ry="14" transform="rotate(25)"/><ellipse rx="85" ry="13" transform="rotate(-65)"/><ellipse rx="85" ry="13" transform="rotate(62)"/></g>'
    + '<g transform="translate(300 668) scale(.7)"><ellipse rx="95" ry="14" transform="rotate(-22)"/><ellipse rx="95" ry="14" transform="rotate(24)"/><ellipse rx="85" ry="13" transform="rotate(-62)"/><ellipse rx="85" ry="13" transform="rotate(60)"/></g></g>'
    + '<rect y="860" width="1600" height="40" fill="#0a0214"/></svg>');
  WestThemes.register({
    id: 'gta6', name: 'GTA VI', blurb: 'Neon sunset, pink skies and palm trees.', mode: 'dark', swatch: ['#ff4fa3', '#ff9a3c', '#2ee6d6'],
    schedule: { from: [11, 19], to: [11, 26], years: [2026] }, priority: 20,
    vars: {
      '--bg': '#12061f', '--bg2': '#190a2b', '--card': '#220f38', '--card2': '#2d1648', '--card3': '#3a1d5c',
      '--fill': 'rgba(255,214,240,.09)', '--fill2': 'rgba(255,214,240,.15)', '--sep': 'rgba(255,170,225,.16)',
      '--label': '#fff1fa', '--label2': 'rgba(255,241,250,.66)', '--label3': 'rgba(255,241,250,.38)',
      '--tint': '#ff4fa3', '--tint2': '#ff8fc6', '--tint-dim': 'rgba(255,79,163,.2)',
      '--good': '#2ee6a8', '--bad': '#ff5470', '--warn': '#ffb340', '--blue': '#3fd0ff',
      '--material': 'rgba(32,12,54,.74)', '--scrim': 'rgba(10,0,24,.55)', '--shadow': '0 10px 40px rgba(255,79,163,.18),0 10px 40px rgba(0,0,0,.5)'
    },
    wall: skyline + ' center bottom/cover no-repeat, radial-gradient(circle at 50% 69%,#fff2a8 0,#ffd36b 5%,#ff9a3c 11%,rgba(255,90,140,0) 24%), linear-gradient(180deg,#14052b 0%,#3f0f6b 30%,#c42d88 56%,#ff7a45 72%,#ffc86a 82%,#6b1b6f 82.1%,#12041f 100%)',
    three: { k: .7, bg: '#14052b', fog: '#3a0f5e', sky: '#8a4ad8', ground: '#4a1456', dir: '#ff9ac8', point: '#ff4fa3', pk: .55,
      backdrop: [[0, '#0c0220'], [.4, '#3f0f6b'], [.7, '#c42d88'], [.9, '#ff8a4a'], [1, '#ffd36b']], stars: true },
    fx: { kind: 'embers', colors: ['#ff4fa3', '#ff9a3c', '#2ee6d6', '#ffd36b'], rate: 14, size: .008, fall: .1, dir: 1, shape: 'glow', blend: 'add', alpha: .85, drag: .6, life: 7 }
  });
})();
