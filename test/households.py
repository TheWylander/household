"""Households: the original two move across when the new rules go live, a new couple starts their own and invites
their partner, invite codes, pilot features switched on by the owner, the shared shop specials, the owner's list and
lock check, a household that's deleted, and that one household can't open another's data."""
import json
import pathlib
import subprocess
import sys
import time
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import deals_fixture

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
SHOTS = ROOT / 'shots'
PORT = 8790 + int(__import__('os').environ.get('HH_PORT_SHIFT', '0'))
SITE = f'http://127.0.0.1:{PORT}/pwa/site/'
BASE = SITE + 'index.html'
TEST_CONFIG = "window.HH_FIREBASE = { apiKey: 'test-key', authDomain: 'test-project.firebaseapp.com', projectId: 'test-project', appId: '1:1:web:1' };"
FONT_CSS = (
    "@font-face{font-family:'Figtree';font-weight:300 900;src:url(http://127.0.0.1:%d/test/fonts/figtree.woff2) format('woff2')}"
    "@font-face{font-family:'Bricolage Grotesque';font-weight:200 800;src:url(http://127.0.0.1:%d/test/fonts/bricolage.woff2) format('woff2')}" % (PORT, PORT)
)
RULES = {'households': True, 'us': ['ari@example.com', 'noor@example.com'], 'admin': 'ari@example.com'}
failures, problems = [], []
AUDIT = """() => {
  const vw = document.documentElement.clientWidth, bad = [];
  const name = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).join('.') : '') + (el.getAttribute('data-act') ? '[' + el.getAttribute('data-act') + ']' : '');
  if (document.documentElement.scrollWidth > vw + 1) bad.push('page scrolls sideways: ' + document.documentElement.scrollWidth + 'px on a ' + vw + 'px screen');
  const seen = (el) => { const cs = getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0'; };
  document.querySelectorAll('.card, .kpi, .hero, .dialog, .savebar').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width && (r.left < -1 || r.right > vw + 1)) bad.push(name(el) + ' runs off the screen (' + Math.round(r.left) + ' to ' + Math.round(r.right) + ')');
  });
  document.querySelectorAll('.hscroll').forEach((el) => {
    const r = el.getBoundingClientRect(), box = el.closest('.card, .dialog'), b = box ? box.getBoundingClientRect() : { left: 0, right: vw };
    if (r.left < Math.max(0, b.left) - 1 || r.right > Math.min(vw, b.right) + 1) bad.push(name(el) + ' runs outside ' + (box ? name(box) : 'the screen'));
  });
  document.querySelectorAll('input, select, textarea, button, .chip, .seg').forEach((el) => {
    if (el.type === 'file' || el.type === 'hidden' || !seen(el) || el.closest('.nav') || el.closest('.date-chip') || el.closest('.hscroll')) return;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const box = el.parentElement && el.parentElement.closest('.card, .dialog, .hero, .kpi, .savebar');
    const b = box ? box.getBoundingClientRect() : { left: 0, right: vw };
    if (r.left < Math.max(0, b.left) - 1 || r.right > Math.min(vw, b.right) + 1) bad.push(name(el) + ' sits outside ' + (box ? name(box) : 'the screen') + ' (' + Math.round(r.left) + '-' + Math.round(r.right) + ' vs ' + Math.round(b.left) + '-' + Math.round(b.right) + ')');
  });
  return bad;
}"""


def narrow(page, where):
    """The same screen on a small phone, 320px wide: nothing runs off it."""
    page.set_viewport_size({'width': 320, 'height': 700}); page.wait_for_timeout(250)
    bad = page.evaluate(AUDIT)
    check(not bad, f'320px, {where}: everything in bounds' + ('' if not bad else ': ' + '; '.join(bad[:4])))
    page.set_viewport_size({'width': 390, 'height': 844}); page.wait_for_timeout(150)


def check(cond, msg):
    print(('ok   ' if cond else 'FAIL ') + msg)
    if not cond:
        failures.append(msg)


def act(page, a, arg=None, wait=150):
    sel = f'[data-act="{a}"]' + (f'[data-arg="{arg}"]' if arg is not None else '')
    page.locator(sel).first.click()
    page.wait_for_timeout(wait)


def text(page):
    return page.locator('#app').inner_text()


def shot(page, name, full=False):
    page.wait_for_timeout(250)
    page.screenshot(path=str(SHOTS / f'{name}.png'), full_page=full)


