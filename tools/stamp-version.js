#!/usr/bin/env node
/* Writes version.json: a content hash of every file the browser loads. index.html reads it on every visit; when it differs from what this browser last saw, the browser
 * drops Cache Storage + service workers, re-downloads the changed files bypassing the HTTP cache, and reloads — so an old version is never run.
 * Run by .github/workflows/stamp-version.yml on every push; run it yourself (node tools/stamp-version.js) before uploading if you host without GitHub Actions.
 * Market/lab-cache/data feeds the bots rewrite every few minutes are EXCLUDED, so they never trigger a purge. */
const fs = require('fs'), path = require('path'), crypto = require('crypto'), root = path.join(__dirname, '..');
const SKIP_DIR = new Set(['.git', '.github', 'node_modules', 'tests', 'tools', 'lab-cache', 'market']), SKIP_FILE = new Set(['version.json', 'CNAME', 'robots.txt']), SKIP_EXT = new Set(['.md', '.py']);
const out = {};
(function walk(d){ for(const n of fs.readdirSync(d, { withFileTypes: true })){ const p = path.join(d, n.name), rel = path.relative(root, p).split(path.sep).join('/');
  if(n.isDirectory()){ if(!SKIP_DIR.has(n.name)) walk(p); continue; } if(SKIP_FILE.has(n.name) || SKIP_EXT.has(path.extname(n.name))) continue;
  out[rel] = crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex').slice(0, 10); } })(root);
const keys = Object.keys(out).sort(), v = crypto.createHash('sha1').update(keys.map(k => k + ':' + out[k]).join('\n')).digest('hex').slice(0, 12);
const json = JSON.stringify({ v, files: out }), file = path.join(root, 'version.json');
let old = ''; try{ old = JSON.parse(fs.readFileSync(file, 'utf8')).v; }catch(e){}
if(old !== v){ fs.writeFileSync(file, json); console.log('version.json → ' + v + ' (' + keys.length + ' files)'); } else console.log('version unchanged ' + v);
