"""The PWA on its own: manifest and icons, service worker and offline launch, sign-in, setup, two phones in sync,
Jules's welcome, rent, a login that isn't allowed, and the real Firebase library's API."""
import json
import pathlib
import re
import subprocess
import sys
import time
from datetime import date, timedelta

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
SHOTS = ROOT / 'shots'
PORT = 8768
SITE = f'http://127.0.0.1:{PORT}/pwa/site/'
BASE = SITE + 'index.html'
FONT_CSS = (
    "@font-face{font-family:'Figtree';font-weight:300 900;src:url(http://127.0.0.1:%d/test/fonts/figtree.woff2) format('woff2')}"
    "@font-face{font-family:'Bricolage Grotesque';font-weight:200 800;src:url(http://127.0.0.1:%d/test/fonts/bricolage.woff2) format('woff2')}" % (PORT, PORT)
)
TEST_CONFIG = "window.HH_FIREBASE = { apiKey: 'test-key', authDomain: 'test-project.firebaseapp.com', projectId: 'test-project', appId: '1:1:web:1' };"
failures, problems = [], []


def check(cond, msg):
    print(('ok   ' if cond else 'FAIL ') + msg)
    if not cond:
        failures.append(msg)


def act(page, a, arg=None):
    sel = f'[data-act="{a}"]' + (f'[data-arg="{arg}"]' if arg is not None else '')
    page.locator(sel).first.click()
    page.wait_for_timeout(150)

def open_custom(page):
    """Customise now sits under Settings, which opens from the gear on Home."""
    page.locator('[data-act="go"][data-arg="home"]').first.click(); page.wait_for_timeout(150)
    page.locator('[data-act="go"][data-arg="settings"]').first.click(); page.wait_for_timeout(150)
    page.locator('[data-act="go"][data-arg="custom"]').first.click(); page.wait_for_timeout(150)



def text(page):
    return page.locator('#app').inner_text()


def shot(page, name, full=False):
    page.wait_for_timeout(250)
    page.screenshot(path=str(SHOTS / f'{name}.png'), full_page=full)


def fonts(ctx):
    ctx.route('https://fonts.googleapis.com/**', lambda r: r.fulfill(status=200, content_type='text/css', body=FONT_CSS))
    ctx.route('https://fonts.gstatic.com/**', lambda r: r.abort())


def watch(page, name, console=True):
    page.on('pageerror', lambda e: problems.append(f'{name}: pageerror {e}'))
    if console:  # pages that go offline on purpose log failed requests, so only their script errors count
        page.on('console', lambda m: problems.append(f'{name}: console {m.type}: {m.text}') if m.type == 'error' else None)
    return page


def sign_up(page, email, pw='correct horse 1'):
    act(page, 'aumode', 'create')
    page.fill('#auemail', email); page.fill('#aupw', pw)
    act(page, 'aucreate'); page.wait_for_timeout(300)


def confirm(page, email):
    page.evaluate('(e) => window.__fbVerify(e)', email)
    act(page, 'auverified')
    page.wait_for_load_state('load'); page.wait_for_timeout(700)


money = lambda c: '${:,.2f}'.format(c / 100)

server = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'], cwd=ROOT,
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])

        # ---------- the files a phone needs to install it ----------
        ctx0 = browser.new_context()
        r = ctx0.request.get(SITE + 'manifest.json')
        m = r.json()
        check(r.ok and m['display'] == 'standalone' and m['start_url'] == './' and m['short_name'] == 'Household', 'manifest: standalone, starts at the app, named Household')
        for icon in m['icons'] + [{'src': 'apple-touch-icon.png'}]:
            check(ctx0.request.get(SITE + icon['src']).ok, 'icon is there: ' + icon['src'])
        check(any(i.get('purpose') == 'maskable' for i in m['icons']), 'maskable icon for Android')
        html = ctx0.request.get(BASE).text()
        for tag in ['rel="manifest"', 'apple-mobile-web-app-capable', 'apple-touch-icon', 'viewport-fit=cover', "serviceWorker.register('service-worker.js')"]:
            check(tag in html, 'page has ' + tag)
        check('Robin' not in html and 'Jules' not in html, 'no names in the public code')
        ctx0.close()

        # ---------- service worker: installs, then the app opens offline ----------
        ctx1 = browser.new_context(service_workers='allow')
        fonts(ctx1)
        pg = watch(ctx1.new_page(), 'sw', console=False)
        pg.goto(BASE); pg.wait_for_timeout(1500)
        check('Sign in to see your shared spends' in text(pg), 'with your Firebase settings it opens on sign-in')
        state = pg.evaluate("navigator.serviceWorker.ready.then((r) => r.active && r.active.state)")
        check(state in ('activated', 'activating'), 'service worker installed: ' + str(state))
        pg.wait_for_timeout(500)
        cached = pg.evaluate("caches.keys().then((ks) => Promise.all(ks.map((k) => caches.open(k).then((c) => c.keys())))).then((all) => all.flat().map((r) => new URL(r.url).pathname))")
        check(any(c.endswith('/firebase-firestore-compat.js') for c in cached) and any(c.endswith('/index.html') for c in cached), f'app files cached for offline ({len(cached)} files)')
        ctx1.set_offline(True)
        pg.reload(); pg.wait_for_timeout(1500)
        check('Our household' in text(pg), 'opens with no connection, from the cache')
        ctx1.close()

        # without Firebase settings it says what's missing instead of failing
        ctxp = browser.new_context(service_workers='block')
        fonts(ctxp)
        ctxp.route('**/firebase-config.js', lambda r: r.fulfill(status=200, content_type='text/javascript', body="window.HH_FIREBASE = { apiKey: 'PASTE_API_KEY', projectId: 'PASTE_PROJECT_ID' };"))
        pp = watch(ctxp.new_page(), 'no-settings', console=False)
        pp.goto(BASE); pp.wait_for_timeout(800)
        check('Add your Firebase settings to firebase-config.js' in text(pp), 'without settings it opens as a preview and says what to add')
        ctxp.close()

        # ---------- the real Firebase library: same calls the app makes ----------
        ctx2 = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, service_workers='block')
        fonts(ctx2)
        ctx2.route('**/firebase-config.js', lambda r: r.fulfill(status=200, content_type='text/javascript', body=TEST_CONFIG))
        ctx2.route(re.compile(r'https://[a-z.]*googleapis\.com/.*'), lambda r: r.abort())
        rf = watch(ctx2.new_page(), 'real-sdk', console=False)
        rf.goto(BASE + '?realfb=1'); rf.wait_for_timeout(1500)
        check('Sign in to see your shared spends' in text(rf), 'real Firebase library: sign-in screen shows')
        api = rf.evaluate("""() => {
          const a = firebase.auth(), f = firebase.firestore(), d = f.doc('hh/settings'), c = f.collection('months');
          return [typeof a.onAuthStateChanged, typeof a.createUserWithEmailAndPassword, typeof a.signInWithEmailAndPassword,
                  typeof a.sendPasswordResetEmail, typeof a.signOut, typeof d.onSnapshot, typeof d.get, typeof d.set, typeof d.delete,
                  typeof c.onSnapshot, typeof c.get, d.id].join(',');
        }""")
        check(api == ','.join(['function'] * 11 + ['settings']), 'real Firebase library has every call the app uses: ' + api)
        rf.fill('#auemail', 'robin@example.com'); rf.fill('#aupw', 'correct horse 1')
        act(rf, 'auin'); rf.wait_for_timeout(2500)
        check("Can't reach the internet" in text(rf), 'real library error comes through as a plain message: ' + text(rf).split('\n')[-3:].__repr__())
        ctx2.close()

        # ---------- two phones on the test double ----------
        ctx = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True,
                                  locale='en-AU', timezone_id='Australia/Sydney', service_workers='block')
        ctx.add_init_script(path=str(ROOT / 'test' / 'firebase-mock.js'))
        ctx.route('**/firebase-config.js', lambda r: r.fulfill(status=200, content_type='text/javascript', body=TEST_CONFIG))
        ctx.route('**/firebase-*-compat.js', lambda r: r.fulfill(status=200, content_type='text/javascript', body='/* test double */'))
        fonts(ctx)

        a = watch(ctx.new_page(), 'robin')
        a.goto(BASE); a.wait_for_timeout(300)
        a.evaluate("() => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('__fbrules', JSON.stringify(['robin@example.com', 'jules@example.com'])); }")
        a.reload(); a.wait_for_timeout(600)
        t = text(a)
        check('Our household' in t and 'Sign in to see your shared spends' in t and a.locator('.nav').count() == 0, 'opens on sign-in')
        check('Preview only' not in t, 'no preview banner once Firebase is set up')
        shot(a, 'p01-signin')
        act(a, 'aumode', 'create')
        a.fill('#auemail', 'Robin@Example.com'); a.fill('#aupw', 'short')
        act(a, 'aucreate')
        check('Use at least 8 characters' in text(a), 'short password caught')
        a.fill('#aupw', 'correct horse 1')
        act(a, 'aucreate'); a.wait_for_timeout(300)
        t = text(a)
        check('Check your email' in t and 'robin@example.com' in t and a.evaluate('window.__fbSent') == 1, 'login created and confirmation email sent')
        shot(a, 'p02-check-email')
        act(a, 'auverified'); a.wait_for_timeout(200)
        check('Not confirmed yet' in text(a), 'unconfirmed email is held back')
        confirm(a, 'robin@example.com')
        t = text(a)
        check('Hello, you two' in t and a.input_value('#sna') == '' and a.input_value('#snb') == '', 'setup starts blank: no names in the code')
        a.fill('#sna', 'Robin'); a.fill('#snb', 'Jules'); act(a, 'sme', 'a'); act(a, 'snext')
        check(a.locator('#srent').count() == 0, 'rent is set in Customise, not prefilled from code')
        a.fill('#sbudget', '2000'); act(a, 'snext')
        act(a, 'sfinish'); a.wait_for_timeout(500)
        t = text(a)
        check('Hi Robin' in t and '$2,000' in t and 'All square' in t, 'home after setup')
        settings = a.evaluate("JSON.parse(localStorage.getItem('__fbdb'))['hh/settings']")
        check(settings['members']['a'] == 'uid-robin' and settings['members']['b'] is None, 'this phone linked to Robin\'s login')

        # a spend, saved through Firestore
        act(a, 'add')
        for k in ['4', '2', '.', '5']:
            act(a, 'key', k)
        a.fill('#addTitle', 'Dinner')
        act(a, 'saveadd'); a.wait_for_timeout(400)
        db = a.evaluate("JSON.parse(localStorage.getItem('__fbdb'))")
        months = [k for k in db if k.startswith('months/')]
        check(len(months) == 1 and any(v and v.get('title') == 'Dinner' for v in db[months[0]]['entries'].values()), 'spend saved to Firestore')

        # rent from 4 Oct, set in Customise
        open_custom(a)
        a.check('#drenton'); a.wait_for_timeout(150)
        a.fill('#drentamt', '250'); a.fill('#drentstart', '2026-10-04')
        act(a, 'savecustom'); a.wait_for_timeout(500)
        act(a, 'go', 'home'); a.wait_for_timeout(300)
        today = a.evaluate("(() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })()")
        start, end = date(2026, 10, 4), date.fromisoformat(today)
        weeks = sum(1 for i in range((end - start).days + 1) if (start + timedelta(days=i)).weekday() == 6)
        db = a.evaluate("JSON.parse(localStorage.getItem('__fbdb'))")
        rents = sorted(k for m in db if m.startswith('months/') for k, v in db[m]['entries'].items() if k.startswith('rent-') and v)
        check(len(rents) == weeks, f'rent added for each Sunday from 4 Oct: {len(rents)} of {weeks}')
        t = text(a)
        m2 = re.search(r'(Jules owes you|You owe Jules)\s*\$([\d,]+\.\d\d)', t)
        check(m2 is not None and 'Jules owes you' == m2.group(1), 'rent shows in the balance: ' + (m2.group(0) if m2 else 'none'))
        shot(a, 'p03-home', full=True)

        # a profile photo goes to Firestore with the rest
        act(a, 'go', 'home'); act(a, 'go', 'settings'); act(a, 'go', 'profile')
        a.set_input_files('input[data-change="photo"][data-arg="a"]', str(ROOT / 'test' / 'photo-sample.png'))
        a.wait_for_function("() => { const d = JSON.parse(localStorage.getItem('__fbdb') || '{}'); return d['hh/photos'] && d['hh/photos'].a; }", timeout=5000)
        check(a.locator('.av.ph-a').count() >= 1, 'profile photo saved to Firestore and shown')
        act(a, 'go', 'home')

        # ---------- Jules's phone ----------
        b = watch(ctx.new_page(), 'jules')
        b.goto(BASE); b.wait_for_timeout(600)
        check('Sign in to see your shared spends' in text(b), "Jules's phone opens on sign-in")
        sign_up(b, 'jules@example.com')
        confirm(b, 'jules@example.com')
        b.wait_for_timeout(600)
        t = text(b)
        check('Welcome home, Jules' in t and 'Robin made this for the two of you' in t, 'Jules gets her welcome')
        check(b.locator('.av.ph-a').count() >= 1, "Jules's phone shows Robin's photo")
        shot(b, 'p04-jules-welcome', full=True)
        act(b, 'welcomein'); b.wait_for_timeout(400)
        t = text(b)
        bal = re.search(r'You owe Robin\s*\$([\d,]+\.\d\d)', t)
        check('Hi Jules' in t and bal is not None and bal.group(1) == m2.group(2), "Jules's phone shows the same balance from her side: " + (bal.group(0) if bal else 'none'))
        settings = b.evaluate("JSON.parse(localStorage.getItem('__fbdb'))['hh/settings']")
        check(settings['members'] == {'a': 'uid-robin', 'b': 'uid-jules'}, 'each phone linked to its own login')

        # live between phones
        act(b, 'settle'); act(b, 'dlgsettle'); b.wait_for_timeout(500)
        check('All square' in text(b), 'settled on Jules\'s phone')
        a.wait_for_timeout(600)
        check('All square' in text(a), "Robin's phone updates live")

        # ---------- a login that isn't one of the two ----------
        c = watch(ctx.new_page(), 'stranger')
        c.goto(BASE); c.wait_for_timeout(500)
        sign_up(c, 'someone@example.com')
        confirm(c, 'someone@example.com')
        c.wait_for_timeout(500)
        t = text(c)
        check("This login can't open it" in t and 'someone@example.com' in t and 'Hi ' not in t, 'other logins see nothing')
        shot(c, 'p05-denied')
        act(c, 'auout'); c.wait_for_load_state('load'); c.wait_for_timeout(500)
        check('Sign in to see your shared spends' in text(c), 'sign out goes back to sign-in')

        # sign out and back in on Robin's phone
        act(a, 'go', 'home'); act(a, 'go', 'settings')
        check('Signed in as robin@example.com' in text(a), 'Settings shows who is signed in')
        act(a, 'auout'); a.wait_for_load_state('load'); a.wait_for_timeout(500)
        a.fill('#auemail', 'robin@example.com'); a.fill('#aupw', 'wrong password')
        act(a, 'auin'); a.wait_for_timeout(200)
        check("That email and password don't match" in text(a), 'wrong password message')
        a.fill('#aupw', 'correct horse 1')
        act(a, 'auin'); a.wait_for_timeout(900)
        check('Hi Robin' in text(a), 'signed back in, data still there')
        browser.close()
finally:
    server.terminate()

print('\nproblems:', json.dumps(problems, indent=1) if problems else 'none')
print('FAILURES:', len(failures))
sys.exit(1 if failures or problems else 0)
