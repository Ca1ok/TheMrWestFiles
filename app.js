/* ================= WANTED POSTER (poster page only) ================= */
if(document.getElementById('missingBanner')){
  document.getElementById('missingBanner').textContent = `Missing ${WANTED_DATA.missingDays} day(s)`;
  document.getElementById('chargeList').innerHTML = WANTED_DATA.charges.map(c =>
    `<li><span class="count">${c.count}</span><span>${c.text}</span></li>`).join('');
  document.getElementById('sentenceList').innerHTML = WANTED_DATA.sentence.map(s =>
    `<li><span class="count">${s.count}</span><span>${s.text}</span></li>`).join('');
}

/* ================= FIREBASE (shared by market sync + leaderboard) ================= */
const firebaseConfig = {
  apiKey: "AIzaSyBNT1jvi0El_txSKTjCGS5MeBbVz15DKs4",
  authDomain: "mrwestfiles.firebaseapp.com",
  databaseURL: "https://mrwestfiles-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "mrwestfiles",
  storageBucket: "mrwestfiles.firebasestorage.app",
  messagingSenderId: "761539070041",
  appId: "1:761539070041:web:392762db7b305b2b3e4948"
};
const FIREBASE_CONFIGURED = firebaseConfig.apiKey !== "YOUR_API_KEY";

let db = null;
if(FIREBASE_CONFIGURED){
  try{
    firebase.initializeApp(firebaseConfig);
    db = firebase.database();
  } catch(e){ db = null; }
}

// stable per-browser ID, used both to back up this player's portfolio and to identify them on the leaderboard
let investorId = localStorage.getItem('mrwestcoin_investor_id');
if(!investorId){
  investorId = 'inv_' + Math.random().toString(36).slice(2, 10);
  localStorage.setItem('mrwestcoin_investor_id', investorId);
}

/* ================= NAV (real links now — just keep the site nav's active-page highlight) ================= */
document.querySelectorAll('#siteNav a').forEach(a => {
  if(a.getAttribute('href') === location.pathname.split('/').pop() ||
     (a.getAttribute('href') === 'index.html' && (location.pathname === '/' || location.pathname.endsWith('/')))){
    a.classList.add('active');
  }
});

window.addEventListener('resize', () => {
  if(typeof positionVideoPopup === 'function') positionVideoPopup();
  if(typeof drawChart === 'function') drawChart();
});


/* ================= LOW ATTENTION SPAN MODE (several distinct clips, floatable popup) ================= */
const VIDEO_OPTIONS = [
  { id: 'QPW3XwBoQlw', label: 'Subway Surfers', aspect: 9/16 },
  { id: 'vnM6WJrWdkk', label: 'Subway Surfers (Long)', aspect: 16/9 },
  { id: '0y3iAtrfKjk', label: 'Minecraft Parkour', aspect: 9/16 },
];
let videoIndex = parseInt(localStorage.getItem('lasVideoIndex') ?? '-1', 10); // -1 = off

const lasToggle = document.getElementById('lasToggle');
const videoPopup = document.getElementById('videoPopup');
const videoFrame = document.getElementById('videoFrame');
const videoLabel = document.getElementById('videoLabel');
const videoDragBar = document.getElementById('videoDragBar');
const videoClose = document.getElementById('videoClose');
const DRAG_BAR_H = 28;

// popup position in screen space (persisted so it stays where you left it)
let popupPos = JSON.parse(localStorage.getItem('lasPopupPos') || 'null');

function positionVideoPopup(){
  if(videoIndex < 0 || !videoPopup) return;
  const opt = VIDEO_OPTIONS[videoIndex];
  const maxH = window.innerHeight * 0.8;
  const maxW = Math.min(520, window.innerWidth * 0.42);
  let bodyH = maxH - DRAG_BAR_H, w = bodyH * opt.aspect;
  if(w > maxW){ w = maxW; bodyH = w / opt.aspect; }
  videoPopup.style.width = w + 'px';
  videoPopup.style.height = (bodyH + DRAG_BAR_H) + 'px';

  // clamp any saved/current position back onto screen after a resize
  if(!popupPos){
    popupPos = { x: window.innerWidth - w - 24, y: (window.innerHeight - (bodyH+DRAG_BAR_H)) / 2 };
  }
  popupPos.x = Math.min(Math.max(0, popupPos.x), window.innerWidth - w);
  popupPos.y = Math.min(Math.max(0, popupPos.y), window.innerHeight - (bodyH+DRAG_BAR_H));
  applyPopupPos();
}
function applyPopupPos(){
  videoPopup.style.left = popupPos.x + 'px';
  videoPopup.style.top = popupPos.y + 'px';
  videoPopup.style.transform = 'none';
}

function updateVideoPopupVisibility(showIfOn){
  if(!videoPopup) return;
  const shouldShow = showIfOn && videoIndex >= 0;
  videoPopup.classList.toggle('show', shouldShow);
  if(!shouldShow){ videoFrame.src = ''; }
  else{
    const opt = VIDEO_OPTIONS[videoIndex];
    videoLabel.textContent = opt.label;
    videoFrame.src = `https://www.youtube.com/embed/${opt.id}?autoplay=1&mute=1&loop=1&playlist=${opt.id}&controls=0`;
  }
}

function applyLasLabel(){
  if(!lasToggle) return;
  if(videoIndex < 0){ lasToggle.textContent = 'Off'; lasToggle.classList.remove('active'); }
  else{ lasToggle.textContent = VIDEO_OPTIONS[videoIndex].label; lasToggle.classList.add('active'); }
}

function toggleLas(){
  videoIndex += 1;
  if(videoIndex >= VIDEO_OPTIONS.length) videoIndex = -1;
  localStorage.setItem('lasVideoIndex', videoIndex);
  applyLasLabel();
  positionVideoPopup();
  updateVideoPopupVisibility(true);
}

// everything below only exists on the poster page, where the popup widget itself lives
if(lasToggle){
  applyLasLabel();
  positionVideoPopup();
  updateVideoPopupVisibility(true);

  lasToggle.addEventListener('click', toggleLas);
  videoClose.addEventListener('click', () => {
    videoIndex = -1;
    localStorage.setItem('lasVideoIndex', videoIndex);
    applyLasLabel();
    updateVideoPopupVisibility(true);
  });

  // drag the popup freely around screen space
  let draggingPopup = false, popupDragStart = {x:0,y:0}, popupStart = {x:0,y:0};
  videoDragBar.addEventListener('pointerdown', (e) => {
    draggingPopup = true;
    popupDragStart = { x:e.clientX, y:e.clientY };
    popupStart = { ...popupPos };
  });
  window.addEventListener('pointermove', (e) => {
    if(!draggingPopup) return;
    const w = videoPopup.offsetWidth, h = videoPopup.offsetHeight;
    popupPos.x = Math.min(Math.max(0, popupStart.x + (e.clientX - popupDragStart.x)), window.innerWidth - w);
    popupPos.y = Math.min(Math.max(0, popupStart.y + (e.clientY - popupDragStart.y)), window.innerHeight - h);
    applyPopupPos();
  });
  window.addEventListener('pointerup', () => {
    if(!draggingPopup) return;
    draggingPopup = false;
    localStorage.setItem('lasPopupPos', JSON.stringify(popupPos));
  });
}



/* ================= MrWestCoin (shared market — static market-data.json, updated by GitHub Actions) ================= */
// Market data is a static file (market-data.json) updated every 10 minutes by a scheduled
// GitHub Action, NOT Firebase — see the note further down for why. Player accounts, the
// leaderboard, and the marketplace still use Firebase, since that data is genuinely per-player
// and comparatively tiny.
const STORAGE_KEY = 'mrwestcoin_portfolio';

function loadPortfolio(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if(!raw) return { cash:1000, lots:[], nextLotId:1, trades:[], elements:{}, compounds:{}, tools:['basic'], reactors:{}, reactorPending:{} };
  const p = JSON.parse(raw);
  // migrate old aggregate-holdings saves into a single lot so nothing is lost
  if(p.lots === undefined){
    p.lots = p.held > 0 ? [{ id:1, qty:p.held, buyPrice: 12.5, time: new Date().toLocaleString() }] : [];
    p.nextLotId = 2;
    delete p.held;
  }
  // older saves predate the element economy entirely — without this, any buy/craft/sell
  // action throws immediately because portfolio.elements (etc.) is undefined
  if(!p.elements) p.elements = {};
  if(!p.compounds) p.compounds = {};
  if(!p.tools) p.tools = ['basic'];
  if(!p.reactors) p.reactors = {};
  if(!p.reactorPending) p.reactorPending = {};
  return p;
}
function savePortfolio(p){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  if(db && investorId){
    // this is what stops the stock (and elements/compounds/tools/in-progress reactors) you
    // have from disappearing — everything is backed up, not just the computed leaderboard
    // number, so it survives a cleared cache, a new device, or closing the tab mid-craft
    db.ref('players/' + investorId).set({
      cash: p.cash, lots: p.lots, trades: p.trades.slice(-200),
      elements: p.elements || {}, compounds: p.compounds || {}, tools: p.tools || ['basic'],
      reactors: p.reactors || {}, reactorPending: p.reactorPending || {},
      nameLocked: !!p.nameLocked, updatedAt: Date.now()
    }).catch(() => {});
  }
}
let portfolio = loadPortfolio();
let playerCashListenerRef = null;

// Loads (or initializes) player data for whichever account ID is currently active. Called once
// at startup, and again any time the active account switches (sign in, sign out, or upgrading
// from anonymous to a real account) — so the same logic handles all three cases identically.
function loadPlayerData(uid){
  if(!db || !uid) return;
  db.ref('players/' + uid).once('value').then(snap => {
    const remote = snap.val();
    if(remote){
      portfolio = {
        cash: remote.cash, lots: remote.lots || [], trades: remote.trades || [],
        elements: remote.elements || {}, compounds: remote.compounds || {}, tools: remote.tools || ['basic'],
        reactors: remote.reactors || {}, reactorPending: remote.reactorPending || {},
        nameLocked: !!remote.nameLocked
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(portfolio));
    } else {
      savePortfolio(portfolio); // nothing backed up yet under this ID — protect what we have now
    }
    renderPortfolio(); renderHistory(); renderLots(); drawChart();
    if(typeof renderOwnedElements === 'function'){ renderOwnedElements(); renderOwnedCompounds(); renderTools(); }
    if(typeof renderReactors === 'function') renderReactors();
    if(typeof renderCompoundsInventory === 'function') renderCompoundsInventory();
    if(typeof refreshLeaderboardGateUI === 'function') refreshLeaderboardGateUI();
  }).catch(() => {});

  // Marketplace sales (and admin edits) credit/adjust cash directly in Firebase, which could
  // otherwise get silently overwritten the next time this player's own client does a full save —
  // this listener merges any such external change into the live local state so it isn't lost.
  if(playerCashListenerRef) playerCashListenerRef.off();
  playerCashListenerRef = db.ref('players/' + uid + '/cash');
  playerCashListenerRef.on('value', (snap) => {
    const remoteCash = snap.val();
    if(typeof remoteCash === 'number' && remoteCash !== portfolio.cash){
      portfolio.cash = remoteCash;
      renderPortfolio();
    }
  });
}
if(db && investorId) loadPlayerData(investorId);

