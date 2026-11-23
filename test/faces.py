"""Profile photos framed on the face. A new photo is cropped around the face before it's saved; a photo saved before
that (or while the face finder couldn't be reached) is zoomed in on the face on each phone, and the loading screen cuts
the person out of the close-up. MediaPipe is stood in for, as tests can't reach its CDN: the magenta patch is the face."""
import base64
import io
import json
import pathlib
import subprocess
import sys
import tempfile
import time

from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
PORT = 8790 + int(__import__('os').environ.get('HH_PORT_SHIFT', '0'))
BASE = f'http://127.0.0.1:{PORT}/pwa/site/index.html'
TEST_CONFIG = "window.HH_FIREBASE = { apiKey: 'test-key', authDomain: 'test-project.firebaseapp.com', projectId: 'test-project', appId: '1:1:web:1' };"
STUB = """
  window.HH_REPO = 'robin/household';
  window.HH_CUTOUT_WAIT = 0;
  window.HH_FACE_WAIT = 0;
  if (localStorage.getItem('__faceLimit')) window.HH_FACE_LIMIT = Number(localStorage.getItem('__faceLimit'));
  /* The face finder: finds the magenta patch. Like the real one, it misses a face that's under a tenth of what it's
     shown, or cut off by the edge. It can also be unreachable, or never answer. */
  window.HH_FACE = (cv) => {
    window.__faceCalls = (window.__faceCalls || 0) + 1;
    const mode = localStorage.getItem('__faceMode') || 'find';
    if (mode === 'offline') throw new Error('Failed to fetch');
    if (mode === 'slow') return new Promise(() => {});
    const W = cv.width, H = cv.height, d = cv.getContext('2d').getImageData(0, 0, W, H).data;
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (d[i] > 190 && d[i + 1] < 80 && d[i + 2] > 190) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    }
    if (x1 < 0 || Math.max(x1 - x0, y1 - y0) + 1 < Math.max(W, H) / 10 || x0 === 0 || y0 === 0 || x1 === W - 1 || y1 === H - 1) return [];
    return [{ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, score: 0.93 }];
  };
  /* The cut-out: everything is the person, so it just keeps what it was given. */
  window.HH_CUTOUT = (img) => { window.__cutSrc = img.src; window.__cutCalls = (window.__cutCalls || 0) + 1;
    const w = 32, h = 32, data = new Float32Array(w * h).fill(0.03);
    for (let y = 4; y < h; y++) for (let x = 4; x < w - 4; x++) data[y * w + x] = 0.97;
    return { w, h, data }; };
"""
failures, problems = [], []
TMP = pathlib.Path(tempfile.mkdtemp())


def check(cond, msg):
    print(('ok   ' if cond else 'FAIL ') + msg)
    if not cond:
        failures.append(msg)


def act(page, a, arg=None):
    page.locator(f'[data-act="{a}"]' + (f'[data-arg="{arg}"]' if arg is not None else '')).first.click()
    page.wait_for_timeout(200)


def db(page):
    return page.evaluate("JSON.parse(localStorage.getItem('__fbdb'))")


def faces(page):
    return page.evaluate("JSON.parse(localStorage.getItem('hh.faces') || 'null')")


def splash(page):
    return page.evaluate("JSON.parse(localStorage.getItem('hh.splash') || 'null')")


