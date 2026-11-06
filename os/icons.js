// WestOS icon set: hand-drawn 24×24 line glyphs (stroke = currentColor) for the UI, + the app registry.
// App icons themselves are PNG files in /assets/icons/<AppId>.png (regenerate with tools/make-icons.py).
// Adding an app = one entry in OS_APPS here, its glyph below, and a PNG in assets/icons — the desktop, dock and window
// title bars all read from this registry.
const OS_GLYPHS = {
  news:'<path d="M5 4h11a2 2 0 0 1 2 2v13a1 1 0 0 0 1 1H7a3 3 0 0 1-3-3V5a1 1 0 0 1 1-1z"/><path d="M18 9h2a1 1 0 0 1 1 1v8a2 2 0 0 1-2 2"/><path d="M8 8h7M8 12h7M8 16h4"/>',
  stocks:'<path d="M3 17l5.5-5.5 4 4L21 7"/><path d="M15 7h6v6"/>',
  shop:'<path d="M5 8h14l-1 12H6L5 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  lab:'<path d="M9 3h6M10 3v6L4.6 18.4A2 2 0 0 0 6.3 21.5h11.4a2 2 0 0 0 1.7-3.1L14 9V3"/><path d="M7.5 15h9"/>',
  home:'<path d="M3 11.5L12 4l9 7.5"/><path d="M5.5 10v10h13V10"/><path d="M10 20v-6h4v6"/>',
  bank:'<path d="M3 9.5L12 4l9 5.5"/><path d="M4.5 20h15M6 9.5V17M10 9.5V17M14 9.5V17M18 9.5V17"/>',
  messages:'<path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-8l-5 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/>',
  files:'<path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>',
  settings:'<circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>',
  photos:'<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="M3.5 17l5-4.5 4 3.5 3-2.5 5 4.5"/>',
  notes:'<path d="M6 3h9l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14.5 3v4.5H19M8.5 12h7M8.5 16h5"/>',
  games:'<path d="M7 8h10a4 4 0 0 1 3.9 4.9l-.8 4a2.4 2.4 0 0 1-4 1.2L14 16.5h-4l-2.1 1.6a2.4 2.4 0 0 1-4-1.2l-.8-4A4 4 0 0 1 7 8z"/><path d="M8 11v3M6.5 12.5h3M15.5 11.5h.01M17.5 13.5h.01"/>',
  // UI glyphs
  plus:'<path d="M12 5v14M5 12h14"/>', minus:'<path d="M5 12h14"/>', check:'<path d="M5 12.5l4.5 4.5L19 7"/>', x:'<path d="M6 6l12 12M18 6L6 18"/>',
  chevL:'<path d="M15 5l-7 7 7 7"/>', chevR:'<path d="M9 5l7 7-7 7"/>', chevD:'<path d="M5 9l7 7 7-7"/>', chevU:'<path d="M5 15l7-7 7 7"/>',
  search:'<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>', lock:'<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  cloud:'<path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 10.5a3.8 3.8 0 0 1-.5 7.5H7z"/>', cloudOff:'<path d="M7 18a4.5 4.5 0 0 1-.6-8.96M10 5.5A6 6 0 0 1 18 10.5a3.8 3.8 0 0 1 2 6.9M3 3l18 18"/>',
  trash:'<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>', share:'<path d="M12 15V3m0 0L8 7m4-4l4 4M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>', bell:'<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16zM10 20a2 2 0 0 0 4 0"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>', dollar:'<path d="M12 3v18M16.5 7.5C15.6 6.4 14 6 12 6c-2.5 0-4 1.2-4 3s1.5 2.5 4 3 4 1.2 4 3-1.5 3-4 3c-2 0-3.6-.5-4.5-1.5"/>',
  up:'<path d="M12 19V5m0 0l-6 6m6-6l6 6"/>', down:'<path d="M12 5v14m0 0l-6-6m6 6l6-6"/>', edit:'<path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/>',
  grid:'<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6L19 19M5 19l1.4-1.4M17.6 6.4L19 5"/>', moon:'<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/>',
  play:'<path d="M7 4.5v15l12-7.5-12-7.5z"/>', image:'<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="M3.5 17l5-4.5 4 3.5 3-2.5 5 4.5"/>',
  star:'<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 17l-5.2 2.7 1-5.9L3.5 9.7l5.9-.8L12 3.5z"/>', flame:'<path d="M12 21a6 6 0 0 0 6-6c0-4-3-5.5-4-9-2 1.5-3 3.5-3 5.5-1.2-.7-1.8-1.8-2-3C7.3 10 6 12.3 6 15a6 6 0 0 0 6 6z"/>',
  key:'<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3"/>', flask:'<path d="M9 3h6M10 3v6L4.6 18.4A2 2 0 0 0 6.3 21.5h11.4a2 2 0 0 0 1.7-3.1L14 9V3"/>',
  layers:'<path d="M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5"/>', refresh:'<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>', shield:'<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z"/>',
  wifi:'<path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.8 16a5 5 0 0 1 6.4 0M12 19.5h.01"/>', bolt:'<path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/>',
  trophy:'<path d="M8 4h8v5a4 4 0 0 1-8 0V4z"/><path d="M8 6H5a1 1 0 0 0-1 1c0 2.2 1.6 3.6 4 3.8M16 6h3a1 1 0 0 1 1 1c0 2.2-1.6 3.6-4 3.8"/><path d="M12 13v4M8.5 20h7M10 17h4"/>',
  preview:'<rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="9" cy="10.5" r="1.6"/><path d="M3.5 16.5l4.5-4 3.5 3 3-2.5 6 4.5"/><path d="M17 3.5v3M15.5 5h3"/>',
  bug:'<path d="M9 7.5V7a3 3 0 0 1 6 0v.5M7 10h10v4a5 5 0 0 1-10 0v-4zM12 10v9M3 12h4M17 12h4M4 6.5l3 2.5M20 6.5l-3 2.5M4 19l3-2.5M20 19l-3-2.5"/>',
  arcade:'<circle cx="12" cy="6" r="3"/><path d="M12 9v6"/><path d="M4.5 21v-2.5a2.5 2.5 0 0 1 2.5-2.5h10a2.5 2.5 0 0 1 2.5 2.5V21z"/><circle cx="8.5" cy="18.8" r=".9" fill="currentColor"/><circle cx="15.5" cy="18.8" r=".9" fill="currentColor"/>'
};
// id, display name, file (relative to /apps), tile gradient + glyph (used only by tools/make-icons.py to draw the PNG)
const OS_ICON_BASE = (() => { const s = document.currentScript; return s && s.src ? s.src.replace(/os\/icons\.js.*$/, 'assets/icons/') : 'assets/icons/'; })();
const OS_APPS = [
  { id:'Messages',   name:'Messages',    file:'Messages.html',   g:['#6fd070','#2f9a49'], glyph:'messages' },
  { id:'Stocks',     name:'Stocks',      file:'Stocks.html',     g:['#3fae78','#1c6a4a'], glyph:'stocks'   },
  { id:'News',       name:'News',        file:'News.html',       g:['#ea8a47','#a8431f'], glyph:'news'     },
  { id:'WestShop',   name:'WestShop',    file:'WestShop.html',   g:['#efc062','#b9822a'], glyph:'shop'     },
  { id:'WestLab',    name:'WestLab',     file:'WestLab.html',    g:['#52b5b0','#27677a'], glyph:'lab'      },
  { id:'RealEstate', name:'Real Estate', file:'RealEstate.html', g:['#c98a62','#7b4b31'], glyph:'home'     },
  { id:'Bank',       name:'Bank',        file:'Bank.html',       g:['#4a6fa8','#22375e'], glyph:'bank'     },
  { id:'Games',      name:'Games',       file:'Games.html',      g:['#b36be0','#5a2f9a'], glyph:'games'    },
  { id:'Arcade',     name:'Arcade',      file:'Arcade.html',     g:['#ff4fd8','#3a1a8c'], glyph:'arcade'   },
  { id:'Photos',     name:'Photos',      file:'Photos.html',     g:['#f4a35a','#c23b6b'], glyph:'photos'   },
  { id:'Preview',    name:'Preview',     file:'Preview.html',    g:['#7ab8ff','#3a58c8'], glyph:'preview'  },
  { id:'Leaderboard',name:'Leaderboard', file:'Leaderboard.html',g:['#f2c14e','#c4782a'], glyph:'trophy'   },
  { id:'Notes',      name:'Notes',       file:'Notes.html',      g:['#f4d96f','#d09a22'], glyph:'notes'    },
  { id:'Files',      name:'Files',       file:'Files.html',      g:['#5aaef5','#2d6bb8'], glyph:'files'    },
  { id:'WestReport', name:'WestReport',  file:'WestReport.html', g:['#ef6a5a','#a3262e'], glyph:'bug'      },
  { id:'Settings',   name:'Settings',    file:'Settings.html',   g:['#9a9387','#55504a'], glyph:'settings' }
];
function osIcon(name, size, sw){
  return '<svg class="gl" viewBox="0 0 24 24" width="' + (size || 24) + '" height="' + (size || 24) + '" fill="none" stroke="currentColor" stroke-width="' + (sw || 1.8) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (OS_GLYPHS[name] || '') + '</svg>';
}
function osAppTile(app, size){   // the app icon: a PNG from /assets/icons (used on the desktop, dock, window title bars, notifications…)
  const a = typeof app === 'string' ? OS_APPS.find(x => x.id === app) : app; if(!a) return '';
  return '<span class="tile" style="width:' + size + 'px;height:' + size + 'px"><img src="' + OS_ICON_BASE + a.id + '.png" width="' + size + '" height="' + size + '" alt="" draggable="false" decoding="async"></span>';
}
if(typeof module !== 'undefined') module.exports = { OS_APPS, OS_GLYPHS };
