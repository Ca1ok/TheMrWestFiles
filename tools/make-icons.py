"""Regenerates assets/icons/*.png — one PNG per app, plus WestOS.png (favicon / brand mark).
Run:  python3 tools/make-icons.py        (needs: pip install playwright && playwright install chromium)
Edit an app's colours or glyph in os/icons.js, run this, commit the PNGs. The OS only ever loads the PNG files."""
import json, os, re
from playwright.sync_api import sync_playwright
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'assets', 'icons'); os.makedirs(OUT, exist_ok=True)
src = open(os.path.join(ROOT, 'os', 'icons.js')).read().replace("document.currentScript", "null")
PAGE = """<html><body style="margin:0;background:transparent"><div id="i"></div><script>%s</script><script>
function render(a){
  const el = document.getElementById('i'); const S = 512;
  el.style.cssText = 'width:'+S+'px;height:'+S+'px;border-radius:22.4%%;position:relative;overflow:hidden;display:grid;place-items:center;color:#fff;background:'+a.bg+';box-shadow:inset 0 4px 0 rgba(255,255,255,.30),inset 0 -10px 22px rgba(0,0,0,.20)';
  el.innerHTML = '<div style="position:absolute;inset:0;background:radial-gradient(120%% 80%% at 30%% 0%%,rgba(255,255,255,.22),transparent 60%%)"></div>' + a.inner;
}
</script></body></html>""" % src
with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox']); pg = b.new_page(viewport={'width': 600, 'height': 600}); pg.set_content(PAGE)
    apps = pg.evaluate("OS_APPS.map(a => ({ id: a.id, g: a.g, glyph: a.glyph }))")
    for a in apps:
        glyph = pg.evaluate("osIcon(%s, 300, 1.8)" % json.dumps(a['glyph']))
        pg.evaluate("render(%s)" % json.dumps({'bg': 'linear-gradient(160deg,%s,%s)' % tuple(a['g']), 'inner': '<div style="position:relative;filter:drop-shadow(0 6px 10px rgba(0,0,0,.28))">%s</div>' % glyph}))
        pg.locator('#i').screenshot(path=os.path.join(OUT, a['id'] + '.png'), omit_background=True)
    # brand mark: parchment-and-ink "W"
    W = '<div style="position:relative;font:900 330px/1 Georgia,Times New Roman,serif;color:#f1dfb4;letter-spacing:-10px;text-shadow:0 6px 0 #a2321f,0 10px 18px rgba(0,0,0,.5)">W</div>'
    pg.evaluate("render(%s)" % json.dumps({'bg': 'linear-gradient(160deg,#3a2a1b,#16100a)', 'inner': W}))
    pg.locator('#i').screenshot(path=os.path.join(OUT, 'WestOS.png'), omit_background=True)
    b.close()
print('wrote', len(os.listdir(OUT)), 'icons to', OUT)
