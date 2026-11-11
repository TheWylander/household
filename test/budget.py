"""The "Counts towards our monthly budget" box: when adding or editing a spend, closing a day tab and checking a receipt.
A spend marked not in the budget still splits and moves the balance, is marked "Not in budget" where it's listed, and
is left out of what Home, Insights and the year's bars count against the budget, with a note so the numbers add up."""
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

ROOT = pathlib.Path(__file__).resolve().parent.parent
SHOTS = ROOT / 'shots'
SHOTS.mkdir(exist_ok=True)
PORT = 8775 + int(__import__('os').environ.get('HH_PORT_SHIFT', '0'))
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


def titled(page, title):
    return [e for e in entries(page) if e.get('title') == title]


def home_sub(page):
    return page.locator('.hero .hero-sub').first.inner_text().replace('\n', ' | ')


def open_add(page):
    act(page, 'go', 'home'); act(page, 'addpick'); act(page, 'pickadd')


def add_spend(page, keys, title, cat, untick=False):
    open_add(page)
    for k in keys:
        act(page, 'key', k)
    page.fill('#addTitle', title)
    act(page, 'addcat', cat)
    act(page, 'addpayer', 'a')
    if untick:
        page.locator('#addBudget').uncheck()
        page.wait_for_timeout(100)
    act(page, 'saveadd')
    page.wait_for_timeout(300)


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
        a.fill('#sna', 'Robin'); a.fill('#snb', 'Jules'); act(a, 'sme', 'a'); act(a, 'snext'); a.fill('#sbudget', '2000'); act(a, 'snext')
        for c in ['Groceries', 'Eating out']:
            act(a, 'scat', c)
        a.fill('#snewcat', 'Bills'); act(a, 'saddcat')
        act(a, 'sfinish'); a.wait_for_timeout(500)
        check('Left to spend' in a.locator('#app').inner_text(), 'set up with a $2,000 budget')

        # ---------- adding: the box starts ticked, and can be unticked ----------
        open_add(a)
        for k in ['1', '2', '0']:
            act(a, 'key', k)
        a.fill('#addTitle', 'Concert tickets'); act(a, 'addcat', 'Eating out'); act(a, 'addpayer', 'a')
        box = a.locator('#addBudget')
        row = a.locator('label.check-row', has=box)
        check(box.count() == 1 and box.is_checked() and row.inner_text().strip() == 'Counts towards our monthly budget', 'adding a spend: the budget box is there, ticked')
        box.uncheck(); a.wait_for_timeout(100)
        box.scroll_into_view_if_needed(); a.wait_for_timeout(150)
        a.screenshot(path=str(SHOTS / 'b01-add-budget-box.png'))
        act(a, 'saveadd'); a.wait_for_timeout(400)
        e1 = titled(a, 'Concert tickets')
        check(len(e1) == 1 and e1[0].get('offBudget') is True and e1[0]['owed'] == {'a': 6000, 'b': 6000} and e1[0]['paid'] == {'a': 12000, 'b': 0},
              'saved as not in the budget, and split as usual: ' + json.dumps({k: e1[0].get(k) for k in ('offBudget', 'owed', 'paid')} if e1 else {}))
        t, sub = a.locator('#app').inner_text(), home_sub(a)
        check('$2,000' in a.locator('.hero .hero-v').first.inner_text(), 'Home: the whole budget is still left')
        check('Spent $0.00 of $2,000' in sub and '+ $120.00 not in the budget' in sub, 'Home says what was spent against the budget, and what was left out: ' + sub)
        check('Jules owes you' in t and '$60.00' in t, 'it still counts in the balance: Jules owes Robin half')

        add_spend(a, ['8', '0'], 'Groceries run', 'Groceries')
        e2 = titled(a, 'Groceries run')
        check(len(e2) == 1 and e2[0].get('offBudget') is False, 'the next spend starts ticked again and counts')
        sub = home_sub(a)
        check('Spent $80.00 of $2,000' in sub and '+ $120.00 not in the budget' in sub and '$1,920' in a.locator('.hero .hero-v').first.inner_text(),
              'Home: $80 against the budget, $1,920 left, and the $120 left out: ' + sub)
        a.evaluate('window.scrollTo(0, 0)'); a.wait_for_timeout(150)
        a.screenshot(path=str(SHOTS / 'b02-home-not-in-budget.png'))

        # ---------- where it's listed ----------
        act(a, 'go', 'cal'); act(a, 'selday', str(TODAY))
        day = a.locator('#dayCard')
        marked = day.locator('li.entry', has=a.locator('.tag', has_text='Not in budget'))
        check(marked.count() == 1 and 'Concert tickets' in marked.first.inner_text() and day.locator('.tag', has_text='Not in budget').count() == 1,
              "the Calendar day marks the spend that's not in the budget, and only that one")

        # ---------- editing: the box shows how it was saved, and can change ----------
        act(a, 'edit', e1[0]['id'])
        check(a.locator('#addBudget').count() == 1 and not a.locator('#addBudget').is_checked(), 'editing shows it unticked')
        a.locator('#addBudget').check(); a.wait_for_timeout(100); act(a, 'saveadd'); a.wait_for_timeout(300)
        check(titled(a, 'Concert tickets')[0].get('offBudget') is False, 'ticking it saves it as counting')
        act(a, 'go', 'home')
        sub = home_sub(a)
        check('Spent $200.00 of $2,000' in sub and 'not in the budget' not in sub, 'Home counts it again, with no note: ' + sub)
        act(a, 'go', 'cal'); act(a, 'selday', str(TODAY))
        check(a.locator('#dayCard .tag', has_text='Not in budget').count() == 0, 'and the Calendar drops the marker')
        act(a, 'edit', e1[0]['id'])
        check(a.locator('#addBudget').is_checked(), 'and editing again shows it ticked')
        a.locator('#addBudget').uncheck(); a.wait_for_timeout(100); act(a, 'saveadd'); a.wait_for_timeout(300)
        check(titled(a, 'Concert tickets')[0].get('offBudget') is True, 'unticked again')

        # ---------- Insights ----------
        act(a, 'go', 'insights')
        hero = a.locator('.hero').first.inner_text().replace('\n', ' | ')
        check('$200' in hero and '$80 counts towards the $2,000 budget' in hero and 'Under by $1,920' in hero,
              'Insights: all shared spend, and what counts towards the budget: ' + hero)
        a.evaluate('window.scrollTo(0, 0)'); a.wait_for_timeout(150)
        a.screenshot(path=str(SHOTS / 'b03-insights.png'))
        act(a, 'inscat', 'Eating out')
        dlg = a.locator('.dialog')
        check(dlg.locator('.cr-nb').count() == 1 and 'Not in budget' in dlg.locator('.cat-row', has_text='Concert tickets').inner_text(), "the category's spends mark it too")
        act(a, 'dlgclose')
        act(a, 'insmode', 'year')
        check('Bars show what counts towards the budget, so they leave out spends marked not in it.' in a.locator('#app').inner_text(), "the year's bars say what they leave out")
        act(a, 'insmode', 'month')

        # ---------- a category left out in Customise: the box says so ----------
        act(a, 'go', 'home'); act(a, 'go', 'settings'); act(a, 'go', 'custom')
        act(a, 'cskip', 'Bills'); act(a, 'savecustom'); a.wait_for_timeout(300)
        open_add(a)
        for k in ['5', '0']:
            act(a, 'key', k)
        act(a, 'addcat', 'Bills')
        check(a.locator('#addBudget').is_disabled() and not a.locator('#addBudget').is_checked() and 'Bills is left out of the budget in Customise.' in a.locator('#app').inner_text(),
              'with Bills left out of the budget, the box shows unticked and says why')
        act(a, 'addcat', 'Groceries')
        check(a.locator('#addBudget').is_enabled() and a.locator('#addBudget').is_checked(), 'another category brings the box back, ticked')
        act(a, 'addcat', 'Bills')
        a.fill('#addTitle', 'Water bill'); act(a, 'saveadd'); a.wait_for_timeout(300)
        check(titled(a, 'Water bill')[0].get('offBudget') is False, "a Bills spend isn't marked: it's out because of its category")
        sub = home_sub(a)
        check('Spent $80.00 of $2,000' in sub and 'Not counting Bills' in sub and '+ $120.00 not in the budget' in sub, 'Home: Bills not counted, and the marked spend noted once: ' + sub)

        # ---------- closing a day tab ----------
        open_add(a); act(a, 'go', 'tab'); act(a, 'tabstart'); a.wait_for_timeout(200)
        a.fill('#tabAmt', '30'); a.fill('#tabLabel', 'Picnic'); act(a, 'tabadd'); a.wait_for_timeout(200)
        act(a, 'tabclose')
        check(a.locator('#dlgBudget').count() == 1 and a.locator('#dlgBudget').is_checked(), 'closing a tab: the box is there, ticked')
        a.locator('#dlgBudget').uncheck(); a.wait_for_timeout(100)
        act(a, 'dlgcat', 'Eating out')
        check(not a.locator('#dlgBudget').is_checked(), 'picking a category keeps it unticked')
        act(a, 'dlgtabclose'); a.wait_for_timeout(400)
        tab = titled(a, 'Day out')
        check(len(tab) == 1 and tab[0].get('offBudget') is True and tab[0]['amount'] == 3000, 'the tab saves as one spend, not in the budget')

        # ---------- checking a receipt ----------
        act(a, 'go', 'home'); act(a, 'go', 'settings'); act(a, 'go', 'upload')
        a.evaluate("([r, m]) => { window.__aiReply = r; window.__aiMode = m; window.__aiCalls = []; }", [ai_fake.reply(str(TODAY)), 'ok'])
        a.locator('input[data-change="rcpfile"]').first.set_input_files(PHOTO)
        a.wait_for_timeout(900)
        check(a.locator('#rcpBudget').count() == 1 and a.locator('#rcpBudget').is_checked(), 'checking a receipt: the box is there, ticked')
        a.locator('#rcpBudget').uncheck(); a.wait_for_timeout(100)
        act(a, 'rcpsave'); a.wait_for_timeout(400)
        rc = titled(a, 'Coles Artarmon')
        check(len(rc) == 1 and rc[0].get('offBudget') is True and rc[0]['amount'] == 5237, 'the receipt saves as not in the budget: ' + json.dumps([(e.get('amount'), e.get('offBudget')) for e in rc]))

        act(a, 'go', 'home')
        sub = home_sub(a)
        check('Spent $80.00 of $2,000' in sub and '+ $202.37 not in the budget' in sub, 'Home adds up everything marked not in the budget: ' + sub)
finally:
    server.terminate()

print('problems:', 'none' if not problems else problems[:5])
print('FAILURES:', len(failures))
sys.exit(1 if failures or problems else 0)
