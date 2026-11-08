"""Motion: screens rise in once, numbers count to their value, charts grow, and a sideways swipe changes month.
Runs the home-screen web app against the Firebase test double with motion on, then checks reduced motion turns it off."""
import json
import pathlib
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
PORT = 8773
BASE = f'http://127.0.0.1:{PORT}/pwa/site/index.html'
TEST_CONFIG = "window.HH_FIREBASE = { apiKey: 'test-key', authDomain: 'test-project.firebaseapp.com', projectId: 'test-project', appId: '1:1:web:1' };"
failures, problems = [], []
SWIPE = """([x0, x1, y]) => {
  const el = document.querySelector('main');
  const ev = (type, x) => el.dispatchEvent(new PointerEvent(type, { pointerType: 'touch', clientX: x, clientY: y, bubbles: true, isPrimary: true }));
  ev('pointerdown', x0); ev('pointerup', x1);
}"""


def check(cond, msg):
    print(('ok   ' if cond else 'FAIL ') + msg)
    if not cond:
        failures.append(msg)


def act(page, a, arg=None):
    sel = f'[data-act="{a}"]' + (f'[data-arg="{arg}"]' if arg is not None else '')
    page.locator(sel).first.click()
    page.wait_for_timeout(120)


def household(ctx):
    a = ctx.new_page()
    a.on('pageerror', lambda e: problems.append(f'pageerror {e}'))
    a.goto(BASE); a.wait_for_timeout(500)
    a.evaluate("() => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('__fbrules', JSON.stringify(['robin@example.com', 'jules@example.com'])); }")
    a.reload(); a.wait_for_timeout(600)
    act(a, 'aumode', 'create'); a.fill('#auemail', 'robin@example.com'); a.fill('#aupw', 'correct horse 1')
    act(a, 'aucreate'); a.wait_for_timeout(300)
    a.evaluate("(e) => window.__fbVerify(e)", 'robin@example.com'); act(a, 'auverified')
    a.wait_for_load_state('load'); a.wait_for_timeout(700)
    a.fill('#sna', 'Robin'); a.fill('#snb', 'Jules'); act(a, 'sme', 'a'); act(a, 'snext')
    a.fill('#sbudget', '2000'); act(a, 'snext'); act(a, 'sfinish'); a.wait_for_timeout(500)
    for amount in ['84.20', '12.50']:
        act(a, 'add')
        for k in amount:
            act(a, 'key', k)
        act(a, 'saveadd'); a.wait_for_timeout(250)
    return a


def ctx_for(browser, reduced):
    ctx = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True,
                              locale='en-AU', timezone_id='Australia/Sydney', reduced_motion='reduce' if reduced else 'no-preference')
    ctx.add_init_script(path=str(ROOT / 'test' / 'firebase-mock.js'))
    ctx.route('**/firebase-config.js', lambda r: r.fulfill(status=200, content_type='text/javascript', body=TEST_CONFIG))
    ctx.route('**/firebase-*-compat.js', lambda r: r.fulfill(status=200, content_type='text/javascript', body='/* test double */'))
    ctx.route('https://fonts.googleapis.com/**', lambda r: r.abort())
    return ctx


server = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'], cwd=ROOT,
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        a = household(ctx_for(browser, False))
        a.wait_for_timeout(1500)
        final = a.inner_text('.hero-v')
        # leaving Home and coming back after a spend: the number moves from what you saw to the new value
        act(a, 'add')
        for k in '30':
            act(a, 'key', k)
        a.locator('[data-act="saveadd"]').click()
        a.wait_for_timeout(60)
        mid = a.inner_text('.hero-v')
        check(a.evaluate("document.getElementById('app').classList.contains('enter')"), 'coming back to Home plays its entrance')
        a.wait_for_timeout(1500)
        after = a.inner_text('.hero-v')
        to_c = lambda t: int(round(float(t.replace('$', '').replace(',', '')) * 100))
        check(to_c(after) == to_c(final) - 3000, f'Left to spend counts to the new value: {final} to {after}')
        check(to_c(after) <= to_c(mid) <= to_c(final) and mid not in (after,), f'mid-way it shows a number in between ({mid})')
        check(not a.evaluate("document.getElementById('app').classList.contains('enter')") or a.evaluate("getComputedStyle(document.querySelector('.hero')).opacity") == '1', 'the entrance settles')
        # a redraw while a screen is still opening carries on rather than starting again
        act(a, 'go', 'insights'); a.wait_for_timeout(250)
        e1 = a.evaluate("parseFloat(document.getElementById('app').style.getPropertyValue('--enter'))")
        act(a, 'insmode', 'month'); a.wait_for_timeout(100)
        e2 = a.evaluate("parseFloat(document.getElementById('app').style.getPropertyValue('--enter'))")
        check(e1 > -100 and e2 <= -300, f'a redraw mid-entrance picks up where it was instead of restarting ({e1}ms, then {e2}ms)')
        check(a.locator('.pace .pc-line[pathLength="1"]').count() == 1, 'the pace line is set up to draw itself in')
        # swipe sideways: right goes back a month, left comes forward, and it can't go past this month
        head = a.inner_text('.period-nav h2')
        a.evaluate(SWIPE, [100, 300, 420]); a.wait_for_timeout(200)
        back = a.inner_text('.period-nav h2')
        check(back != head and 'so far' not in back, f'swiping right goes to the month before ({back})')
        check(a.evaluate("document.getElementById('app').classList.contains('from-l')"), 'and slides in from the left')
        a.evaluate(SWIPE, [300, 100, 420]); a.wait_for_timeout(200)
        check(a.inner_text('.period-nav h2') == head, 'swiping left comes back to this month')
        a.evaluate(SWIPE, [300, 100, 420]); a.wait_for_timeout(200)
        check(a.inner_text('.period-nav h2') == head, "and can't go past it")
        a.evaluate(SWIPE, [300, 260, 420]); a.wait_for_timeout(200)
        check(a.inner_text('.period-nav h2') == head, 'a short drag is not a swipe')
        act(a, 'go', 'cal')
        m = a.inner_text('.cal-head h2')
        a.evaluate(SWIPE, [320, 80, 300]); a.wait_for_timeout(200)
        check(a.inner_text('.cal-head h2') != m, 'the Calendar swipes to the next month too')
        # reduced motion: no entrance, numbers shown straight away
        b = household(ctx_for(browser, True))
        act(b, 'go', 'cal'); act(b, 'go', 'home')
        check(not b.evaluate("document.getElementById('app').classList.contains('enter')"), 'reduced motion: no entrance')
        check(b.evaluate("getComputedStyle(document.querySelector('.hero')).animationName") == 'none', 'reduced motion: nothing animates')
        browser.close()
finally:
    server.terminate()

print('\nproblems:', json.dumps(problems, indent=1) if problems else 'none')
print('FAILURES:', len(failures))
sys.exit(1 if failures or problems else 0)