let market = JSON.parse(localStorage.getItem('mrwestcoin_market_cache') || 'null') || {
  price: 12.50, history: [{ price: 12.50, t: Date.now() }],
  fairValue: 12.50, momentum: 0, vol: 0.012, updatedAt: 0
};
let currentPrice = market.price;
let priceHistory = market.history;
let syncOK = false;

const priceEl = document.getElementById('price'), changeEl = document.getElementById('change');
const miniPriceEl = document.getElementById('miniPrice'), miniChangeEl = document.getElementById('miniChange');
const cashEl = document.getElementById('cash'), heldEl = document.getElementById('held'), totalEl = document.getElementById('total');
const msgEl = document.getElementById('msg'), historyListEl = document.getElementById('historyList');
const qtyInput = document.getElementById('qty');
const canvas = document.getElementById('chart'), ctx = canvas ? canvas.getContext('2d') : null;
const chartWrap = document.querySelector('.chart-wrap');

/* --- analysis tools: click to toggle an overlay, hover a button to see what it does --- */
const activeTools = new Set();
document.querySelectorAll('.tool-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tool = btn.dataset.tool;
    if(activeTools.has(tool)){ activeTools.delete(tool); btn.classList.remove('active'); }
    else{ activeTools.add(tool); btn.classList.add('active'); }
    drawChart();
  });
});

/* --- hover over the chart to see the value at that point (crosshair tooltip) --- */
let lastChartGeometry = null;
const chartHoverTip = document.getElementById('chartHoverTip');

if(canvas){
  canvas.addEventListener('pointermove', (e) => {
    if(chartDragging || !lastChartGeometry) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const { points, xOf, LEFT_PAD, RIGHT_PAD, cssW } = lastChartGeometry;
    if(mx < LEFT_PAD || mx > cssW - RIGHT_PAD || points.length === 0){
      chartHoverTip.classList.remove('show');
      return;
    }
    // find nearest data point to the cursor's x position
    let nearestIdx = 0, nearestDist = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(xOf(i) - mx);
      if(d < nearestDist){ nearestDist = d; nearestIdx = i; }
    });
    const p = points[nearestIdx];
    chartHoverTip.textContent = '$' + p.price.toFixed(2) + '  ·  ' + new Date(p.t).toLocaleTimeString([], { hour:'numeric', minute:'2-digit', second:'2-digit' }) + (p.closed ? '  (market closed)' : '');
    const tipX = Math.min(Math.max(xOf(nearestIdx), 60), cssW - 60);
    chartHoverTip.style.left = tipX + 'px';
    chartHoverTip.style.top = '6px';
    chartHoverTip.style.transform = 'translateX(-50%)';
    chartHoverTip.classList.add('show');
  });
  canvas.addEventListener('pointerleave', () => chartHoverTip.classList.remove('show'));
}

const jumpLiveBtn = document.getElementById('jumpLive');

function cacheMarketLocally(){ localStorage.setItem('mrwestcoin_market_cache', JSON.stringify(market)); }

function totalHeld(){
  return portfolio.lots.reduce((sum, l) => sum + l.qty, 0);
}
function renderPortfolio(){
  if(!cashEl) return;
  cashEl.textContent = '$' + portfolio.cash.toFixed(2);
  heldEl.textContent = totalHeld().toFixed(4);
  totalEl.textContent = '$' + (portfolio.cash + totalHeld()*currentPrice).toFixed(2);
}
function renderHistory(){
  if(!historyListEl) return;
  if(portfolio.trades.length === 0){ historyListEl.innerHTML = '<div class="empty-history">No trades yet.</div>'; return; }
  historyListEl.innerHTML = portfolio.trades.slice().reverse().map(t => `
    <div class="history-row ${t.type}"><span class="type">${t.type.toUpperCase()} #${t.lotId}</span><span>${t.qty.toFixed(4)} $WEST @ $${t.price.toFixed(2)}</span><span>${t.time}</span></div>`).join('');
}
const lotsListEl = document.getElementById('lotsList');
function renderLots(){
  if(!lotsListEl) return;
  if(portfolio.lots.length === 0){ lotsListEl.innerHTML = '<div class="empty-history">No open positions.</div>'; return; }
  lotsListEl.innerHTML = portfolio.lots.slice().reverse().map(l => {
    const pl = (currentPrice - l.buyPrice) * l.qty;
    const plPct = ((currentPrice - l.buyPrice) / l.buyPrice) * 100;
    const up = pl >= 0;
    return `
      <div class="lot-row">
        <div class="lot-num">#${l.id}</div>
        <div class="lot-info">
          ${l.qty.toFixed(4)} $WEST @ <b>$${l.buyPrice.toFixed(2)}</b><br>
          <span class="lot-pl ${up?'up':'down'}">${up?'+':''}$${pl.toFixed(2)} (${up?'+':''}${plPct.toFixed(1)}%)</span>
        </div>
        <button class="lot-sell-btn" data-lot-id="${l.id}">Sell</button>
      </div>`;
  }).join('');
  lotsListEl.querySelectorAll('.lot-sell-btn').forEach(btn => {
    btn.addEventListener('click', () => sellLot(parseInt(btn.dataset.lotId, 10), btn));
  });
}

/* --- fence-style brush timeline: shows the full history, drag the handles to pick a window --- */
const brushCanvas = document.getElementById('brushChart');
const brushCtx = brushCanvas ? brushCanvas.getContext('2d') : null;
let viewStart = null, viewEnd = null; // absolute timestamps; null = "live" (always show the latest window)
const MIN_WINDOW_MS = 8000; // can't shrink the selection below ~8 seconds of data

function currentWindow(){
  if(priceHistory.length === 0) return { start: 0, end: 0, live: true };
  const earliestT = priceHistory[0].t, latestT = priceHistory[priceHistory.length-1].t;
  if(viewStart === null || viewEnd === null){
    return { start: Math.max(earliestT, latestT - 120000), end: latestT, live: true }; // trailing 2-minute live window
  }
  return { start: Math.max(earliestT, viewStart), end: Math.min(latestT, viewEnd), live: false };
}

function visibleHistory(){
  if(priceHistory.length === 0) return [];
  const w = currentWindow();
  let points = priceHistory.filter(p => p.t >= w.start && p.t <= w.end);
  if(points.length < 2) points = priceHistory.slice(-2);
  return points;
}
function clampScroll(){
  if(jumpLiveBtn) jumpLiveBtn.classList.toggle('visible', viewStart !== null);
}

function formatAxisTime(t, spanMs){
  const d = new Date(t);
  if(spanMs <= 2 * 86400000) return d.toLocaleTimeString([], { hour:'numeric', minute:'2-digit' });
  return d.toLocaleDateString([], { month:'short', day:'numeric' });
}

