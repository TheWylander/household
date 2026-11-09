"""Builds the app two ways from the same source.

dist/index.html  one self-contained page for the private Claude version, with your own starting values.
pwa/site/        the home-screen web app (PWA) for free hosting. No names or money in its code.
pwa/household-pwa.zip  site/ plus the Firestore rules and setup notes, ready to download.

Optional private files (never shipped in the site, never committed):
household-preset.json  your names, card and rent, for the Claude version
pwa-config.json        {"firebase": {...web app config...}, "emails": ["you@...", "partner@..."]}

config/firebase.json holds the Firebase web app config. It isn't secret (it ships in the live site), so it is
committed and used when pwa-config.json isn't there. The two sign-in emails are only needed to write the rules file.
"""
import hashlib
import json
import re
import pathlib
import shutil
import zipfile

root = pathlib.Path(__file__).parent
src = root / 'src'
css = (src / 'styles.css').read_text()
logic = (src / 'logic.js').read_text()
app_src = (src / 'app.js').read_text()
shell = (src / 'shell.html').read_text()
schemes = json.dumps(json.load(open(root / 'design' / 'schemes.json')), separators=(',', ':'))


def private(name):
    p = root / name
    return json.loads(p.read_text()) if p.exists() else None


def page(preset_js, head_extra='', before_scripts='', after_scripts=''):
    app = app_src
    assert app.count('/*__SCHEMES__*/{}') == 1 and app.count('/*__PRESET__*/null') == 1
    app = app.replace('/*__SCHEMES__*/{}', schemes).replace('/*__PRESET__*/null', preset_js)
    for name, text in (('logic.js', logic), ('app.js', app)):
        assert '</script' not in text.lower(), name + ' contains a closing script tag'
    html = shell
    if head_extra:
        anchor = '<meta name="theme-color" content="#FFF3E4">'
        assert html.count(anchor) == 1
        html = html.replace(anchor, anchor + '\n' + head_extra)
    if before_scripts:
        anchor = '<script>\n/*__LOGIC__*/'
        assert html.count(anchor) == 1
        html = html.replace(anchor, before_scripts + '\n' + anchor)
    if after_scripts:
        html = html.replace('</body>', after_scripts + '\n</body>')
    html = html.replace('/*__CSS__*/', css).replace('/*__LOGIC__*/', logic).replace('/*__APP__*/', app)
    assert '/*__' not in html
    return html


# ---------- 1. the private Claude version ----------
preset = private('household-preset.json')
out = root / 'dist' / 'index.html'
out.parent.mkdir(exist_ok=True)
out.write_text(page(json.dumps(preset, separators=(',', ':')) if preset else 'null'))
print(out, len(out.read_bytes()), 'bytes')

# ---------- 2. the PWA ----------
FIREBASE_VERSION = '13.2.0'
VENDOR = ['firebase-app-compat.js', 'firebase-auth-compat.js', 'firebase-firestore-compat.js']
pwa = root / 'pwa'
site = pwa / 'site'
if site.exists():
    shutil.rmtree(site)
site.mkdir(parents=True)

head = '\n'.join([
    '<link rel="manifest" href="manifest.json">',
    '<link rel="icon" type="image/png" sizes="32x32" href="icon-32.png">',
    '<link rel="apple-touch-icon" href="apple-touch-icon.png">',
    '<meta name="apple-mobile-web-app-capable" content="yes">',
    '<meta name="mobile-web-app-capable" content="yes">',
    '<meta name="apple-mobile-web-app-title" content="Household">',
    '<meta name="apple-mobile-web-app-status-bar-style" content="default">',
])
before = '\n'.join(['<script src="firebase-config.js"></script>'] + ['<script src="%s"></script>' % f for f in VENDOR])
after = "<script>if ('serviceWorker' in navigator) window.addEventListener('load', function () { navigator.serviceWorker.register('service-worker.js').catch(function () {}); });</script>"
index = page('null', head, before, after)
private_words = []
if preset:
    private_words += [n for n in (preset.get('names') or {}).values() if n]
    r = preset.get('rent') or {}
    private_words += (['"amount":%d' % r['amount']] if r.get('amount') else []) + (['"start":"%s"' % r['start']] if r.get('start') else [])
private_words += [e for e in ((private('pwa-config.json') or {}).get('emails') or []) if e]
for word in private_words:
    assert word not in index, 'personal value in the public PWA: ' + word
(site / 'index.html').write_text(index)

# Firebase browser builds, self-hosted so the app opens offline and doesn't depend on a CDN
tgz = pathlib.Path('/tmp/fbpkg') / ('firebase-%s.tgz' % FIREBASE_VERSION)
if not tgz.exists():
    import subprocess
    tgz.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(['npm', 'pack', 'firebase@' + FIREBASE_VERSION, '--pack-destination', str(tgz.parent)], check=True, stdout=subprocess.DEVNULL)
