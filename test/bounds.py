"""Every field, button and card stays inside the screen and inside its card, at 320px and 390px wide.

Runs the home-screen web app against the Firebase test double and visits each screen and dialog.
(iOS sizes date fields its own way, so the stylesheet also sets them to shrink; this test covers the rest.)"""
import json
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import ai_fake
import deals_fixture
import pathlib
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
PORT = 8772
BASE = f'http://127.0.0.1:{PORT}/pwa/site/index.html'
TEST_CONFIG = "window.HH_FIREBASE = { apiKey: 'test-key', authDomain: 'test-project.firebaseapp.com', projectId: 'test-project', appId: '1:1:web:1' };"
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


def check(cond, msg):
    print(('ok   ' if cond else 'FAIL ') + msg)
    if not cond:
        failures.append(msg)


def act(page, a, arg=None):
    sel = f'[data-act="{a}"]' + (f'[data-arg="{arg}"]' if arg is not None else '')
    page.locator(sel).first.click()
    page.wait_for_timeout(150)


def audit(page, where, width):
    bad = page.evaluate(AUDIT)
    check(not bad, f'{width}px, {where}: everything in bounds' + ('' if not bad else ': ' + '; '.join(bad[:4])))


server = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'], cwd=ROOT,
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        for width in (320, 390):
            ctx = browser.new_context(reduced_motion='reduce', viewport={'width': width, 'height': 740}, device_scale_factor=2, is_mobile=True, has_touch=True,
                                      locale='en-AU', timezone_id='Australia/Sydney')
            ctx.add_init_script(path=str(ROOT / 'test' / 'firebase-mock.js'))
            ctx.route('**/firebase-config.js', lambda r: r.fulfill(status=200, content_type='text/javascript', body=TEST_CONFIG))
            ctx.route('**/firebase-*-compat.js', lambda r: r.fulfill(status=200, content_type='text/javascript', body='/* test double */'))
            ctx.route('https://fonts.googleapis.com/**', lambda r: r.abort())
            ai_fake.route(ctx)
            ctx.add_init_script("window.HH_DEALS_URL = '%s';" % deals_fixture.URL)
            ctx.route(deals_fixture.URL, lambda r: r.fulfill(status=200, content_type='application/json', headers={'Access-Control-Allow-Origin': '*'},
                                                             body=json.dumps(deals_fixture.feed(datetime.now(ZoneInfo('Australia/Sydney')).date().isoformat()))))
            a = ctx.new_page()
            a.on('pageerror', lambda e: problems.append(f'pageerror {e}'))
            a.goto(BASE); a.wait_for_timeout(500)
            a.evaluate("() => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('__fbrules', JSON.stringify(['robin@example.com', 'jules@example.com'])); }")
            a.reload(); a.wait_for_timeout(600)
            audit(a, 'sign in', width)
            act(a, 'aumode', 'create'); a.fill('#auemail', 'robin@example.com'); a.fill('#aupw', 'correct horse 1')
            act(a, 'aucreate'); a.wait_for_timeout(300)
            a.evaluate("(e) => window.__fbVerify(e)", 'robin@example.com'); act(a, 'auverified')
            a.wait_for_load_state('load'); a.wait_for_timeout(700)
            audit(a, 'setup', width)
            a.fill('#sna', 'Robin'); a.fill('#snb', 'Jules'); act(a, 'sme', 'a'); act(a, 'snext')
            a.fill('#sbudget', '2000'); act(a, 'snext'); act(a, 'sfinish'); a.wait_for_timeout(500)
            audit(a, 'home', width)
            # a day of spends with notes
            act(a, 'add')
            for k in ['7', '7', '+', '1', '3', '.', '5', '0', '+', '4', '2']:
                act(a, 'key', k)
            a.fill('#lnNote0', 'Crepes at the market with a long note that keeps going'); a.fill('#lnNote1', 'Coffee')
            audit(a, 'add a spend, with lines', width)
            act(a, 'saveadd'); a.wait_for_timeout(300)
            # Customise: every date field, the rent and points rows
            act(a, 'go', 'settings'); audit(a, 'settings', width)
            act(a, 'go', 'custom')
            a.check('#drenton'); a.wait_for_timeout(150)
            a.fill('#drentamt', '250'); a.fill('#drentstart', '2026-10-04')
            act(a, 'cspot', 'countdown'); a.fill('#dstext', 'Adelaide'); a.fill('#dsdate', '2027-01-04')
            a.fill('#dpbal', '50,000'); a.fill('#dpasof', '2026-10-10'); a.fill('#dcfrom', '2026-10-01')
            audit(a, 'customise, with dates filled in', width)
            # the iPhone bug that was reported: a date field wider than its card. The check has to catch it, and the fix has to be on.
            a.add_style_tag(content='#dsdate { width: 600px !important; min-width: 600px !important; }')
            check(any('dsdate' in b for b in a.evaluate(AUDIT)), f'{width}px: the check catches a date field wider than its card')
            a.evaluate("() => document.querySelectorAll('style').forEach((s) => { if (s.textContent.includes('600px !important')) s.remove(); })")
            cs = a.evaluate("() => [...document.querySelectorAll('input[type=date].input')].map((el) => { const c = getComputedStyle(el); return [c.minWidth, c.appearance || c.webkitAppearance, c.display].join(' '); })")
            check(len(cs) == 4 and all(c == '0px none block' for c in cs), f'{width}px: all 4 date fields in Customise can shrink to their card')
            act(a, 'savecustom'); a.wait_for_timeout(300)
            act(a, 'go', 'home'); act(a, 'go', 'settings'); act(a, 'go', 'profile'); audit(a, 'profiles', width)
            act(a, 'go', 'settings'); act(a, 'go', 'newsedit'); audit(a, 'notes editor', width)
            act(a, 'newspreview'); audit(a, 'note preview', width); act(a, 'newsok')
            act(a, 'go', 'home'); audit(a, 'home with spends', width)
            act(a, 'billsopen')
            a.fill('#billName', 'Strata levy for the building'); a.fill('#billAmt', '1516.25'); a.select_option('#billEvery', 'quarter'); a.fill('#billFrom', '2026-11-20')
            act(a, 'billadd'); a.wait_for_timeout(200)
            audit(a, 'regular bills dialog', width)
            a.locator('.dialog [data-act="dlgclose"]').first.click(); a.wait_for_timeout(200); a.wait_for_timeout(200)
            check('Strata levy for the building' in a.locator('section.soon').inner_text(), f'{width}px: an added bill shows in Coming up')
            audit(a, 'home with Coming up', width)
            act(a, 'go', 'cal'); audit(a, 'calendar', width)
            act(a, 'go', 'deals'); a.wait_for_timeout(400); audit(a, 'deals', width)
            act(a, 'salemonth'); a.wait_for_timeout(200); audit(a, 'sale days panel', width)
            act(a, 'saleidea', 'luckymart'); a.wait_for_timeout(200)
            a.locator('.dialog .cal-day.sale').first.click(); a.wait_for_timeout(200); audit(a, 'sale days panel with a day picked', width)
            a.locator('.dialog [data-act="saleadd"]').first.click(); a.wait_for_timeout(200); audit(a, 'sale day dialog', width)
            a.select_option('#saleKind', 'once'); a.wait_for_timeout(200); audit(a, 'sale day dialog, one day', width)
            a.locator('.dialog [data-act="dlgclose"]').first.click(); a.wait_for_timeout(200)
            a.locator('.dialog [data-act="saleopen"]').first.click(); a.wait_for_timeout(200); audit(a, 'editing a sale day', width)
            a.locator('.dialog [data-act="dlgclose"]').first.click(); a.wait_for_timeout(200)
            a.locator('.dialog [data-act="saleadd"]').first.click(); a.fill('#saleStore', 'A shop with quite a long name'); a.fill('#saleOffer', '20% off everything in store')
            a.select_option('#saleKind', 'once'); a.wait_for_timeout(150)
            a.fill('#saleDate', (datetime.now(ZoneInfo('Australia/Sydney')).date() + timedelta(days=1)).isoformat()); a.wait_for_timeout(150)
            act(a, 'salesave'); a.wait_for_timeout(200)
            a.locator('.dialog [data-act="dlgclose"]').first.click(); a.wait_for_timeout(200)
            act(a, 'watchopen'); a.wait_for_timeout(200)
            a.fill('#watchIn', 'weetbix'); a.press('#watchIn', 'Enter'); a.wait_for_timeout(200)
            a.fill('#watchIn', 'a long watch word here'); a.press('#watchIn', 'Enter'); a.wait_for_timeout(200)
            audit(a, 'watch list panel', width)
            a.locator('.dialog [data-act="dlgclose"]').first.click(); a.wait_for_timeout(200)
            a.locator('.sp-row .sp-add').first.click(); a.wait_for_timeout(200); audit(a, 'a special, to add to a list', width)
            act(a, 'listadd'); a.wait_for_timeout(200)
            act(a, 'shoplist'); a.wait_for_timeout(200)
            a.fill('#listIn', 'Something with quite a long name for a list'); a.press('#listIn', 'Enter'); a.wait_for_timeout(200)
            a.locator('.dialog .sl-tick').first.click(); a.wait_for_timeout(150)
            audit(a, 'weekend shopping list', width)
            a.locator('.dialog [data-act="dlgclose"]').first.click(); a.wait_for_timeout(200)
            act(a, 'spmore'); act(a, 'ozball'); audit(a, 'deals with a sale day, a watch list and every special', width)
            act(a, 'spwatch'); audit(a, 'deals, just the watch list', width)
            act(a, 'spwatch'); act(a, 'spaisle', 'pantry'); audit(a, 'deals, one aisle', width)
            act(a, 'go', 'home'); a.wait_for_timeout(200)
            check(a.locator('.notice').count() == 2, f'{width}px: two heads-ups on Home')
            audit(a, 'home with two heads-ups', width)
            for _ in range(2):
                a.locator('.notice [data-act="noticex"]').first.click(); a.wait_for_timeout(150)
            audit(a, 'home with a special and a sale day', width)
            act(a, 'go', 'settings'); act(a, 'go', 'upload'); audit(a, 'upload', width)
            a.evaluate("(r) => { window.__aiReply = r; }", ai_fake.reply(datetime.now(ZoneInfo('Australia/Sydney')).date().isoformat()))
            a.locator('input[data-change="rcpfile"]').first.set_input_files(str(ROOT / 'test' / 'photo-sample.png')); a.wait_for_timeout(900)
            a.locator('.rcp-who').nth(4).click(); a.wait_for_timeout(150)
            audit(a, 'checking a receipt', width)
            a.locator('.dialog [data-act="dlgclose"]').first.click(); a.wait_for_timeout(200)
            a.locator('.snap [data-act="aitoken"]').click(); a.wait_for_timeout(200)
            a.fill('#aiTokIn', 'not a token'); act(a, 'aitoksave'); audit(a, 'receipt reading setup', width)
            a.locator('.dialog [data-act="dlgclose"]').first.click(); a.wait_for_timeout(200)
            act(a, 'go', 'insights'); audit(a, 'insights, month', width)
            act(a, 'insmode', 'year'); audit(a, 'insights, year', width)
            a.locator('[data-act="inscat"]').first.click(); a.wait_for_timeout(200)
            a.locator('[data-act="inscatopen"]').first.click(); a.wait_for_timeout(200)
            audit(a, 'category dialog with a spend open', width)
            a.locator('.dialog [data-act="dlgclose"]').first.click(); a.wait_for_timeout(200)
            act(a, 'go', 'home'); act(a, 'add'); act(a, 'go', 'tab')
            if a.locator('[data-act="tabstart"]').count():
                act(a, 'tabstart')
            a.fill('#tabAmt', '12.50'); a.fill('#tabLabel', 'Ice cream'); act(a, 'tabadd')
            audit(a, 'day tab', width)
            ctx.close()
        browser.close()
finally:
    server.terminate()

print('\nproblems:', json.dumps(problems, indent=1) if problems else 'none')
print('FAILURES:', len(failures))
sys.exit(1 if failures or problems else 0)