function drawChart(){
  if(!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.offsetWidth, cssH = canvas.offsetHeight;
  if(cssW === 0 || cssH === 0) return;
  canvas.width = cssW * dpr; canvas.height = cssH * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0,0,cssW,cssH);

  const points = visibleHistory();
  if(points.length < 2) { drawBrush(); return; }

  const LEFT_PAD = 46, RIGHT_PAD = 6, TOP_PAD = 10, BOTTOM_PAD = 24;
  const plotW = cssW - LEFT_PAD - RIGHT_PAD, plotH = cssH - TOP_PAD - BOTTOM_PAD;
  const prices = points.map(p => p.price);
  const rawMin = Math.min(...prices), rawMax = Math.max(...prices);
  const pad = (rawMax - rawMin) * 0.12 || rawMax * 0.05 || 1;
  const min = rawMin - pad, max = rawMax + pad, range = (max - min) || 1;
  const yOf = v => TOP_PAD + plotH - ((v - min) / range) * plotH;
  const xOf = i => LEFT_PAD + (i / (points.length - 1)) * plotW;

  const spanMs = points[points.length-1].t - points[0].t;
  const X_LABELS = 4;
  ctx.font = '9px Courier New, monospace';
  ctx.fillStyle = '#a89678';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for(let x = 0; x <= X_LABELS; x++){
    const idx = Math.round((x / X_LABELS) * (points.length - 1));
    const px = xOf(idx);
    ctx.fillText(formatAxisTime(points[idx].t, spanMs), Math.min(Math.max(px, LEFT_PAD+20), cssW-RIGHT_PAD-20), cssH - BOTTOM_PAD + 6);
  }

  const GRID_LINES = 4;
  ctx.font = '9px Courier New, monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for(let g = 0; g <= GRID_LINES; g++){
    const v = min + (range * g / GRID_LINES);
    const y = yOf(v);
    ctx.strokeStyle = 'rgba(107,90,65,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(LEFT_PAD, y);
    ctx.lineTo(cssW - RIGHT_PAD, y);
    ctx.stroke();
    ctx.fillStyle = '#a89678';
    ctx.fillText('$' + v.toFixed(2), LEFT_PAD - 6, y);
  }

  // Render the line/fill slightly wider than the visible plot area, then clip tightly to the
  // exact plot rect — this way the edges always reach flush to the boundary with room to spare,
  // instead of any sub-pixel rounding ever being able to leave a hairline gap the player would see.
  const OVERDRAW = 4;
  ctx.save();
  ctx.beginPath();
  ctx.rect(LEFT_PAD, TOP_PAD, plotW, plotH);
  ctx.clip();

  // draw the line as a sequence of segments, switching style whenever we cross a
  // closed/live boundary — this is what actually renders the "market closed" bridge distinctly
  let segStart = 0;
  for(let i = 1; i <= points.length; i++){
    const boundary = i === points.length || !!points[i].closed !== !!points[segStart].closed;
    if(!boundary) continue;
    const segPoints = points.slice(segStart, i);
    const isClosed = !!points[segStart].closed;

    ctx.beginPath();
    ctx.strokeStyle = isClosed ? 'rgba(168,150,120,0.55)' : '#d97a3f';
    ctx.lineWidth = isClosed ? 1.3 : 1.6;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.setLineDash(isClosed ? [5, 4] : []);
    segPoints.forEach((p, j) => {
      const gi = segStart + j;
      // overdraw the very first/last point of the WHOLE chart a little past the edge, so the
      // rounded line-cap always fully covers the boundary rather than potentially falling short
      const overshoot = (gi === 0 ? -OVERDRAW : gi === points.length - 1 ? OVERDRAW : 0);
      const x = xOf(gi) + overshoot, y = yOf(p.price);
      if(j === 0){ ctx.moveTo(x, y); }
      else{
        const prevOvershoot = (gi-1 === 0 ? -OVERDRAW : 0);
        const prevX = xOf(gi-1) + prevOvershoot, prevY = yOf(points[gi-1].price);
        const midX = (prevX + x) / 2, midY = (prevY + y) / 2;
        ctx.quadraticCurveTo(prevX, prevY, midX, midY);
      }
    });
    // connect to the first point of the next segment so there's no visible gap at the boundary
    if(i < points.length){ ctx.lineTo(xOf(i), yOf(points[i].price)); }
    ctx.stroke();
    ctx.setLineDash([]);

    // fill under THIS segment only — never under the closed bridge, so there's no stray tint there
    if(!isClosed){
      const segEndIdx = i < points.length ? i : points.length - 1;
      const endOvershoot = segEndIdx === points.length - 1 ? OVERDRAW : 0;
      const startOvershoot = segStart === 0 ? -OVERDRAW : 0;
      ctx.lineTo(xOf(segEndIdx) + endOvershoot, TOP_PAD + plotH);
      ctx.lineTo(xOf(segStart) + startOvershoot, TOP_PAD + plotH);
      ctx.closePath();
      ctx.fillStyle = 'rgba(217,122,63,0.08)';
      ctx.fill();
    }

    segStart = i;
  }
  ctx.restore(); // drop the clip — everything drawn after this (labels, legend, etc.) is unaffected

  // "Market Closed" label centered under any closed stretch
  const closedIdxs = points.map((p,i) => p.closed ? i : -1).filter(i => i >= 0);
  if(closedIdxs.length > 0){
    const midIdx = closedIdxs[Math.floor(closedIdxs.length/2)];
    const labelX = xOf(midIdx);
    ctx.font = '9px Courier New, monospace';
    ctx.fillStyle = 'rgba(168,150,120,0.85)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('MARKET CLOSED', Math.min(Math.max(labelX, LEFT_PAD+50), cssW-RIGHT_PAD-50), TOP_PAD + plotH/2);
  }

  const lastX = xOf(points.length-1), lastY = yOf(points[points.length-1].price);

  if(currentWindow().live){
    ctx.beginPath();
    ctx.arc(lastX, lastY, 2.6, 0, Math.PI*2);
    ctx.fillStyle = '#f4ecd8';
    ctx.fill();
  }

  // numbered horizontal lines marking where each open position was bought
  if(typeof portfolio !== 'undefined' && portfolio.lots){
    portfolio.lots.forEach(lot => {
      if(lot.buyPrice < min || lot.buyPrice > max) return; // off the current price range — skip rather than clutter
      const y = yOf(lot.buyPrice);
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(244,236,216,0.5)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.moveTo(LEFT_PAD, y);
      ctx.lineTo(cssW - RIGHT_PAD, y);
      ctx.stroke();
      ctx.setLineDash([]);

      const label = '#' + lot.id;
      ctx.font = '9px Courier New, monospace';
      const labelW = ctx.measureText(label).width + 8;
      ctx.fillStyle = 'rgba(26,21,16,0.9)';
      ctx.fillRect(cssW - RIGHT_PAD - labelW, y - 8, labelW, 16);
      ctx.strokeStyle = '#f4ecd8';
      ctx.lineWidth = 1;
      ctx.strokeRect(cssW - RIGHT_PAD - labelW + 0.5, y - 8 + 0.5, labelW - 1, 15);
      ctx.fillStyle = '#f4ecd8';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, cssW - RIGHT_PAD - labelW/2, y);
    });
  }

  // --- analysis tool overlays ---
  const meanPrice = prices.reduce((a,b) => a+b, 0) / prices.length;
  const variance = prices.reduce((a,b) => a + (b-meanPrice)*(b-meanPrice), 0) / prices.length;
  const stdDev = Math.sqrt(variance);

  if(activeTools.has('avg')){
    ctx.beginPath();
    ctx.strokeStyle = '#5aa9f0';
    ctx.lineWidth = 1;
    ctx.setLineDash([2,3]);
    ctx.moveTo(LEFT_PAD, yOf(meanPrice));
    ctx.lineTo(cssW - RIGHT_PAD, yOf(meanPrice));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#5aa9f0';
    ctx.font = '9px Courier New, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('avg $' + meanPrice.toFixed(2), LEFT_PAD + 4, yOf(meanPrice) - 2);
  }

  if(activeTools.has('bands') && stdDev > 0){
    ctx.fillStyle = 'rgba(90,169,240,0.08)';
    ctx.fillRect(LEFT_PAD, yOf(meanPrice+stdDev), plotW, yOf(meanPrice-stdDev)-yOf(meanPrice+stdDev));
    [meanPrice+stdDev, meanPrice-stdDev].forEach(v => {
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(90,169,240,0.4)';
      ctx.lineWidth = 1;
      ctx.moveTo(LEFT_PAD, yOf(v));
      ctx.lineTo(cssW - RIGHT_PAD, yOf(v));
      ctx.stroke();
    });
  }

  if(activeTools.has('trend') && points.length >= 2){
    // simple linear regression over the visible points
    const n = points.length;
    let sumX=0,sumY=0,sumXY=0,sumXX=0;
    points.forEach((p,i) => { sumX+=i; sumY+=p.price; sumXY+=i*p.price; sumXX+=i*i; });
    const slope = (n*sumXY - sumX*sumY) / (n*sumXX - sumX*sumX || 1);
    const intercept = (sumY - slope*sumX) / n;
    const y0 = intercept, y1 = intercept + slope*(n-1);
    ctx.beginPath();
    ctx.strokeStyle = slope >= 0 ? '#4fae5c' : '#c23b3b';
    ctx.lineWidth = 1.4;
    ctx.moveTo(LEFT_PAD, yOf(y0));
    ctx.lineTo(cssW - RIGHT_PAD, yOf(y1));
    ctx.stroke();
  }

  if(activeTools.has('highlow')){
    const maxP = Math.max(...prices), minP = Math.min(...prices);
    [{v:maxP,c:'#4fae5c',label:'high'},{v:minP,c:'#c23b3b',label:'low'}].forEach(h => {
      ctx.beginPath();
      ctx.strokeStyle = h.c;
      ctx.lineWidth = 1;
      ctx.setLineDash([2,3]);
      ctx.moveTo(LEFT_PAD, yOf(h.v));
      ctx.lineTo(cssW - RIGHT_PAD, yOf(h.v));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = h.c;
      ctx.font = '9px Courier New, monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(h.label + ' $' + h.v.toFixed(2), LEFT_PAD + 4, yOf(h.v) - 2);
    });
  }

  if(activeTools.has('vol')){
    ctx.fillStyle = 'rgba(244,236,216,0.8)';
    ctx.font = '10px Courier New, monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText('σ $' + stdDev.toFixed(3), cssW - RIGHT_PAD - 4, TOP_PAD + 4);
  }

  // stash geometry so the hover handler can map a mouse x back to a data point
  lastChartGeometry = { points, xOf, yOf, LEFT_PAD, RIGHT_PAD, TOP_PAD, plotW, plotH, cssW, cssH };

  drawBrush();
}

/* --- the brush strip itself: a compressed sparkline of ALL history, with two draggable
   handles ("fence posts") marking the selected window, plus a draggable middle to pan it --- */
function drawBrush(){
  const dpr = window.devicePixelRatio || 1;
  const cssW = brushCanvas.offsetWidth, cssH = brushCanvas.offsetHeight;
  if(cssW === 0 || cssH === 0 || priceHistory.length < 2) return;
  brushCanvas.width = cssW * dpr; brushCanvas.height = cssH * dpr;
  brushCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  brushCtx.clearRect(0,0,cssW,cssH);

  const earliestT = priceHistory[0].t, latestT = priceHistory[priceHistory.length-1].t;
  const totalSpan = Math.max(1, latestT - earliestT);
  const prices = priceHistory.map(p => p.price);
  const min = Math.min(...prices), max = Math.max(...prices), range = (max-min) || 1;
  const tToX = t => ((t - earliestT) / totalSpan) * cssW;
  const priceToY = p => cssH - ((p - min) / range) * (cssH - 6) - 3;

  // full-history sparkline — the entire priceHistory array, always, regardless of what the main chart shows
  brushCtx.beginPath();
  priceHistory.forEach((p, i) => {
    const x = tToX(p.t), y = priceToY(p.price);
    if(i === 0) brushCtx.moveTo(x, y); else brushCtx.lineTo(x, y);
  });
  brushCtx.strokeStyle = '#c9a876';
  brushCtx.lineWidth = 1.4;
  brushCtx.lineJoin = 'round';
  brushCtx.stroke();

  // light fill under it so the shape reads clearly even at a glance
  brushCtx.lineTo(tToX(priceHistory[priceHistory.length-1].t), cssH);
  brushCtx.lineTo(tToX(priceHistory[0].t), cssH);
  brushCtx.closePath();
  brushCtx.fillStyle = 'rgba(201,168,118,0.12)';
  brushCtx.fill();

  // small dot at the very latest point so it's obvious this is live, real data
  const lastP = priceHistory[priceHistory.length-1];
  brushCtx.beginPath();
  brushCtx.arc(tToX(lastP.t), priceToY(lastP.price), 2, 0, Math.PI*2);
  brushCtx.fillStyle = '#f4ecd8';
  brushCtx.fill();

  // selected window highlight + handles
  const w = currentWindow();
  const x0 = tToX(w.start), x1 = tToX(w.end);
  brushCtx.fillStyle = 'rgba(217,122,63,0.16)';
  brushCtx.fillRect(x0, 0, Math.max(2, x1 - x0), cssH);
  brushCtx.strokeStyle = 'rgba(217,122,63,0.5)';
  brushCtx.lineWidth = 1;
  brushCtx.strokeRect(x0, 0.5, Math.max(2, x1 - x0), cssH - 1);

  // wide gate posts with a grip notch, so they're obviously separate from the pannable middle
  [x0, x1].forEach(hx => {
    brushCtx.fillStyle = '#d97a3f';
    brushCtx.fillRect(hx - 3, 0, 6, cssH);
    brushCtx.fillStyle = '#f4ecd8';
    brushCtx.fillRect(hx - 1, cssH/2 - 6, 2, 12);
  });
}

