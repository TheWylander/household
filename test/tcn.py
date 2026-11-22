"""TCN gift cards in Deals: The Card Network's deals while they run (before the OzBargain card when one's on), every
card's shops with the popular ones in bold, a search for which cards take a shop, the cards taken at a kind of place,
and nothing from the file run as code."""
import json
import pathlib
import subprocess
import sys
import time
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import deals_fixture  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
SHOTS = ROOT / 'shots'
PORT = 8778 + int(__import__('os').environ.get('HH_PORT_SHIFT', '0'))
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


def fmt(d):
    return f"{d.strftime('%a')} {d.day} {d.strftime('%b')}"


def card(n, shops, top=(), link=''):
    return {'n': n, 'link': link, 'shops': list(shops), 'top': list(top)}


CARDS = [
    card('TCN Active', ['99 Bikes', 'adidas', 'BCF', 'Platypus', 'rebel'], ['BCF', 'rebel'], 'https://thecardnetwork.com.au/pages/the-active-card'),
    card('TCN Baby', ['Baby Bunting', 'Bonds', 'Cotton On Kids'], ['Baby Bunting']),
    card('TCN Choice', ['Adairs', 'JB Hi-Fi', 'The Good Guys', 'Village Roadshow Theme Parks'], ['JB Hi-Fi', 'The Good Guys'], 'https://choicecard.gift/'),
    card('TCN Home', ['Adairs', 'BCF', 'JB Hi-Fi', 'Kogan.com', 'Supercheap Auto', 'The Good Guys'], ['BCF', 'JB Hi-Fi', 'Supercheap Auto', 'The Good Guys']),
    card('TCN Shop', ['Adairs', 'adidas', 'ASOS', 'BCF', '<img src=x onerror="window.__xss=1">', 'rebel', 'Uber', 'Uber Eats'], ['Uber', 'Uber Eats', 'rebel', 'BCF'],
         'https://thecardnetwork.com.au/pages/the-shop-card'),
    card('TCN Teen', ['Culture Kings', 'Glue Store', 'Hype DC'], [], 'javascript:window.__xss=1'),
    card('TCN Kids', ['Timezone', 'Smiggle', 'Lego'], ['Timezone']),
    {'n': 'TCN Pamper', 'link': '', 'shops': [], 'top': [], 'note': 'Merchants around Australia categorised as Barber and Beauty Shops (MCC 7230), Health and Beauty Spas (MCC 7298) or Hotels, Motels and Resorts (MCC 7011).'},
    {'n': 'TCN Pub & Bar', 'link': '', 'shops': [], 'top': [], 'note': 'Merchants around Australia categorised as Eating Places and Restaurants (MCC 5812), Drinking Places (MCC 5813) or Country Clubs (MCC 7997). Gift card subject to individual merchant acceptance.'},
]
state = {'deals': []}


def feed_body():
    f = deals_fixture.feed(TODAY.isoformat())
    f['tcn'] = {'asAt': '2026-10-16', 'cards': CARDS, 'deals': state['deals']}
    f['sources']['tcn'] = {'ok': True, 'n': len(CARDS)}
    return json.dumps(f)


LIVE = {'id': '984101', 't': '15% off TCN Good Food, Pamper, Active, Shop, Cinema and Choice Gift Cards', 's': 'Coles (In-Store Only)',
        'link': 'https://www.ozbargain.com.au/node/984101', 'from': str(TODAY - timedelta(days=2)), 'to': str(TODAY + timedelta(days=3)), 'votes': 118,
        'off': 15, 'back': 0, 'cards': ['Good Food', 'Shop', 'Active']}
SOON = {'id': '984102', 't': '20x EDR Pts on TCN Kids and Shop Gift Cards', 's': 'Woolworths', 'link': 'https://www.ozbargain.com.au/node/984102',
        'from': str(TODAY + timedelta(days=5)), 'to': str(TODAY + timedelta(days=11)), 'votes': 40, 'off': 0, 'back': 10, 'cards': ['Kids', 'Shop']}
GONE = {'id': '984103', 't': '10% off Pamper Gift Cards', 's': 'Card.gift', 'link': 'https://www.ozbargain.com.au/node/984103',
        'from': str(TODAY - timedelta(days=9)), 'to': str(TODAY - timedelta(days=1)), 'votes': 30, 'off': 10, 'back': 0, 'cards': ['Pamper']}

server = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx = browser.new_context(reduced_motion='reduce', viewport={'width': 402, 'height': 874}, device_scale_factor=2, is_mobile=True, has_touch=True,
                                  locale='en-AU', timezone_id='Australia/Sydney', service_workers='block')
        ctx.add_init_script(path=str(ROOT / 'test' / 'firebase-mock.js'))
        ctx.add_init_script("window.HH_DEALS_URL = '%s'; window.HH_REPO = 'robin/household';" % deals_fixture.URL)
        ctx.route('**/firebase-config.js', lambda r: r.fulfill(status=200, content_type='text/javascript', body=TEST_CONFIG))
        ctx.route('**/firebase-*-compat.js', lambda r: r.fulfill(status=200, content_type='text/javascript', body='/* test double */'))
        ctx.route('https://fonts.googleapis.com/**', lambda r: r.abort())
        ctx.route(deals_fixture.URL, lambda r: r.fulfill(status=200, content_type='application/json', headers={'Access-Control-Allow-Origin': '*'}, body=feed_body()))
        a = ctx.new_page()
        a.on('pageerror', lambda e: problems.append(f'pageerror {e}'))
        a.goto(BASE); a.wait_for_timeout(500)
        a.evaluate("() => { localStorage.clear(); localStorage.setItem('__fbrules', JSON.stringify(['robin@example.com', 'jules@example.com'])); }")
        a.reload(); a.wait_for_timeout(600)
        act(a, 'aumode', 'create'); a.fill('#auemail', 'robin@example.com'); a.fill('#aupw', 'correct horse 1'); act(a, 'aucreate')
        a.evaluate("(e) => window.__fbVerify(e)", 'robin@example.com'); act(a, 'auverified'); a.wait_for_load_state('load'); a.wait_for_timeout(700)
        a.fill('#sna', 'Robin'); a.fill('#snb', 'Jules'); act(a, 'sme', 'a'); act(a, 'snext'); a.fill('#sbudget', '2000'); act(a, 'snext'); act(a, 'sfinish'); a.wait_for_timeout(500)

        # ---------- no deal on: the card list, after the OzBargain card ----------
        state['deals'] = [GONE]
        a.reload(); a.wait_for_timeout(900)
        act(a, 'go', 'deals'); a.wait_for_timeout(500)
        tc = a.locator('#tcnCard')
        check(tc.count() == 1 and 'No TCN deals on right now' in tc.inner_text() and tc.locator('.tcn-deal').count() == 0,
              'with nothing on, it says so and leaves out the one that ended')
        order = a.evaluate("() => [...document.querySelectorAll('main section.card, #app section.card')].map((s) => s.id || s.className)")
        ozb_i = next((i for i, x in enumerate(order) if 'ozb' in x), -1)
        tcn_i = next((i for i, x in enumerate(order) if x == 'tcnCard'), -1)
        check(ozb_i >= 0 and tcn_i > ozb_i, 'with nothing on, it comes after the OzBargain card: ' + str(order))
        rows = a.locator('#tcnList .tcn-row').all_inner_texts()
        check(len(rows) == 5 and rows[0].startswith('TCN Shop') and '8 shops, including Uber, Uber Eats and rebel' in rows[0] and rows[1].startswith('TCN Home'),
              'five cards to start, the ones with the most popular shops first: ' + ' | '.join(r.replace('\n', ' ') for r in rows)[:300])
        act(a, 'tcnall'); a.wait_for_timeout(200)
        rows = a.locator('#tcnList .tcn-row').all_inner_texts()
        check(len(rows) == 11 and any('TCN Good Food' in r and 'not fast food' in r for r in rows) and any('TCN Cinema' in r for r in rows)
              and sum('TCN Pamper' in r for r in rows) == 1 and not any('0 shops' in r for r in rows)
              and any('TCN Pub & Bar' in r and 'Eating Places and Restaurants, Drinking Places or Country Clubs' in r and 'MCC' not in r for r in rows),
              'see all: the seven cards and the ones taken at a kind of place, Pamper once, never as 0 shops, the wiki\'s in plain words')
        check('Fewer cards' in a.locator('#tcnCard').inner_text(), 'and back to fewer')
        hint = a.locator('#tcnCard .hint').inner_text()
        check("OzBargain’s gift card wiki, correct as at Fri 16 Oct" in hint and 'check its own list before you buy' in hint, 'it says where the lists come from and when: ' + hint[:160])

        # ---------- a deal on now and one coming ----------
        state['deals'] = [SOON, LIVE, GONE]
        a.reload(); a.wait_for_timeout(900)
        act(a, 'go', 'deals'); a.wait_for_timeout(500)
        order = a.evaluate("() => [...document.querySelectorAll('section.card')].map((s) => s.id || s.className)")
        ozb_i = next((i for i, x in enumerate(order) if 'ozb' in x), -1)
        tcn_i = next((i for i, x in enumerate(order) if x == 'tcnCard'), -1)
        check(tcn_i >= 0 and tcn_i < ozb_i, 'with a deal on, it comes before the OzBargain card')
        deals = a.locator('#tcnCard .tcn-deal').all_inner_texts()
        check(len(deals) == 2 and '2 deals' in a.locator('#tcnCard .card-head').inner_text(), 'the one on now and the one coming, not the one that ended')
        d0 = deals[0].replace('\n', ' | ')
        check(d0.startswith('15% off at Coles') and 'TCN Good Food, TCN Shop and TCN Active' in d0 and 'Covers Uber, Uber Eats, rebel and BCF' in d0
              and 'Till ' + fmt(TODAY + timedelta(days=3)) in d0, "the one on now first: how much, where, its cards, the popular shops they cover, till when: " + d0)
        d1 = deals[1].replace('\n', ' | ')
        check(d1.startswith('About 10% back in points at Woolies') and 'From ' + fmt(TODAY + timedelta(days=5)) in d1 and 'soon' in (a.locator('#tcnCard .tcn-deal').nth(1).get_attribute('class') or ''),
              'then the one coming, marked as coming: ' + d1)
        check(a.locator('#tcnCard .tcn-deal a').first.get_attribute('href') == 'https://www.ozbargain.com.au/node/984101', 'each opens its OzBargain post')
        rows = a.locator('#tcnList .tcn-row').all_inner_texts()
        check(rows[0].startswith('TCN Shop') and 'On special' in rows[0] and rows[1].startswith('TCN Active') and 'On special' in rows[1] and 'On special' not in rows[2],
              "cards in the deal on now come first and say so (Kids' deal hasn't started)")
        act(a, 'tcnopen', 'TCN Shop'); a.wait_for_timeout(200)
        shops = a.locator('#tcnList .tcn-row.open .tcn-shops')
        check(shops.count() == 1 and 'Uber Eats' in shops.inner_text() and shops.locator('strong').all_inner_texts() == ['BCF', 'rebel', 'Uber', 'Uber Eats'],
              'tapping a card shows all its shops, the popular ones in bold')
        check(shops.locator('a').get_attribute('href') == 'https://thecardnetwork.com.au/pages/the-shop-card' and '<img' in shops.inner_text(),
              "with a link to TCN's own list, and a shop name shown as text, never run")
        check(a.locator('[data-act="tcnopen"][data-arg="TCN Shop"]').get_attribute('aria-expanded') == 'true', 'and says it is open')
        a.locator('#tcnCard').screenshot(path=str(SHOTS / 'p45-tcn.png'))
        act(a, 'tcnopen', 'TCN Shop'); a.wait_for_timeout(200)
        check(a.locator('#tcnList .tcn-row.open').count() == 0, 'tapping again closes it')
        act(a, 'tcnall'); a.wait_for_timeout(200)
        act(a, 'tcnopen', 'TCN Teen'); a.wait_for_timeout(200)
        check(a.locator('#tcnList .tcn-row.open .tcn-shops a').count() == 0, 'a link that is not to TCN is left off')
        act(a, 'tcnopen', 'TCN Teen'); a.wait_for_timeout(100)
        act(a, 'tcnall'); a.wait_for_timeout(100)

        # ---------- which cards take a shop ----------
        a.fill('#tcnQ', 'uber eats'); a.wait_for_timeout(300)
        res = a.locator('#tcnList').inner_text()
        check('1 card takes it' in res and 'TCN Shop' in res and 'Uber Eats' in res and 'TCN Home' not in res, 'a shop finds the cards that take it: ' + res.replace('\n', ' | '))
        a.fill('#tcnQ', 'jb hi'); a.wait_for_timeout(300)
        res = a.locator('#tcnList').inner_text()
        check('2 cards take it' in res and 'TCN Choice' in res and 'TCN Home' in res, 'any part of the name: ' + res.replace('\n', ' | '))
        a.fill('#tcnQ', 'restaurants'); a.wait_for_timeout(300)
        check('TCN Good Food' in a.locator('#tcnList').inner_text(), 'and a kind of place finds the cards taken there')
        a.fill('#tcnQ', 'hotel'); a.wait_for_timeout(300)
        check('TCN Pamper' in a.locator('#tcnList').inner_text(), "the wiki's description is searched too (Pamper works at hotels)")
        a.fill('#tcnQ', 'bunnings'); a.wait_for_timeout(300)
        check('No TCN card lists “bunnings”' in a.locator('#tcnList').inner_text(), 'none says so')
        check(a.evaluate('document.activeElement && document.activeElement.id') == 'tcnQ', 'typing keeps the cursor in the box')
        a.fill('#tcnQ', ''); a.wait_for_timeout(300)
        check(a.locator('#tcnList .tcn-row').count() == 5, 'clearing it shows the cards again')
        check(a.evaluate('window.__xss') is None, 'nothing from the file ran')

        # ---------- an old copy without TCN ----------
        state['deals'] = []
        a.route(deals_fixture.URL, lambda r: r.fulfill(status=200, content_type='application/json', headers={'Access-Control-Allow-Origin': '*'},
                                                     body=json.dumps(deals_fixture.feed(TODAY.isoformat()))))
        a.reload(); a.wait_for_timeout(900)
        act(a, 'go', 'deals'); a.wait_for_timeout(500)
        check(a.locator('#tcnCard').count() == 0 and a.locator('.ozb').count() == 1, 'a deals file from before TCN shows no card and nothing breaks')
        browser.close()
finally:
    server.terminate()

print('problems:', '; '.join(problems) if problems else 'none')
print('FAILURES:', len(failures))
sys.exit(1 if failures or problems else 0)
