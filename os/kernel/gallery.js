/* KERNEL · gallery — client for the media archive that lives in Firebase (files are base64 chunks; nothing is served from a public URL).
 * Shared by Photos, News (thumbnails only), Settings (wallpaper picker) and the shell (wallpaper), so one cache serves every app.
 * Data-saving design — the Spark plan allows ~10 GB/month of database download:
 *   - the item LIST is one small read (cached 5 min); thumbnails are separate tiny nodes, fetched lazily and kept in IndexedDB forever
 *   - images keep a ~1600px preview for viewing and the untouched original for Download only; GIFs/videos load on request
 *   - every byte pulled is counted and added to a shared monthly counter that the Firebase rules enforce (loading pauses past the budget) */
(window.__OSM = window.__OSM || []).push(function(K){
  const CFG = OS_CONFIG, CHUNK = 300000, LIMITS = { image: 25e6, gif: 10e6, video: 25e6 }, PREVIEW_PX = 1600, SINGLE_COPY_MAX = 500e3, DISK_CACHE = 120e6, MAX_ITEMS = 150;
  const G = K.gallery = { usage: { until: 0, bytes: 0 } };
  const db = () => K.cloud.db;
  /* Previews are PUBLIC: the item list and the tiny thumbnails can be read by anyone (guests included, no sign-in, no anonymous session needed).
   * Opening, expanding and downloading (the ~1600px preview, the original, GIFs, videos) needs a real signed-in account. */
  const dbReady = () => new Promise(res => { if(db()) return res(true); let n = 0; const t = setInterval(() => { if(db() || ++n > 80){ clearInterval(t); res(!!db()); } }, 100); });
  const denied = e => !!e && (e.code === 'PERMISSION_DENIED' || /permission/i.test(e.message || ''));
  async function publicRead(path, fn){                                    // try anonymously first; if the rules still want a session, fall back to an anonymous one
    if(!(await dbReady())) throw new Error('offline');
    try{ return await fn(db().ref(path)); }
    catch(e){ if(!denied(e) || K.cloud.user || !(await K.cloud.ensureReadAccess())) throw e; return fn(db().ref(path)); }
  }
  G.canOpen = () => K.cloud.signedIn();
  let pending = 0, listP = null, listAt = 0, itemsCache = [];
  const thumbMem = new Map(), blobCache = new Map(), viewUrl = new Map();

  /* ---- browser cache (IndexedDB; same database name as the old site so existing caches still work) ---- */
  let idbP = null;
  const idbOpen = () => idbP || (idbP = new Promise(res => { try{ const r = indexedDB.open('mwf_gallery', 1); r.onupgradeneeded = () => { r.result.createObjectStore('thumb'); r.result.createObjectStore('media'); }; r.onsuccess = () => res(r.result); r.onerror = r.onblocked = () => res(null); }catch(e){ res(null); } }));
  const idbReq = (store, mode, fn) => idbOpen().then(d => !d ? null : new Promise(res => { try{ const t = d.transaction(store, mode), r = fn(t.objectStore(store)); t.oncomplete = () => res(r && 'result' in r ? r.result : null); t.onerror = t.onabort = () => res(null); }catch(e){ res(null); } }));
  const idbGet = (s, k) => idbReq(s, 'readonly', st => st.get(k)), idbPut = (s, k, v) => idbReq(s, 'readwrite', st => st.put(v, k)), idbDel = (s, k) => idbReq(s, 'readwrite', st => st.delete(k));
  async function trim(){
    const keys = await idbReq('media', 'readonly', st => st.getAllKeys()), vals = await idbReq('media', 'readonly', st => st.getAll()); if(!keys || !vals) return;
    const rows = keys.map((k, i) => ({ k, size: (vals[i] && vals[i].size) || 0, ts: (vals[i] && vals[i].ts) || 0 })).sort((a, b) => a.ts - b.ts);
    let total = rows.reduce((n, r) => n + r.size, 0); for(const r of rows){ if(total <= DISK_CACHE) break; await idbDel('media', r.k); total -= r.size; }
  }

  /* ---- monthly budget ---- */
  const monthEnd = () => { const d = new Date(); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1); };
  G.budgetOk = () => !G.usage.until || Date.now() > G.usage.until || G.usage.bytes < CFG.galleryBudgetBytes;
  const addBytes = n => { if(n > 0){ pending += n; K.cloud.bytes += n; } };
  function flushBytes(){
    if(!db() || !K.cloud.user || pending <= 0) return; const n = Math.min(pending, 60e6); pending -= n;
    db().ref('gallery/usage').transaction(cur => (!cur || Date.now() > cur.until) ? { bytes: n, until: monthEnd() } : { bytes: cur.bytes + n, until: cur.until }).catch(() => {});
    if(pending > 0) setTimeout(flushBytes, 1500);
  }
  setInterval(flushBytes, 20000); document.addEventListener('visibilitychange', () => { if(document.hidden) flushBytes(); }); window.addEventListener('pagehide', flushBytes);
  G.loadUsage = async () => { if(!K.cloud.signedIn() || !(await dbReady())) return G.usage; try{ const s = await db().ref('gallery/usage').once('value'); G.usage = s.val() || { until: 0, bytes: 0 }; }catch(e){} return G.usage; };

  /* ---- listing / thumbnails ---- */
  G.list = async function(force){
    if(!force && listP && Date.now() - listAt < 300000) return listP;
    listAt = Date.now();
    listP = (async () => {
      try{
        const s = await publicRead('gallery/items', r => r.orderByKey().limitToLast(MAX_ITEMS).once('value')); const v = s.val() || {};
        try{ addBytes(JSON.stringify(v).length); }catch(e){}
        itemsCache = Object.keys(v).sort().reverse().map(id => Object.assign({ id }, v[id]));
      }catch(e){ listP = null; listAt = 0; }
      return itemsCache;
    })();
    return listP;
  };
  G.item = id => itemsCache.find(m => m.id === id) || null;
  const thumbWait = new Map();                                         // de-duplicates simultaneous requests for the same thumbnail
  G.thumb = async function(m){
    if(!m) return null; if(m.thumb) return m.thumb; if(thumbMem.has(m.id)) return thumbMem.get(m.id); if(thumbWait.has(m.id)) return thumbWait.get(m.id);
    const p = (async () => {
      let t = await idbGet('thumb', m.id);
      if(!t){ try{ t = (await publicRead('gallery/thumbs/' + m.id, r => r.once('value'))).val(); }catch(e){} if(t){ addBytes(t.length); idbPut('thumb', m.id, t); } }
      if(t) thumbMem.set(m.id, t); return t || null;
    })();
    thumbWait.set(m.id, p); p.then(() => thumbWait.delete(m.id), () => thumbWait.delete(m.id)); return p;
  };

  /* ---- chunk loading: memory → IndexedDB → Firebase ---- */
  const b64ToBytes = b64 => { const bin = atob(b64), u = new Uint8Array(bin.length); for(let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
  const cachePut = (key, blob) => { if(blobCache.has(key)) return blobCache.get(key); const c = { blob, url: URL.createObjectURL(blob) }; blobCache.set(key, c); while(blobCache.size > 6){ const k = blobCache.keys().next().value; if(k === key) break; URL.revokeObjectURL(blobCache.get(k).url); blobCache.delete(k); } return c; };
  G.isCached = async key => blobCache.has(key) || !!((await idbGet('media', key)) || {}).blob;
  async function loadBlob(kind, id, count, mime, onProg){
    const key = kind + '/' + id;
    if(!K.cloud.signedIn()) throw new Error('signin');
    if(blobCache.has(key)){ const c = blobCache.get(key); blobCache.delete(key); blobCache.set(key, c); return c.blob; }
    const rec = await idbGet('media', key); if(rec && rec.blob){ cachePut(key, rec.blob); idbPut('media', key, { blob: rec.blob, size: rec.size, ts: Date.now() }); return rec.blob; }
    if(!K.cloud.signedIn()) throw new Error('signin'); if(!G.budgetOk()) throw new Error('budget'); if(!(await dbReady())) throw new Error('offline');
    const parts = new Array(count); let next = 0, done = 0, got = 0;
    const worker = async () => { while(next < count){ const i = next++; const v = (await db().ref('gallery/' + kind + '/' + id + '/' + i).once('value')).val(); if(typeof v !== 'string') throw new Error('missing chunk ' + i); got += v.length; parts[i] = b64ToBytes(v); done++; if(onProg) onProg(done / count); } };
    try{ await Promise.all([worker(), worker(), worker(), worker()]); } finally { addBytes(got); }
    const blob = new Blob(parts, { type: mime }); cachePut(key, blob); idbPut('media', key, { blob, size: blob.size, ts: Date.now() }).then(trim); return blob;
  }
  G.view = async function(m, onProg){ const blob = await loadBlob('view', m.id, m.chunks, m.viewMime || m.mime, onProg); return { blob, url: (blobCache.get('view/' + m.id) || cachePut('view/' + m.id, blob)).url }; };
  G.full = async function(m, onProg){ if(m.type === 'image' && m.fullChunks) return { blob: await loadBlob('full', m.id, m.fullChunks, m.origMime || m.mime, onProg), mime: m.origMime || m.mime }; return { blob: (await G.view(m, onProg)).blob, mime: m.viewMime || m.mime }; };
  G.errText = e => (e && e.message === 'signin') ? 'Sign in to open, expand and download photos.' : (e && (e.message === 'budget' || /permission/i.test(e.message || ''))) ? 'Monthly data budget reached — media loading resumes next month.' : 'Could not load this file.';
  // wallpapers: the ~1600px preview of an image, resolved to an object URL (cached in IndexedDB, so it costs data once per device)
  G.wallpaper = async function(id){
    if(!id) return null; if(viewUrl.has(id)) return viewUrl.get(id);
    const m = G.item(id) || (await G.list()).find(x => x.id === id); if(!m || m.type === 'video') return null;
    try{ const { url } = await G.view(m); viewUrl.set(id, url); return url; }catch(e){ return e && e.message === 'signin' ? (await G.thumb(m)) : null; }
  };

  G.cacheSize = async () => { const vals = await idbReq('media', 'readonly', st => st.getAll()); return (vals || []).reduce((n, v) => n + ((v && v.size) || 0), 0); };
  G.clearCache = async () => { blobCache.forEach(c => URL.revokeObjectURL(c.url)); blobCache.clear(); viewUrl.clear(); await idbReq('media', 'readwrite', st => st.clear()); };
  /* ---- counters ---- */
  const seen = new Set(); try{ JSON.parse(sessionStorage.getItem('gal_seen') || '[]').forEach(x => seen.add(x)); }catch(e){}
  G.stats = async () => { if(!K.cloud.signedIn() || !(await dbReady())) return {}; try{ const s = await db().ref('gallery/stats').once('value'); const v = s.val() || {}; try{ addBytes(JSON.stringify(v).length); }catch(e){} return v; }catch(e){ return {}; } };
  G.countView = id => { if(!db() || !K.cloud.user || seen.has(id)) return; seen.add(id); try{ sessionStorage.setItem('gal_seen', JSON.stringify([...seen])); }catch(e){} db().ref('gallery/stats/' + id + '/views').transaction(v => (v || 0) + 1).catch(() => {}); };
  G.countDownload = id => db() && K.cloud.user ? db().ref('gallery/stats/' + id + '/downloads').transaction(v => (v || 0) + 1).catch(() => {}) : null;

  /* ---- admin: upload / rename / delete (the rules reject all of this from anyone else) ---- */
  const kindOf = f => f.type === 'image/gif' ? 'gif' : f.type.startsWith('video/') ? 'video' : f.type.startsWith('image/') ? 'image' : null;
  const need = () => { if(!K.cloud.isAdmin()) throw new Error('Admin only.'); };
  const drawFit = (bmp, max) => { const s = Math.min(1, max / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas'); c.width = Math.max(1, Math.round(bmp.width * s)); c.height = Math.max(1, Math.round(bmp.height * s)); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); return c; };
  const canvasBlob = (c, type, q) => new Promise(res => c.toBlob(res, type, q));
  const toB64 = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
  function thumbOf(src){ const w = src.width || src.videoWidth, h = src.height || src.videoHeight, s = Math.min(1, 320 / Math.max(w, h)), c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s)); c.getContext('2d').drawImage(src, 0, 0, c.width, c.height); let d = c.toDataURL('image/webp', 0.5); if(!d.startsWith('data:image/webp')) d = c.toDataURL('image/jpeg', 0.55); return d; }
  const videoFrame = file => new Promise((res, rej) => { const url = URL.createObjectURL(file), v = document.createElement('video'); v.muted = true; v.preload = 'metadata'; v.playsInline = true; v.onloadedmetadata = () => { v.currentTime = Math.min(1, (v.duration || 1) * 0.25); }; v.onseeked = () => res({ v, url }); v.onerror = () => { URL.revokeObjectURL(url); rej(new Error('This video format cannot be read by your browser (try MP4 or WebM).')); }; v.src = url; });
  async function writeChunks(path, blob, onBytes){ const n = Math.ceil(blob.size / CHUNK); let bytes = 0; for(let i = 0; i < n; i += 3){ const batch = []; for(let j = i; j < Math.min(n, i + 3); j++) batch.push(toB64(blob.slice(j * CHUNK, (j + 1) * CHUNK)).then(async b64 => { await db().ref(path + '/' + j).set(b64); bytes += b64.length; onBytes(b64.length); })); await Promise.all(batch); } return { count: n, bytes }; }
  G.upload = async function(file, onProgress){
    need(); const kind = kindOf(file); if(!kind) throw new Error('Unsupported file type.'); if(file.size > LIMITS[kind]) throw new Error('Too large (max ' + Math.round(LIMITS[kind] / 1e6) + ' MB).');
    const id = db().ref('gallery/items').push().key;
    try{
      const meta = { type: kind, title: file.name.replace(/\.[^.]+$/, '').slice(0, 80), mime: file.type, size: file.size, origName: file.name };
      let viewBlob = file, fullBlob = null, thumb;
      if(kind === 'video'){ const { v, url } = await videoFrame(file); meta.w = v.videoWidth; meta.h = v.videoHeight; meta.duration = Math.round(v.duration || 0); thumb = thumbOf(v); URL.revokeObjectURL(url); }
      else { const bmp = await createImageBitmap(file); meta.w = bmp.width; meta.h = bmp.height; thumb = thumbOf(bmp);
        if(kind === 'image' && !(file.size <= SINGLE_COPY_MAX && Math.max(bmp.width, bmp.height) <= PREVIEW_PX)){ const c = drawFit(bmp, PREVIEW_PX); let pb = await canvasBlob(c, 'image/webp', 0.82); if(!pb || pb.type !== 'image/webp') pb = await canvasBlob(c, 'image/jpeg', 0.84); if(pb && pb.size < file.size * 0.85){ viewBlob = pb; fullBlob = file; meta.viewMime = pb.type; meta.origMime = file.type; } } }
      meta.viewSize = viewBlob.size; const total = viewBlob.size + (fullBlob ? fullBlob.size : 0); let sent = 0; const prog = n => { sent += n * 0.75; onProgress && onProgress(Math.min(0.99, sent / total)); };
      await db().ref('gallery/thumbs/' + id).set(thumb);
      const v = await writeChunks('gallery/view/' + id, viewBlob, prog); meta.chunks = v.count; meta.bytes = v.bytes + thumb.length;
      if(fullBlob){ const f = await writeChunks('gallery/full/' + id, fullBlob, prog); meta.fullChunks = f.count; meta.bytes += f.bytes; }
      meta.createdAt = firebase.database.ServerValue.TIMESTAMP; meta.uploader = K.cloud.user.uid;
      await db().ref('gallery/items/' + id).set(meta);               // meta last, so the item only appears once everything is stored
      onProgress && onProgress(1); listP = null; return id;
    }catch(e){ try{ await Promise.all([db().ref('gallery/view/' + id).remove(), db().ref('gallery/full/' + id).remove(), db().ref('gallery/thumbs/' + id).remove()]); }catch(_){} throw e; }
  };
  G.rename = async (id, title) => { need(); await db().ref('gallery/items/' + id + '/title').set(String(title).trim().slice(0, 80)); listP = null; };
  G.remove = async id => { need(); ['view', 'full'].forEach(k => { const c = blobCache.get(k + '/' + id); if(c){ URL.revokeObjectURL(c.url); blobCache.delete(k + '/' + id); } idbDel('media', k + '/' + id); }); idbDel('thumb', id);
    await Promise.all([db().ref('gallery/view/' + id).remove(), db().ref('gallery/full/' + id).remove(), db().ref('gallery/thumbs/' + id).remove(), db().ref('gallery/stats/' + id).remove()]); await db().ref('gallery/items/' + id).remove(); listP = null; };
});