if(canvas){
  jumpLiveBtn.addEventListener('click', () => { viewStart = null; viewEnd = null; clampScroll(); drawChart(); });

  /* dragging on the main chart pans the current window left/right */
  let chartDragging = false, chartDragStartX = 0, chartDragStartWindow = null;
  chartWrap.addEventListener('pointerdown', (e) => {
    chartDragging = true;
    chartWrap.classList.add('grabbing');
    chartDragStartX = e.clientX;
    chartDragStartWindow = currentWindow();
    e.stopPropagation();
  });
  window.addEventListener('pointermove', (e) => {
    if(!chartDragging) return;
    const w = chartDragStartWindow;
    const spanMs = w.end - w.start;
    const pxPerMs = canvas.offsetWidth / (spanMs || 1);
    const dx = e.clientX - chartDragStartX;
    const shift = -dx / pxPerMs;
    const earliestT = priceHistory[0].t, latestT = priceHistory[priceHistory.length-1].t;
    let newStart = w.start + shift, newEnd = w.end + shift;
    if(newStart < earliestT){ newEnd += (earliestT - newStart); newStart = earliestT; }
    if(newEnd > latestT){ newStart -= (newEnd - latestT); newEnd = latestT; }
    viewStart = Math.max(earliestT, newStart);
    viewEnd = Math.min(latestT, newEnd);
    clampScroll();
    drawChart();
  });
  window.addEventListener('pointerup', () => { chartDragging = false; chartWrap.classList.remove('grabbing'); });

  /* dragging the brush handles resizes the window; dragging the middle pans it */
  var brushWrap = document.querySelector('.brush-wrap');
  let brushMode = null; // 'left' | 'right' | 'move' | null
  let brushDragStartX = 0, brushDragStartWindow = null;

  var brushPxToTime = function(px){
    const cssW = brushCanvas.offsetWidth;
    const earliestT = priceHistory[0].t, latestT = priceHistory[priceHistory.length-1].t;
    return earliestT + (px / cssW) * (latestT - earliestT);
  };
  brushCanvas.addEventListener('pointermove', (e) => {
    if(brushMode || priceHistory.length < 2) return; // don't fight the cursor mid-drag
    const rect = brushCanvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const w = currentWindow();
    const cssW = brushCanvas.offsetWidth;
    const earliestT = priceHistory[0].t, latestT = priceHistory[priceHistory.length-1].t;
    const x0 = ((w.start - earliestT) / (latestT - earliestT || 1)) * cssW;
    const x1 = ((w.end - earliestT) / (latestT - earliestT || 1)) * cssW;
    const HANDLE_HIT = 20;
    if(Math.abs(px - x0) <= HANDLE_HIT || Math.abs(px - x1) <= HANDLE_HIT){
      brushCanvas.style.cursor = 'ew-resize';
    } else if(px > x0 && px < x1){
      brushCanvas.style.cursor = 'grab';
    } else {
      brushCanvas.style.cursor = 'crosshair';
    }
  });

  let brushGrabOffsetMs = 0; // keeps the handle at a fixed offset from the cursor instead of snapping to it

  brushWrap.addEventListener('pointerdown', (e) => {
    if(priceHistory.length < 2) return;
    const rect = brushCanvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const w = currentWindow();
    const cssW = brushCanvas.offsetWidth;
    const earliestT = priceHistory[0].t, latestT = priceHistory[priceHistory.length-1].t;
    const x0 = ((w.start - earliestT) / (latestT - earliestT || 1)) * cssW;
    const x1 = ((w.end - earliestT) / (latestT - earliestT || 1)) * cssW;
    const HANDLE_HIT = 20; // wide, easy-to-grab hit zone right at each gate
    const distToLeft = Math.abs(px - x0), distToRight = Math.abs(px - x1);

    // whichever gate is genuinely closer wins whenever a click is within reach of either —
    // no fallback branch that silently favors one side over the other
    if(distToLeft <= HANDLE_HIT || distToRight <= HANDLE_HIT){
      brushMode = distToLeft <= distToRight ? 'left' : 'right';
    } else if(px > x0 && px < x1){
      brushMode = 'move';
    } else {
      brushMode = px < x0 ? 'left' : 'right';
    }

    const clickedT = brushPxToTime(px);
    // remember exactly how far off-center the click was, so the handle doesn't jump to snap
    // under the cursor the instant you grab it — it keeps the same relative offset all the way through
    brushGrabOffsetMs = brushMode === 'left' ? w.start - clickedT : brushMode === 'right' ? w.end - clickedT : 0;

    brushDragStartX = e.clientX;
    brushDragStartWindow = w;
    brushWrap.classList.add('dragging');
    e.stopPropagation();
  });
  window.addEventListener('pointermove', (e) => {
    if(!brushMode || priceHistory.length < 2) return;
    const earliestT = priceHistory[0].t, latestT = priceHistory[priceHistory.length-1].t;
    const cssW = brushCanvas.offsetWidth;
    const rect = brushCanvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const t = Math.min(latestT, Math.max(earliestT, brushPxToTime(px) + brushGrabOffsetMs));

    if(brushMode === 'left'){
      viewStart = Math.min(t, brushDragStartWindow.end - MIN_WINDOW_MS);
      viewEnd = brushDragStartWindow.end;
    } else if(brushMode === 'right'){
      viewStart = brushDragStartWindow.start;
      viewEnd = Math.max(t, brushDragStartWindow.start + MIN_WINDOW_MS);
    } else if(brushMode === 'move'){
      const dxPx = e.clientX - brushDragStartX;
      const dxMs = (dxPx / cssW) * (latestT - earliestT);
      let ns = brushDragStartWindow.start + dxMs, ne = brushDragStartWindow.end + dxMs;
      if(ns < earliestT){ ne += (earliestT - ns); ns = earliestT; }
      if(ne > latestT){ ns -= (ne - latestT); ne = latestT; }
      viewStart = ns; viewEnd = ne;
    }
    clampScroll();
    drawChart();
  });
  window.addEventListener('pointerup', () => { brushMode = null; brushWrap.classList.remove('dragging'); });
}

function updatePriceDisplays(){
  const prevPrice = priceHistory.length > 1 ? priceHistory[priceHistory.length-2].price : currentPrice;
  const changePct = prevPrice ? ((currentPrice - prevPrice) / prevPrice) * 100 : 0;
  const priceText = '$' + currentPrice.toFixed(2);
  if(priceEl) priceEl.textContent = priceText;
  if(miniPriceEl) miniPriceEl.textContent = priceText;
  const isUp = changePct >= 0;
  const changeText = (isUp?'▲ ':'▼ ') + Math.abs(changePct).toFixed(2) + '%' + (syncOK ? '' : ' (local)');
  if(changeEl){ changeEl.textContent = changeText; changeEl.className = 'change ' + (isUp?'up':'down'); }
  if(miniChangeEl){ miniChangeEl.textContent = changeText; miniChangeEl.className = 'change ' + (isUp?'up':'down'); }

  // visible proof the poll is actually happening, and how stale market-data.json currently is —
  // the Action only commits every ~10 min, so "X min ago" jumping straight from 0 to 10 is normal
  const hint = document.getElementById('marketUpdatedHint');
  if(hint){
    const mins = market.updatedAt ? Math.round((Date.now() - market.updatedAt) / 60000) : null;
    hint.textContent = mins === null ? 'Waiting for first market update...'
      : mins < 1 ? 'Market data updated moments ago'
      : `Market data updated ${mins} min ago (ticks every ~10 min)`;
  }
}

function applyMarketData(m){
  market = m;
  currentPrice = market.price;
  priceHistory = (market.history && market.history.length) ? market.history : priceHistory;
  cacheMarketLocally();
  clampScroll();
  updatePriceDisplays();
  drawChart();
  renderPortfolio();
  renderLots();
}

// --- Market data now comes from a static file committed to the repo by a scheduled GitHub
// Action (.github/workflows/update-market.yml + .github/scripts/tick-market.js), NOT from
// Firebase. That Action advances the price every 10 minutes and commits market-data.json —
// every visitor just fetches that plain static file, which GitHub Pages serves for free with
// its own CDN caching. This is what actually fixes the Firebase quota: the old design had every
// open tab writing a tick to Firebase every 12 seconds AND listening live for others' writes;
// now Firebase carries zero market traffic at all, only player accounts/leaderboard/marketplace.
const MARKET_JSON_PATH = 'market-data.json';
const MARKET_POLL_MS = 30000; // static file, effectively free to poll this often

async function fetchMarketData(){
  try{
    // cache-bust AND tell the browser not to reuse a cached response at all — belt and
    // suspenders, since a stale cached copy would look exactly like "it's not updating"
    const v = Date.now();
    const res = await fetch(`${MARKET_JSON_PATH}?v=${v}`, { cache: 'no-store' });
    if(!res.ok) return;
    const m = await res.json();
    syncOK = true;
    applyMarketData(m);
  } catch(e){ /* offline or the file isn't reachable yet — keep whatever's cached locally */ }
}

// show cached data immediately (no flash of "$--.--"), then get the real thing
if(market.updatedAt) applyMarketData(market);
fetchMarketData();
setInterval(fetchMarketData, MARKET_POLL_MS);

// Previously taxed BOTH buy and sell at a flat rate, which guaranteed a loss on every round
// trip even when the price went up — that's what made it feel unbalanced. Now: no tax at all
// on buying, and selling is only taxed on the PROFIT portion, and only once that profit is
// meaningful — a real capital-gains-style model instead of a flat transaction fee.
const PROFIT_TAX_THRESHOLD = 0.10; // only taxed once a position is up at least 10%
const PROFIT_TAX_RATE = 0.15;      // and even then, only 15% of the profit itself is taxed

// picks the smallest positive integer not currently in use, so a sold lot's number gets
// reused by the next buy — e.g. sell #1 while #2 and #3 exist, and the next buy becomes #1 again
function nextAvailableLotId(){
  const used = new Set(portfolio.lots.map(l => l.id));
  let id = 1;
  while(used.has(id)) id++;
  return id;
}

const buyBtnEl = document.getElementById('buyBtn');
if(buyBtnEl) buyBtnEl.addEventListener('click', () => {
  const qty = parseFloat(qtyInput.value);
  if(!qty || qty<=0){ msgEl.textContent = 'Enter a valid quantity.'; return; }
  const cost = qty*currentPrice;
  if(cost > portfolio.cash){ msgEl.textContent = "You can't afford that, champ."; return; }
  portfolio.cash -= cost;
  const lotId = nextAvailableLotId();
  portfolio.lots.push({ id: lotId, qty, buyPrice: currentPrice, time: new Date().toLocaleString() });
  portfolio.trades.push({ type:'buy', qty, price: currentPrice, tax: 0, lotId, time: new Date().toLocaleString() });
  savePortfolio(portfolio);
  renderPortfolio(); renderHistory(); renderLots(); drawChart();
  msgEl.textContent = `Bought #${lotId}: ${qty} $WEST for $${cost.toFixed(2)}.`;
});

// cookie-clicker style floating +$X.XX / -$X.XX that rises and fades above wherever it was triggered
function spawnProfitPopup(anchorRect, amount){
  const isProfit = amount >= 0;
  const popup = document.createElement('div');
  popup.className = 'profit-popup ' + (isProfit ? 'profit' : 'loss');
  popup.textContent = (isProfit ? '+' : '−') + '$' + Math.abs(amount).toFixed(2);
  popup.style.left = (anchorRect.left + anchorRect.width / 2) + 'px';
  popup.style.top = anchorRect.top + 'px';
  document.body.appendChild(popup);
  requestAnimationFrame(() => popup.classList.add('rise'));
  setTimeout(() => popup.remove(), 1100);
}

function sellLot(lotId, btnEl){
  const idx = portfolio.lots.findIndex(l => l.id === lotId);
  if(idx === -1) return;
  const lot = portfolio.lots[idx];
  const anchorRect = btnEl ? btnEl.getBoundingClientRect() : null; // capture before the list re-renders and detaches this button
  const proceeds = lot.qty * currentPrice;
  const costBasis = lot.qty * lot.buyPrice;
  const grossProfit = proceeds - costBasis;
  const profitPct = costBasis > 0 ? grossProfit / costBasis : 0;
  const tax = (grossProfit > 0 && profitPct >= PROFIT_TAX_THRESHOLD) ? grossProfit * PROFIT_TAX_RATE : 0;
  const netProceeds = proceeds - tax;
  const pl = grossProfit - tax; // net profit/loss after tax, what you actually walked away with
  portfolio.cash += netProceeds;
  portfolio.lots.splice(idx, 1);
  portfolio.trades.push({ type:'sell', qty: lot.qty, price: currentPrice, tax, lotId, time: new Date().toLocaleString() });
  savePortfolio(portfolio);
  renderPortfolio(); renderHistory(); renderLots(); drawChart();
  if(anchorRect) spawnProfitPopup(anchorRect, pl);
  const taxNote = tax > 0 ? ` (after $${tax.toFixed(2)} capital gains tax)` : '';
  msgEl.textContent = `Sold #${lotId} for $${netProceeds.toFixed(2)}${taxNote} — ${pl>=0?'profit':'loss'} of $${Math.abs(pl).toFixed(2)}.`;
}




/* ================= PERIODIC TABLE ================= */
// category color scheme

// Room-temperature (25°C) state — well-established exceptions; everything else defaults to solid.

