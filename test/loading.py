"""The loading screen: the other one of us, rotating. Each phone cuts the person out of the other one's photo
itself and keeps it for the next time the app opens. MediaPipe is stood in for, as tests can't reach its CDN."""
import math
import base64
import io
import json
import pathlib
import subprocess
import sys
import time

from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
PORT = 8774 + int(__import__('os').environ.get('HH_PORT_SHIFT', '0'))
BASE = f'http://127.0.0.1:{PORT}/pwa/site/index.html'
TEST_CONFIG = "window.HH_FIREBASE = { apiKey: 'test-key', authDomain: 'test-project.firebaseapp.com', projectId: 'test-project', appId: '1:1:web:1' };"
STUB = """
  window.HH_REPO = 'robin/household';
  window.HH_CUTOUT_WAIT = 0;
  /* Stands in for MediaPipe: how sure it is that each pixel is the person. A head and shoulders in the middle, nobody,
     or a download that fails, as the test says. */
  window.HH_CUTOUT = (img) => {
    window.__cutCalls = (window.__cutCalls || 0) + 1;
    const mode = localStorage.getItem('__cutMode') || 'person';
    if (mode === 'offline') throw new Error('Failed to fetch');
    const w = 64, h = 64, data = new Float32Array(w * h).fill(0.03);
    if (mode === 'person') for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const head = ((x - 32) / 12) ** 2 + ((y - 24) / 15) ** 2 < 1, body = ((x - 32) / 27) ** 2 + ((y - 68) / 26) ** 2 < 1;
      if (head || body) data[y * w + x] = 0.96;
    }
    return { w, h, data };
  };
  /* Holds the sign-in check while __holdAuth is set, so the loading screen stays up long enough to look at. */
  (() => {
    if (localStorage.getItem('__holdAuth') !== '1' || !window.firebase) return;
    const a = window.firebase.auth(), on = a.onAuthStateChanged;
    a.onAuthStateChanged = (cb) => on.call(a, (u) => { window.__release = () => cb(u); });
  })();
"""
failures, problems = [], []


def check(cond, msg):
    print(('ok   ' if cond else 'FAIL ') + msg)
    if not cond:
        failures.append(msg)


def act(page, a, arg=None):
    page.locator(f'[data-act="{a}"]' + (f'[data-arg="{arg}"]' if arg is not None else '')).first.click()
    page.wait_for_timeout(200)


def db(page):
    return page.evaluate("JSON.parse(localStorage.getItem('__fbdb'))")


def splash(page):
    return page.evaluate("JSON.parse(localStorage.getItem('hh.splash') || 'null')")


def portrait(shirt, hair, wall):
    """A head-and-shoulders photo, square and 192px like the ones the app saves."""
    im = Image.new('RGB', (192, 192), wall)
    d = ImageDraw.Draw(im)
    d.ellipse([22, 128, 170, 250], fill=shirt)
    d.rectangle([84, 100, 108, 140], fill=(222, 178, 146))
    d.ellipse([58, 22, 134, 112], fill=hair)
    d.ellipse([64, 34, 128, 116], fill=(232, 190, 158))
    for x in (84, 108):
        d.ellipse([x - 4, 70, x + 4, 78], fill=(40, 30, 25))
    d.arc([84, 88, 108, 102], 20, 160, fill=(150, 70, 70), width=3)
    b = io.BytesIO()
    im.save(b, 'JPEG', quality=80)
    return 'data:image/jpeg;base64,' + base64.b64encode(b.getvalue()).decode()


def put_photo(page, p, url):
    page.evaluate("""([p, url]) => { const d = JSON.parse(localStorage.getItem('__fbdb'));
      d['hh/photos'] = Object.assign({ a: null, b: null }, d['hh/photos'] || {}, { [p]: url }); localStorage.setItem('__fbdb', JSON.stringify(d)); }""", [p, url])


def opened(page):
    """Reopens the app and waits for it, and for the phone to make a cut-out if it's going to."""
    page.reload()
    page.wait_for_timeout(1200)


