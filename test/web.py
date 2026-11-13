"""Coles fresh food and Liquorland from Coles' website: the weekly laptop run pastes src/agent/coles-specials.js into
a coles.com.au page in the browser, which reads the specials pages (stood in for here by pages shaped like Coles'
own) and opens Two of Us with them in the link. Covers what the reader keeps and skips, the hand-over, what's saved
for both phones, how they show and filter, the pop-up refresh it starts, a second week replacing the first, and when
Coles shows a check page or the link is broken."""
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
PORT = 8777 + int(__import__('os').environ.get('HH_PORT_SHIFT', '0'))
BASE = f'http://127.0.0.1:{PORT}/pwa/site/index.html'
TEST_CONFIG = "window.HH_FIREBASE = { apiKey: 'test-key', authDomain: 'test-project.firebaseapp.com', projectId: 'test-project', appId: '1:1:web:1' };"
TODAY = datetime.now(ZoneInfo('Australia/Sydney')).date()
WEEK_END = deals_fixture.week(TODAY)[1]
READER = (ROOT / 'src' / 'agent' / 'coles-specials.js').read_text().replace("'https://thewylander.github.io/household/'", repr(BASE))
failures, problems = [], []


def check(cond, msg):
    print(('ok   ' if cond else 'FAIL ') + msg)
    if not cond:
        failures.append(msg)


def act(page, a, arg=None):
    page.locator(f'[data-act="{a}"]' + (f'[data-arg="{arg}"]' if arg is not None else '')).first.click()
    page.wait_for_timeout(200)


def product(pid, brand, name, size, now, was=0, heirs=(('Fruit & Vegetables', 'Fruit'),), offer='', weighted=False, comparable='', ad=None):
    p = {'now': now, 'was': was, 'unit': {'isWeighted': weighted, 'ofMeasureUnits': 'g' if weighted else 'ea', 'price': 0}, 'comparable': comparable,
         'promotionType': 'SPECIAL'}
    if offer:
        p['offerDescription'] = offer
    return {'_type': 'PRODUCT', 'id': pid, 'adId': ad, 'brand': brand, 'name': name, 'size': size, 'pricing': p,
            'onlineHeirs': [{'subCategory': s, 'category': c} for s, c in heirs]}


FRUIT = [product(8925050, 'Coles', 'Medium Calypso Mangoes', '1 Each', 2.9, offer='Buy 2 for $5'),
         product(156713, 'Coles', 'Peaches Yellow', 'approx. 120g', 0.95, weighted=True, comparable='$7.90/ 1kg'),
         product(5191256, 'Coles', 'Strawberries', '250g', 4, heirs=(('Christmas', 'Desserts'), ('Fruit & Vegetables', 'Fruit'))),
         product(777, 'Coca-Cola', 'Zero Sugar 10x375ml', '3.75L', 23, heirs=(('Drinks', 'Soft Drinks'),), ad='ad-1')]
FRUIT += [product(9000 + i, 'Coles', f'Baby Spinach Bag {i}', '120g', 3.3, heirs=(('Fruit & Vegetables', 'Vegetables'),)) for i in range(46)]
FRUIT2 = [product(9100, 'Coles', 'Packham Pears', '1kg', 4.5), product(8925050, 'Coles', 'Medium Calypso Mangoes', '1 Each', 2.9)]
MEAT = [product(4400, 'Coles', 'Australian Pork Loin Chops', '1kg', 11, 16, heirs=(('Meat & Seafood', 'Pork'),)),
        product(4401, 'Coles', 'RSPCA Chicken Breast Fillets', 'approx. 1kg', 10.5, heirs=(('Meat & Seafood', 'Poultry'),))]
LIQUOR = [product(5500, 'Jameson', 'Irish Whiskey 700ml', '1 Each', 55, 68, heirs=(('Liquorland', 'Spirits'),)),
          product(5501, 'Carlton', 'Dry Bottle 330ml', '24 Pack', 65, heirs=(('Liquorland', 'Beer'),), offer='Buy 2 for $118'),
          product(5502, 'Heaps Normal', 'Quiet XPA 4x375ml', '1.5L', 12.8, 16, heirs=(('Drinks', 'Non-Alcoholic'),)),
          product(4400, 'Coles', 'Australian Pork Loin Chops', '1kg', 11, 16, heirs=(('Meat & Seafood', 'Pork'),))]