function stateOf(num){
  if(UNKNOWN_STATE.has(num)) return 'unknown';
  if(GAS_AT_25C.has(num)) return 'gas';
  if(LIQUID_AT_25C.has(num)) return 'liquid';
  return 'solid';
}
function blockOf(num, cat, group){
  if(cat === 'lanthanide' || cat === 'actinide') return 'f';
  if(num === 2) return 's'; // helium: s-block by electron configuration despite group 18 placement
  if(group === 1 || group === 2) return 's';
  if(group >= 3 && group <= 12) return 'd';
  return 'p';
}

let ptMode = 'category';
let ptSearchTerm = '';

function buildPeriodicTable(){
  const grid = document.getElementById('ptable');
  if(!grid) return;
  const legend = document.getElementById('legend');
  const info = document.getElementById('elemInfo');

  const cells = {};
  ELEMENTS.forEach(e => {
    const [num,sym,name,mass,cat,period,group] = e;
    let row = period, col = group;
    if(cat === 'lanthanide' && group === 0){ row = 8; col = (num - 57) + 3; }
    if(cat === 'actinide' && group === 0){ row = 9; col = (num - 89) + 3; }
    if(!cells[row]) cells[row] = {};
    cells[row][col] = e;
  });

  let html = '';
  for(let row = 1; row <= 9; row++){
    for(let col = 1; col <= 18; col++){
      const e = cells[row] && cells[row][col];
      if(e){
        const [num,sym,name,mass,cat,period,group] = e;
        const state = stateOf(num);
        const block = blockOf(num, cat, group);
        html += `<div class="elem" data-cat="${cat}" data-state="${state}" data-block="${block}"
          data-num="${num}" data-sym="${sym}" data-name="${name}" data-mass="${mass}" data-period="${period}" data-group="${group||'—'}">
          <span class="num">${num}</span><span class="sym">${sym}</span><span class="mini-mass">${mass}</span></div>`;
      } else {
        html += `<div class="elem spacer"></div>`;
      }
    }
  }
  grid.innerHTML = html;

  grid.querySelectorAll('.elem:not(.spacer)').forEach(cell => {
    cell.addEventListener('click', () => {
      grid.querySelectorAll('.elem.selected').forEach(x => x.classList.remove('selected'));
      cell.classList.add('selected');
      const cat = cell.dataset.cat, state = cell.dataset.state, block = cell.dataset.block;
      info.innerHTML = `
        <span class="big-sym" style="color:${CATEGORY_COLORS[cat]}">${cell.dataset.sym}</span>
        <div>
          <div class="elem-title">${cell.dataset.name} <span style="color:var(--muted); font-size:0.75rem;">— #${cell.dataset.num}</span></div>
          <div class="info-grid">
            <span>Relative atomic mass</span><b>${cell.dataset.mass}</b>
            <span>Category</span><b>${CATEGORY_LABELS[cat]}</b>
            <span>Period</span><b>${cell.dataset.period}</b>
            <span>Group</span><b>${cell.dataset.group === '0' || cell.dataset.group === '—' ? '—' : cell.dataset.group}</b>
            <span>Block</span><b>${BLOCK_LABELS[block]}</b>
            <span>State at 25°C</span><b>${STATE_LABELS[state]}</b>
          </div>
        </div>`;
    });
    setupElementDrag(cell);
  });

  renderLegend();
  applyPtFilter();
  applyPtColors();
}

