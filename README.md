# Household app: source code

This `source` branch holds the code. The `main` branch holds the built site that GitHub Pages serves at https://thewylander.github.io/household/.

## Make a change

1. Edit `src/`: `app.js` for screens and behaviour, `logic.js` for money maths and CSV parsing, `styles.css` for the look.
2. Build with `python3 build.py` (Python with Pillow; it fetches the Firebase SDK from npm the first time). The site lands in `pwa/site/`.
3. Test with `node test/logic.test.js` and `python3 test/e2e_pwa.py` (Playwright and Chrome).
4. Deploy: copy everything in `pwa/site/` to the root of `main`, keeping `README.md` and `.nojekyll`, then commit and push. Pages updates in about a minute. Close the app fully and reopen it to get the new version.
5. Add an entry at the top of `RELEASES` in `src/app.js` for anything you'd want them to notice. Each of you sees the newest entry once as a What's new note, and whoever joins later sees it as a few things to try.

## Keep out of this repo (it's public)

- `household-preset.json`: names, card and rent for the private Claude version.
- `pwa-config.json`: the two sign-in emails, only needed to rebuild the Firestore rules file.
- Any Splitwise or bank CSV.

`.gitignore` already covers these. Two more browser test suites use them, so they aren't here.

## Where the data lives

Firebase (Firestore and email sign-in). The Firestore rules are set in the Firebase console and only let the two verified emails in. `config/firebase.json` is the web config the live site already serves, so it isn't secret.
