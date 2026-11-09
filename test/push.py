"""Phone notifications in the PWA: turning them on and off, what's saved for the GitHub job, and the service worker
showing a pop-up. The browser's push service is stood in for, since tests can't reach Apple's or Google's."""
import json
import pathlib
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
PORT = 8771
BASE = f'http://127.0.0.1:{PORT}/pwa/site/index.html'
TEST_CONFIG = "window.HH_FIREBASE = { apiKey: 'test-key', authDomain: 'test-project.firebaseapp.com', projectId: 'test-project', appId: '1:1:web:1' };"
STUB = """
  window.__asked = 0;
  Notification.requestPermission = () => { window.__asked++; return Promise.resolve('granted'); };
  const b64u = (k) => btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(k)))).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
  const fake = (key) => ({ endpoint: 'https://push.test/' + Math.random().toString(36).slice(2), options: { applicationServerKey: key },
    toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'BPkTestKey', auth: 'authTest' } }; },
    unsubscribe() { window.__sub = null; return Promise.resolve(true); } });
  PushManager.prototype.getSubscription = function () { return Promise.resolve(window.__sub || null); };
  PushManager.prototype.subscribe = function (o) { window.__subKey = b64u(o.applicationServerKey); window.__sub = fake(o.applicationServerKey); return Promise.resolve(window.__sub); };
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


server = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx = browser.new_context(reduced_motion='reduce', viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True,
                                  locale='en-AU', timezone_id='Australia/Sydney', service_workers='allow')
        ctx.grant_permissions(['notifications'], origin=f'http://127.0.0.1:{PORT}')
        ctx.add_init_script(path=str(ROOT / 'test' / 'firebase-mock.js'))
        ctx.add_init_script(STUB)
        ctx.route('**/firebase-config.js', lambda r: r.fulfill(status=200, content_type='text/javascript', body=TEST_CONFIG))
        ctx.route('**/firebase-*-compat.js', lambda r: r.fulfill(status=200, content_type='text/javascript', body='/* test double */'))
        ctx.route('https://fonts.googleapis.com/**', lambda r: r.abort())
        a = ctx.new_page()
        a.on('pageerror', lambda e: problems.append(f'pageerror {e}'))
        a.goto(BASE); a.wait_for_timeout(500)
        a.evaluate("() => { localStorage.clear(); localStorage.setItem('__fbrules', JSON.stringify(['robin@example.com', 'jules@example.com'])); }")
        a.reload(); a.wait_for_timeout(600)
        act(a, 'aumode', 'create'); a.fill('#auemail', 'robin@example.com'); a.fill('#aupw', 'correct horse 1'); act(a, 'aucreate')
        a.evaluate("(e) => window.__fbVerify(e)", 'robin@example.com'); act(a, 'auverified'); a.wait_for_load_state('load'); a.wait_for_timeout(700)
        a.fill('#sna', 'Robin'); a.fill('#snb', 'Jules'); act(a, 'sme', 'a'); act(a, 'snext'); a.fill('#sbudget', '2000'); act(a, 'snext'); act(a, 'sfinish'); a.wait_for_timeout(500)

        act(a, 'go', 'settings')
        card = a.locator('#pushCard').inner_text()
        check('Turn on for this phone' in card and 'Robin: not yet' in card and 'Jules: not yet' in card, 'Settings has phone notifications, off for both')
        check('One-time setup' in card and 'BOT_PASSWORD' in card and 'Service accounts' not in card, 'whoever set the app up sees the one-time bot login steps')
        a.locator('#pushCard').screenshot(path=str(ROOT / 'shots' / 'p09-push-setup.png'))
        act(a, 'pushon'); a.wait_for_timeout(1500)
        d = db(a)['hh/push']
        pub, sub = d['vapid']['pub'], next(iter(d['subs'].values()))
        check(a.evaluate('window.__asked') == 1, 'asked for permission once, from the tap')
        check(len(pub) == 87 and len(d['vapid']['d']) == 43, 'a P-256 key pair made on the phone and saved for the job')
        check(a.evaluate('window.__subKey') == pub, 'the phone subscribed with that key')
        check(sub['who'] == 'a' and sub['vapid'] == pub and sub['welcomed'] is False and sub['endpoint'].startswith('https://push.test/') and sub['keys']['auth'] == 'authTest', 'its subscription is saved for the job')
        card = a.locator('#pushCard').inner_text()
        check('On for this phone' in card and 'Robin: on' in card and 'Turn off for this phone' in card, 'shows on for this phone')
        a.locator('#pushCard').screenshot(path=str(ROOT / 'shots' / 'p10-push-on.png'))
        a.locator('#pushCard input[data-arg="specials"]').uncheck(); a.wait_for_timeout(400)
        check(db(a)['hh/push']['prefs']['a'] == {'sale': True, 'specials': False}, 'each person picks what they get')
        a.reload(); a.wait_for_timeout(1500)
        act(a, 'go', 'settings')
        check('On for this phone' in a.locator('#pushCard').inner_text() and a.evaluate('window.__subKey') is None, 'still on after reopening, without signing up again')

        # the job checks in, and a phone it marked as stale signs up again by itself
        a.evaluate("""() => { const d = JSON.parse(localStorage.getItem('__fbdb')); const id = Object.keys(d['hh/push'].subs)[0];
          d['hh/push'].subs[id].stale = true; d['hh/push'].last = { at: new Date().toISOString(), sent: 1, failed: 0 }; localStorage.setItem('__fbdb', JSON.stringify(d)); }""")
        a.reload(); a.wait_for_timeout(2000)
        d = db(a)['hh/push']
        check(all(not s.get('stale') for s in d['subs'].values() if s) and a.evaluate('window.__subKey') == pub, 'a stale phone quietly signs up again on opening')
        act(a, 'go', 'settings')
        card = a.locator('#pushCard').inner_text()
        check('Last checked' in card and 'One-time setup' not in card, 'once the job has run, the setup steps give way to when it last checked')

        # the service worker shows a pop-up from a push
        sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event('serviceworker')
        titles = sw.evaluate("""async () => {
          self.dispatchEvent(new PushEvent('push', { data: JSON.stringify({ title: '📅 Lucky Mart sale tomorrow', body: 'Up to 20% off\\n📍 Artarmon', url: './#deals', tag: 'sale-1' }) }));
          await new Promise((r) => setTimeout(r, 500));
          return (await self.registration.getNotifications()).map((n) => [n.title, n.body, n.tag, n.data && n.data.url]);
        }""")
        check(['📅 Lucky Mart sale tomorrow', 'Up to 20% off\n📍 Artarmon', 'sale-1', './#deals'] in titles, 'the service worker shows the pop-up: ' + json.dumps(titles))

        # a tapped notification opens Deals
        a.goto(BASE + '?from=notification#deals'); a.wait_for_timeout(1500)
        check('Everything on special' in a.locator('#app').inner_text() and a.locator('h1.title').inner_text() == 'Deals' and a.evaluate('location.hash') == '', 'opening from a notification lands on Deals')

        act(a, 'go', 'home'); act(a, 'go', 'settings'); act(a, 'pushoff'); a.wait_for_timeout(800)
        check(all(v is None for v in db(a)['hh/push']['subs'].values()) and 'Turn on for this phone' in a.locator('#pushCard').inner_text(), 'turned off: the subscription is removed')
        browser.close()
finally:
    server.terminate()

print('\nproblems:', json.dumps(problems, indent=1) if problems else 'none')
print('FAILURES:', len(failures))
sys.exit(1 if failures or problems else 0)