/* ================= COMPOUND LAB (reactor system, fully local, tied to real inventory) ================= */
// Dragging uses raw Pointer Events (not native HTML5 drag-and-drop, which barely works on
// touchscreens) so the exact same code path handles mouse, trackpad, and touch identically.
// Each draggable already lives inside the pan/zoomable world map, so the critical thing is
// stopping the drag's pointerdown from ever reaching the camera's own pan listener — otherwise
// starting a drag would also start panning the whole board underneath it.
//
// Reusable for element tiles, owned compound chips, and pending crafted results — each just
// supplies its own label/color and a list of drop targets (rects to test against on release).
function setupGenericDrag(el, { label, color, onDropTargets }){
  el.addEventListener('pointerdown', (e) => {
    e.stopPropagation(); // critical: keeps the world-map camera from also starting a pan
    const isTouch = e.pointerType === 'touch';
    let dragging = false, armed = !isTouch;
    const startX = e.clientX, startY = e.clientY;
    const armTimer = isTouch ? setTimeout(() => {
      armed = true;
      el.classList.add('armed');
      if(navigator.vibrate) navigator.vibrate(15);
    }, 300) : null;
    let ghost = null;

    function startDrag(){
      dragging = true;
      ghost = document.createElement('div');
      ghost.className = 'drag-ghost';
      ghost.textContent = label;
      ghost.style.background = color;
      document.body.appendChild(ghost);
    }
    function findTarget(x, y){
      for(const t of onDropTargets){
        const tEl = t.getEl();
        if(!tEl) continue;
        const r = tEl.getBoundingClientRect();
        if(x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return t;
      }
      return null;
    }
    function clearHighlights(){
      onDropTargets.forEach(t => { const tEl = t.getEl(); if(tEl) tEl.classList.remove('drag-over'); });
    }
    function onMove(ev){
      const dx = ev.clientX - startX, dy = ev.clientY - startY;
      const moved = Math.hypot(dx, dy);
      if(!armed){
        if(moved > 10){ clearTimeout(armTimer); el.classList.remove('armed'); }
        return;
      }
      if(!dragging && moved > 4) startDrag();
      if(dragging && ghost){
        ghost.style.left = ev.clientX + 'px';
        ghost.style.top = ev.clientY + 'px';
        clearHighlights();
        const target = findTarget(ev.clientX, ev.clientY);
        if(target){ const tEl = target.getEl(); if(tEl) tEl.classList.add('drag-over'); }
      }
    }
    function onUp(ev){
      clearTimeout(armTimer);
      el.classList.remove('armed');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      if(dragging){
        clearHighlights();
        const target = findTarget(ev.clientX, ev.clientY);
        if(target) target.onDrop();
      }
      if(ghost){ ghost.remove(); ghost = null; }
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  });
}

function setupElementDrag(cell){
  const sym = cell.dataset.sym, cat = cell.dataset.cat;
  setupGenericDrag(cell, {
    label: sym, color: CATEGORY_COLORS[cat],
    onDropTargets: TOOLS.map(t => ({ getEl: () => document.getElementById('reactorZone_' + t.id), onDrop: () => attemptAddElementToReactor(sym, t.id) }))
  });
}

// Everything below is 100% local — no network calls. PubChem was removed after proving
// unreliable (CORS failures, downtime); RECIPES in data/economy-data.js is now the only
// source of truth for what a combination makes, and atomic masses from the periodic table
// data give a real molecular weight without needing an external lookup.
const ATOMIC_MASS = {};
ELEMENTS.forEach(([num, sym, name, mass]) => { ATOMIC_MASS[sym] = mass; });

function molecularWeight(counts){
  return Object.keys(counts).reduce((sum, sym) => sum + (ATOMIC_MASS[sym] || 0) * counts[sym], 0);
}

// Matches a reactor's current pool (elements AND compounds) against a recipe for that same
// tool tier — exact makeup, not just string formula, so recipes can require other compounds
// as ingredients (tiered crafting) alongside or instead of raw elements.
function matchRecipeInPool(pool, toolId){
  const haveE = Object.keys(pool.elements).filter(s => pool.elements[s] > 0);
  const haveC = Object.keys(pool.compounds).filter(s => pool.compounds[s] > 0);
  return RECIPES.find(r => {
    if(r.tool !== toolId) return false;
    const needE = Object.keys(r.need || {});
    const needC = Object.keys(r.needCompounds || {});
    if(haveE.length !== needE.length || haveC.length !== needC.length) return false;
    if(!haveE.every(s => (r.need || {})[s] === pool.elements[s])) return false;
    if(!haveC.every(s => (r.needCompounds || {})[s] === pool.compounds[s])) return false;
    return true;
  });
}

// Reactor pools and pending results live on the portfolio itself (not module-level state) so
// they're saved to Firebase/localStorage exactly like everything else — closing the tab
// mid-craft won't strand elements you already dropped in.
function getReactorPool(toolId){
  if(!portfolio.reactors) portfolio.reactors = {};
  if(!portfolio.reactors[toolId]) portfolio.reactors[toolId] = { elements:{}, compounds:{} };
  return portfolio.reactors[toolId];
}
function getReactorPending(toolId){
  if(!portfolio.reactorPending) portfolio.reactorPending = {};
  return portfolio.reactorPending[toolId] || null;
}
function setReactorPending(toolId, formula){
  if(!portfolio.reactorPending) portfolio.reactorPending = {};
  if(formula) portfolio.reactorPending[toolId] = formula; else delete portfolio.reactorPending[toolId];
}

function attemptAddElementToReactor(sym, toolId){
  if(!portfolio.tools.includes(toolId)) return; // reactor locked — don't own that tool
  if(getReactorPending(toolId)) return; // collect the pending result first
  if((portfolio.elements[sym] || 0) <= 0) return; // don't own this element — only owned stock can be used
  portfolio.elements[sym]--;
  const pool = getReactorPool(toolId);
  pool.elements[sym] = (pool.elements[sym] || 0) + 1;
  saveEconomy();
  renderOwnedElements(); renderReactors();
}
function attemptAddCompoundToReactor(formula, toolId){
  if(!portfolio.tools.includes(toolId)) return;
  if(getReactorPending(toolId)) return;
  if((portfolio.compounds[formula] || 0) <= 0) return;
  portfolio.compounds[formula]--;
  const pool = getReactorPool(toolId);
  pool.compounds[formula] = (pool.compounds[formula] || 0) + 1;
  saveEconomy();
  renderOwnedCompounds(); renderReactors();
}
function removeFromReactor(toolId, kind, key){
  const pool = getReactorPool(toolId);
  const bucket = kind === 'compound' ? pool.compounds : pool.elements;
  if(bucket[key] > 0){
    bucket[key]--;
    if(bucket[key] <= 0) delete bucket[key];
    if(kind === 'compound') portfolio.compounds[key] = (portfolio.compounds[key] || 0) + 1;
    else portfolio.elements[key] = (portfolio.elements[key] || 0) + 1;
    saveEconomy();
    renderOwnedElements(); renderOwnedCompounds(); renderReactors();
  }
}
function craftInReactor(toolId){
  if(getReactorPending(toolId)) return;
  const pool = getReactorPool(toolId);
  const recipe = matchRecipeInPool(pool, toolId);
  if(!recipe) return;
  // ingredients were already deducted from inventory the moment they were dropped in — clear
  // the working pool and stage the finished compound for collection
  pool.elements = {}; pool.compounds = {};
  setReactorPending(toolId, recipe.formula);
  saveEconomy();
  renderReactors();
}
function collectPending(toolId){
  const formula = getReactorPending(toolId);
  if(!formula) return;
  portfolio.compounds[formula] = (portfolio.compounds[formula] || 0) + 1;
  setReactorPending(toolId, null);
  saveEconomy();
  renderOwnedCompounds(); renderReactors();
}

function renderReactors(){
  const wrap = document.getElementById('reactorBoxes');
  if(!wrap) return;
  wrap.innerHTML = TOOLS.map(t => {
    const owned = portfolio.tools.includes(t.id);
    const pool = getReactorPool(t.id);
    const pendingFormula = getReactorPending(t.id);
    const pendingRecipe = pendingFormula ? RECIPES.find(r => r.formula === pendingFormula) : null;
    const chips = [
      ...Object.keys(pool.elements).filter(s => pool.elements[s] > 0).map(sym => ({ kind:'element', key:sym, label:sym, qty:pool.elements[sym] })),
      ...Object.keys(pool.compounds).filter(f => pool.compounds[f] > 0).map(f => {
        const r = RECIPES.find(rc => rc.formula === f);
        return { kind:'compound', key:f, label:`${r ? r.name : f} (${f})`, qty:pool.compounds[f] };
      })
    ];
    const match = (!pendingRecipe && owned) ? matchRecipeInPool(pool, t.id) : null;
    return `
      <div class="reactor-box ${owned ? '' : 'locked'}">
        <div class="rb-title">${t.name}</div>
        ${!owned ? `<div class="rb-locked-msg">🔒 Buy this tool in the Element Economy to use it</div>` : `
          <div class="rb-zone" id="reactorZone_${t.id}">
            ${chips.length ? chips.map(c => `
              <div class="elem-chip">${c.label}${c.qty > 1 ? ` ×${c.qty}` : ''}<span class="chip-remove" data-kind="${c.kind}" data-key="${c.key}" data-tool="${t.id}">✕</span></div>
            `).join('') : '<span class="dropzone-hint">Drag an owned element (or compound) here</span>'}
          </div>
          ${pendingRecipe
            ? `<div class="rb-pending-wrap"><div class="elem-chip pending" id="rbPending_${t.id}">${pendingRecipe.name} (${pendingRecipe.formula}) — drag or tap to collect ↓</div></div>`
            : `<button class="tool-btn rb-craft" data-tool="${t.id}" ${match ? '' : 'disabled'}>${match ? 'Craft ' + match.name : 'Craft'}</button>`}
        `}
      </div>`;
  }).join('');

  wrap.querySelectorAll('.chip-remove').forEach(btn => {
    btn.addEventListener('click', () => removeFromReactor(btn.dataset.tool, btn.dataset.kind, btn.dataset.key));
  });
  wrap.querySelectorAll('.rb-craft:not(:disabled)').forEach(btn => {
    btn.addEventListener('click', () => craftInReactor(btn.dataset.tool));
  });
  TOOLS.forEach(t => {
    const pendingEl = document.getElementById('rbPending_' + t.id);
    if(!pendingEl) return;
    pendingEl.addEventListener('click', () => collectPending(t.id));
    setupGenericDrag(pendingEl, {
      label: getReactorPending(t.id) || '?', color: 'var(--rust-2)',
      onDropTargets: [{ getEl: () => document.getElementById('compoundsInventoryZone'), onDrop: () => collectPending(t.id) }]
    });
  });
}

function renderCompoundsInventory(){
  const wrap = document.getElementById('compoundsInventoryZone');
  if(!wrap) return;
  const formulas = Object.keys(portfolio.compounds || {}).filter(f => portfolio.compounds[f] > 0);
  if(formulas.length === 0){
    wrap.innerHTML = '<div class="empty-history">Nothing collected yet — craft something below and drag it in.</div>';
    return;
  }
  wrap.innerHTML = formulas.map(f => {
    const r = RECIPES.find(rc => rc.formula === f);
    return `<div class="owned-chip" data-formula="${f}">${r ? r.name : f} <span class="oc-qty">×${portfolio.compounds[f]}</span></div>`;
  }).join('');
  wrap.querySelectorAll('.owned-chip[data-formula]').forEach(chip => {
    const f = chip.dataset.formula;
    setupGenericDrag(chip, {
      label: f, color: '#e05a5a',
      onDropTargets: TOOLS.map(t => ({ getEl: () => document.getElementById('reactorZone_' + t.id), onDrop: () => attemptAddCompoundToReactor(f, t.id) }))
    });
  });
}

/* ================= ELEMENT ECONOMY ================= */
// Prices are illustrative, roughly ordered like real-world commodity prices (precious metals
// expensive, common gases/nonmetals cheap) — not exact spot prices, this is a game, not a
// commodities terminal. Scoped to ~20 elements rather than all 118 to keep this maintainable.

// player's element/compound/tool state — synced to Firebase alongside cash/lots
function ensureEconomyState(p){
  if(!p.elements) p.elements = {};
  if(!p.compounds) p.compounds = {};
  if(!p.tools) p.tools = ['basic'];
  return p;
}
ensureEconomyState(portfolio);

function saveEconomy(){
  savePortfolio(portfolio); // reuses the existing cash/lots sync, now also carrying elements/compounds/tools
}

// populate the element dropdowns
const marketElemSelect = document.getElementById('marketElemSelect');
const marketQtyInput = document.getElementById('marketQty');
const marketPriceHintEl = document.getElementById('marketPriceHint');
const listElemSelect = document.getElementById('listElemSelect');

function populateElementSelects(){
  if(!marketElemSelect) return;
  const optionsHtml = Object.keys(ELEMENT_PRICES).map(sym => `<option value="${sym}">${sym} — $${ELEMENT_PRICES[sym].toLocaleString()}</option>`).join('');
  marketElemSelect.innerHTML = optionsHtml;
  updateMarketPriceHint();
}

// The marketplace "what am I listing" select depends on which type is chosen, and — since you
// can only list what you actually own — on your current elements/compounds inventory.
const listTypeSelect = document.getElementById('listTypeSelect');
function populateListSelect(){
  if(!listTypeSelect) return;
  if(listTypeSelect.value === 'compound'){
    const owned = Object.keys(portfolio.compounds || {}).filter(f => portfolio.compounds[f] > 0);
    listElemSelect.innerHTML = owned.length
      ? owned.map(f => { const r = RECIPES.find(rc => rc.formula === f); return `<option value="${f}">${r ? r.name : f} (${f}) — ×${portfolio.compounds[f]} owned</option>`; }).join('')
      : '<option value="">No compounds owned</option>';
  } else {
    const owned = Object.keys(ELEMENT_PRICES).filter(sym => (portfolio.elements || {})[sym] > 0);
    listElemSelect.innerHTML = owned.length
      ? owned.map(sym => `<option value="${sym}">${sym} — ×${portfolio.elements[sym]} owned</option>`).join('')
      : '<option value="">No elements owned</option>';
  }
}
if(listTypeSelect) listTypeSelect.addEventListener('change', populateListSelect);
function updateMarketPriceHint(){
  if(!marketElemSelect) return;
  const sym = marketElemSelect.value;
  const qty = parseFloat(marketQtyInput.value) || 0;
  marketPriceHintEl.textContent = sym ? `Total: $${(ELEMENT_PRICES[sym]*qty).toFixed(2)}` : '';
}
if(marketElemSelect){
  marketElemSelect.addEventListener('change', updateMarketPriceHint);
  marketQtyInput.addEventListener('input', updateMarketPriceHint);

  document.getElementById('marketBuyBtn').addEventListener('click', () => {
    const sym = marketElemSelect.value;
    const qty = parseFloat(marketQtyInput.value);
    if(!qty || qty <= 0) return;
    const cost = ELEMENT_PRICES[sym] * qty;
    if(cost > portfolio.cash){ marketPriceHintEl.textContent = "Can't afford that."; return; }
    portfolio.cash -= cost;
    portfolio.elements[sym] = (portfolio.elements[sym] || 0) + qty;
    saveEconomy();
    renderPortfolio(); renderOwnedElements();
  });
}

function renderOwnedElements(){
  const wrap = document.getElementById('ownedElementsList');
  if(!wrap) return;
  const syms = Object.keys(portfolio.elements).filter(s => portfolio.elements[s] > 0);
  if(syms.length === 0){ wrap.innerHTML = '<div class="empty-history">You don\'t own any elements yet.</div>'; }
  else{
    wrap.innerHTML = syms.map(sym => `
      <div class="owned-chip">${sym} <span class="oc-qty">×${portfolio.elements[sym]}</span>
        <button class="oc-sell" data-sym="${sym}">Sell 1</button>
      </div>`).join('');
    wrap.querySelectorAll('.oc-sell').forEach(btn => {
      btn.addEventListener('click', () => {
        const sym = btn.dataset.sym;
        if(portfolio.elements[sym] > 0){
          portfolio.elements[sym]--;
          portfolio.cash += ELEMENT_PRICES[sym] * 0.8; // sell back to the system at a discount
          saveEconomy();
          renderPortfolio(); renderOwnedElements();
        }
      });
    });
  }
  renderRecipes(); // recipe availability depends on what you own
  if(typeof renderReactors === 'function') renderReactors();
}

function renderTools(){
  const wrap = document.getElementById('toolsList');
  if(!wrap) return;
  wrap.innerHTML = TOOLS.map(t => {
    const owned = portfolio.tools.includes(t.id);
    return `
      <div class="tool-card ${owned ? 'owned' : ''}">
        <div class="tc-name">${t.name}</div>
        <div class="tc-desc">${t.desc}</div>
        <span class="tc-owned-tag">✓ Owned</span>
        <button class="tc-btn" data-tool="${t.id}" data-cost="${t.cost}">Buy — $${t.cost}</button>
      </div>`;
  }).join('');
  wrap.querySelectorAll('.tc-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const toolId = btn.dataset.tool, cost = parseFloat(btn.dataset.cost);
      if(portfolio.tools.includes(toolId)) return;
      if(cost > portfolio.cash){ return; }
      portfolio.cash -= cost;
      portfolio.tools.push(toolId);
      saveEconomy();
      renderPortfolio(); renderTools(); renderRecipes();
      if(typeof renderReactors === 'function') renderReactors();
    });
  });
}

function renderRecipes(){
  const wrap = document.getElementById('recipesList');
  if(!wrap) return;
  // tiered recipes (needCompounds) require dragging a crafted compound in as an ingredient —
  // that only makes sense in the Compound Lab's reactors, so this quick-craft list only shows
  // element-only recipes; the rest are reachable from the Periodic Table region.
  const simple = RECIPES.filter(r => !r.needCompounds || Object.keys(r.needCompounds).length === 0);
  wrap.innerHTML = simple.map(r => {
    const haveTool = portfolio.tools.includes(r.tool);
    const haveElements = Object.keys(r.need).every(sym => (portfolio.elements[sym] || 0) >= r.need[sym]);
    const needText = Object.keys(r.need).map(sym => `<b>${sym}×${r.need[sym]}</b>`).join(', ');
    return `
      <div class="recipe-card">
        <div class="rc-name">${r.name}</div>
        <div class="rc-formula">${r.formula}</div>
        <div class="rc-need">Needs: ${needText}${!haveTool ? `<div class="rc-locked">🔒 Requires: ${TOOLS.find(t=>t.id===r.tool).name}</div>` : ''}</div>
        <button class="rc-btn" data-formula="${r.formula}" ${(!haveTool || !haveElements) ? 'disabled' : ''}>Craft</button>
      </div>`;
  }).join('');
  wrap.querySelectorAll('.rc-btn:not(:disabled)').forEach(btn => {
    btn.addEventListener('click', () => craftCompound(btn.dataset.formula));
  });
}

