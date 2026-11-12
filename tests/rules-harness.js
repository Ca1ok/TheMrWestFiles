// A small evaluator for Firebase Realtime Database security rules, good enough to run database.rules.json against honest and cheating writes.
// The rule strings are JavaScript-compatible, so each is evaluated with mocks of data / newData / root / now / auth. Semantics follow Firebase:
//   .write rules cascade DOWN (any ancestor's .write that is true grants the write, evaluated at that ancestor with data/newData of THAT node);
//   .validate rules run on the written location and every descendant that exists after the write (they do NOT cascade up);
//   a multi-path update is atomic: every path is checked against the same before/after trees.
const fs = require('fs'), path = require('path');
String.prototype.beginsWith = function(s){ return this.startsWith(s); };
String.prototype.matches = function(re){ return re.test(String(this)); };
const RULES = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'database.rules.json'), 'utf8')).rules;
const clone = o => o === undefined ? undefined : JSON.parse(JSON.stringify(o));
function getAt(tree, p){ let v = tree; for(const k of p){ if(v == null || typeof v !== 'object') return undefined; v = v[k]; } return v; }
function setAt(tree, p, val){ if(!p.length) return val; const t = tree && typeof tree === 'object' ? tree : {}; let cur = t; for(let i = 0; i < p.length - 1; i++){ if(cur[p[i]] == null || typeof cur[p[i]] !== 'object') cur[p[i]] = {}; cur = cur[p[i]]; } if(val === null || val === undefined){ delete cur[p[p.length - 1]]; } else cur[p[p.length - 1]] = val; return t; }
function prune(v){ if(v && typeof v === 'object'){ Object.keys(v).forEach(k => { const c = prune(v[k]); if(c === undefined) delete v[k]; else v[k] = c; }); return Object.keys(v).length ? v : undefined; } return v === null ? undefined : v; }
function node(tree, p){
  const get = () => getAt(tree, p);
  return {
    val: () => { const v = get(); return v === undefined ? null : v; },
    exists: () => { const v = get(); return v !== undefined && v !== null; },
    hasChildren: ks => { const v = get(); return v != null && typeof v === 'object' && (!ks || ks.every(k => v[k] !== undefined)); },
    child: c => node(tree, p.concat(String(c).split('/').filter(Boolean))),
    parent: () => { if(!p.length) throw new Error('parent of root'); return node(tree, p.slice(0, -1)); },
    isNumber: () => typeof get() === 'number', isString: () => typeof get() === 'string', isBoolean: () => typeof get() === 'boolean'
  };
}
function evalExpr(expr, ctx){
  const names = Object.keys(ctx), fn = new Function(...names, 'return (' + expr + ');');
  try{ return fn(...names.map(k => ctx[k])) === true; }catch(e){ return false; }
}
// walk the rules tree along a path; returns [{rule, vars, at}] from the root down to the deepest rule node found
function chain(p){
  const out = [{ rule: RULES, vars: {}, at: [] }]; let rule = RULES, vars = {};
  for(let i = 0; i < p.length; i++){
    const k = p[i]; let next = rule[k] && typeof rule[k] === 'object' ? rule[k] : null, v = vars;
    if(!next){ const wk = Object.keys(rule).find(x => x.charAt(0) === '$' && x !== '$other'); if(wk){ next = rule[wk]; v = Object.assign({}, vars, { [wk]: k }); } }
    if(!next) break; rule = next; vars = v; out.push({ rule, vars, at: p.slice(0, i + 1) });
  }
  return out;
}
function ctxFor(oldT, newT, at, vars, now, auth){ return Object.assign({ data: node(oldT, at), newData: node(newT, at), root: node(oldT, []), now, auth: auth || null }, vars); }
function checkWrite(oldT, newT, p, now, auth){
  for(const c of chain(p)){ const w = c.rule['.write']; if(typeof w === 'boolean'){ if(w) return true; } else if(typeof w === 'string' && evalExpr(w, ctxFor(oldT, newT, c.at, c.vars, now, auth))) return true; }
  return false;
}
function checkValidate(oldT, newT, p, now, auth){   // the written location and everything under it
  const bad = [];
  (function walk(at, rule, vars){
    const cur = getAt(newT, at); if(cur === undefined || cur === null) return;
    const v = rule && rule['.validate'];
    if(v !== undefined && v !== null){ const ok = typeof v === 'boolean' ? v : evalExpr(v, ctxFor(oldT, newT, at, vars, now, auth)); if(!ok) bad.push(at.join('/')); }
    if(cur && typeof cur === 'object') Object.keys(cur).forEach(k => {
      let next = rule && rule[k] && typeof rule[k] === 'object' ? rule[k] : null, nv = vars;
      if(!next && rule){ const wk = Object.keys(rule).find(x => x.charAt(0) === '$' && x !== '$other'); if(wk){ next = rule[wk]; nv = Object.assign({}, vars, { [wk]: k }); } else if(rule.$other){ next = rule.$other; } }
      walk(at.concat(k), next, nv);
    });
  })(p, chain(p).slice(-1)[0].at.length === p.length ? chain(p).slice(-1)[0].rule : null, chain(p).slice(-1)[0].vars);
  return bad;
}
/* apply a multi-path update { 'a/b': value | null } to a tree and judge it. returns { ok, why, tree } */
function update(oldT, updates, now, auth){
  let newT = clone(oldT) || {};
  Object.keys(updates).forEach(k => { newT = setAt(newT, k.split('/').filter(Boolean), clone(updates[k])); }); newT = prune(newT) || {};
  for(const k of Object.keys(updates)){ const p = k.split('/').filter(Boolean);
    if(!checkWrite(oldT, newT, p, now, auth)) return { ok: false, why: 'write denied at ' + k, tree: oldT };
    if(updates[k] !== null){ const bad = checkValidate(oldT, newT, p, now, auth); if(bad.length) return { ok: false, why: 'validate failed at ' + bad.join(', '), tree: oldT }; } }
  return { ok: true, tree: newT };
}
const mkAuth = (uid, email, anon) => ({ uid, token: { email: email || (uid + '@x.com'), email_verified: true, firebase: { sign_in_provider: anon ? 'anonymous' : 'google.com' } } });
const ADMIN = mkAuth('admin', 'kirattdhaliwal@gmail.com');
module.exports = { RULES, update, node, mkAuth, ADMIN, clone, checkWrite, checkValidate };