def hold(page):
    """Reopens the app with the sign-in check held, so the loading screen stays up."""
    page.evaluate("localStorage.setItem('__holdAuth', '1')")
    page.reload()
    page.wait_for_timeout(500)


def release(page):
    page.evaluate("localStorage.removeItem('__holdAuth'); window.__release && window.__release()")
    page.wait_for_timeout(900)


ROBIN, JULES = portrait((196, 72, 58), (52, 34, 24), (198, 222, 236)), portrait((60, 128, 90), (30, 26, 22), (238, 214, 190))
NEW_JULES, OTHER_JULES = portrait((90, 70, 150), (120, 80, 40), (220, 230, 210)), portrait((30, 90, 160), (60, 40, 30), (240, 236, 200))

(ROOT / 'shots').mkdir(exist_ok=True)
server = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, locale='en-AU', timezone_id='Australia/Sydney')
        ctx.add_init_script(path=str(ROOT / 'test' / 'firebase-mock.js'))
        ctx.add_init_script(STUB)
        ctx.route('**/firebase-config.js', lambda r: r.fulfill(status=200, content_type='text/javascript', body=TEST_CONFIG))
        ctx.route('**/firebase-*-compat.js', lambda r: r.fulfill(status=200, content_type='text/javascript', body='/* test double */'))
        ctx.route('https://fonts.googleapis.com/**', lambda r: r.abort())
        cdn = []
        ctx.route('https://cdn.jsdelivr.net/**', lambda r: (cdn.append(r.request.url), r.abort()))
        ctx.route('https://storage.googleapis.com/**', lambda r: (cdn.append(r.request.url), r.abort()))
        a = ctx.new_page()
        a.on('pageerror', lambda e: problems.append(f'pageerror {e}'))
        a.goto(BASE); a.wait_for_timeout(500)
        a.evaluate("() => { localStorage.clear(); localStorage.setItem('__fbrules', JSON.stringify(['robin@example.com', 'jules@example.com'])); }")
        a.reload(); a.wait_for_timeout(600)
        act(a, 'aumode', 'create'); a.fill('#auemail', 'robin@example.com'); a.fill('#aupw', 'correct horse 1'); act(a, 'aucreate')
        a.evaluate("(e) => window.__fbVerify(e)", 'robin@example.com'); act(a, 'auverified'); a.wait_for_load_state('load'); a.wait_for_timeout(700)
        a.fill('#sna', 'Robin'); a.fill('#snb', 'Jules'); act(a, 'sme', 'a'); act(a, 'snext'); a.fill('#sbudget', '2000'); act(a, 'snext'); act(a, 'sfinish'); a.wait_for_timeout(500)

        # no photos yet: the loading screen keeps its blob
        check(splash(a) is None, 'without a photo of Jules, Robin\'s phone keeps nothing for the loading screen')
        hold(a)
        check(a.locator('.loading .blob').count() == 1 and a.locator('.loading .twirl').count() == 0 and 'Opening your household' in a.locator('#app').inner_text(),
              'the loading screen has the blob, as before')
        release(a)

        # both add photos: Robin's phone keeps Jules's, and cuts Jules out of it
        put_photo(a, 'a', ROBIN); put_photo(a, 'b', JULES)
        opened(a)
        sp = splash(a)
        check(sp is not None and sp['p'] == 'b' and sp['cut'] is True and sp['src'].startswith('data:image/png;base64,') and a.evaluate('window.__cutCalls') == 1,
              "Robin's phone keeps a cut-out of Jules, the other one of them, made once: " + json.dumps({k: (v if k != 'src' else v[:30]) for k, v in (sp or {}).items()}))
        cut = a.evaluate("""(src) => new Promise((done) => { const i = new Image(); i.onload = () => { const c = document.createElement('canvas'); c.width = i.width; c.height = i.height;
          const g = c.getContext('2d'); g.drawImage(i, 0, 0); const al = (x, y) => g.getImageData(x, y, 1, 1).data[3];
          done({ w: i.width, h: i.height, corner: al(1, 1), face: al(i.width >> 1, Math.round(i.height * 0.3)), shirt: al(i.width >> 1, i.height - 3) }); }; i.src = src; })""", sp['src'])
        check(cut['corner'] == 0 and cut['face'] > 240 and cut['shirt'] > 240 and cut['w'] < 192 and cut['h'] <= 192,
              'only the person is left: the wall behind is see-through, and it\'s cropped to them: ' + json.dumps(cut))
        check(not cdn, 'nothing is fetched from the MediaPipe CDN when the cut-out is stood in for')

        # opening the app again: Jules rotating while it loads
        hold(a)
        pic = a.locator('.loading .twirl.cut .twirl-pic')
        check(pic.count() == 1 and pic.get_attribute('src') == sp['src'], 'the loading screen shows the cut-out of Jules')
        anim = a.evaluate("""() => { const t = document.querySelector('.loading .twirl-turn'), s = getComputedStyle(t);
          const k = t.getAnimations()[0].effect.getKeyframes(), box = t.parentNode.getBoundingClientRect(), img = t.querySelector('img').getBoundingClientRect();
          return { name: s.animationName, dur: s.animationDuration, n: s.animationIterationCount, ease: s.animationTimingFunction, delay: parseFloat(t.style.animationDelay),
            to: k[k.length - 1].transform, shadow: getComputedStyle(t.parentNode).filter, floor: document.querySelectorAll('.twirl-floor').length }; }""")
        check(anim['name'] == 'twirl' and anim['dur'] == '2.2s' and anim['n'] == 'infinite' and anim['ease'] == 'linear' and anim['delay'] <= 0 and anim['to'] == 'rotate(360deg)',
              'rotating flat, round and round, picking up where it was on each redraw: ' + json.dumps(anim))
        a.evaluate("document.getAnimations().forEach((x) => { x.pause(); x.currentTime = 0; })")
        fit = a.evaluate("""() => { const box = document.querySelector('.loading .twirl').getBoundingClientRect(), img = document.querySelector('.loading .twirl-pic').getBoundingClientRect();
          const el = document.querySelector('.loading .twirl-pic');
          return { box: box.width, w: el.offsetWidth, h: el.offsetHeight, dx: (img.left + img.width / 2) - (box.left + box.width / 2), dy: (img.top + img.height / 2) - (box.top + box.height / 2) }; }""")
        check('drop-shadow' in anim['shadow'] and anim['floor'] == 0 and math.hypot(fit['w'], fit['h']) <= fit['box'] + 1 and abs(fit['dx']) < 1 and abs(fit['dy']) < 1,
              'centred so it goes round on the spot, never poking out of its box, with the shadow staying underneath: ' + json.dumps([anim['shadow'], fit]))
        a.screenshot(path=str(ROOT / 'shots' / 'l01-loading-cutout.png'))
        a.evaluate("document.getAnimations().forEach((x) => { x.currentTime = 550; })")
        a.screenshot(path=str(ROOT / 'shots' / 'l02-loading-cutout-turning.png'))
        a.evaluate("document.getAnimations().forEach((x) => { x.currentTime = 1100; })")
        a.screenshot(path=str(ROOT / 'shots' / 'l02b-loading-cutout-upside-down.png'))
        release(a)
        check('Opening your household' not in a.locator('#app').inner_text(), 'and the app opens as usual once the data is in')

        # reduced motion: no rotating
        a.emulate_media(reduced_motion='reduce')
        hold(a)
        check(a.evaluate("getComputedStyle(document.querySelector('.loading .twirl-turn')).animationName") == 'none' and a.locator('.loading .twirl-pic').count() == 1,
              'with reduced motion, Jules stands still')
        release(a)
        a.emulate_media(reduced_motion='no-preference')

        # a new photo with nobody the phone can find: the round photo rotates instead, and it isn't tried again
        a.evaluate("localStorage.setItem('__cutMode', 'nobody')")
        put_photo(a, 'b', NEW_JULES)
        opened(a)
        sp = splash(a)
        check(sp['src'] == NEW_JULES and sp['cut'] is False and sp['tries'] == 3, "a new photo is picked up; with nobody found in it, it's kept as it is, and not tried again")
        hold(a)
        pic = a.locator('.loading .twirl:not(.cut) .twirl-pic')
        check(pic.count() == 1 and pic.get_attribute('src') == NEW_JULES and a.evaluate("getComputedStyle(document.querySelector('.loading .twirl-pic')).borderRadius") == '50%',
              'the loading screen turns the round photo instead')
        a.evaluate("document.getAnimations().forEach((x) => { x.pause(); x.currentTime = 0; })")
        a.screenshot(path=str(ROOT / 'shots' / 'l03-loading-photo.png'))
        release(a)
        opened(a)
        check(not a.evaluate('window.__cutCalls'), 'opening the app again leaves it be')

        # a cut-out that can't download: tried again a day later, three times at most
        a.evaluate("localStorage.setItem('__cutMode', 'offline')")
        put_photo(a, 'b', OTHER_JULES)
        opened(a)
        sp = splash(a)
        check(sp['src'] == OTHER_JULES and sp['cut'] is False and sp['tries'] == 1 and sp['at'] > 0, 'a download that fails is noted, and the round photo shows meanwhile')
        opened(a)
        check(not a.evaluate('window.__cutCalls'), 'not tried again the same day')
        a.evaluate("localStorage.setItem('__cutMode', 'person'); const s = JSON.parse(localStorage.getItem('hh.splash')); s.at -= 25 * 3600e3; localStorage.setItem('hh.splash', JSON.stringify(s));")
        opened(a)
        sp = splash(a)
        check(a.evaluate('window.__cutCalls') == 1 and sp['cut'] is True and sp['src'].startswith('data:image/png'), 'a day later it tries again, and the cut-out is made')
        a.evaluate("const s = JSON.parse(localStorage.getItem('hh.splash')); localStorage.setItem('hh.splash', JSON.stringify(Object.assign(s, { src: 'javascript:alert(1)' })));")
        hold(a)
        check(a.locator('.loading .blob').count() == 1 and a.locator('.loading .twirl').count() == 0, 'anything in storage that isn\'t a picture is ignored')
        release(a)

        # Jules's photo is removed: back to the blob
        put_photo(a, 'b', None)
        opened(a)
        check(splash(a) is None, 'with Jules\'s photo removed, nothing is kept')
        hold(a)
        check(a.locator('.loading .blob').count() == 1 and a.locator('.loading .twirl').count() == 0, 'and the loading screen has the blob again')
        release(a)
        put_photo(a, 'b', JULES)
        opened(a)
        check(splash(a) is not None, 'a photo again, a picture again')

        # signing out clears it, and Jules's phone shows Robin
        act(a, 'go', 'settings'); act(a, 'auout'); a.wait_for_load_state('load'); a.wait_for_timeout(600)
        check(splash(a) is None, 'signing out clears the picture from this phone')
        act(a, 'aumode', 'create'); a.fill('#auemail', 'jules@example.com'); a.fill('#aupw', 'correct horse 2'); act(a, 'aucreate')
        a.evaluate("(e) => window.__fbVerify(e)", 'jules@example.com'); act(a, 'auverified'); a.wait_for_load_state('load'); a.wait_for_timeout(700)
        act(a, 'welcomein'); a.wait_for_timeout(1000)
        sp = splash(a)
        check(sp is not None and sp['p'] == 'a' and sp['cut'] is True, "Jules's phone keeps a cut-out of Robin")
        hold(a)
        check(a.locator('.loading .twirl.cut .twirl-pic').get_attribute('src') == sp['src'], 'and shows Robin rotating while it opens')
        release(a)
        browser.close()
finally:
    server.terminate()

print('\nproblems:', problems or 'none')
print('FAILURES:', len(failures))
for f in failures:
    print(' -', f)
sys.exit(1 if failures or problems else 0)