function craftCompound(formula){
  const recipe = RECIPES.find(r => r.formula === formula);
  if(!recipe) return;
  // re-verify right before consuming — the button is only disabled at render time, so a stale
  // button (or a double-click) could otherwise push element counts negative
  const haveTool = portfolio.tools.includes(recipe.tool);
  const haveElements = Object.keys(recipe.need).every(sym => (portfolio.elements[sym] || 0) >= recipe.need[sym]);
  if(!haveTool || !haveElements) return;
  Object.keys(recipe.need).forEach(sym => { portfolio.elements[sym] -= recipe.need[sym]; });
  const materialCost = Object.keys(recipe.need).reduce((sum, sym) => sum + ELEMENT_PRICES[sym] * recipe.need[sym], 0);
  const value = materialCost * 1.6; // crafting adds value over raw materials, like real manufacturing
  portfolio.compounds[formula] = (portfolio.compounds[formula] || 0) + 1;
  saveEconomy();
  renderPortfolio(); renderOwnedElements(); renderOwnedCompounds();

  // fully local — molecular weight comes straight from the periodic table's atomic masses,
  // no external lookup needed or attempted
  const mw = molecularWeight(recipe.need);
  const resultEl = document.getElementById('craftResult');
  if(resultEl) resultEl.innerHTML = `
    <div class="compound-card">
      <div class="cc-formula">${recipe.formula}</div>
      <div class="cc-name">${recipe.name} — added to your collection (worth ~$${value.toFixed(2)})</div>
      <div class="cc-props"><span>Molecular weight</span><b>${mw.toFixed(2)} g/mol</b></div>
      <div class="cc-desc">${recipe.desc}</div>
    </div>`;
}

function renderOwnedCompounds(){
  const wrap = document.getElementById('ownedCompoundsList');
  if(!wrap) return;
  const formulas = Object.keys(portfolio.compounds).filter(f => portfolio.compounds[f] > 0);
  if(formulas.length === 0){ wrap.innerHTML = '<div class="empty-history">You haven\'t made anything yet.</div>'; }
  else{
    wrap.innerHTML = formulas.map(f => {
      const r = RECIPES.find(rc => rc.formula === f);
      return `<div class="owned-chip">${r ? r.name : f} <span class="oc-qty">×${portfolio.compounds[f]}</span>
        <button class="oc-sell" data-formula="${f}">Sell 1</button></div>`;
    }).join('');
    wrap.querySelectorAll('.oc-sell').forEach(btn => {
      btn.addEventListener('click', () => {
        const f = btn.dataset.formula;
        const r = RECIPES.find(rc => rc.formula === f);
        if(portfolio.compounds[f] > 0 && r){
          portfolio.compounds[f]--;
          const materialCost = Object.keys(r.need).reduce((sum, sym) => sum + ELEMENT_PRICES[sym] * r.need[sym], 0);
          portfolio.cash += materialCost * 1.6 * 0.8; // same crafted value as when made, sold back at a discount
          saveEconomy();
          renderPortfolio(); renderOwnedCompounds();
        }
      });
    });
  }
  if(typeof populateListSelect === 'function') populateListSelect();
  if(typeof renderReactors === 'function') renderReactors();
  if(typeof renderCompoundsInventory === 'function') renderCompoundsInventory();
}

/* --- Marketplace: shared Firebase listings, buyable by any player, elements or compounds --- */
function creditInventory(type, key, qty){
  if(type === 'compound'){ portfolio.compounds[key] = (portfolio.compounds[key] || 0) + qty; }
  else { portfolio.elements[key] = (portfolio.elements[key] || 0) + qty; }
}

const createListingBtnEl = document.getElementById('createListingBtn');
if(createListingBtnEl) createListingBtnEl.addEventListener('click', () => {
  const type = listTypeSelect.value;
  const key = listElemSelect.value;
  const qty = parseFloat(document.getElementById('listQty').value);
  const price = parseFloat(document.getElementById('listPrice').value);
  if(!key || !qty || qty <= 0 || !price || price <= 0) return;
  const stash = type === 'compound' ? portfolio.compounds : portfolio.elements;
  if((stash[key] || 0) < qty) return; // can't list more than you own
  stash[key] -= qty;
  saveEconomy();
  renderOwnedElements(); renderOwnedCompounds(); populateListSelect();
  if(db){
    const listingId = 'listing_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
    db.ref('marketplace/' + listingId).set({
      sellerId: investorId, sellerName: investorName || 'Anonymous', type, symbol: key, qty, pricePerUnit: price, createdAt: Date.now()
    }).catch(() => {});
  }
});

if(db){
  db.ref('marketplace').on('value', (snap) => {
    const val = snap.val() || {};
    const wrap = document.getElementById('marketplaceList');
    if(!wrap) return; // marketplace UI only exists on the Element Economy page
    const ids = Object.keys(val);
    if(ids.length === 0){ wrap.innerHTML = '<div class="empty-history">No listings yet.</div>'; return; }
    wrap.innerHTML = ids.map(id => {
      const l = val[id];
      const isCompound = l.type === 'compound';
      const label = isCompound ? `${(RECIPES.find(r => r.formula === l.symbol) || {}).name || l.symbol} (${l.symbol})` : l.symbol;
      const mine = l.sellerId === investorId;
      return `<div class="listing-row">${label} ×${l.qty} — $${l.pricePerUnit}/unit by ${l.sellerName}
        ${mine
          ? `<span class="oc-qty">Your listing</span> <button class="lr-cancel" data-id="${id}">Cancel</button>`
          : `<button class="lr-buy" data-id="${id}">Buy</button>`}</div>`;
    }).join('');
    wrap.querySelectorAll('.lr-buy').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const listing = val[id];
        if(!listing || listing.sellerId === investorId) return; // can't buy your own listing
        const totalCost = listing.qty * listing.pricePerUnit;
        if(totalCost > portfolio.cash) return;
        portfolio.cash -= totalCost;
        creditInventory(listing.type, listing.symbol, listing.qty);
        saveEconomy();
        renderPortfolio(); renderOwnedElements(); renderOwnedCompounds();
        db.ref('marketplace/' + id).remove().catch(() => {});
        // credit the seller even if they're offline right now, via an atomic increment —
        // this is the part that actually pays them, not just removing their listing
        db.ref('players/' + listing.sellerId + '/cash').transaction(cash => (cash || 0) + totalCost).catch(() => {});
      });
    });
    wrap.querySelectorAll('.lr-cancel').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const listing = val[id];
        if(!listing || listing.sellerId !== investorId) return; // only the seller can pull their own listing
        creditInventory(listing.type, listing.symbol, listing.qty); // return the stock to inventory
        saveEconomy();
        renderOwnedElements(); renderOwnedCompounds(); populateListSelect();
        db.ref('marketplace/' + id).remove().catch(() => {});
      });
    });
  });
}

populateElementSelects();
populateListSelect();
renderOwnedElements();
renderTools();
renderRecipes();
renderOwnedCompounds();

function swatchFor(cell){
  return ptMode === 'state' ? STATE_COLORS[cell.dataset.state] :
         ptMode === 'block' ? BLOCK_COLORS[cell.dataset.block] :
         CATEGORY_COLORS[cell.dataset.cat];
}
function applyPtColors(){
  document.querySelectorAll('#ptable .elem:not(.spacer)').forEach(cell => {
    cell.style.background = swatchFor(cell);
    cell.style.color = '#1a1510';
  });
}

function renderLegend(){
  const legend = document.getElementById('legend');
  if(!legend) return;
  const map = ptMode === 'state' ? { colors: STATE_COLORS, labels: STATE_LABELS }
            : ptMode === 'block' ? { colors: BLOCK_COLORS, labels: BLOCK_LABELS }
            : { colors: CATEGORY_COLORS, labels: CATEGORY_LABELS };
  legend.innerHTML = Object.keys(map.labels).map(key => `
    <div class="legend-item"><span class="legend-swatch" style="background:${map.colors[key]}"></span>${map.labels[key]}</div>
  `).join('');
}

function applyPtFilter(){
  const term = ptSearchTerm.trim().toLowerCase();
  document.querySelectorAll('#ptable .elem:not(.spacer)').forEach(cell => {
    if(!term){
      cell.classList.remove('dimmed','matched');
      return;
    }
    const matches = cell.dataset.name.toLowerCase().includes(term)
      || cell.dataset.sym.toLowerCase() === term
      || cell.dataset.num === term;
    cell.classList.toggle('matched', matches);
    cell.classList.toggle('dimmed', !matches);
  });
}

const ptSearchEl = document.getElementById('ptSearch');
if(ptSearchEl) ptSearchEl.addEventListener('input', (e) => {
  ptSearchTerm = e.target.value;
  applyPtFilter();
});
document.querySelectorAll('.pt-mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.pt-mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    ptMode = btn.dataset.mode;
    renderLegend();
    applyPtColors();
  });
});

buildPeriodicTable();

/* ================= CHEMISTRY DATABOOK ================= */
// Independently compiled, publicly-known reference values — check against your
// official VCAA Chemistry Data Book for exam use, exact formatting/rounding may differ.

function buildDatabook(){
  const wrap = document.getElementById('databookAccordion');
  if(!wrap) return;
  wrap.innerHTML = DATABOOK.map(sec => `
    <div class="db-section" id="dbsec-${sec.id}">
      <button class="db-head" data-target="${sec.id}"><span>${sec.title}</span><span>+</span></button>
      <div class="db-body" id="dbbody-${sec.id}">${sec.body}</div>
    </div>
  `).join('');
  wrap.querySelectorAll('.db-head').forEach(head => {
    head.addEventListener('click', () => {
      document.getElementById('dbbody-' + head.dataset.target).classList.toggle('open');
    });
  });
  // deep-linked from the poster's Explore panel as databook.html#section-id
  if(location.hash) openDbSection(location.hash.slice(1));
}
buildDatabook();

function openDbSection(id){
  document.querySelectorAll('.db-body').forEach(b => b.classList.remove('open'));
  const body = document.getElementById('dbbody-' + id);
  if(body){
    body.classList.add('open');
    document.getElementById('dbsec-' + id).scrollIntoView({ behavior:'smooth', block:'start' });
  }
}

/* ================= INVESTOR LEADERBOARD ================= */
// Firebase (config + db) is initialized near the top of this script, shared with the market sync below.

/* --- name filter ---
   Normalizes common leetspeak substitutions (4->a, 3->e, 1->i, 0->o, 5->s, 7->t, @->a, $->s, etc.),
   strips everything else down to bare letters, then checks for blocked substrings — so spacing,
   symbols, or leetspeak swaps don't bypass it. BLOCKED_TERMS intentionally ships with only a couple
   of generic placeholders: add whatever specific terms/slurs you want blocked directly into this
   array yourself (including their common broken-up/leetspeak variants) — that list isn't something
   this assistant will pre-populate. */

function normalizeForFilter(str){
  let s = str.toLowerCase();
  s = s.split('').map(ch => LEET_MAP[ch] || ch).join('');
  s = s.replace(/[^a-z]/g, ''); // strip spaces, numbers, symbols entirely — catches "s_l_u_r", "s1u2r" etc.
  return s;
}
function isNameAllowed(raw){
  const normalized = normalizeForFilter(raw);
  if(normalized.length < 2) return false;
  return !BLOCKED_TERMS.some(term => normalized.includes(term));
}

const nameInput = document.getElementById('nameInput');
const nameMsg = document.getElementById('nameMsg');
const leaderboardListEl = document.getElementById('leaderboardList');
const lbStatus = document.getElementById('lbStatus');

function isSignedIn(){ return currentUser && !currentUser.isAnonymous; }
function refreshLeaderboardGateUI(){
  if(!nameInput) return;
  const signedIn = isSignedIn();
  const locked = !!portfolio.nameLocked;
  nameInput.disabled = locked || !signedIn;
  document.getElementById('nameSaveBtn').disabled = locked || !signedIn;
  if(!signedIn){
    nameMsg.style.color = '';
    nameMsg.textContent = 'Sign in (Settings → Account) to join the leaderboard under your name.';
  } else if(locked){
    nameMsg.style.color = 'var(--danger)';
    nameMsg.textContent = 'Your name has been locked by an admin.';
  } else {
    nameMsg.textContent = '';
  }
}

