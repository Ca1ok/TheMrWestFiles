/* WestFFSync — saves freshly calculated WestFF records into the GitHub repository (lab-cache/ff/<shard>.json) so every future simulator run starts from the cache.
 *
 *  • Runs in the maintainer's browser only: it needs a GitHub fine-grained personal access token (repository access: this repo only, permission: Contents → Read and write).
 *    The token is kept in this browser's localStorage and is sent to api.github.com and nowhere else. Players without a token still calculate and keep results on their own
 *    device (IndexedDB); only a configured maintainer machine publishes to the shared library, so a modified client can never write bad data into it.
 *  • Records are queued, de-duplicated and committed in ONE batch per shard file after a quiet period (default 30 s) — a handful of commits, not one per molecule.
 *  • A failed commit (offline, conflict, expired token) keeps the records queued; they are retried on the next flush or the next visit.
 *  • Firebase is never touched: everything goes browser → GitHub.
 */
const WestFFSync = (function(){
  'use strict';
  const KEY = 'westlab.gh', QKEY = 'westlab.ffq', QUIET = 30000;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const ls = { get: k => { try{ return localStorage.getItem(k); }catch(e){ return null; } }, set: (k, v) => { try{ localStorage.setItem(k, v); }catch(e){} }, del: k => { try{ localStorage.removeItem(k); }catch(e){} } };
  let timer = 0, busy = false, last = { ok: null, msg: 'Nothing pushed yet.', t: 0 };
  const listeners = [];
  const emit = () => listeners.forEach(f => { try{ f(status()); }catch(e){} });

  const cfg = () => { try{ const c = JSON.parse(ls.get(KEY) || 'null'); return c && c.repo && c.token ? { repo: c.repo, branch: c.branch || 'main', token: c.token } : null; }catch(e){ return null; } };
  function setCfg(c){
    const repo = String(c.repo || '').trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, ''), token = String(c.token || '').trim(), branch = String(c.branch || 'main').trim() || 'main';
    if(!/^[\w.-]+\/[\w.-]+$/.test(repo)) return { ok: false, msg: 'Repository must look like owner/name.' };
    if(token.length < 20) return { ok: false, msg: 'That doesn’t look like a GitHub token.' };
    ls.set(KEY, JSON.stringify({ repo, token, branch })); emit(); return { ok: true };
  }
  const clearCfg = () => { ls.del(KEY); emit(); };

  const queue = () => { try{ return JSON.parse(ls.get(QKEY) || '[]'); }catch(e){ return []; } };
  const saveQ = q => { try{ localStorage.setItem(QKEY, JSON.stringify(q)); }catch(e){ if(q.length > 20) saveQ(q.slice(-20)); } };   // localStorage is small: if it is full, keep only the newest
  function enqueue(rec){
    if(!cfg() || !rec || !rec.hill || !rec.cid) return; const q = queue().filter(r => !(r.hill === rec.hill && r.cid === rec.cid)); q.push(rec); saveQ(q); emit();
    clearTimeout(timer); timer = setTimeout(() => flush(), QUIET);
  }

  const b64 = s => { const u = new TextEncoder().encode(s); let bin = ''; for(let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(bin); };
  const unb64 = s => { const bin = atob(s.replace(/\s/g, '')), u = new Uint8Array(bin.length); for(let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new TextDecoder().decode(u); };
  const sorted = o => { const r = {}; Object.keys(o).sort().forEach(k => r[k] = o[k]); return r; };
  async function gh(c, method, path, body){
    const r = await fetch('https://api.github.com/repos/' + c.repo + path, { method, headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + c.token, 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    let j = null; try{ j = await r.json(); }catch(e){} return { status: r.status, ok: r.ok, j };
  }
  async function pushShard(c, FF, id, recs){                              // read current file → merge → commit; retried when somebody else committed in between
    const path = 'lab-cache/ff/' + id + '.json';
    for(let k = 0; k < 4; k++){
      const cur = await gh(c, 'GET', '/contents/' + path + '?ref=' + encodeURIComponent(c.branch)); let db = {}, sha;
      if(cur.status === 200 && cur.j && cur.j.content){ try{ db = JSON.parse(unb64(cur.j.content)); }catch(e){ db = {}; } sha = cur.j.sha; } else if(cur.status !== 404) return { ok: false, msg: 'GitHub said ' + cur.status + (cur.j && cur.j.message ? ': ' + cur.j.message : '') };
      let added = 0; recs.forEach(r => { const e = db[r.hill] = db[r.hill] || {}, old = e[r.cid]; if(old && !(old.tier !== 'ff' && r.tier === 'ff') && !(old.tier === 'ff' && r.tier === 'ff' && r.E < old.E - 0.001)) return; e[r.cid] = r; added++; });   // merge rule: keep the lower-energy conformer; an embed-only record is upgraded by a force-field one
      if(!added) return { ok: true, added: 0 };
      Object.keys(db).forEach(h => db[h] = sorted(db[h])); db = sorted(db);
      const put = await gh(c, 'PUT', '/contents/' + path, { message: 'WestLab FF cache: +' + added + ' compound' + (added > 1 ? 's' : '') + ' (' + id + ')', content: b64(JSON.stringify(db)), branch: c.branch, sha, committer: { name: 'westlab-ff', email: 'noreply@users.noreply.github.com' } });
      if(put.ok) return { ok: true, added };
      if(put.status === 409 || put.status === 422){ await sleep(800 * (k + 1)); continue; }                 // stale sha → read again
      return { ok: false, msg: 'GitHub said ' + put.status + (put.j && put.j.message ? ': ' + put.j.message : '') };
    }
    return { ok: false, msg: 'Too many conflicting commits — will retry.' };
  }
  async function flush(){
    const c = cfg(), FF = typeof WestFF !== 'undefined' ? WestFF : null; if(!c || !FF) return last; if(busy) return last;
    let q = queue(); if(!q.length) return last; busy = true; emit(); clearTimeout(timer);
    try{
      const by = {}; q.forEach(r => (by[FF.shardOf(r.hill)] = by[FF.shardOf(r.hill)] || []).push(r)); let total = 0, fail = null;
      for(const id of Object.keys(by)){
        const res = await pushShard(c, FF, id, by[id]);
        if(res.ok){ total += res.added || 0; const gone = new Set(by[id].map(r => r.hill + '|' + r.cid)); q = q.filter(r => !gone.has(r.hill + '|' + r.cid)); saveQ(q); } else { fail = res.msg; break; }
        await sleep(1000);                                                // GitHub asks for ≥ 1 s between write requests
      }
      last = fail ? { ok: false, msg: fail, t: Date.now() } : { ok: true, msg: 'Committed ' + total + ' compound' + (total === 1 ? '' : 's') + ' to ' + c.repo + '@' + c.branch + '.', t: Date.now() };
      if(fail) timer = setTimeout(() => flush(), 5 * 60000);
    }catch(e){ last = { ok: false, msg: 'Network error — records stay queued.', t: Date.now() }; timer = setTimeout(() => flush(), 5 * 60000); }
    busy = false; emit(); return last;
  }
  const status = () => ({ configured: !!cfg(), repo: cfg() ? cfg().repo : '', branch: cfg() ? cfg().branch : 'main', pending: queue().length, busy, last });
  if(typeof window !== 'undefined') setTimeout(() => { if(cfg() && queue().length) flush(); }, 8000);     // pick up anything left from an earlier session
  return { setCfg, clearCfg, enqueue, flush, status, onChange: f => listeners.push(f) };
})();