def db(page):
    return page.evaluate("JSON.parse(localStorage.getItem('__fbdb') || '{}')")


def watch(page, name):
    page.on('pageerror', lambda e: problems.append(f'{name}: pageerror {e}'))
    page.on('console', lambda m: problems.append(f'{name}: console {m.type}: {m.text}') if m.type == 'error' else None)
    return page


def create_login(page, email, pw='correct horse 1'):
    if page.locator('[data-act="aumode"][data-arg="create"]').count():
        act(page, 'aumode', 'create')
    page.fill('#auemail', email); page.fill('#aupw', pw)
    act(page, 'aucreate', wait=300)
    page.evaluate('(e) => window.__fbVerify(e)', email)
    act(page, 'auverified')
    page.wait_for_load_state('load'); page.wait_for_timeout(900)


def try_read(page, path, col=False):
    """What the raw Firestore answers this login for a path: 'open' or the error code."""
    return page.evaluate("""([p, col]) => { const fs = firebase.firestore(); const q = col ? fs.collection(p).get() : fs.doc(p).get();
      return q.then(() => 'open', (e) => e.code); }""", [path, col])


def try_write(page, path, data, merge=True):
    return page.evaluate("""([p, d, m]) => firebase.firestore().doc(p).set(d, m ? { merge: true } : undefined).then(() => 'saved', (e) => e.code)""", [path, data, merge])


server = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'], cwd=ROOT,
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx = browser.new_context(reduced_motion='reduce', viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True,
                                  locale='en-AU', timezone_id='Australia/Sydney', service_workers='block')
        ctx.add_init_script(path=str(ROOT / 'test' / 'firebase-mock.js'))
        ctx.route('**/firebase-config.js', lambda r: r.fulfill(status=200, content_type='text/javascript', body=TEST_CONFIG))
        ctx.route('**/firebase-*-compat.js', lambda r: r.fulfill(status=200, content_type='text/javascript', body='/* test double */'))
        ctx.route('https://fonts.googleapis.com/**', lambda r: r.fulfill(status=200, content_type='text/css', body=FONT_CSS))
        ctx.route('https://fonts.gstatic.com/**', lambda r: r.abort())
        TODAY = datetime.now(ZoneInfo('Australia/Sydney')).date()
        ctx.add_init_script("window.HH_DEALS_URL = '%s';" % deals_fixture.URL)
        ctx.add_init_script("window.HH_CUTOUT = () => null;")
        ctx.route(deals_fixture.URL, lambda r: r.fulfill(status=200, content_type='application/json', headers={'Access-Control-Allow-Origin': '*'},
                                                         body=json.dumps(deals_fixture.feed(TODAY.isoformat()))))

        # ---------- before: the one household, on the old rules ----------
        a = watch(ctx.new_page(), 'ari')
        a.goto(BASE); a.wait_for_timeout(300)
        a.evaluate("() => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('__fbrules', JSON.stringify(['ari@example.com', 'noor@example.com'])); }")
        a.reload(); a.wait_for_timeout(600)
        create_login(a, 'ari@example.com')
        check('Hello, you two' in text(a), 'on the old rules, the app starts as it always has')
        a.fill('#sna', 'Ari'); a.fill('#snb', 'Noor'); act(a, 'sme', 'a'); act(a, 'snext')
        a.fill('#sbudget', '2000'); act(a, 'snext'); act(a, 'sfinish', wait=500)
        act(a, 'addpick'); act(a, 'pickadd')
        for k in ['4', '2', '.', '5']:
            act(a, 'key', k)
        a.fill('#addTitle', 'Dinner'); act(a, 'saveadd', wait=400)
        to = (TODAY + timedelta(days=4)).isoformat()
        a.evaluate("""(to) => { const d = JSON.parse(localStorage.getItem('__fbdb')), at = new Date().toISOString();
          d['hh/deals'] = Object.assign({ sales: [], list: [], watch: ['mango'] }, d['hh/deals'] || {}, { web: { at, by: 'a', to,
            items: ['Coles\\tColes Medium Calypso Mangoes\\t290\\t0\\tBuy 2 for $5\\tFruit & Veg\\tFruit\\t/product/coles-medium-calypso-mangoes-1-each-8925050'],
            shops: { Coles: { at, by: 'a', to, n: 1 } } } });
          localStorage.setItem('__fbdb', JSON.stringify(d)); }""", to)
        top = db(a)
        check('hh/settings' in top and not any(k.startswith('households/') for k in top), 'the data is at the top, as before')

        b = watch(ctx.new_page(), 'noor')
        b.goto(BASE); b.wait_for_timeout(600)
        create_login(b, 'noor@example.com')
        if b.locator('[data-act="welcomein"]').count():
            act(b, 'welcomein', wait=400)
        check('Hi Noor' in text(b), "Noor's in, on the old rules")

        # a stranger on the old rules is turned away, as before
        x = watch(ctx.new_page(), 'stranger')
        x.goto(BASE); x.wait_for_timeout(500)
        create_login(x, 'sam@example.com')
        check("isn't one of the two emails" in text(x), 'before the new rules, other logins are turned away as before')
        x.close()

        # ---------- the new rules are published; Ari opens the app ----------
        a.evaluate("(r) => localStorage.setItem('__fbrules', JSON.stringify(r))", RULES)
        a.reload(); a.wait_for_timeout(1800)
        t = text(a)
        d = db(a)
        hid = (d.get('users/uid-ari') or {}).get('hid')
        H = d.get('households/%s' % hid) or {}
        check(bool(hid) and 'Hi Ari' in t, 'Ari opens straight into the moved-across household: ' + str(hid))
        check(H.get('legacy') is True and H.get('pilot') == {'splitwise': True, 'insights': True} and H.get('members') == ['uid-ari'] and H.get('emails') == ['ari@example.com'],
              'it is marked as the original, with every pilot feature on: ' + json.dumps(H)[:200])
        moved = [k for k in d if k.startswith('households/%s/months/' % hid)]
        check(('households/%s/hh/settings' % hid) in d and moved and any(v and v.get('title') == 'Dinner' for m in moved for v in d[m]['entries'].values()),
              'settings and spends moved inside it')
        check((d.get('hh/migrated') or {}).get('hid') == hid and 'hh/settings' in d, 'the old copy stays, read-only, with a note of where it went')
        web = d.get('shared/web') or {}
        check(len(web.get('items') or []) == 1 and 'hid' not in web, 'the website specials became the shared copy, without saying whose household')
        check(H.get('label') == 'Ari & Noor', 'the household is labelled with both names: ' + str(H.get('label')))
        check(a.locator('.nav [data-arg="insights"]').count() == 1, 'Insights is still in the bottom bar')
        check('Get set up' not in t, 'no getting-started list for the original household')
        act(a, 'go', 'settings')
        t = text(a)
        check('Households' in t and 'Just for you' in t, "the owner's list is in Settings")
        check('joins by opening the app once' in t, 'Settings says Noor joins by opening the app')
        check('Delete our household' not in t, "the original household can't be deleted from the app")
        shot(a, 'hh01-ari-settings', full=True)

        # Noor opens it and joins
        b.reload(); b.wait_for_timeout(1500)
        d = db(b)
        check((d.get('users/uid-noor') or {}).get('hid') == hid and d['households/%s' % hid]['members'] == ['uid-ari', 'uid-noor'], 'Noor joins the same household')
        t = text(b)
        check('Hi Noor' in t, "Noor's phone carries on as before")
        act(b, 'go', 'settings')
        check('Households' not in text(b).split('How to use Two of Us')[1][:200] if 'How to use Two of Us' in text(b) else False, "Noor doesn't get the owner's list")
        act(b, 'go', 'home')

        # a move that stopped part way picks up without writing over what's been saved since
        a.evaluate("""(hid) => { const d = JSON.parse(localStorage.getItem('__fbdb'));
          d['households/' + hid + '/hh/settings'].goal = { name: 'Japan', target: 500000, saved: 0 };
          delete d['users/uid-ari']; localStorage.setItem('__fbdb', JSON.stringify(d)); }""", hid)
        a.reload(); a.wait_for_timeout(1800)
        d = db(a)
        check((d.get('users/uid-ari') or {}).get('hid') == hid and (d['households/%s/hh/settings' % hid].get('goal') or {}).get('name') == 'Japan' and 'Hi Ari' in text(a),
              "picking up a stopped move keeps what was saved since")

        # ---------- a new couple ----------
        r = watch(ctx.new_page(), 'robin')
        r.goto(BASE); r.wait_for_timeout(600)
        create_login(r, 'robin@example.com')
        t = text(r)
        check('Welcome to Two of Us' in t and 'Start our household' in t and 'I have an invite code' in t, 'a new login gets the choice to start or join')
        check(r.locator('details.gate-privacy').count() == 1, 'with how their data is kept')
        shot(r, 'hh02-start')
        narrow(r, 'start or join')
        act(r, 'gatestart', wait=900)
        t = text(r)
        d = db(r)
        rhid = (d.get('users/uid-robin') or {}).get('hid')
        RH = d.get('households/%s' % rhid) or {}
        check(bool(rhid) and rhid != hid and 'Hello, you two' in t, 'Start our household goes to setup, in a new household')
        check(RH.get('members') == ['uid-robin'] and 'pilot' not in RH and 'legacy' not in RH, 'just Robin, no pilot features yet')
        r.fill('#sna', 'Robin'); r.fill('#snb', 'Jules'); act(r, 'sme', 'a'); act(r, 'snext')
        check(r.locator('#sbudget').count() == 0 and 'How you share' in text(r), 'no budget step while Insights and budgets is a pilot')
        act(r, 'snext'); act(r, 'sfinish', wait=700)
        t = text(r)
        check('Hi Robin' in t and 'Get set up' in t and 'Invite Jules' in t, 'home has the getting-started list')
        check('Set a monthly budget' not in t, 'no budget on Home')
        check(r.locator('.nav [data-arg="insights"]').count() == 0 and r.locator('.nav [data-arg="settings"]').count() == 1, 'Settings takes the place of Insights')
        check(db(r)['households/%s' % rhid].get('label') == 'Robin & Jules', 'labelled with their names')
        shot(r, 'hh03-robin-home', full=True)
        narrow(r, 'home with the guide')

        # one household can't open another's
        check(try_read(r, 'households/%s/hh/settings' % hid) == 'permission-denied', "Robin can't open the original household's settings")
        check(try_read(r, 'households/%s/months' % hid, col=True) == 'permission-denied', "or its spends")
        check(try_read(r, 'households', col=True) == 'permission-denied', "or list the households")
        check(try_read(r, 'hh/settings') == 'permission-denied', "or the old copy at the top")
        check(try_read(r, 'households/%s' % hid) == 'permission-denied', "or the household itself")
        check(try_write(r, 'households/%s' % rhid, {'pilot': {'insights': True}}) == 'permission-denied', "and can't switch pilot features on for themselves")
        check(try_write(r, 'households/%s' % hid, {'members': ['uid-ari', 'uid-robin']}) == 'permission-denied', "or add themselves to another household")
        check(try_write(r, 'shared/web', {'items': []}, merge=False) == 'permission-denied', "or change the shared specials")
        check(try_write(r, 'users/uid-ari', {'hid': rhid}, merge=False) == 'permission-denied', "or point someone else's login")
        check(try_read(r, 'admin/flag') == 'permission-denied', 'and the app knows Robin is not the owner')
        check(try_write(r, 'users/uid-robin', {'hid': hid}, merge=False) == 'permission-denied', "Robin can't point their own login at another household")
        check(try_write(r, 'households/%2e%2e', {'owner': 'uid-robin', 'members': ['uid-robin'], 'emails': ['robin@example.com']}, merge=False) == 'permission-denied',
              'a household id that could read as a path is refused')
        check(try_write(r, 'households/%s/hh/anything' % rhid, {'x': 1}, merge=False) == 'permission-denied', 'only the documents the app uses can be saved in a household')
        check(try_write(r, 'households/%s/months/x' % rhid, {'x': 1}, merge=False) == 'permission-denied', 'and months are named YYYY-MM')
        check(try_write(r, 'invites/abcdefghjk23', {'hid': rhid, 'by': 'uid-robin', 'at': 9999999999999}, merge=False) == 'permission-denied', "an invite can't be dated in the future")

        # the shared specials reach them, without whose laptop
        act(r, 'go', 'deals', wait=900)
        t = text(r)
        r.fill('#spQ', 'calypso'); r.wait_for_timeout(500)
        check('Calypso Mangoes' in text(r), "the Coles specials from the owner's laptop show for the new couple")
        r.fill('#spQ', ''); r.wait_for_timeout(300)
        check('laptop' not in t and 'Ari' not in t, "without saying whose laptop: " + ([l for l in t.split('\n') if 'Coles fresh food' in l] or [''])[0][:160])
        act(r, 'go', 'home')

        # Splitwise import is a pilot
        act(r, 'go', 'settings'); act(r, 'go', 'upload')
        check('Moving from Splitwise' not in text(r), 'no Splitwise import while it is a pilot')
        act(r, 'go', 'settings')
        check('Splitwise' not in text(r), 'and Settings leaves it out')

        # the guide's steps
        act(r, 'go', 'home'); act(r, 'a2hs')
        check('Add to Home Screen' in r.locator('.dialog').inner_text(), 'how to put it on the Home Screen')
        r.locator('.dialog [data-act="dlgclose"]').first.click(); r.wait_for_timeout(150)
        act(r, 'gohelp')
        t = text(r)
        check('Using Two of Us' in t and 'Pilot features' in t and 'Splitwise import' in t and 'Your data' in t, 'Help covers each part, the pilot features and their data')
        shot(r, 'hh04-help', full=True)
        narrow(r, 'help')
        act(r, 'go', 'home')
        check(r.locator('[data-guide="help"][disabled]').count() == 1, 'Help is ticked off')

        # invite Jules
        act(r, 'guideinvite', wait=600)
        code = r.locator('#invCode').inner_text().strip()
        d = db(r)
        check(len(code) == 12 and (d.get('invites/' + code) or {}).get('hid') == rhid and d['invites/' + code].get('label') == 'Robin & Jules', 'an invite code for their household: ' + code)
        shot(r, 'hh05-invite')
        narrow(r, 'the invite')

        j = watch(ctx.new_page(), 'jules')
        j.goto(BASE + '?join=' + code); j.wait_for_timeout(700)
        check("You're invited" in text(j) and 'join=' not in j.url, 'the invite link opens on making a login, and the code leaves the address')
        create_login(j, 'jules@example.com')
        t = text(j)
        check("Join Robin & Jules's household?" in t, 'Jules is asked to join Robin & Jules: ' + t[:120].replace('\n', ' | '))
        narrow(j, 'join confirm')
        act(j, 'gateconfirm', wait=1200)
        t = text(j)
        d = db(j)
        check(d['households/%s' % rhid]['members'] == ['uid-robin', 'uid-jules'] and d['invites/' + code].get('usedBy') == 'uid-jules', 'Jules is in, and the code is used up')
        check('Welcome home, Jules' in t, "Jules gets the welcome tour from Robin")
        act(j, 'welcomein', wait=400)
        check('Hi Jules' in text(j), "Jules is in")
        r.wait_for_timeout(400)
        act(r, 'go', 'settings')
        check("You're both in" in text(r), "Robin's Settings says they're both in")
        act(r, 'go', 'home')
        check(r.locator('[data-guide="invite"][disabled]').count() == 1, 'and the guide ticks off the invite')

        # a used code doesn't work again, and a third person can't get in
        y = watch(ctx.new_page(), 'third')
        y.goto(BASE + '?join=' + code); y.wait_for_timeout(600)
        create_login(y, 'pat@example.com')
        check('already been used' in text(y), 'a used code is refused')
        act(y, 'gateback')
        check('Welcome to Two of Us' in text(y), 'and they can start their own instead')
        check(try_write(y, 'households/%s' % rhid, {'members': ['uid-robin', 'uid-jules', 'uid-pat']}) == 'permission-denied', 'a full household takes no one else')
        y.close()

        # ---------- the owner's list ----------
        act(a, 'go', 'home'); act(a, 'go', 'settings'); act(a, 'go', 'admin', wait=900)
        t = text(a)
        check('2 households' in t and 'Robin & Jules' in t and 'robin@example.com' in t and 'Ari & Noor' in t, "the owner's list shows both households: " + t[:200].replace('\n', ' | '))
        act(a, 'lockcheck', wait=600)
        check(a.locator('#lockResult[data-ok="1"]').count() == 1, 'the lock check passes: ' + (a.locator('#lockResult').inner_text() if a.locator('#lockResult').count() else 'none'))
        shot(a, 'hh06-admin', full=True)
        narrow(a, "the owner's list")
        act(a, 'adminpilot', rhid + '|insights', wait=700)
        check((db(a)['households/%s' % rhid].get('pilot') or {}).get('insights') is True, 'the owner switches Insights and budgets on for Robin & Jules')
        r.wait_for_timeout(500)
        check(r.locator('.nav [data-arg="insights"]').count() == 1, "and Insights appears on Robin's phone straight away")
        check(try_read(a, 'households/%s/hh/settings' % rhid) == 'permission-denied', "the owner still can't open their spends")

        # ---------- deleting a household ----------
        act(r, 'go', 'settings'); act(r, 'hhdelete')
        check('Delete your household?' in r.locator('.dialog').inner_text(), 'deleting asks first')
        act(r, 'dlghhdelete', wait=200)
        r.wait_for_load_state('load'); r.wait_for_timeout(1200)
        d = db(r)
        check(not any(k.startswith('households/%s' % rhid) for k in d) and 'users/uid-robin' not in d, 'everything in it is gone')
        check('Welcome to Two of Us' in text(r), 'Robin can start again')
        j.wait_for_timeout(600)
        check('This household has gone' in text(j), "Jules's phone says it has gone")
        act(j, 'gonestart', wait=200)
        j.wait_for_load_state('load'); j.wait_for_timeout(900)
        check('Welcome to Two of Us' in text(j), 'and Jules can start again too')
        check(hid and ('households/%s' % hid) in db(a), "the original household is untouched")

        # ---------- the other way round: both phones open the new version at once ----------
        ctx.close()
        ctx = browser.new_context(reduced_motion='reduce', viewport={'width': 390, 'height': 844}, locale='en-AU', timezone_id='Australia/Sydney', service_workers='block')
        ctx.add_init_script(path=str(ROOT / 'test' / 'firebase-mock.js'))
        ctx.route('**/firebase-config.js', lambda r: r.fulfill(status=200, content_type='text/javascript', body=TEST_CONFIG))
        ctx.route('**/firebase-*-compat.js', lambda r: r.fulfill(status=200, content_type='text/javascript', body='/* test double */'))
        ctx.add_init_script("window.HH_DEALS_URL = '%s';" % deals_fixture.URL)
        ctx.add_init_script("window.HH_CUTOUT = () => null;")
        ctx.route(deals_fixture.URL, lambda r: r.fulfill(status=200, content_type='application/json', headers={'Access-Control-Allow-Origin': '*'},
                                                         body=json.dumps(deals_fixture.feed(TODAY.isoformat()))))
        a = watch(ctx.new_page(), 'ari2')
        a.goto(BASE); a.wait_for_timeout(300)
        a.evaluate("() => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('__fbrules', JSON.stringify(['ari@example.com', 'noor@example.com'])); }")
        a.reload(); a.wait_for_timeout(600)
        create_login(a, 'ari@example.com')
        a.fill('#sna', 'Ari'); a.fill('#snb', 'Noor'); act(a, 'sme', 'a'); act(a, 'snext'); act(a, 'snext'); act(a, 'sfinish', wait=500)
        a.evaluate("""(to) => { const d = JSON.parse(localStorage.getItem('__fbdb')), at = new Date().toISOString();
          d['hh/deals'] = Object.assign({ sales: [], list: [], watch: [] }, d['hh/deals'] || {}, { web: { at, by: 'a', to,
            items: ['Coles\\tColes Medium Calypso Mangoes\\t290\\t0\\t\\tFruit & Veg\\tFruit\\t/product/x-1'], shops: { Coles: { at, by: 'a', to, n: 1 } } } });
          localStorage.setItem('__fbdb', JSON.stringify(d)); }""", to)
        b = watch(ctx.new_page(), 'noor2')
        b.goto(BASE); b.wait_for_timeout(600)
        create_login(b, 'noor@example.com')
        if b.locator('[data-act="welcomein"]').count():
            act(b, 'welcomein', wait=400)
        a.evaluate("(r) => localStorage.setItem('__fbrules', JSON.stringify(r))", RULES)
        b.reload(); a.reload()
        a.wait_for_timeout(2500); b.wait_for_timeout(500)
        d = db(a)
        homes = [k for k in d if k.count('/') == 1 and k.startswith('households/')]
        ha, hb = (d.get('users/uid-ari') or {}).get('hid'), (d.get('users/uid-noor') or {}).get('hid')
        check(len(homes) == 1 and ha and ha == hb, 'opened at the same moment, they still end up in one household: ' + str(homes))
        H = d.get(homes[0]) if homes else {}
        check(sorted(H.get('members') or []) == ['uid-noor', 'uid-ari'] and H.get('pilot') == {'splitwise': True, 'insights': True}, 'both in, with the pilot features on')
        check('Hi Ari' in text(a) and 'Hi Noor' in text(b), 'both phones open normally')
        check(len((d.get('shared/web') or {}).get('items') or []) == 1, "the shared specials are filled whichever phone moved it")

        browser.close()
finally:
    server.terminate()

print()
print('problems:', '; '.join(problems) if problems else 'none')
print('FAILURES:', len(failures))
sys.exit(1 if failures or problems else 0)