def photo(size, face, path=None, quality=90):
    """A photo with a person, whose face is the magenta patch at `face` (or no face)."""
    W, H = size
    im = Image.new('RGB', size, (182, 202, 222))
    d = ImageDraw.Draw(im)
    if face:
        x0, y0, x1, y1 = face
        d.rectangle([x0 - (x1 - x0) // 2, y1, x1 + (x1 - x0) // 2, H], fill=(60, 90, 140))
        d.ellipse(face, fill=(255, 0, 255))
    if path:
        im.save(path, 'JPEG', quality=quality)
        return path
    b = io.BytesIO()
    im.save(b, 'JPEG', quality=quality)
    return 'data:image/jpeg;base64,' + base64.b64encode(b.getvalue()).decode()


def put_photo(page, p, url):
    page.evaluate("""([p, url]) => { const d = JSON.parse(localStorage.getItem('__fbdb'));
      d['hh/photos'] = Object.assign({ a: null, b: null }, d['hh/photos'] || {}, { [p]: url }); localStorage.setItem('__fbdb', JSON.stringify(d)); }""", [p, url])


def where_face(page, src):
    """The size of a picture and where the magenta in it is."""
    return page.evaluate("""(src) => new Promise((done) => { const i = new Image(); i.onload = () => {
      const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const g = c.getContext('2d'); g.drawImage(i, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data; let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
      for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) { const k = (y * c.width + x) * 4;
        if (d[k] > 190 && d[k + 1] < 80 && d[k + 2] > 190) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } }
      done({ w: i.width, h: i.height, box: x1 < 0 ? null : [x0, y0, x1, y1] }); }; i.onerror = () => done(null); i.src = src; })""", src)


def middle_is_face(page, sel):
    """Whether the middle of an avatar, as drawn on screen, is the face."""
    im = Image.open(io.BytesIO(page.locator(sel).first.screenshot())).convert('RGB')
    r, g, b = im.getpixel((im.width // 2, im.height // 2))
    return r > 190 and g < 80 and b > 190


def upload(page, p, path):
    page.set_input_files(f'input[data-change="photo"][data-arg="{p}"]', str(path))
    page.wait_for_function(f"() => {{ const d = JSON.parse(localStorage.getItem('__fbdb') || '{{}}'); return d['hh/photos'] && d['hh/photos'].{p} && d['hh/photos'].{p} !== window.__before; }}", timeout=8000)
    page.wait_for_timeout(300)


def profiles(page):
    act(page, 'go', 'settings'); act(page, 'go', 'profile'); page.wait_for_timeout(200)


def opened(page):
    page.reload()
    page.wait_for_timeout(1300)


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
        for host in ('https://cdn.jsdelivr.net/**', 'https://storage.googleapis.com/**', 'https://huggingface.co/**'):
            ctx.route(host, lambda r: (cdn.append(r.request.url), r.abort()))
        a = ctx.new_page()
        a.on('pageerror', lambda e: problems.append(f'pageerror {e}'))
        a.on('console', lambda m: problems.append(f'console {m.type}: {m.text}') if m.type == 'error' and 'Failed to load resource' not in m.text else None)
        a.goto(BASE); a.wait_for_timeout(500)
        a.evaluate("() => { localStorage.clear(); localStorage.setItem('__fbrules', JSON.stringify(['robin@example.com', 'jules@example.com'])); }")
        a.reload(); a.wait_for_timeout(600)
        act(a, 'aumode', 'create'); a.fill('#auemail', 'robin@example.com'); a.fill('#aupw', 'correct horse 1'); act(a, 'aucreate')
        a.evaluate("(e) => window.__fbVerify(e)", 'robin@example.com'); act(a, 'auverified'); a.wait_for_load_state('load'); a.wait_for_timeout(700)
        a.fill('#sna', 'Robin'); a.fill('#snb', 'Jules'); act(a, 'sme', 'a'); act(a, 'snext'); a.fill('#sbudget', '2000'); act(a, 'snext'); act(a, 'sfinish'); a.wait_for_timeout(500)

        # 1. a new photo, the whole of Robin from a few metres away: cropped around the face before it's saved
        tall = photo((900, 1600), (200, 220, 320, 360), TMP / 'tall.jpg')
        profiles(a)
        upload(a, 'a', tall)
        url = db(a)['hh/photos']['a']
        got = where_face(a, url)
        box = got and got['box']
        fc = box and ((box[0] + box[2]) / 2, (box[1] + box[3]) / 2, box[3] - box[1] + 1)
        check(got and got['w'] == 256 and got['h'] == 256 and box and abs(fc[0] - 128) <= 6 and abs(fc[1] - 149) <= 8 and abs(fc[2] - 116) <= 8,
              'the saved photo is a 256px square around the face, with room for hair above and a little neck below: ' + json.dumps([got, fc]))
        check(a.evaluate('window.__faceCalls') == 10, 'too small to find in the whole photo, so it looked at nine closer squares: ' + str(a.evaluate('window.__faceCalls')))
        check(len(url) < 80000 and a.locator('.av.ph-a').count() >= 1, 'small enough to keep and show: ' + str(len(url)))
        check(middle_is_face(a, '.profile .av.xl.ph-a'), 'the face fills the middle of the profile picture')
        a.locator('.profile').first.screenshot(path=str(ROOT / 'shots' / 'f01-framed-upload.png'))
        fz = faces(a)
        check(fz and list(fz.values()) == [{'f': 0}], "it's framed already, so the phone won't look at it again: " + json.dumps(fz))
        opened(a)
        check(not a.evaluate('window.__faceCalls'), 'opening the app again leaves it be')
        check(a.evaluate("getComputedStyle(document.querySelector('.av.ph-a')).backgroundSize") == 'cover', 'and it shows as it is, no zoom')

        # 2. a photo saved before this, Jules small and off to one side: each phone zooms in on the face
        old = photo((192, 192), (120, 30, 150, 66))
        put_photo(a, 'b', old)
        opened(a)
        fz = faces(a)
        from_app = next((v['f'] for v in (fz or {}).values() if v.get('f')), None)
        exp = [95.4 / 192, 1.92 / 192, 79.2 / 192]
        check(from_app and all(abs(x - y) < 0.02 for x, y in zip(from_app, exp)), 'where the face is, kept on this phone: ' + json.dumps([from_app, exp]))
        bs = a.evaluate("(() => { const s = getComputedStyle(document.querySelector('.av.ph-b')); return [s.backgroundSize, s.backgroundPosition]; })()")
        nums = [float(x.rstrip('%')) for x in (bs[0].split()[:1] + bs[1].split())]
        check(220 < nums[0] < 260 and 80 < nums[1] < 90 and nums[2] < 5, 'the avatar zooms in on it, about two and a half times, near the top right: ' + json.dumps(bs))
        check(db(a)['hh/photos']['b'] == old, 'the photo itself is left as it is')
        profiles(a)
        check(middle_is_face(a, '.profile .av.xl.ph-b'), 'the face fills the middle of the profile picture')
        a.locator('.profile').nth(1).screenshot(path=str(ROOT / 'shots' / 'f02-zoomed-old-photo.png'))
        sp = splash(a)
        close = next((v['src'] for v in (fz or {}).values() if v.get('f')), '')
        cf = where_face(a, close)
        check(cf and cf['w'] == 192 and abs((cf['box'][0] + cf['box'][2]) / 2 - 96) <= 6, 'with a close-up of the face: ' + json.dumps(cf))
        check(sp and sp['p'] == 'b' and sp['cut'] is True and a.evaluate('window.__cutSrc') == close and a.evaluate('window.__cutCalls') == 1,
              "the loading screen cuts Jules out of the close-up, once: " + json.dumps({k: (v if k != 'src' else v[:30]) for k, v in (sp or {}).items()}))
        opened(a)
        check(not a.evaluate('window.__faceCalls') and not a.evaluate('window.__cutCalls'), 'opening the app again: nothing to redo')

        # 3. a photo with no face: left as it is
        put_photo(a, 'b', photo((192, 192), None))
        opened(a)
        fz = faces(a)
        check(fz and len(fz) == 2 and sorted(json.dumps(v) for v in fz.values()) == ['{"f": 0}', '{"f": 0}'],
              "no face found: noted, so it isn't looked at again, and the old photo's close-up is let go: " + json.dumps(fz))
        check(a.evaluate("getComputedStyle(document.querySelector('.av.ph-b')).backgroundSize") == 'cover' and a.evaluate('window.__cutSrc') == db(a)['hh/photos']['b'],
              'the avatar shows the whole photo, and the loading screen cuts the person out of the whole photo')

        # 4. the face finder can't be reached: the middle of the photo is saved, and the phone looks again next time
        a.evaluate("localStorage.setItem('__faceMode', 'offline')")
        a.evaluate("window.__before = JSON.parse(localStorage.getItem('__fbdb'))['hh/photos'].a")
        fz_before = faces(a)
        far = photo((1000, 1000), (700, 150, 800, 270), TMP / 'far.jpg')
        profiles(a)
        upload(a, 'a', far)
        url = db(a)['hh/photos']['a']
        got = where_face(a, url)
        check(got and got['w'] == 256 and got['box'] and got['box'][0] > 170, 'the photo still saves, the middle of it, as before: ' + json.dumps(got))
        check(faces(a) == fz_before, 'nothing noted for it, so the phones look again later')
        a.evaluate("localStorage.setItem('__faceMode', 'find')")
        opened(a)
        bs = a.evaluate("getComputedStyle(document.querySelector('.av.ph-a')).backgroundSize")
        check(a.evaluate('window.__faceCalls') >= 1 and bs != 'cover', 'it looks again when the app next opens, and zooms in on the face: ' + bs)
        profiles(a)
        check(middle_is_face(a, '.profile .av.xl.ph-a'), 'the face fills the middle of the profile picture')

        # 5. a face finder that never answers: the photo saves after the wait
        a.evaluate("localStorage.setItem('__faceMode', 'slow'); localStorage.setItem('__faceLimit', '400')")
        opened(a)
        a.evaluate("window.__before = JSON.parse(localStorage.getItem('__fbdb'))['hh/photos'].a")
        profiles(a)
        t0 = time.time()
        upload(a, 'a', tall)
        got = where_face(a, db(a)['hh/photos']['a'])
        check(time.time() - t0 < 4 and got and got['w'] == 256, 'a face finder that never answers holds up the photo only briefly: %.1fs' % (time.time() - t0))
        a.evaluate("localStorage.setItem('__faceMode', 'find'); localStorage.removeItem('__faceLimit')")

        # 6. signing out clears what the phone kept
        act(a, 'go', 'settings'); act(a, 'auout'); a.wait_for_load_state('load'); a.wait_for_timeout(600)
        check(not faces(a), 'signing out clears the faces from this phone')
        check(not cdn, 'nothing is fetched from the MediaPipe CDN when the face finder is stood in for: ' + json.dumps(cdn[:3]))
        browser.close()
finally:
    server.terminate()

print('\nproblems:', problems or 'none')
print('FAILURES:', len(failures))
for f in failures:
    print(' -', f)
sys.exit(1 if failures or problems else 0)
