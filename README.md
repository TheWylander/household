# Household app: source code

This `source` branch holds the code. The `main` branch holds the built site that GitHub Pages serves at https://thewylander.github.io/household/.

## Make a change

1. Edit `src/`: `app.js` for screens and behaviour, `logic.js` for money maths and CSV parsing, `styles.css` for the look.
2. Build with `python3 build.py` (Python with Pillow; it fetches the Firebase SDK from npm the first time). The site lands in `pwa/site/`.
3. Test with `node test/logic.test.js`, `node test/deals_job.test.mjs`, `python3 test/e2e_pwa.py`, `python3 test/bounds.py` and `python3 test/motion.py` (Playwright and Chrome). Bounds checks every screen at 320px and 390px wide; motion checks entrances, count-ups and swipes. The other tests run with reduced motion so they read final values.
4. Deploy: copy everything in `pwa/site/` to the root of `main`, keeping `README.md` and `.nojekyll`. Also copy `src/github/deals.mjs` to `.github/deals/deals.mjs` and `src/github/deals.yml` to `.github/workflows/deals.yml`. Then commit and push. Pages updates in about a minute. Close the app fully and reopen it to get the new version.
5. Add a draft note at the top of `RELEASES` in `src/app.js` for anything worth noticing. Whoever set the app up reviews it in Settings, Notes for the other person, edits it and decides when it's shown. The other person sees it once.

## Keep out of this repo (it's public)

- `household-preset.json`: names, card and rent for the private Claude version.
- `pwa-config.json`: the two sign-in emails, only needed to rebuild the Firestore rules file.
- Any Splitwise or bank CSV.

`.gitignore` already covers these. Two more browser test suites use them, so they aren't here.

## Deals

The Calendar's Deals view reads `deals.json` from the `deals` branch. A GitHub Actions job (`.github/workflows/deals.yml` on `main`) rebuilds it twice a day for free from public sources: OzBargain's grocery RSS feeds, the weekly Catalogue Half-Price Report posted on OzBargain (every Coles and Woolworths half-price item in the NSW catalogue), and Harris Farm's online specials. It needs no secrets. The file holds the same store specials for everyone; each phone filters it against its own watch list, which stays in Firebase. Run it by hand from the Actions tab with "Run workflow".

## Where the data lives

Firebase (Firestore and email sign-in). The Firestore rules are set in the Firebase console and only let the two verified emails in. `config/firebase.json` is the web config the live site already serves, so it isn't secret.