PAGES = {'fruit-vegetables': [FRUIT, FRUIT2], 'meat-seafood': [MEAT], 'liquorland': [LIQUOR]}
state = {'check': None, 'hits': [], 'week2': False}


def slug(x):
    import re
    return re.sub(r'[^a-z0-9.]+', '-', (x['brand'] + ' ' + x['name'] + ' ' + x['size']).lower()).strip('-') + '-' + str(x['id'])


def coles_page(route):
    from urllib.parse import urlparse, parse_qs
    u = urlparse(route.request.url)
    if not u.path.startswith('/on-special'):
        route.fulfill(status=404, body='')
        return
    state['hits'].append(u.path + ('?' + u.query if u.query else ''))
    sec = u.path.rstrip('/').split('/')[-1]
    if state['check'] == sec:
        route.fulfill(status=200, content_type='text/html', body='<html><body>Pardon our interruption. Please verify you are human.</body></html>')
        return
    pages = PAGES.get(sec) if not state['week2'] else {'fruit-vegetables': [[FRUIT2[0]]], 'meat-seafood': [MEAT[:1]], 'liquorland': [LIQUOR[:1]]}.get(sec)
    if not pages:
        pages = [[]]
    n = int((parse_qs(u.query).get('page') or ['1'])[0])
    items = pages[n - 1] if n <= len(pages) else []
    total = sum(len(p) for p in pages) if len(pages) > 1 else len(items)
    data = {'props': {'pageProps': {'searchResults': {'noOfResults': total if len(pages) > 1 else len(items), 'pageSize': 48, 'results': items + [{'_type': 'SINGLE_TILE'}]}}}}
    links = ''.join(f'<a href="/product/{slug(x)}">{x["name"]}</a>' for x in items if not x.get('adId'))
    html = (f'<html><head><title>Coles</title></head><body><header>Glebe When</header><main>{links}</main>'
            f'<script id="__NEXT_DATA__" type="application/json">{json.dumps(data)}</script></body></html>')
    route.fulfill(status=200, content_type='text/html', body=html)


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
        ctx.route(deals_fixture.URL, lambda r: r.fulfill(status=200, content_type='application/json', headers={'Access-Control-Allow-Origin': '*'},
                                                         body=json.dumps(deals_fixture.feed(TODAY.isoformat()))))
        ctx.route('https://www.coles.com.au/**', coles_page)
        jobs = []
        def github(route):
            r = route.request
            if r.method == 'OPTIONS':
                route.fulfill(status=204, headers={'access-control-allow-origin': '*', 'access-control-allow-headers': 'Authorization, Content-Type', 'access-control-allow-methods': 'POST'}, body='')
                return
            jobs.append(r.url)
            route.fulfill(status=204, headers={'access-control-allow-origin': '*'}, body='')
        ctx.route('https://api.github.com/**', github)
        a = ctx.new_page()
        a.on('pageerror', lambda e: problems.append(f'pageerror {e}'))
        a.goto(BASE); a.wait_for_timeout(500)
        a.evaluate("() => { localStorage.clear(); localStorage.setItem('__fbrules', JSON.stringify(['robin@example.com', 'jules@example.com'])); }")
        a.reload(); a.wait_for_timeout(600)
        act(a, 'aumode', 'create'); a.fill('#auemail', 'robin@example.com'); a.fill('#aupw', 'correct horse 1'); act(a, 'aucreate')
        a.evaluate("(e) => window.__fbVerify(e)", 'robin@example.com'); act(a, 'auverified'); a.wait_for_load_state('load'); a.wait_for_timeout(700)
        a.fill('#sna', 'Robin'); a.fill('#snb', 'Jules'); act(a, 'sme', 'a'); act(a, 'snext'); a.fill('#sbudget', '2000'); act(a, 'snext'); act(a, 'sfinish'); a.wait_for_timeout(500)
        a.evaluate("""() => { const d = JSON.parse(localStorage.getItem('__fbdb'));
          d['hh/ai'] = { ghToken: 'github_pat_test' }; d['hh/deals'] = Object.assign({ sales: [], keen: {}, list: [] }, d['hh/deals'] || {}, { watch: ['jameson'] });
          localStorage.setItem('__fbdb', JSON.stringify(d)); }""")
        a.reload(); a.wait_for_timeout(800)

        # ---------- a check page stops it ----------
        a.goto('https://www.coles.com.au/on-special'); a.wait_for_timeout(300)
        state['check'] = 'liquorland'
        r = a.evaluate(READER)
        a.wait_for_timeout(900)
        check(r.get('ok') is False and 'normal liquorland page' in r.get('error', '') and 'coles.com.au' in a.url,
              "when Coles shows a check page, it stops, says so, and doesn't open the app: " + str(r.get('error'))[:120])
        state['check'] = None

        # ---------- a normal week ----------
        state['hits'].clear()
        a.goto('https://www.coles.com.au/on-special'); a.wait_for_timeout(300)
        t0 = time.time()
        r = a.evaluate(READER)
        took = time.time() - t0
        check(r.get('ok') and r.get('counts') == {'fruit-vegetables': 50, 'meat-seafood': 2, 'liquorland': 3} and 'Glebe' in r.get('where', ''),
              'it reads both pages of fruit and veg, meat and Liquorland, skipping an ad from another aisle and one it already has: ' + json.dumps(r.get('counts')))
        check(state['hits'] == ['/on-special', '/on-special/fruit-vegetables', '/on-special/fruit-vegetables?page=2', '/on-special/meat-seafood', '/on-special/liquorland']
              and took >= 0.8, 'one page at a time, with a pause, like paging through: ' + ' '.join(state['hits']))
        sample = r.get('sample') or []
        check(sample[:2] == [['Coles', 'Coles Medium Calypso Mangoes', 290, 0, 'Buy 2 for $5', 'Fruit & Veg', 'Fruit', '/product/coles-medium-calypso-mangoes-1-each-8925050'],
                             ['Coles', 'Coles Peaches Yellow per kg', 790, 0, '', 'Fruit & Veg', 'Fruit', '/product/coles-peaches-yellow-approx.-120g-156713']],
              'each special as name, price, usual price, deal, aisle and link; fruit sold by weight at its price per kilo: ' + json.dumps(sample[:2]))
        a.wait_for_url(BASE + '*', timeout=8000); a.wait_for_timeout(1500)
        check('#web=' not in a.url, 'the app takes the specials out of the link straight away')
        dlg = a.locator('.dialog').inner_text() if a.locator('.dialog').count() else ''
        check(a.locator('#webDone[data-ok="1"]').count() == 1 and 'Saved 55 specials for both phones: 50 Coles fruit and veg, 2 Coles meat and seafood and 3 Liquorland' in dlg
              and 'On special till' in dlg, 'the app saves them and says how many from each: ' + dlg.replace('\n', ' | ')[:200])
        a.locator('.dialog').screenshot(path=str(SHOTS / 'p42-web-done.png'))
        web = (a.evaluate("JSON.parse(localStorage.getItem('__fbdb'))['hh/deals']").get('web') or {})
        lines = web.get('items') or []
        check(web.get('to') == str(WEEK_END) and web.get('by') == 'a' and len(lines) == 55 and all(isinstance(x, str) and x.count('\t') == 7 for x in lines),
              'kept in hh/deals for both phones and the pop-up job, one line each, till Tuesday')
        check(any(j.endswith('/repos/robin/household/actions/workflows/deals.yml/dispatches') for j in jobs), 'it starts the deals refresh, so watch-list pop-ups go out now')
        act(a, 'dlgclose')
        check('Coles fresh food and Liquorland from Coles\' website, read in the browser on Robin\'s laptop' in a.locator('.sp-src').inner_text(),
              'the sources note says where they came from')

        # ---------- how they show ----------
        a.select_option('#spShop', 'Liquorland'); a.wait_for_timeout(250)
        lst = a.locator('#spList').inner_text()
        check('Jameson Irish Whiskey 700ml' in lst and '19% off' in lst and 'Buy 2 for $118' in lst and 'Liquorland · Spirits' in lst and 'Carlton Dry Bottle 330ml 24 Pack' in lst,
              'Liquorland shows each with its saving or deal and its own aisle')
        a.select_option('#spShop', 'Coles'); a.wait_for_timeout(250)
        a.select_option('#spCat', 'fresh'); a.wait_for_timeout(250)
        lst = a.locator('#spList').inner_text()
        check('Coles Peaches Yellow per kg' in lst and '$7.90' in lst and 'Coles Medium Calypso Mangoes' in lst and 'Coca-Cola' not in lst, 'fruit and veg are under Fresh')
        a.select_option('#spCat', 'meat'); a.wait_for_timeout(250)
        check('Coles Australian Pork Loin Chops 1kg' in a.locator('#spList').inner_text(), 'pork chops are under Meat and seafood')
        a.locator('#spCard').screenshot(path=str(SHOTS / 'p43-web-list.png'))
        act(a, 'spitem', 'web|Coles|Coles Australian Pork Loin Chops 1kg')
        dlg = a.locator('.dialog').inner_text()
        href = a.locator('.dialog a.link').first.get_attribute('href') if a.locator('.dialog a.link').count() else ''
        check('special till' in dlg and href == 'https://www.coles.com.au/product/coles-australian-pork-loin-chops-1kg-4400', 'tapping one shows its last day and links to it at Coles: ' + str(href))
        act(a, 'dlgclose')
        a.select_option('#spShop', 'all'); a.select_option('#spCat', 'all'); a.wait_for_timeout(250)
        m = a.locator('.matches').inner_text() if a.locator('.matches').count() else ''
        check('Jameson Irish Whiskey 700ml' in m, 'the watch list finds Jameson at Liquorland')

        # ---------- next week replaces this one ----------
        state['week2'] = True
        a.goto('https://www.coles.com.au/on-special'); a.wait_for_timeout(300)
        r = a.evaluate(READER)
        a.wait_for_url(BASE + '*', timeout=8000); a.wait_for_timeout(1500)
        lines = (a.evaluate("JSON.parse(localStorage.getItem('__fbdb'))['hh/deals']").get('web') or {}).get('items') or []
        check(r.get('total') == 3 and len(lines) == 3 and not any('Peaches' in x for x in lines) and 'Saved 3 specials' in a.locator('.dialog').inner_text(),
              "the next run replaces last week's, so nothing stale hangs about")
        act(a, 'dlgclose')

        # ---------- a broken or old link ----------
        a.goto(BASE + '#web=' + 'A' * 40); a.wait_for_timeout(1500)
        check(a.locator('#webDone[data-ok="0"]').count() == 1 and len((a.evaluate("JSON.parse(localStorage.getItem('__fbdb'))['hh/deals']").get('web') or {}).get('items') or []) == 3,
              "a broken link says the specials didn't come through, and keeps what's there")
        act(a, 'dlgclose')
        a.evaluate("() => localStorage.setItem('hh.webIn', JSON.stringify({ at: Date.now() - 4 * 864e5, d: 'H4sIAAAAAAAAA6tWKlOyMjQw0FEqS8wpTQUA' }))")
        a.reload(); a.wait_for_timeout(1200)
        check(a.locator('#webDone').count() == 0 and not a.evaluate("localStorage.getItem('hh.webIn')"), 'one left waiting for days is dropped, not saved late')

        # ---------- when they've run out ----------
        a.evaluate("""(d) => { const x = JSON.parse(localStorage.getItem('__fbdb')); x['hh/deals'].web.to = d; localStorage.setItem('__fbdb', JSON.stringify(x)); }""",
                   str(TODAY - timedelta(days=1)))
        a.reload(); a.wait_for_timeout(900)
        act(a, 'go', 'deals'); a.wait_for_timeout(400)
        check('Packham Pears' not in a.locator('#spCard').inner_text() and 'from Coles\' website' not in (a.locator('.sp-src').inner_text() if a.locator('.sp-src').count() else ''),
              'after their last day they go, and so does the note')
        browser.close()
finally:
    server.terminate()

print('problems:', '; '.join(problems) if problems else 'none')
print('FAILURES:', len(failures))
sys.exit(1 if failures or problems else 0)