let investorName = localStorage.getItem('mrwestcoin_investor_name') || '';

function portfolioValue(){
  return portfolio.cash + totalHeld() * currentPrice;
}
function elementsOwnedCount(){
  return Object.values(portfolio.elements || {}).reduce((a,b) => a+b, 0);
}
function compoundsMadeCount(){
  return Object.values(portfolio.compounds || {}).reduce((a,b) => a+b, 0);
}

function pushLeaderboardEntry(){
  // only real signed-in accounts get added — anonymous play doesn't publish to the leaderboard
  if(!db || !investorName || !isSignedIn()) return;
  db.ref('leaderboard/' + investorId).set({
    name: investorName,
    value: portfolioValue(),
    elementsOwned: elementsOwnedCount(),
    compoundsMade: compoundsMadeCount(),
    updatedAt: Date.now()
  }).catch(() => {});
}

function renderLeaderboard(entries){
  if(!leaderboardListEl) return;
  if(!entries || entries.length === 0){
    leaderboardListEl.innerHTML = '<div class="empty-history">No investors ranked yet.</div>';
    return;
  }
  const sorted = entries.slice().sort((a,b) => b.value - a.value);
  const medalClass = i => i===0 ? 'gold' : i===1 ? 'silver' : i===2 ? 'bronze' : '';
  leaderboardListEl.innerHTML = sorted.map((e,i) => `
    <div class="lb-row">
      <span class="lb-rank ${medalClass(i)}">#${i+1}</span>
      <span class="lb-name ${e.id===investorId ? 'you' : ''}">${e.name}${e.id===investorId ? ' (you)' : ''}
        <span style="display:block; font-size:0.62rem; color:var(--muted);">${e.elementsOwned||0} elements owned · ${e.compoundsMade||0} compounds made</span>
      </span>
      <span class="lb-value">$${e.value.toFixed(2)}</span>
    </div>`).join('');
}

// keeps your own leaderboard entry fresh in the background regardless of which page is open
if(db) setInterval(pushLeaderboardEntry, 20000);

if(nameInput){
  nameInput.value = investorName;
  refreshLeaderboardGateUI();

  document.getElementById('nameSaveBtn').addEventListener('click', () => {
    if(!isSignedIn()){ nameMsg.textContent = 'Sign in first (Settings → Account) to join the leaderboard.'; return; }
    if(portfolio.nameLocked){ nameMsg.textContent = 'Your name has been locked by an admin.'; return; }
    const raw = nameInput.value.trim();
    if(raw.length < 2){ nameMsg.textContent = 'Name needs at least 2 characters.'; return; }
    if(!isNameAllowed(raw)){ nameMsg.textContent = "That name isn't allowed — try something else."; return; }
    investorName = raw;
    localStorage.setItem('mrwestcoin_investor_name', investorName);
    nameMsg.style.color = 'var(--gain)';
    nameMsg.textContent = 'Saved! Your rank will update shortly.';
    pushLeaderboardEntry();
  });

  if(db){
    lbStatus.textContent = 'Ranked by total portfolio value — live, shared with everyone.';
    db.ref('leaderboard').on('value', (snap) => {
      const val = snap.val() || {};
      const entries = Object.keys(val).map(id => ({ id, name: val[id].name, value: val[id].value, elementsOwned: val[id].elementsOwned, compoundsMade: val[id].compoundsMade }));
      renderLeaderboard(entries);
    });
  } else {
    lbStatus.textContent = 'Leaderboard is local-only until a Firebase project is connected.';
    renderLeaderboard(investorName ? [{ id: investorId, name: investorName, value: portfolioValue() }] : []);
  }
}

/* ================= ACCOUNTS / AUTH / ADMIN ================= */
// Set this to the email address YOU will sign in with — the admin panel only actually works
// because Firebase's security rules check this server-side (see the rules snippet given in
// chat). This client-side constant only controls whether the admin UI is shown; it grants no
// real access by itself.
const ADMIN_EMAIL = 'YOUR_ADMIN_EMAIL@example.com';

const anonId = investorId; // the local random ID this browser started with, preserved so sign-out can return to it
let currentUser = null;

function switchActiveAccount(uid){
  investorId = uid;
  localStorage.setItem('mrwestcoin_investor_id', uid);
  if(db) loadPlayerData(uid);
}

async function migrateAnonymousDataTo(newUid){
  if(!db) return;
  // carry the current (anonymous) progress over to the newly-signed-in account, then switch to it
  await db.ref('players/' + newUid).set({
    cash: portfolio.cash, lots: portfolio.lots, trades: portfolio.trades.slice(-200),
    elements: portfolio.elements || {}, compounds: portfolio.compounds || {}, tools: portfolio.tools || ['basic'],
    reactors: portfolio.reactors || {}, reactorPending: portfolio.reactorPending || {},
    nameLocked: !!portfolio.nameLocked, updatedAt: Date.now()
  }).catch(() => {});
  switchActiveAccount(newUid);
}

function updateAuthUI(user){
  currentUser = user;
  const signedIn = user && !user.isAnonymous;
  if(typeof refreshLeaderboardGateUI === 'function') refreshLeaderboardGateUI();

  // everything below only exists on the Settings page
  const signedInBlock = document.getElementById('authSignedInBlock');
  if(!signedInBlock) return;
  signedInBlock.style.display = signedIn ? 'block' : 'none';
  document.getElementById('authSignedOutBlock').style.display = signedIn ? 'none' : 'block';
  document.getElementById('authStatus').textContent = signedIn
    ? 'Signed in — your progress follows this account across devices.'
    : "Playing anonymously — sign in below to carry your progress to other devices.";
  if(signedIn){
    document.getElementById('authSignedInText').textContent = `Signed in as ${user.email || user.displayName || 'your account'}.`;
  }
  document.getElementById('accountIdText').textContent = signedIn
    ? `Account ID: ${user.uid}`
    : `Anonymous device ID: ${anonId} (this is the "backup random ID" — write it down if you ever need to recover this device's progress)`;

  const isAdmin = signedIn && user.email === ADMIN_EMAIL;
  document.getElementById('adminPanelWrap').style.display = isAdmin ? 'block' : 'none';
  if(isAdmin) renderAdminPanel();
}

// Runs on EVERY page (not just Settings) — this is what keeps the signed-in account active as
// you navigate between separate pages, since each page load re-establishes Firebase's
// (persisted) auth session from scratch.
if(FIREBASE_CONFIGURED){
  firebase.auth().onAuthStateChanged((user) => {
    if(user){
      if(user.isAnonymous){
        // real Firebase anonymous auth, separate from our own local random ID — used only so
        // linking to a real account later is possible without losing data. Doesn't change
        // which account is "active" on its own.
      } else if(investorId !== user.uid){
        switchActiveAccount(user.uid);
      }
    }
    updateAuthUI(user);
  });
  // sign in anonymously in the background so linking (upgrading to Google/email) is possible later
  if(!firebase.auth().currentUser) firebase.auth().signInAnonymously().catch(() => {});
}

const googleSignInBtnEl = document.getElementById('googleSignInBtn');
if(googleSignInBtnEl){
  googleSignInBtnEl.addEventListener('click', async () => {
    const authMsg = document.getElementById('authMsg');
    authMsg.textContent = '';
    const provider = new firebase.auth.GoogleAuthProvider();
    try{
      let result;
      if(firebase.auth().currentUser && firebase.auth().currentUser.isAnonymous){
        try{ result = await firebase.auth().currentUser.linkWithPopup(provider); }
        catch(linkErr){ result = await firebase.auth().signInWithPopup(provider); } // e.g. account already exists elsewhere
      } else {
        result = await firebase.auth().signInWithPopup(provider);
      }
      await migrateAnonymousDataTo(result.user.uid);
    } catch(e){ authMsg.textContent = 'Google sign-in failed: ' + e.message; }
  });

  document.getElementById('emailSignUpBtn').addEventListener('click', async () => {
    const authMsg = document.getElementById('authMsg');
    const email = document.getElementById('authEmail').value.trim();
    const pw = document.getElementById('authPassword').value;
    if(!email || pw.length < 6){ authMsg.textContent = 'Enter an email and a password of at least 6 characters.'; return; }
    try{
      let result;
      if(firebase.auth().currentUser && firebase.auth().currentUser.isAnonymous){
        const cred = firebase.auth.EmailAuthProvider.credential(email, pw);
        result = await firebase.auth().currentUser.linkWithCredential(cred);
      } else {
        result = await firebase.auth().createUserWithEmailAndPassword(email, pw);
      }
      await migrateAnonymousDataTo(result.user.uid);
    } catch(e){ authMsg.textContent = 'Sign-up failed: ' + e.message; }
  });
  document.getElementById('emailSignInBtn').addEventListener('click', async () => {
    const authMsg = document.getElementById('authMsg');
    const email = document.getElementById('authEmail').value.trim();
    const pw = document.getElementById('authPassword').value;
    if(!email || !pw){ authMsg.textContent = 'Enter your email and password.'; return; }
    try{
      const result = await firebase.auth().signInWithEmailAndPassword(email, pw);
      switchActiveAccount(result.user.uid);
    } catch(e){ authMsg.textContent = 'Sign-in failed: ' + e.message; }
  });
  document.getElementById('signOutBtn').addEventListener('click', async () => {
    await firebase.auth().signOut();
    switchActiveAccount(anonId);
    firebase.auth().signInAnonymously().catch(() => {});
  });
}

/* --- Admin panel: reads every player's record; writes are gated by Firebase's own rules, not this code --- */
function renderAdminPanel(){
  if(!db) return;
  const wrap = document.getElementById('adminPlayerList');
  if(!wrap) return;
  db.ref('players').once('value').then(snap => {
    const val = snap.val() || {};
    const ids = Object.keys(val);
    if(ids.length === 0){ wrap.innerHTML = '<div class="empty-history">No players yet.</div>'; return; }
    wrap.innerHTML = ids.map(id => `
      <div class="admin-player-row">
        <span style="width:110px; overflow:hidden; text-overflow:ellipsis;">${id}</span>
        <input type="number" class="ap-cash" data-id="${id}" value="${(val[id].cash||0).toFixed(2)}">
        <label><input type="checkbox" class="ap-lock" data-id="${id}" ${val[id].nameLocked ? 'checked' : ''}> Lock name</label>
        <button class="ap-save" data-id="${id}">Save</button>
        <button class="ap-delete" data-id="${id}">Delete</button>
      </div>`).join('');
    wrap.querySelectorAll('.ap-save').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const cash = parseFloat(wrap.querySelector(`.ap-cash[data-id="${id}"]`).value);
        const nameLocked = wrap.querySelector(`.ap-lock[data-id="${id}"]`).checked;
        db.ref('players/' + id).update({ cash, nameLocked }).catch(e => alert('Save failed: ' + e.message));
      });
    });
    wrap.querySelectorAll('.ap-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        if(!confirm('Delete this player entirely? This cannot be undone.')) return;
        const id = btn.dataset.id;
        db.ref('players/' + id).remove();
        db.ref('leaderboard/' + id).remove();
      });
    });
  });
}