import tarfile
# Receipt reading uses Firebase AI Logic, with App Check to prove requests come from this app. They're ES modules,
# loaded only when a receipt is snapped, and point at the app module next to them rather than at Google's CDN.
AI_VENDOR = ['firebase-app.js', 'firebase-ai.js', 'firebase-app-check.js']
with tarfile.open(tgz) as t:
    for f in VENDOR + AI_VENDOR:
        text = t.extractfile('package/' + f).read().decode('utf-8')
        text = '\n'.join(line for line in text.split('\n') if not line.startswith('//# sourceMappingURL='))
        if f in ('firebase-ai.js', 'firebase-app-check.js'):
            cdn = 'https://www.gstatic.com/firebasejs/%s/firebase-app.js' % FIREBASE_VERSION
            assert text.count(cdn) == 1, f + ' should import the app module once'
            text = text.replace(cdn, './firebase-app.js')
            assert 'gstatic.com' not in text
        (site / f).write_text(text)
(site / 'FIREBASE-LICENSE.txt').write_text(
    'Firebase JavaScript SDK %s, Copyright Google LLC.\nLicensed under the Apache License, Version 2.0: https://www.apache.org/licenses/LICENSE-2.0\n' % FIREBASE_VERSION)

# Icons from the chosen app icon (Two of us, Warm). The art sits inside the safe zone, so it also works as a maskable icon.
from PIL import Image
icon = Image.open(root / 'design' / 'export' / 'household-icon.png').convert('RGB')
for name, px in [('icon-32.png', 32), ('icon-192.png', 192), ('icon-512.png', 512), ('icon-maskable-512.png', 512), ('apple-touch-icon.png', 180)]:
    icon.resize((px, px), Image.LANCZOS).save(site / name, optimize=True)

manifest = {
    'name': 'Our household', 'short_name': 'Household', 'description': 'Shared spending for the two of you.',
    'start_url': './', 'scope': './', 'display': 'standalone', 'orientation': 'portrait',
    'background_color': '#FFF3E4', 'theme_color': '#FFF3E4',
    'icons': [
        {'src': 'icon-192.png', 'sizes': '192x192', 'type': 'image/png', 'purpose': 'any'},
        {'src': 'icon-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'any'},
        {'src': 'icon-maskable-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'maskable'},
    ],
}
(site / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')

cfg = private('pwa-config.json') or {}
fb = cfg.get('firebase') or private('config/firebase.json') or {}
keys = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId']
if fb.get('apiKey'):
    body = ',\n'.join("  %s: %s" % (k, json.dumps(fb[k])) for k in keys if fb.get(k))
else:
    body = "  apiKey: 'PASTE_API_KEY',\n  authDomain: 'PASTE_PROJECT_ID.firebaseapp.com',\n  projectId: 'PASTE_PROJECT_ID',\n  appId: 'PASTE_APP_ID'"
# The reCAPTCHA key App Check uses for receipt reading (Google Cloud console > reCAPTCHA). Public by design, like the rest.
appcheck = str(cfg.get('appCheckKey') or '').strip()
assert not appcheck or re.fullmatch(r'[A-Za-z0-9_-]{20,64}', appcheck), 'appCheckKey in pwa-config.json should be a reCAPTCHA key ID'
(site / 'firebase-config.js').write_text(
    '/* Your Firebase web app settings (Firebase console > Project settings > Your apps > Web app).\n'
    '   These are not secret: your data is protected by the Firestore rules. */\n'
    'window.HH_FIREBASE = {\n' + body + '\n};\n' +
    ('/* The reCAPTCHA key App Check uses, so Gemini knows receipt requests come from this app. Also not secret. */\n'
     'window.HH_APPCHECK = ' + json.dumps(appcheck) + ';\n' if appcheck else ''))

files = sorted(p.relative_to(site).as_posix() for p in site.rglob('*') if p.is_file() and p.name != 'FIREBASE-LICENSE.txt')
version = hashlib.sha256(b''.join((site / f).read_bytes() for f in files)).hexdigest()[:10]
sw = (src / 'pwa' / 'service-worker.js').read_text()
assert sw.count('__VERSION__') == 1 and sw.count('__FILES__') == 1
sw = sw.replace('__VERSION__', version).replace('__FILES__', json.dumps(['./'] + files))
(site / 'service-worker.js').write_text(sw)

emails = [e.strip().lower() for e in (cfg.get('emails') or []) if e.strip()]
rules = (src / 'pwa' / 'firestore.rules').read_text()
rules = rules.replace('__EMAILS__', ', '.join("'%s'" % e for e in emails) if len(emails) == 2 else "'you@example.com', 'partner@example.com'")
# The notification job's own login: the first email with +bot before the @, unless pwa-config.json names one.
bot = (cfg.get('botEmail') or (emails[0].replace('@', '+bot@', 1) if len(emails) == 2 else 'you+bot@example.com')).strip().lower()
rules = rules.replace('__BOT_EMAIL__', "'%s'" % bot)
(pwa / 'firestore.rules').write_text(rules)
shutil.copy(src / 'pwa' / 'README.md', pwa / 'README.md')

zpath = pwa / 'household-pwa.zip'
with zipfile.ZipFile(zpath, 'w', zipfile.ZIP_DEFLATED) as z:
    for p in sorted(site.rglob('*')):
        if p.is_file():
            z.write(p, 'household-pwa/site/' + p.relative_to(site).as_posix())
    z.write(pwa / 'firestore.rules', 'household-pwa/firestore.rules')
    z.write(pwa / 'README.md', 'household-pwa/README.md')
print(site, len(files) + 1, 'files, version', version, '| config', 'filled' if fb.get('apiKey') else 'template', '| emails', len(emails))
print(zpath, zpath.stat().st_size, 'bytes')
