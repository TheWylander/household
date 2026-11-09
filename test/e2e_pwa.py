"""The PWA on its own: manifest and icons, service worker and offline launch, sign-in, setup, two phones in sync,
Jules's welcome, rent, a login that isn't allowed, and the real Firebase library's API."""
import json
import pathlib
import re
import subprocess
import sys
import time
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import deals_fixture

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

def close(page):
    """Close the panel or dialog with its own button."""
    page.locator('.dialog [data-act="dlgclose"]').first.click()
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
        ctx0 = browser.new_context(reduced_motion='reduce', )
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
        ctx1 = browser.new_context(reduced_motion='reduce', service_workers='allow')
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
        ctxp = browser.new_context(reduced_motion='reduce', service_workers='block')
        fonts(ctxp)
        ctxp.route('**/firebase-config.js', lambda r: r.fulfill(status=200, content_type='text/javascript', body="window.HH_FIREBASE = { apiKey: 'PASTE_API_KEY', projectId: 'PASTE_PROJECT_ID' };"))
        pp = watch(ctxp.new_page(), 'no-settings', console=False)
        pp.goto(BASE); pp.wait_for_timeout(800)
        check('Add your Firebase settings to firebase-config.js' in text(pp), 'without settings it opens as a preview and says what to add')
        ctxp.close()

        # ---------- the real Firebase library: same calls the app makes ----------
        ctx2 = browser.new_context(reduced_motion='reduce', viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, service_workers='block')
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
        ctx = browser.new_context(reduced_motion='reduce', viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True,
                                  locale='en-AU', timezone_id='Australia/Sydney', service_workers='block')
        ctx.add_init_script(path=str(ROOT / 'test' / 'firebase-mock.js'))
        ctx.route('**/firebase-config.js', lambda r: r.fulfill(status=200, content_type='text/javascript', body=TEST_CONFIG))
        ctx.route('**/firebase-*-compat.js', lambda r: r.fulfill(status=200, content_type='text/javascript', body='/* test double */'))
        fonts(ctx)
        TODAY = datetime.now(ZoneInfo('Australia/Sydney')).date()
        ctx.add_init_script("window.HH_DEALS_URL = '%s';" % deals_fixture.URL)
        # a stand-in for the phone's keyboard: window.__kb(px) shrinks the visible area the way an iPhone keyboard does
        ctx.add_init_script("""(() => {
          const fake = new EventTarget(); let h = null;
          Object.defineProperties(fake, { height: { get: () => (h == null ? window.innerHeight : h) }, width: { get: () => window.innerWidth },
            offsetTop: { get: () => 0 }, offsetLeft: { get: () => 0 }, scale: { get: () => 1 } });
          window.__kb = (px) => { h = px ? window.innerHeight - px : null; fake.dispatchEvent(new Event('resize')); };
          Object.defineProperty(window, 'visualViewport', { get: () => fake, configurable: true });
        })();""")
        feed_over = {}

        def deals_body():
            f = deals_fixture.feed(TODAY.isoformat())
            if feed_over.get('report_from'):
                f['sources']['report']['from'] = feed_over['report_from']
            return json.dumps(f)
        photo = (ROOT / 'test' / 'photo-sample.png').read_bytes()
        shop_photos = []
        ctx.route('https://cdn.shopify.com/**', lambda r: (shop_photos.append(r.request.url), r.fulfill(status=200, content_type='image/png', body=photo))[-1])
        ctx.route(deals_fixture.URL, lambda r: r.fulfill(status=200, content_type='application/json', headers={'Access-Control-Allow-Origin': '*'}, body=deals_body()))

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
        act(a, 'addpick'); act(a, 'pickadd')
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

        # Robin shows Claude's draft note to Jules
        act(a, 'go', 'home'); act(a, 'go', 'newsedit'); act(a, 'newspublish'); a.wait_for_timeout(300)
        check(a.evaluate("JSON.parse(localStorage.getItem('__fbdb'))['hh/news'].notes['2026-11-09'].status") == 'published', 'the update note is saved to Firestore')
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
        check('A few things to try' in b.locator('.dialog').inner_text(), 'after the welcome, a few things to try'); act(b, 'newsok'); b.wait_for_timeout(300)
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

        # ---------- deals: everything on special first, then the watch list, sale days and OzBargain ----------
        nxt = deals_fixture.next_second_saturday(TODAY)
        this_sat = deals_fixture.second_saturday(TODAY.year, TODAY.month)
        act(a, 'go', 'deals'); a.wait_for_timeout(500)
        t = text(a)
        cards = a.evaluate("[...document.querySelectorAll('#app .main > section, #app .main > button.card')].map((e) => e.id || e.className)")
        check(cards[0] == 'spCard' and 'Everything on special' in t and 'Rarely this cheap' in t and 'Sale days' in t, 'Everything on special comes first: ' + ', '.join(cards[:4]))
        check(a.locator('.nav [data-arg="deals"]').count() == 1 and a.locator('.nav [data-arg="inbox"]').count() == 0, 'the tab bar has Deals where Inbox was')
        shops = ' | '.join(a.locator('#spShop option').all_inner_texts())
        check('All shops' in shops and 'Coles · 9' in shops and 'Woolies · 9' in shops and 'Harris Farm · 2' in shops and 'Umall · 1' in shops and a.locator('.specials .chip').count() == 0,
              'specials from Coles, Woolies, Harris Farm and Umall (not its ended pick), picked from a drop-down rather than pills: ' + shops)
        rare = a.locator('.sp-rare .sp-row').all_inner_texts()
        check(len(rare) == 3 and 'Vittoria' in rare[0] and 'First time at half price' in rare[0] and 'First time in 15 weeks' in rare[1], 'Rarely this cheap: the three not half price for longest')
        aisles = ' | '.join(a.locator('#spCat option').all_inner_texts())
        check('All categories' in aisles and 'Pantry · 18' in aisles and 'Fresh · 2' in aisles and 'Freezer · 1' in aisles, 'categories with how many in each: ' + aisles)
        check(a.locator('[data-act="spmore"]').inner_text() == 'See all 21 specials', 'a button for the lot')
        act(a, 'spmore')
        check(a.locator('#spList .sp-row').count() == 21 and 'Frozen Pork & Cabbage Dumplings' in text(a) and 'Ended Umall pick' not in text(a) and 'Umall' in a.locator('.sp-src').inner_text() and a.evaluate('window.__xss') is None and a.locator('.specials img:not(.sp-img)').count() == 0 and '<img src=x' in text(a), 'every special, and text from the deals file shows as text and never runs')
        for i in range(a.locator('#spList .sp-img').count()):
            a.locator('#spList .sp-img').nth(i).scroll_into_view_if_needed(); a.wait_for_timeout(400)
        imgs = a.evaluate("[...document.querySelectorAll('#spList .sp-img')].map((i) => [i.closest('.sp-row').querySelector('.sp-n').textContent, i.getAttribute('src'), i.complete && i.naturalWidth > 0, i.getAttribute('alt'), i.className])")
        check(len(imgs) == 2 and {x[0] for x in imgs} == {'Imperfect Avocados 600g', 'Frozen Pork & Cabbage Dumplings 1kg'}
              and all(x[1].startswith('https://cdn.shopify.com/s/files/') and x[1].endswith('width=144') and x[3] == '' for x in imgs),
              'photos on the Harris Farm and Umall specials, only from Shopify, sized for the row: ' + json.dumps(imgs))
        check(any(x[2] for x in imgs) and all('width=144' in u or 'width=264' in u for u in shop_photos), 'and they load, at the size asked for: ' + json.dumps([imgs, shop_photos])[:600])
        check(a.locator('.specials a[href^="javascript"]').count() == 0, 'only links to the stores and OzBargain')
        act(a, 'spmore')
        check(a.locator('.sp-rare').count() == 1, 'Show fewer goes back to the picks')
        a.select_option('#spCat', 'fresh'); a.wait_for_timeout(250)
        check(a.evaluate('document.activeElement.tagName') != 'SELECT', 'after a pick the drop-down lets go, so the iPhone picker does not open again')
        fresh = a.locator('#spList .sp-row').all_inner_texts()
        check(len(fresh) == 2 and all('Harris Farm' in r for r in fresh), 'pick an aisle')
        a.locator('#spCard').screenshot(path=str(SHOTS / 'p13-deals-photos.png'))
        a.locator('#spList .sp-row', has_text='Imperfect Avocados').locator('.sp-add').click(); a.wait_for_timeout(300)
        big = a.locator('.dialog .sp-item-head .sp-img')
        check(big.count() == 1 and (big.get_attribute('src') or '').endswith('width=264') and big.get_attribute('width') == '88', 'the + panel shows a bigger photo')
        a.locator('.dialog').screenshot(path=str(SHOTS / 'p14-special-photo.png'))
        a.locator('.dialog [data-act="dlgclose"]').first.click(); a.wait_for_timeout(200)
        a.select_option('#spCat', 'all'); a.wait_for_timeout(250)
        check(a.locator('.sp-rare').count() == 1, 'All categories goes back to the picks')
        m = a.locator('#matchCard, .matches').first.inner_text()
        check('Tell it what we buy' in m, 'an empty watch list says what it is for')
        shot(a, 'p06-deals', full=True)
        act(a, 'salemonth'); a.wait_for_timeout(300)
        check(a.locator('.dialog #saleMonth').count() == 1 and 'Lucky Mart' in a.locator('.dialog').inner_text(), 'sale days open as a panel, with the Lucky Mart idea')
        act(a, 'saleidea', 'luckymart'); a.wait_for_timeout(400)
        sale = a.evaluate("JSON.parse(localStorage.getItem('__fbdb'))['hh/deals']")['sales'][0]
        check(sale['store'] == 'Lucky Mart' and sale['rule'] == {'k': 'nth', 'n': 2, 'dow': 6} and sale['keen'] is True, 'Lucky Mart saved as the 2nd Saturday of every month, keen')
        cell = a.locator(f'.dialog .cal-day[data-arg="{this_sat.isoformat()}"]')
        check('sale' in (cell.get_attribute('class') or '') and 'Lucky' in cell.inner_text(), f'the month marks {this_sat} for Lucky Mart')
        shot(a, 'p06b-sale-month')
        close(a)
        check('Next: Lucky Mart' in a.locator('[data-act="salemonth"].card').inner_text(), 'the Sale days row shows the next one')
        act(a, 'watchopen'); a.wait_for_timeout(200)
        a.fill('#watchIn', 'weetbix'); a.press('#watchIn', 'Enter'); a.wait_for_timeout(300)
        check(a.evaluate("JSON.parse(localStorage.getItem('__fbdb'))['hh/deals'].watch") == ['weetbix'] and a.evaluate('document.activeElement.id') == 'watchIn', 'watch word saved, ready for the next one')
        a.fill('#watchIn', 'oat milk'); a.press('#watchIn', 'Enter'); a.wait_for_timeout(300)
        check('weetbix 1' in a.locator('.dialog .watch').inner_text().replace('\n', ' '), 'the panel shows how many match this week')
        close(a)
        m = a.locator('#matchCard').inner_text()
        check('Weetbix is on special' in m and 'Sanitarium Weet-Bix 575g' in m and '$2.50' in m and 'Nothing on special for oat milk' in m and 'saves $2.50' in m, 'the best deal for each watch word: ' + m.replace('\n', ' | '))
        act(a, 'spwatch'); a.wait_for_timeout(200)
        rows = a.locator('#spList .sp-row')
        check(rows.count() == 1 and 'Weet-Bix' in rows.first.inner_text() and 'On our list' in rows.first.inner_text(), 'See all matches filters the specials to the watch list')
        check(a.input_value('#spCat') == 'watch', 'and the category drop-down says Our watch list')
        act(a, 'spwatch')
        a.locator('#spQ').press_sequentially('coffee'); a.wait_for_timeout(200)
        rows = a.locator('#spList .sp-row')
        check(rows.count() == 1 and 'Vittoria' in rows.first.inner_text() and a.evaluate('document.activeElement.id') == 'spQ', 'search filters as you type and keeps the keyboard up')
        a.fill('#spQ', ''); a.dispatch_event('#spQ', 'input'); a.wait_for_timeout(200)
        a.select_option('#spShop', 'Harris Farm'); a.wait_for_timeout(250)
        hf_rows = a.locator('#spList .sp-row').all_inner_texts()
        check(len(hf_rows) == 2 and all('Harris Farm' in r for r in hf_rows), 'pick a shop')
        a.select_option('#spShop', 'all'); a.wait_for_timeout(250)
        # ---------- the weekend shopping list, from the + on each special ----------
        wb = a.locator('#matchCard .sp-add')
        check(wb.count() == 1 and a.locator('#spList .sp-add').count() >= 3, 'a + on the watch list match and on each special')
        wb.first.click(); a.wait_for_timeout(250)
        dlg = a.locator('.dialog').inner_text()
        check('Sanitarium Weet-Bix 575g' in dlg and 'Add to our weekend list' in dlg and 'On the watch list as weetbix' in dlg and 'See it at Coles' in dlg,
              'the + offers the weekend list, and says it is already watched: ' + dlg.replace('\n', ' | '))
        act(a, 'listadd'); a.wait_for_timeout(300)
        lst = a.evaluate("JSON.parse(localStorage.getItem('__fbdb'))['hh/deals'].list")
        check(len(lst) == 1 and lst[0]['n'] == 'Sanitarium Weet-Bix 575g' and lst[0]['s'] == 'Coles' and lst[0]['p'] == 250 and lst[0]['w'] == 500 and lst[0]['done'] is False and bool(lst[0]['to']),
              'added to the weekend list with its price and when the special ends')
        check('Added to the weekend list' in a.locator('.toast').inner_text() and a.locator('.list-btn .list-n').inner_text() == '1' and a.locator('#matchCard .sp-add.on').count() == 1,
              'a note, a 1 on the trolley, and a tick on the row')
        a.locator('.sp-rare .sp-row', has_text='Vittoria').locator('.sp-add').click(); a.wait_for_timeout(250)
        check('Put it on the watch list' in a.locator('.dialog').inner_text(), 'a special that is not watched can go on the watch list')
        act(a, 'watchfor'); a.wait_for_timeout(250)
        check(a.input_value('#watchIn') == 'Vittoria Espresso Coffee', 'the watch list opens with a starting word, without the size: ' + a.input_value('#watchIn'))
        a.fill('#watchIn', 'vittoria'); a.press('#watchIn', 'Enter'); a.wait_for_timeout(300)
        check('vittoria' in a.evaluate("JSON.parse(localStorage.getItem('__fbdb'))['hh/deals'].watch"), 'and saved')
        act(a, 'watchdel', 'vittoria'); a.wait_for_timeout(200)
        close(a)
        act(a, 'shoplist'); a.wait_for_timeout(250)
        dlg = a.locator('.dialog').inner_text()
        check('Weekend shopping list' in dlg and '1 to get' in dlg and '$2.50' in dlg and 'Coles' in dlg and 'was $5.00' in dlg, 'the list, by shop, with the special price: ' + dlg.replace('\n', ' | '))
        a.fill('#listIn', 'bread'); a.press('#listIn', 'Enter'); a.wait_for_timeout(300)
        dlg = a.locator('.dialog').inner_text()
        check('Anywhere' in dlg and 'bread' in dlg and '2 to get' in dlg and a.evaluate('document.activeElement.id') == 'listIn', 'add your own, ready for the next one')
        a.locator('.dialog .sl-tick').first.click(); a.wait_for_timeout(250)
        check(a.input_value('#listIn') == '', 'the box is empty again after adding')
        check(a.locator('.dialog .sl-row.done').count() == 1 and '1 to get' in a.locator('.dialog').inner_text() and a.locator('.dialog [data-act="listclear"]').inner_text() == 'Clear 1 ticked',
              'tick things off as you go')
        shot(a, 'p08b-shop-list')
        act(a, 'listclear'); a.wait_for_timeout(250)
        check([i['n'] for i in a.evaluate("JSON.parse(localStorage.getItem('__fbdb'))['hh/deals'].list")] == ['bread'], 'clear the ticked ones')
        # ---------- the phone's keyboard: what's behind it hides, and the sheet sits on top of it ----------
        kb_state = "(() => { const d = document.querySelector('.dialog'), n = document.querySelector('.nav'); return { open: document.documentElement.classList.contains('kb-open'), bottom: getComputedStyle(d).bottom, nav: getComputedStyle(n).visibility }; })()"
        a.locator('#listIn').focus(); a.evaluate('window.__kb(320)'); a.wait_for_timeout(200)
        st = a.evaluate(kb_state)
        check(st == {'open': True, 'bottom': '320px', 'nav': 'hidden'}, 'with the keyboard up, the sheet sits on top of it and the tab bar hides: ' + str(st))
        a.evaluate('window.__kb(0)'); a.locator('#listIn').blur(); a.wait_for_timeout(200)
        st = a.evaluate(kb_state)
        check(st == {'open': False, 'bottom': '0px', 'nav': 'visible'}, 'and back when it goes: ' + str(st))
        close(a)
        ozb = a.locator('.ozb-list').inner_text()
        check(ozb.index('Tony') < ozb.index('Iceberg') and '44' in ozb and 'Sushi Rice' not in ozb and '191 More' not in ozb and 'Ended last week' not in ozb, 'OzBargain deals for our shops, most votes first, without the half-price post or ended deals')
        act(a, 'ozball')
        check('Sushi Rice' in a.locator('.ozb-list').inner_text(), 'see every grocery deal')
        act(a, 'go', 'home'); a.wait_for_timeout(300)
        note = a.locator('.notice').first.inner_text() if a.locator('.notice').count() else ''
        check('Weetbix is on special' in note and 'Sanitarium Weet-Bix 575g at Coles' in note and 'On special this week' not in text(a), 'a heads-up at the top of Home for a watch-list special')
        check(a.locator('.nav [data-arg="deals"] .dot-badge').count() == 1, 'and a dot on Deals')
        a.locator('.notice [data-act="noticex"]').first.click(); a.wait_for_timeout(200)
        t = text(a)
        check(a.locator('.notice').count() == 0 and 'On special this week' in t and 'Weetbix is on special' in t and a.locator('.nav .dot-badge').count() == 0, 'closed, it settles into the row on Home')
        a.reload(); a.wait_for_timeout(1800)
        check(a.locator('.notice').count() == 0 and 'On special this week' in text(a), 'and stays closed after reopening')
        ns = a.locator('.next-sale').inner_text() if a.locator('.next-sale').count() else ''
        days = (nxt - TODAY).days
        when = 'Today' if days == 0 else 'Tomorrow' if days == 1 else f'In {days} days'
        check('Lucky Mart' in ns and when in ns and 'Wilkes Ave' in ns and 'Lucky Mart' not in a.locator('section.soon').inner_text(), f'Home shows the next sale day ({nxt}, {when}), and Coming up is for bills')
        shot(a, 'p07-home-deals', full=True)
        a.locator(f'.next-sale .keen-btn[data-arg$="|{nxt.isoformat()}"]').click(); a.wait_for_timeout(300)
        sale = a.evaluate("JSON.parse(localStorage.getItem('__fbdb'))['hh/deals']")['sales'][0]
        check(sale['skip'] == [nxt.isoformat()] and nxt.isoformat() not in (a.locator('.next-sale .keen-btn').get_attribute('data-arg') or ''), 'not keen on one month, and Home moves on to the next')
        act(a, 'salemonthgo'); a.wait_for_timeout(300)
        if nxt.month != TODAY.month:
            act(a, 'calmove', '1')
        a.locator(f'.dialog .keen-btn[data-arg$="|{nxt.isoformat()}"]').first.click(); a.wait_for_timeout(300)
        check(a.evaluate("JSON.parse(localStorage.getItem('__fbdb'))['hh/deals']")['sales'][0]['skip'] == [], 'keen again, from All sale days')
        close(a)

        b.wait_for_timeout(300)
        act(b, 'go', 'deals'); b.wait_for_timeout(400)
        act(b, 'watchopen')
        check('weetbix' in b.locator('.dialog .watch').inner_text(), "Jules's phone has the watch list")
        close(b)
        act(b, 'shoplist'); b.wait_for_timeout(250)
        check('bread' in b.locator('.dialog').inner_text() and b.locator('.list-btn .list-n').inner_text() == '1', 'and the weekend list')
        close(b)
        act(b, 'salemonth')
        check('Lucky Mart' in b.locator('#saleMonth').inner_text(), "and the sale day")
        act(b, 'saleadd')
        act(b, 'salesave')
        check('Which shop is it at?' in b.locator('.dialog').inner_text(), 'a sale day needs a shop')
        b.fill('#saleStore', 'Tong Li'); b.fill('#saleOffer', '10% off')
        b.select_option('#saleKind', 'monthly'); b.wait_for_timeout(200)
        b.select_option('#saleDay', '15'); b.wait_for_timeout(200)
        check('Next: ' in b.locator('.dialog').inner_text() and b.input_value('#saleStore') == 'Tong Li', 'the dialog shows the next dates and keeps what was typed')
        shot(b, 'p08-sale-dialog')
        act(b, 'salesave'); b.wait_for_timeout(400)
        sales = b.evaluate("JSON.parse(localStorage.getItem('__fbdb'))['hh/deals'].sales")
        check(len(sales) == 2 and sales[1]['store'] == 'Tong Li' and sales[1]['rule'] == {'k': 'monthly', 'day': 15}, 'a sale day of your own, on the 15th of each month')
        check(b.locator('.dialog #saleMonth').count() == 1, 'and back to the month')
        if b.locator(f'[data-act="saleopen"][data-arg="{sales[1]["id"]}"]').count() == 0:
            act(b, 'calmove', '1')
        b.locator(f'[data-act="saleopen"][data-arg="{sales[1]["id"]}"]').first.click(); b.wait_for_timeout(200)
        b.select_option('#saleKind', 'once'); b.wait_for_timeout(200)
        once = (TODAY + timedelta(days=1)).isoformat()
        b.fill('#saleDate', once); b.wait_for_timeout(200)
        act(b, 'salesave'); b.wait_for_timeout(400)
        sales = b.evaluate("JSON.parse(localStorage.getItem('__fbdb'))['hh/deals'].sales")
        check(sales[1]['rule'] == {'k': 'once', 'date': once}, 'changed to a one-off sale tomorrow')
        close(b)
        act(b, 'go', 'home'); b.wait_for_timeout(300)
        notes = b.locator('.notice').all_inner_texts()
        check(any('Tong Li sale is tomorrow' in n and '10% off' in n for n in notes), 'a heads-up the day before a sale day: ' + ' | '.join(n.replace('\n', ' ') for n in notes))
        check('Tong Li' in b.locator('.next-sale').inner_text() and 'Tomorrow' in b.locator('.next-sale').inner_text(), 'and it is the next sale day on Home')
        b.locator('.notice:has-text("Tong Li") [data-act="noticex"]').click(); b.wait_for_timeout(200)
        check(not any('Tong Li' in n for n in b.locator('.notice').all_inner_texts()), 'closed')
        act(b, 'salemonthgo'); b.wait_for_timeout(200)
        if b.locator(f'.dialog [data-act="saleopen"][data-arg="{sales[1]["id"]}"]').count() == 0:
            act(b, 'calmove', '1')
        b.locator(f'.dialog [data-act="saleopen"][data-arg="{sales[1]["id"]}"]').first.click(); b.wait_for_timeout(200)
        act(b, 'saledel'); b.wait_for_timeout(400)
        check(len(b.evaluate("JSON.parse(localStorage.getItem('__fbdb'))['hh/deals'].sales")) == 1, 'removed')
        close(b)
        act(b, 'go', 'home')

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

        # next week's half-price list, posted early, says when it starts
        feed_over['report_from'] = (TODAY + timedelta(days=1)).isoformat()
        a.reload(); a.wait_for_timeout(2500); act(a, 'go', 'deals'); a.wait_for_timeout(400)
        a.select_option('#spShop', 'Coles'); a.wait_for_timeout(250)
        rows = a.locator('#spList .sp-row').all_inner_texts()
        d1 = TODAY + timedelta(days=1)
        starts = 'from ' + d1.strftime('%a ') + str(d1.day) + d1.strftime(' %b')
        check(rows and all(starts in r for r in rows), 'specials that start tomorrow say so: ' + (rows[0].replace('\n', ' | ') if rows else 'none'))
        browser.close()
finally:
    server.terminate()

print('\nproblems:', json.dumps(problems, indent=1) if problems else 'none')
print('FAILURES:', len(failures))
sys.exit(1 if failures or problems else 0)
