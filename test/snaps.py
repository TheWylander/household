"""Specials from screenshots: Coles fresh food and Liquorland don't let other sites read their specials, so we screenshot
them (or save Safari's full-page PDF) and Gemini (stood in for here) reads each product and price into Deals.
Covers the button, reading several screenshots in turn, the tick list to check, what's saved for both phones, how they
show in the list and the watch list, taking a wrong one off, a PDF, and when Gemini or a file can't help."""
import json
import pathlib
import subprocess
import sys
import time
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import ai_fake  # noqa: E402
import deals_fixture  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
SHOTS = ROOT / 'shots'
PORT = 8776 + int(__import__('os').environ.get('HH_PORT_SHIFT', '0'))
BASE = f'http://127.0.0.1:{PORT}/pwa/site/index.html'
TEST_CONFIG = "window.HH_FIREBASE = { apiKey: 'test-key', authDomain: 'test-project.firebaseapp.com', projectId: 'test-project', appId: '1:1:web:1' };"
TODAY = datetime.now(ZoneInfo('Australia/Sydney')).date()
WEEK_END = deals_fixture.week(TODAY)[1]
PHOTO = str(ROOT / 'test' / 'photo-sample.png')
failures, problems = [], []

COLES = {'shop': 'Coles Supermarkets', 'ends': '', 'items': [
    {'name': 'Coles Australian Pork Loin Chops 1kg', 'price': 11, 'was': 16, 'deal': '', 'category': 'Meat & Seafood'},
    {'name': 'Kensington Pride Mangoes Each', 'price': 1.5, 'was': 2.5, 'deal': '', 'category': 'Fruit & Veg'},
    {'name': 'Sanitarium Weet-Bix 575g', 'price': 2.5, 'was': 5, 'deal': 'Half price', 'category': 'Pantry'},
    {'name': 'Coles Baby Spinach 120g', 'price': 2.5, 'was': 0, 'deal': '2 for $4', 'category': 'Fruit & Veg'},
    {'name': 'Something it misread', 'price': 3, 'was': 4, 'deal': '', 'category': 'Pantry'},
    {'name': 'Kensington Pride mangoes each', 'price': 1.5, 'was': 2.5, 'deal': '', 'category': 'Fruit & Veg'},
    {'name': 'Banner with no price', 'price': 0, 'was': 0, 'deal': '', 'category': 'Other'},
    {'name': 'A made-up aisle', 'price': 4, 'was': 5, 'deal': '', 'category': 'Toys'}]}
LIQUOR = {'shop': 'Liquorland', 'ends': str(TODAY + timedelta(days=5)), 'items': [
    {'name': 'Coopers Pale Ale 24 x 375mL', 'price': 55, 'was': 65, 'deal': 'Save $10', 'category': 'Liquor'},
    {'name': 'Yellow Tail Shiraz 750mL', 'price': 8, 'was': 0, 'deal': '2 for $15', 'category': 'Liquor'}]}


def check(cond, msg):
    print(('ok   ' if cond else 'FAIL ') + msg)
    if not cond:
        failures.append(msg)


def act(page, a, arg=None):
    page.locator(f'[data-act="{a}"]' + (f'[data-arg="{arg}"]' if arg is not None else '')).first.click()
    page.wait_for_timeout(200)


def db(page):
    return page.evaluate("JSON.parse(localStorage.getItem('__fbdb'))")


def snaps(page):
    return (db(page).get('hh/deals') or {}).get('snaps') or []


def shoot(page, files, reply=None, mode='ok'):
    page.evaluate("([r, m]) => { window.__aiReply = r; window.__aiMode = m; window.__aiCalls = []; }", [reply or COLES, mode])
    page.locator('.sp-snap input[data-change="snapfile"]').set_input_files(files)
    first = page.locator('.dialog').inner_text()
    page.wait_for_function("() => !document.querySelector('.dialog .spin')", timeout=10000)
    page.wait_for_timeout(150)
    return first


server = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx = browser.new_context(reduced_motion='reduce', viewport={'width': 402, 'height': 874}, device_scale_factor=2, is_mobile=True, has_touch=True,
                                  locale='en-AU', timezone_id='Australia/Sydney')
        ctx.add_init_script(path=str(ROOT / 'test' / 'firebase-mock.js'))
        ctx.add_init_script("window.HH_DEALS_URL = '%s';" % deals_fixture.URL)
        ctx.route('**/firebase-config.js', lambda r: r.fulfill(status=200, content_type='text/javascript', body=TEST_CONFIG))
        ctx.route('**/firebase-*-compat.js', lambda r: r.fulfill(status=200, content_type='text/javascript', body='/* test double */'))
        ctx.route('https://fonts.googleapis.com/**', lambda r: r.abort())
        ctx.route(deals_fixture.URL, lambda r: r.fulfill(status=200, content_type='application/json', headers={'Access-Control-Allow-Origin': '*'},
                                                         body=json.dumps(deals_fixture.feed(TODAY.isoformat()))))
        ai_fake.route(ctx)
        a = ctx.new_page()
        a.on('pageerror', lambda e: problems.append(f'pageerror {e}'))
        a.goto(BASE); a.wait_for_timeout(500)
        a.evaluate("() => { localStorage.clear(); localStorage.setItem('__fbrules', JSON.stringify(['robin@example.com', 'jules@example.com'])); }")
        a.reload(); a.wait_for_timeout(600)
        act(a, 'aumode', 'create'); a.fill('#auemail', 'robin@example.com'); a.fill('#aupw', 'correct horse 1'); act(a, 'aucreate')
        a.evaluate("(e) => window.__fbVerify(e)", 'robin@example.com'); act(a, 'auverified'); a.wait_for_load_state('load'); a.wait_for_timeout(700)
        a.fill('#sna', 'Robin'); a.fill('#snb', 'Jules'); act(a, 'sme', 'a'); act(a, 'snext'); a.fill('#sbudget', '2000'); act(a, 'snext'); act(a, 'sfinish'); a.wait_for_timeout(500)
        if a.locator('.dialog [data-act="dlgclose"]').count():
            a.locator('.dialog [data-act="dlgclose"]').first.click(); a.wait_for_timeout(200)

        # ---------- the button ----------
        act(a, 'go', 'deals'); a.wait_for_timeout(500)
        box = a.locator('.sp-snap')
        check(box.count() == 1 and 'Add specials from screenshots' in box.inner_text() and 'Coles fresh food, Liquorland' in box.inner_text(),
              'Deals has an Add specials from screenshots button under the list, saying what it is for')
        inp = a.locator('.sp-snap input[data-change="snapfile"]')
        check(inp.get_attribute('accept') == 'image/*,application/pdf' and inp.get_attribute('multiple') is not None, 'it takes several screenshots at once, or a PDF')
        cats = ' | '.join(a.locator('#spCat option').all_inner_texts())
        check('Meat and seafood · 1' in cats and 'Pantry · 18' in cats, 'meat has its own aisle now, so it is not lumped in with the pantry: ' + cats)

        # ---------- two overlapping screenshots ----------
        first = shoot(a, [PHOTO, PHOTO])
        calls = a.evaluate('window.__aiCalls') or []
        c = calls[0] if calls else {}
        schema = (c.get('config') or {}).get('responseJsonSchema') or {}
        item = ((schema.get('properties') or {}).get('items') or {}).get('items') or {}
        check('Reading 1 of 2' in first or 'Reading 2 of 2' in first, 'while it reads, it says how far it has got: ' + first.replace('\n', ' | '))
        check(len(calls) == 2 and all(x.get('mime') == 'image/jpeg' and x.get('size', 0) > 100 for x in calls) and c.get('prompt', '').startswith('These are screenshots')
              and set(item.get('properties', {})) == {'name', 'price', 'was', 'deal', 'category'} and 'Liquor' in item['properties']['category'].get('enum', []),
              'one Gemini call per screenshot, each a JPEG, asking for each product, price, usual price, deal and aisle')
        dlg = a.locator('.dialog').inner_text()
        rows = a.locator('.snap-row')
        check('Check the specials' in dlg and 'Gemini found 6 specials' in dlg and rows.count() == 6,
              'the same product in both screenshots shows once, and lines with no price are dropped: ' + str(rows.count()))
        check(a.input_value('#snapShop') == 'Coles' and a.input_value('#snapTo') == str(WEEK_END), "the shop's name is tidied, and with no end date shown it runs to Tuesday")
        check(a.locator('#snapGo').inner_text() == 'Add 6 specials', 'everything is ticked to start with')
        check('Other' in rows.nth(5).inner_text() and '2 for $4' in rows.nth(3).inner_text() and '$16.00' in rows.nth(0).inner_text(),
              'each row has its aisle, any deal words and the usual price (an aisle Gemini made up becomes Other)')
        rows.nth(4).locator('input').click(); a.wait_for_timeout(150)
        check(a.locator('#snapGo').inner_text() == 'Add 5 specials', 'unticking one counts it out straight away')
        rows.nth(5).locator('input').click(); a.wait_for_timeout(150)
        a.wait_for_timeout(200)
        a.locator('.dialog').screenshot(path=str(SHOTS / 'p40-snaps-check.png'))
        a.fill('#snapShop', ''); act(a, 'snapsave')
        check('Enter the shop.' in a.locator('.dialog').inner_text() and not snaps(a), 'a shop is needed, and nothing is saved without one')
        a.fill('#snapShop', 'coles'); act(a, 'snapsave'); a.wait_for_timeout(400)
        saved = snaps(a)
        pork = [x for x in saved if x['n'].startswith('Coles Australian Pork')]
        spin = [x for x in saved if 'Spinach' in x['n']]
        check(len(saved) == 4 and a.locator('.dialog').count() == 0 and all(x['s'] == 'Coles' and x['to'] == str(WEEK_END) and x['by'] == 'a' for x in saved),
              'four saved to hh/deals for both phones, from Coles, till the end of the specials week')
        check(pork and pork[0]['now'] == 1100 and pork[0]['was'] == 1600 and pork[0]['cat'] == 'Meat & Seafood' and spin and spin[0]['promo'] == '2 for $4' and spin[0]['was'] == 0,
              'prices in cents, with the deal words kept: ' + json.dumps(saved[:2]))
        check('Added 4 specials from Coles' in a.locator('.toast').inner_text(), 'a note says what was added')
        check(a.input_value('#spShop') == 'Coles', 'the list jumps to Coles, so they show straight away')
        lst = a.locator('#spList').inner_text()
        check('Coles Australian Pork Loin Chops 1kg' in lst and 'From a screenshot' in lst and '31% off' in lst, 'they show in Everything on special, marked as from a screenshot, with the % off')
        check(lst.count('Sanitarium Weet-Bix 575g') == 1, "the Weet-Bix already on the half-price list isn't doubled up")
        a.select_option('#spCat', 'meat'); a.wait_for_timeout(250)
        check('Coles Australian Pork Loin Chops 1kg' in a.locator('#spList').inner_text(), 'the pork chops are under Meat and seafood')
        a.select_option('#spCat', 'fresh'); a.wait_for_timeout(250)
        lst = a.locator('#spList').inner_text()
        check('Kensington Pride Mangoes Each' in lst and 'Coles Baby Spinach 120g' in lst and '2 for $4' in lst, 'the mangoes and spinach are under Fresh, the spinach with its 2 for $4')
        a.locator('#spCard').screenshot(path=str(SHOTS / 'p41-snaps-list.png'))

        # ---------- on the weekend list, and taking a wrong one off ----------
        key = 'snap|Coles|Coles Baby Spinach 120g'
        act(a, 'spitem', key)
        dlg = a.locator('.dialog').inner_text()
        check('2 for $4' in dlg and 'special till' in dlg and "Read from Robin's screenshot" in dlg and 'Take it off' in dlg, 'tapping one shows its deal, its last day and whose screenshot it came from')
        act(a, 'listadd', key); a.wait_for_timeout(300)
        lst_items = (db(a).get('hh/deals') or {}).get('list') or []
        check(any(i['n'] == 'Coles Baby Spinach 120g' and i['s'] == 'Coles' and i['p'] == 250 and i['to'] == str(WEEK_END) for i in lst_items),
              'it goes on the weekend list with its price and last day, like any special')
        if a.locator('.dialog').count():
            a.locator('.dialog [data-act="dlgclose"]').first.click(); a.wait_for_timeout(200)
        act(a, 'spitem', 'snap|Coles|Kensington Pride Mangoes Each')
        act(a, 'snapdel', [x for x in snaps(a) if x['n'].startswith('Kensington')][0]['id']); a.wait_for_timeout(300)
        check(len(snaps(a)) == 3 and 'Kensington' not in a.locator('#spCard').inner_text() and 'Taken off the specials' in a.locator('.toast').inner_text(),
              'a wrong one can be taken off')

        # ---------- a full-page PDF of Liquorland ----------
        a.select_option('#spShop', 'all'); a.wait_for_timeout(200)
        a.select_option('#spCat', 'all'); a.wait_for_timeout(200)
        shoot(a, [{'name': 'Liquorland specials.pdf', 'mimeType': 'application/pdf', 'buffer': b'%PDF-1.4\n% a page of specials\n%%EOF\n'}], reply=LIQUOR)
        calls = a.evaluate('window.__aiCalls') or []
        check(len(calls) == 1 and calls[0].get('mime') == 'application/pdf', 'a PDF goes to Gemini as a PDF')
        check(a.input_value('#snapShop') == 'Liquorland' and a.input_value('#snapTo') == str(TODAY + timedelta(days=5)), 'with the last day Liquorland shows')
        act(a, 'snapsave'); a.wait_for_timeout(400)
        saved = snaps(a)
        check(len(saved) == 5 and sum(1 for x in saved if x['s'] == 'Liquorland') == 2 and sum(1 for x in saved if x['s'] == 'Coles') == 3, "Liquorland's join Coles's")
        check(a.input_value('#spShop') == 'Liquorland' and 'Coopers Pale Ale' in a.locator('#spList').inner_text() and '15% off' in a.locator('#spList').inner_text(),
              "and show under Liquorland, in the drinks aisle's way")
        shoot(a, [PHOTO], reply={'shop': 'Liquorland', 'ends': str(TODAY + timedelta(days=5)), 'items': [
            {'name': 'Coopers Pale Ale 24 x 375mL', 'price': 52, 'was': 65, 'deal': '', 'category': 'Liquor'}]})
        act(a, 'snapsave'); a.wait_for_timeout(400)
        coop = [x for x in snaps(a) if x['n'].startswith('Coopers')]
        check(len(snaps(a)) == 5 and len(coop) == 1 and coop[0]['now'] == 5200, 'the same product again replaces the one before, with the new price')

        # ---------- the watch list and the other phone ----------
        a.evaluate("""() => { const d = JSON.parse(localStorage.getItem('__fbdb')); d['hh/deals'].watch = ['coopers', 'pork loin']; localStorage.setItem('__fbdb', JSON.stringify(d)); }""")
        a.reload(); a.wait_for_timeout(900)
        act(a, 'go', 'deals'); a.wait_for_timeout(500)
        m = a.locator('.matches').inner_text() if a.locator('.matches').count() else ''
        check('Coopers Pale Ale' in m and 'Coles Australian Pork Loin Chops 1kg' in m, 'screenshot specials count for the watch list, and stay after a reload: ' + m.replace('\n', ' | ')[:160])

        # ---------- when it can't help ----------
        shoot(a, [PHOTO], mode='quota')
        dlg = a.locator('.dialog').inner_text()
        check("free limit is used up" in dlg and 'Type this one in' not in dlg and a.locator('.dialog input[data-change="snapfile"]').count() == 1,
              "Gemini's limit: says so, and offers other screenshots")
        a.locator('.dialog [data-act="dlgclose"]').first.click(); a.wait_for_timeout(200)
        shoot(a, [PHOTO, PHOTO, PHOTO], mode='quota')
        check(len(a.evaluate('window.__aiCalls') or []) == 1, "once Gemini says no, it doesn't keep trying the rest")
        a.locator('.dialog [data-act="dlgclose"]').first.click(); a.wait_for_timeout(200)
        shoot(a, [PHOTO], mode='unattested')
        check(a.locator('.dialog [data-act="aitoken"]').count() == 1, 'App Check trouble offers the same one-off setup as receipts')
        a.locator('.dialog [data-act="dlgclose"]').first.click(); a.wait_for_timeout(200)
        shoot(a, [PHOTO], reply={'shop': '', 'ends': '', 'items': []})
        check('No specials in that' in a.locator('.dialog').inner_text(), 'a screenshot with no specials says what to screenshot')
        a.locator('.dialog [data-act="dlgclose"]').first.click(); a.wait_for_timeout(200)
        broken = {'name': 'broken.png', 'mimeType': 'image/png', 'buffer': b'not really a picture'}
        shoot(a, [broken])
        check("That screenshot couldn't be opened" in a.locator('.dialog').inner_text(), "a file that isn't a picture is caught")
        a.locator('.dialog [data-act="dlgclose"]').first.click(); a.wait_for_timeout(200)
        shoot(a, [broken, {'name': 'coles.png', 'mimeType': 'image/png', 'buffer': pathlib.Path(PHOTO).read_bytes()}])
        dlg = a.locator('.dialog').inner_text()
        check('Gemini found 6 specials' in dlg and "One file couldn't be read" in dlg, 'with one bad file among good ones, the good ones still come through')
        a.locator('.dialog [data-act="dlgclose"]').first.click(); a.wait_for_timeout(200)
        check(len(snaps(a)) == 5, 'closing without adding saves nothing')

        # ---------- finished ones go ----------
        a.evaluate("""(d) => { const x = JSON.parse(localStorage.getItem('__fbdb')); x['hh/deals'].snaps.forEach((s) => { if (s.s === 'Liquorland') s.to = d; });
          localStorage.setItem('__fbdb', JSON.stringify(x)); }""", str(TODAY - timedelta(days=1)))
        a.reload(); a.wait_for_timeout(900)
        act(a, 'go', 'deals'); a.wait_for_timeout(500)
        check('Coopers' not in a.locator('#spCard').inner_text() and 'Coles Australian Pork Loin' in a.locator('#spCard').inner_text(), "Liquorland's go after their last day")
        shoot(a, [PHOTO])
        act(a, 'snapsave'); a.wait_for_timeout(400)
        check(not any(x['s'] == 'Liquorland' for x in snaps(a)), 'and are cleared out next time some are added')

        browser.close()
finally:
    server.terminate()

print('problems:', '; '.join(problems) if problems else 'none')
print('FAILURES:', len(failures))
sys.exit(1 if failures or problems else 0)
