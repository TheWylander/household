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
  window.HH_REPO = 'robin/household';
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
        check(db(a)['hh/push']['prefs']['a'] == {'sale': True, 'specials': False, 'spends': True}, 'each person picks what they get')
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

        # pop-ups for new spends: Jules's phone is on too, and Robin adds a spend
        gh, gh_status = [], [204]
        def github(route):
            r = route.request
            if r.method == 'OPTIONS':
                route.fulfill(status=204, headers={'access-control-allow-origin': '*', 'access-control-allow-headers': 'Authorization, Content-Type', 'access-control-allow-methods': 'POST'}, body='')
                return
            gh.append({'url': r.url, 'auth': r.headers.get('authorization'), 'body': json.loads(r.post_data or '{}')})
            route.fulfill(status=gh_status[0], headers={'access-control-allow-origin': '*'}, body='')
        ctx.route('https://api.github.com/**', github)
        card = a.locator('#pushCard').inner_text()
        check('Spends Jules adds' in card and 'Robin adds' not in card, 'a switch for the spends the other person adds')
        check('next morning or evening check' in card and a.locator('#pushCard [data-act="ghtoken"]').count() == 1, 'without a token, new spends wait for the next check, with a way to make it instant')
        a.evaluate("""() => { const d = JSON.parse(localStorage.getItem('__fbdb')), p = d['hh/push'];
          d['hh/settings'].categories = ['Groceries', 'Eating out'];
          p.subs.pJules = { who: 'b', endpoint: 'https://push.test/jules', keys: { p256dh: 'BPkJules', auth: 'authJ' }, vapid: p.vapid.pub, welcomed: true, stale: false, device: 'iPhone' };
          localStorage.setItem('__fbdb', JSON.stringify(d)); }""")
        a.reload(); a.wait_for_timeout(1200)

        def add_spend(keys, title, cat=None, payer=None):
            act(a, 'go', 'home'); act(a, 'addpick'); act(a, 'pickadd')
            for k in keys:
                act(a, 'key', k)
            a.fill('#addTitle', title)
            if cat:
                act(a, 'addcat', cat)
            if payer:
                act(a, 'addpayer', payer)
            act(a, 'saveadd'); a.wait_for_timeout(900)

        def events(who='a'):
            return (db(a)['hh/push'].get('events') or {}).get(who) or []

        add_spend(['4', '2', '.', '1', '0'], 'Woolworths', 'Groceries')
        ev = events()
        check(len(ev) == 1 and ev[0]['t'] == '💸 Robin added $42.10' and ev[0]['b'] == 'Woolworths · Groceries\nYou paid · your share $21.05', 'a new spend is noted for Jules\'s phone, who paid on the card: ' + json.dumps(ev[-1:], ensure_ascii=False))
        check(ev and ev[0]['n'] == 'Robin' and ev[0]['c'] == 4210 and ev[0]['sh'] == 2105 and ev[0]['l'] == '$42.10 Woolworths' and abs(ev[0]['at'] / 1000 - time.time()) < 60, 'with the total, the share and a line for a round-up')
        check(gh == [], 'no token yet, so the job is left to its next run')

        # instant pop-ups: the token is checked by starting the job, with a test pop-up for this phone
        act(a, 'go', 'settings'); act(a, 'ghtoken')
        dlg = a.locator('.dialog').inner_text()
        href = a.locator('.dialog .setup-steps a').get_attribute('href')
        check('Only select repositories' in dlg and 'test pop-up' in dlg and 'expires_in=366' in href and 'actions=write' in href and 'name=Household+pop-ups' in href, 'the setup links to a filled-in GitHub token page and says which repo to pick')
        a.locator('.dialog').screenshot(path=str(ROOT / 'shots' / 'p12-instant-setup.png'))
        a.fill('#ghTokIn', 'ghp_short'); act(a, 'ghtoksave')
        check("doesn't look like a GitHub token" in a.locator('.dialog').inner_text() and gh == [], 'a wrong-looking token is caught before asking GitHub')
        gh_status[0] = 404
        tok = 'github_pat_11ABCDEFG0' + 'x' * 72
        a.fill('#ghTokIn', tok); act(a, 'ghtoksave'); a.wait_for_timeout(900)
        check("can't see the household repo" in a.locator('.dialog').inner_text() and not db(a).get('hh/ai', {}).get('ghToken'), 'a token without the repo is turned down with how to fix it, and not saved')
        check(not any(e.get('self') for e in events()), 'its test pop-up is taken back')
        gh_status[0] = 204
        a.fill('#ghTokIn', ' ' + tok + '\n'); act(a, 'ghtoksave'); a.wait_for_timeout(1000)
        last = gh[-1] if gh else {}
        check(db(a)['hh/ai'].get('ghToken') == tok and a.locator('.dialog').count() == 0, 'a working token is saved for both phones')
        check(last.get('url') == 'https://api.github.com/repos/robin/household/actions/workflows/notify.yml/dispatches' and last.get('auth') == 'Bearer ' + tok and last.get('body') == {'ref': 'main', 'inputs': {'mode': 'spends'}}, 'the check starts the job for new spends: ' + json.dumps(last)[:200])
        tests = [e for e in events() if e.get('self')]
        check(len(tests) == 1 and tests[0]['t'] == '🔔 Instant pop-ups are on' and 'When Jules adds a spend' in tests[0]['b'], 'with a test pop-up for this phone')
        card = a.locator('#pushCard').inner_text()
        check('New spends pop up within a minute' in card, 'Settings says new spends are instant')
        a.locator('#pushCard').screenshot(path=str(ROOT / 'shots' / 'p11-push-instant.png'))

        n = len(gh)
        add_spend(['5', '.', '5'], 'Coffee', payer='a')
        ev = events()
        check(len(ev) == 3 and ev[-1]['t'] == '💸 Robin added $5.50' and ev[-1]['b'] == 'Coffee\nRobin paid · your share $2.75' and len(gh) == n + 1, 'the next spend starts the job straight away')
        add_spend(['1', '2'], 'Uber')
        check(len(events()) == 4 and len({e['id'] for e in events()}) == 4, 'quick saves each keep their note')

        # GitHub turns the token down later: Settings says so, and why
        gh_status[0] = 401
        add_spend(['9'], 'Bread')
        a.wait_for_timeout(600); act(a, 'go', 'settings')
        card = a.locator('#pushCard').inner_text()
        check("GitHub didn't accept the token" in card and 'morning or evening check' in card and a.locator('#pushCard [data-act="ghtoken"]').count() == 1, 'a token GitHub turns down shows in Settings, with a fix')
        gh_status[0] = 204
        act(a, 'ghtoken'); act(a, 'ghtokdel')
        check(db(a)['hh/ai'].get('ghToken') == '' and 'next morning or evening check' in a.locator('#pushCard').inner_text(), 'the token can be removed')

        # Jules turns spends off: nothing is noted
        a.evaluate("""() => { const d = JSON.parse(localStorage.getItem('__fbdb')); d['hh/push'].prefs.b = { sale: true, specials: true, spends: false }; localStorage.setItem('__fbdb', JSON.stringify(d)); }""")
        a.reload(); a.wait_for_timeout(1200)
        k = len(events())
        add_spend(['3'], 'Milk')
        check(len(events()) == k, 'with spends turned off on the other phone, nothing is noted')

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
        check(all(v is None or v.get('who') == 'b' for v in db(a)['hh/push']['subs'].values()) and 'Turn on for this phone' in a.locator('#pushCard').inner_text(), 'turned off: the subscription is removed')
        browser.close()
finally:
    server.terminate()

print('\nproblems:', json.dumps(problems, indent=1) if problems else 'none')
print('FAILURES:', len(failures))
sys.exit(1 if failures or problems else 0)
