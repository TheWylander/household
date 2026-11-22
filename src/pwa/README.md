# Our household: the home-screen app

A shared spending app for couples that opens full screen from your phone's home screen. Your data lives in your own free Firebase project, and each couple's household can only be read by its two logins.

What's in this folder:
- `site/` is the app. This is the only folder you put online.
- `firestore.rules` holds the database rules. Paste them into Firebase. Don't put this file online.

## 1. Firebase (free, about 10 minutes, once)
1. Go to console.firebase.google.com and create a project. You can turn Analytics off.
2. Go to **Build → Authentication → Get started**, choose **Email/Password**, switch it on and save.
3. Go to **Build → Firestore Database → Create database**. Pick a location near you and **Production mode**.
4. In **Firestore Database → Rules**, replace everything with `firestore.rules`. Check your two email addresses are in `isUs`, in lower case, that `isAdmin` has yours (it sees the list of households and switches pilot features on), and that `isBot` has the bot email for phone notifications (your email with `+bot` before the @). Then tap **Publish**.

Each couple who signs up gets their own household, and only the two of them can open it. Anyone can make a login and start a household. The first time either of the original two opens the app after the rules are published, your existing spends move into your household by themselves; the other one joins it on their next open.
5. Open **Project settings** (the gear icon). Under **Your apps**, add a **Web** app, then copy its config values into `site/firebase-config.js`.

## 2. Put it online (free)
**GitHub Pages:** make a new repository, upload every file inside `site/` (it has no sub-folders, so you can select them all at once, even on a phone), then go to **Settings → Pages**. Choose **Deploy from a branch** and **main / (root)**. Your link will look like `https://yourname.github.io/repository-name/`.

On a free GitHub account the repository has to be public. That's fine: the code has no names or money in it, and your data stays in Firebase behind your logins.

**Vercel works too:** go to **Add New → Project**, import the repository and deploy.

Then in Firebase, go to **Authentication → Settings → Authorized domains** and add your site's domain, for example `yourname.github.io`.

## 3. Put it on your phone
- **iPhone:** open the link in Safari, tap **Share**, then **Add to Home Screen**.
- **Android:** open the link in Chrome, tap **⋮**, then **Install app** or **Add to Home screen**.

The app opens full screen with its own icon. Each of you creates a login once with your own email, and confirms it from the email Firebase sends.

## Updating
Upload the new files over the old ones. The app picks up the new version the next time it opens.
