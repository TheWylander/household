"""Snap a receipt: the photo goes to Gemini (stood in for here), the check-and-split panel, the spends it saves,
and what happens when Gemini isn't switched on, has hit its limit, or the newest model isn't there.
Then App Check: off until its key is in the config, and once it is, set up once with a fresh token for each request."""
import pathlib
import subprocess
import sys
import time
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import ai_fake  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
SHOTS = ROOT / 'shots'
PORT = 8772
BASE = f'http://127.0.0.1:{PORT}/pwa/site/index.html'
TEST_CONFIG = "window.HH_FIREBASE = { apiKey: 'test-key', authDomain: 'test-project.firebaseapp.com', projectId: 'test-project', appId: '1:1:web:1' };"
TODAY = datetime.now(ZoneInfo('Australia/Sydney')).date()
PHOTO = str(ROOT / 'test' / 'photo-sample.png')
failures, problems = [], []


def check(cond, msg):
    print(('ok   ' if cond else 'FAIL ') + msg)
    if not cond:
        failures.append(msg)


def act(page, a, arg=None):
    page.locator(f'[data-act="{a}"]' + (f'[data-arg="{arg}"]' if arg is not None else '')).first.click()
    page.wait_for_timeout(200)


def entries(page):
    db = page.evaluate("JSON.parse(localStorage.getItem('__fbdb'))")
    out = []
    for k, v in db.items():
        if k.startswith('months/'):
            out += list((v.get('entries') or {}).values())
    return [e for e in out if e]


def snap(page, reply=None, mode='ok', which=0):
    page.evaluate("([r, m]) => { window.__aiReply = r; window.__aiMode = m; window.__aiCalls = []; }", [reply or ai_fake.reply(str(TODAY - timedelta(days=2))), mode])
    page.locator('input[data-change="rcpfile"]').nth(which).set_input_files(PHOTO)
    page.wait_for_timeout(900)


server = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx = browser.new_context(reduced_motion='reduce', viewport={'width': 402, 'height': 874}, device_scale_factor=2, is_mobile=True, has_touch=True,
                                  locale='en-AU', timezone_id='Australia/Sydney')
        ctx.add_init_script(path=str(ROOT / 'test' / 'firebase-mock.js'))
        ctx.route('**/firebase-config.js', lambda r: r.fulfill(status=200, content_type='text/javascript', body=TEST_CONFIG))
        ctx.route('**/firebase-*-compat.js', lambda r: r.fulfill(status=200, content_type='text/javascript', body='/* test double */'))
        ctx.route('https://fonts.googleapis.com/**', lambda r: r.abort())
        ai_fake.route(ctx)
        a = ctx.new_page()
        a.on('pageerror', lambda e: problems.append(f'pageerror {e}'))
        a.goto(BASE); a.wait_for_timeout(500)
        a.evaluate("() => { localStorage.clear(); localStorage.setItem('__fbrules', JSON.stringify(['robin@example.com', 'jules@example.com'])); }")
        a.reload(); a.wait_for_timeout(600)
        act(a, 'aumode', 'create'); a.fill('#auemail', 'robin@example.com'); a.fill('#aupw', 'correct horse 1'); act(a, 'aucreate')
        a.evaluate("(e) => window.__fbVerify(e)", 'robin@example.com'); act(a, 'auverified'); a.wait_for_load_state('load'); a.wait_for_timeout(700)
        a.fill('#sna', 'Robin'); a.fill('#snb', 'Jules'); act(a, 'sme', 'a'); act(a, 'snext'); a.fill('#sbudget', '2000'); act(a, 'snext'); act(a, 'sfinish'); a.wait_for_timeout(500)

        # ---------- from Upload ----------
        act(a, 'go', 'settings'); act(a, 'go', 'upload')
        snapcard = a.locator('.snap').inner_text()
        check('Snap a receipt' in snapcard and 'Take a photo' in snapcard and 'Choose from photos' in snapcard and 'Gemini' in snapcard, 'Upload starts with Snap a receipt, and says photos go to Gemini')
        check(a.locator('.snap input[capture="environment"]').count() == 1, 'Take a photo opens the camera')
        a.locator('.snap').screenshot(path=str(SHOTS / 'p11-snap.png'))
        snap(a)
        dlg = a.locator('.dialog').inner_text()
        calls = a.evaluate('window.__aiCalls')
        check('Check the receipt' in dlg and '$52.37' in dlg and '6 items' in dlg and a.input_value('#rcpShop') == 'Coles Artarmon'
              and a.input_value('#rcpDate') == str(TODAY - timedelta(days=2)), 'Gemini reads the shop, date, total and items')
        c = calls[0] if calls else {}
        schema = (c.get('config') or {}).get('responseJsonSchema') or {}
        check(a.evaluate('window.__appCheck') is None and a.evaluate('window.__aiOpts') == {'app': 'hh-ai', 'limited': False} and 'reCAPTCHA' not in snapcard,
              'no App Check key yet: App Check stays off, and the note says nothing about it')
        check(len(calls) == 1 and c.get('model') == 'gemini-3.5-flash-lite' and c.get('mime') == 'image/jpeg' and c.get('size', 0) > 100
              and (c.get('config') or {}).get('responseMimeType') == 'application/json' and set(schema.get('properties', {})) == {'shop', 'date', 'total', 'category', 'items'},
              'one call to the small Gemini model, with a JPEG and a JSON shape to fill')
        check('$52.37' in a.locator('#rcpSum').inner_text() and 'Jules owes Robin $26.19' in a.locator('#rcpSum').inner_text(), 'all shared at first, split our usual way')
        a.locator('.rcp-who').nth(4).click(); a.wait_for_timeout(150)
        s = a.locator('#rcpSum').inner_text()
        check('Shared $36.37' in s and 'Just Robin $16.00, left out' in s and 'Jules owes Robin $18.19' in s, "the razor blades are just Robin's, so they're left out: " + s.replace('\n', ' | '))
        a.locator('.rcp-who').nth(3).click(); a.wait_for_timeout(100); a.locator('.rcp-who').nth(3).click(); a.wait_for_timeout(150)
        s = a.locator('#rcpSum').inner_text()
        check('Shared $31.42' in s and 'Just Jules $4.95' in s and 'Jules owes Robin $20.66' in s and a.locator('[data-act="rcpsave"]').inner_text() == 'Add 2 spends',
              "Jules's milk is hers to pay back in full: " + s.replace('\n', ' | '))
        a.wait_for_timeout(300)
        a.locator('.dialog').screenshot(path=str(SHOTS / 'p12-receipt.png'))
        a.fill('#rcpTotal', '10'); a.dispatch_event('#rcpTotal', 'input'); a.wait_for_timeout(100)
        check('add up to more than the total' in a.locator('#rcpSum').inner_text(), 'a total that is too small is caught as you type')
        act(a, 'rcpsave')
        check('add up to more than the total' in a.locator('.dialog').inner_text() and len(entries(a)) == 0, 'and nothing is saved')
        a.fill('#rcpTotal', '52.37'); a.dispatch_event('#rcpTotal', 'input')
        act(a, 'rcpsave'); a.wait_for_timeout(500)
        es = sorted(entries(a), key=lambda e: -e['amount'])
        check(len(es) == 2 and a.locator('.dialog').count() == 0, 'two spends saved and the panel closes')
        if len(es) == 2:
            sh, her = es
            check(sh['amount'] == 3142 and sh['title'] == 'Coles Artarmon' and sh['payer'] == 'a' and sh['splitA'] == 50 and sh['status'] == 'shared'
                  and sh['items'] == [250, 725, 417, 1750] and sh['notes'][0] == 'Golden Crumpet Rounds 6 Pack' and sh['date'] == str(TODAY - timedelta(days=2)),
                  'the shared spend has each line with its name')
            check(her['amount'] == 495 and her['title'] == 'Coles Artarmon, just Jules' and her['splitA'] == 0 and her['owed'] == {'a': 0, 'b': 495}, 'Jules owes all of her milk')
        check('Saved 2 spends from Coles Artarmon' in a.locator('.toast').inner_text(), 'a note says what was saved')

        # ---------- when Gemini can't help ----------
        snap(a, mode='setup')
        dlg = a.locator('.dialog').inner_text()
        check("isn't set up yet" in dlg and 'AI Logic' in dlg and a.locator('.dialog [data-act="rcptype"]').count() == 1, 'not switched on: it says where to turn it on, and offers to type it in')
        act(a, 'rcptype'); a.wait_for_timeout(300)
        check(a.locator('#amtTotal').count() == 1, 'Type it in opens Add a spend')
        check(a.locator('.snap-add input[data-change="rcpfile"]').count() == 1, 'the + screen has Snap a receipt too')
        snap(a, mode='config')
        check("isn't set up yet" in a.locator('.dialog').inner_text() and len(a.evaluate('window.__aiCalls')) == 1, 'set up but not finished (genai config not found): says so, without trying the other model')
        a.locator('.dialog [data-act="dlgclose"]').first.click(); a.wait_for_timeout(200)
        snap(a, mode='quota')
        check('free limit' in a.locator('.dialog').inner_text(), "Gemini's free limit")
        a.locator('.dialog [data-act="dlgclose"]').first.click(); a.wait_for_timeout(200)
        snap(a, mode='missing')
        models = [x['model'] for x in a.evaluate('window.__aiCalls')]
        check(models == ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'] and '$52.37' in a.locator('.dialog').inner_text(), 'if the newest model is not there, the one before it reads it')
        a.locator('.dialog [data-act="dlgclose"]').first.click(); a.wait_for_timeout(200)
        snap(a, mode='unattested')
        check("App Check key hasn't been added yet" in a.locator('.dialog').inner_text(), 'Gemini wants App Check and the app has no key yet: says so')
        a.locator('.dialog [data-act="dlgclose"]').first.click(); a.wait_for_timeout(200)
        snap(a, reply={'shop': '', 'date': '', 'total': 0, 'category': 'Other', 'items': []})
        check("doesn't look like a receipt" in a.locator('.dialog').inner_text(), 'a photo that is not a receipt')
        a.locator('.dialog [data-act="dlgclose"]').first.click(); a.wait_for_timeout(200)
        act(a, 'closeadd'); a.wait_for_timeout(300)
        check(len(entries(a)) == 2, 'nothing else was saved')

        # ---------- with App Check's key in the config ----------
        b = ctx.new_page()
        b.on('pageerror', lambda e: problems.append(f'pageerror {e}'))
        b.add_init_script("window.HH_APPCHECK = 'test-recaptcha-key-0123456789abcdefghij'; sessionStorage.setItem('__fbsession', 'robin@example.com');")
        b.goto(BASE); b.wait_for_timeout(300)
        b.reload(); b.wait_for_timeout(900)  # the test double reads who is signed in before this page's own script runs, so once more
        act(b, 'go', 'settings'); act(b, 'go', 'upload')
        hint = b.locator('.snap .hint').inner_text()
        check('reCAPTCHA' in hint and b.locator('.snap .hint a[href="https://policies.google.com/privacy"]').count() == 1
              and b.locator('.snap .hint a[href="https://policies.google.com/terms"]').count() == 1, "the note says Google's reCAPTCHA checks it's our app, with Google's privacy and terms links")
        b.locator('.snap').screenshot(path=str(SHOTS / 'p11b-snap-appcheck.png'))
        snap(b)
        check('$52.37' in b.locator('.dialog').inner_text() and b.evaluate('window.__appCheck') == [{'app': 'hh-ai', 'key': 'test-recaptcha-key-0123456789abcdefghij', 'auto': False}]
              and b.evaluate('window.__aiOpts') == {'app': 'hh-ai', 'limited': True},
              'App Check is set up on the receipt app with the reCAPTCHA key, and Gemini gets a fresh one-use token each time')
        b.locator('.dialog [data-act="dlgclose"]').first.click(); b.wait_for_timeout(200)
        snap(b, mode='unattested')
        check("couldn't confirm this is our app" in b.locator('.dialog').inner_text(), 'a token Gemini turns down: says to reopen the app and retry')
        b.locator('.dialog [data-act="dlgclose"]').first.click(); b.wait_for_timeout(200)
        snap(b, mode='recaptcha')
        check("couldn't confirm this is our app" in b.locator('.dialog').inner_text() and 'appCheck/recaptcha-error' in b.locator('.dialog .err-why').inner_text(),
              'reCAPTCHA failing on the phone: the same, with the technical reason in small print')
        b.locator('.dialog [data-act="dlgclose"]').first.click(); b.wait_for_timeout(200)
        snap(b, mode='enforce')
        dlg = b.locator('.dialog').inner_text()
        check('until App Check is enforced' in dlg and 'Firebase AI Logic to Enforced' in dlg, 'App Check not enforced yet: says where to switch it on')
        check(len(b.evaluate('window.__appCheck')) == 1, 'App Check is set up once, however many receipts are snapped')
        b.locator('.dialog').screenshot(path=str(SHOTS / 'p13-receipt-appcheck.png'))

        browser.close()
finally:
    server.terminate()

print('problems:', '; '.join(problems) if problems else 'none')
print('FAILURES:', len(failures))
sys.exit(1 if failures or problems else 0)
