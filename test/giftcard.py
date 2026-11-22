"""Paid with a gift card bought at a discount: the spend saves at what it really cost, the bill and the saving show on
it, Home adds up what gift cards saved, editing keeps it, and the statement's card part and gift card purchase are
both matched to it, so nothing counts twice."""
import pathlib
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import ai_fake  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
SHOTS = ROOT / 'shots'
SHOTS.mkdir(exist_ok=True)
PORT = 8812 + int(__import__('os').environ.get('HH_PORT_SHIFT', '0'))
BASE = f'http://127.0.0.1:{PORT}/pwa/site/index.html'
TEST_CONFIG = "window.HH_FIREBASE = { apiKey: 'test-key', authDomain: 'test-project.firebaseapp.com', projectId: 'test-project', appId: '1:1:web:1' };"
TODAY = datetime.now(ZoneInfo('Australia/Sydney')).date()
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


def text(page):
    return page.locator('#app').inner_text()


def open_add(page):
    act(page, 'go', 'home'); act(page, 'addpick'); act(page, 'pickadd')


server = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx = browser.new_context(reduced_motion='reduce', viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True,
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
        a.fill('#sna', 'Robin'); a.fill('#snb', 'Jules'); act(a, 'sme', 'a'); act(a, 'snext'); act(a, 'snext'); act(a, 'sfinish'); a.wait_for_timeout(500)

        # ---------- part gift card, part card ----------
        open_add(a)
        for k in '265':
            act(a, 'key', k)
        a.fill('#addTitle', 'Sheridan')
        check(a.locator('[data-act="addpay"][data-arg="card"][aria-pressed="true"]').count() == 1, 'a spend is paid by card unless you say otherwise')
        act(a, 'addpay', 'both')
        a.fill('#addGift', '300'); a.wait_for_timeout(150)
        check("can't be more than $265.00" in a.inner_text('#giftSum'), 'a gift card part bigger than the bill is caught: ' + a.inner_text('#giftSum'))
        a.fill('#addGift', '200'); a.fill('#addOff', '15'); a.wait_for_timeout(150)
        s = a.inner_text('#giftSum')
        check(s == 'Costs you $235.00: $170.00 for the gift card and $65.00 on the card. $30.00 saved.', 'it works out the real cost as you type: ' + s)
        check(a.inner_text('#saveBtn') == 'Save $235.00', 'and saves what it really cost: ' + a.inner_text('#saveBtn'))
        a.screenshot(path=str(SHOTS / 'gift01-add.png'), full_page=True)
        act(a, 'saveadd'); a.wait_for_timeout(400)
        e = [x for x in entries(a) if x.get('title') == 'Sheridan']
        e = e[0] if e else {}
        check(e.get('amount') == 23500 and e.get('gift') == {'bill': 26500, 'face': 20000, 'off': 15, 'saved': 3000}, 'saved at $235, with the bill and the gift card kept: ' + str(e.get('gift')))
        check(e.get('owed') == {'a': 11750, 'b': 11750}, 'the real cost is what gets split')
        t = text(a)
        check('Saved with gift cards' in t and '$30.00' in a.inner_text('#giftSaved'), 'Home adds up what gift cards saved')
        a.screenshot(path=str(SHOTS / 'gift02-home.png'), full_page=True)

        # it shows on the spend, and editing keeps it
        act(a, 'go', 'cal'); a.wait_for_timeout(300)
        row = a.locator('li.entry', has_text='Sheridan').first
        check('Bill $265.00 · $30.00 saved with a gift card' in row.inner_text(), 'the spend shows the bill and the saving')
        act(a, 'edit', e.get('id')); a.wait_for_timeout(300)
        if a.locator('#addGift').count():
            check(a.inner_text('#amtTotal') == '$265.00' and a.input_value('#addGift') == '200' and a.input_value('#addOff') == '15' and
                  a.locator('[data-act="addpay"][data-arg="both"][aria-pressed="true"]').count() == 1, 'editing opens on the bill, the gift card part and the discount: ' +
                  str([a.inner_text('#amtTotal'), a.input_value('#addGift'), a.input_value('#addOff')]))
            act(a, 'closeadd')
        else:
            check(False, 'editing opens on the bill, the gift card part and the discount (the edit form did not open)')

        # all on a gift card
        open_add(a)
        for k in '50':
            act(a, 'key', k)
        a.fill('#addTitle', 'Cinema')
        act(a, 'addpay', 'gift')
        a.fill('#addOff', '10'); a.wait_for_timeout(150)
        check(a.inner_text('#giftSum') == 'Costs you $45.00: $45.00 for the gift card. $5.00 saved.', 'all on a gift card: ' + a.inner_text('#giftSum'))
        act(a, 'saveadd'); a.wait_for_timeout(400)
        check('$35.00' in a.inner_text('#giftSaved'), 'Home now says $35 saved')

        # lines and gift cards don't mix
        open_add(a)
        for k in ['1', '0', '+', '5']:
            act(a, 'key', k)
        check(a.locator('[data-act="addpay"]').count() == 0, 'no gift card option on a spend made of lines')
        act(a, 'closeadd')

        # ---------- the statement: the gift card purchase and the card part match the spend ----------
        bought = TODAY - timedelta(days=5)
        csv = ('Bank Account,Date,Narrative,Debit Amount,Credit Amount,Balance,Categories,Serial\n'
               '732-000 123456,%s,"COLES 0612 BONDI JUNCTION NSW AUS",170.00,,,OTHER,\n'
               '732-000 123456,%s,"SHERIDAN BONDI JUNCTION NSW AUS",65.00,,,OTHER,\n'
               '732-000 123456,%s,"COLES 0612 BONDI JUNCTION NSW AUS",88.40,,,OTHER,\n') % (bought.strftime('%d/%m/%Y'), TODAY.strftime('%d/%m/%Y'), TODAY.strftime('%d/%m/%Y'))
        f = pathlib.Path(tempfile.mkdtemp()) / 'statement.csv'
        f.write_text(csv)
        act(a, 'go', 'home'); act(a, 'go', 'settings'); act(a, 'go', 'upload')
        a.set_input_files('input[data-change="importfile"]', str(f))
        a.wait_for_timeout(1200)
        imp = {x.get('amount'): x for x in entries(a) if x.get('source') == 'import'}
        check(imp.get(17000, {}).get('status') == 'dupe' and imp.get(6500, {}).get('status') == 'dupe',
              'the gift card bought 5 days before and the $65 on the card both match the Sheridan spend: ' + str({k: v.get('status') for k, v in imp.items()}))
        check(imp.get(8840, {}).get('status') == 'check', 'an ordinary Coles shop is still there to check')

        browser.close()
finally:
    server.terminate()

print()
print('problems:', '; '.join(problems) if problems else 'none')
print('FAILURES:', len(failures))
sys.exit(1 if failures or problems else 0)
