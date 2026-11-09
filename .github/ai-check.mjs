/* One-off: tries each route Firebase AI Logic offers this project and prints what comes back,
   to tell apart "Gemini Developer API not set up", "Agent Platform set up instead" and "App Check needed". */
import { readFile } from 'node:fs/promises';

const cfg = await readFile('firebase-config.js', 'utf8');
const pick = (k) => (new RegExp(k + '\\s*:\\s*["\']([^"\']+)["\']').exec(cfg) || [])[1];
const apiKey = pick('apiKey'), project = pick('projectId'), appId = pick('appId');
const [owner, repo] = String(process.env.GITHUB_REPOSITORY || '').split('/');
const site = 'https://' + owner.toLowerCase() + '.github.io/' + repo + '/';
const base = 'https://firebasevertexai.googleapis.com/v1beta/projects/' + project;
const routes = [
  ['Developer API, gemini-3.5-flash-lite', base + '/models/gemini-3.5-flash-lite:generateContent'],
  ['Developer API, gemini-3.1-flash-lite', base + '/models/gemini-3.1-flash-lite:generateContent'],
  ['Agent Platform global, gemini-3.5-flash-lite', base + '/locations/global/publishers/google/models/gemini-3.5-flash-lite:generateContent'],
  ['Agent Platform us-central1, gemini-2.5-flash-lite', base + '/locations/us-central1/publishers/google/models/gemini-2.5-flash-lite:generateContent']
];
console.log('::notice::Checked at ' + new Date().toISOString());
for (const [label, url] of routes) {
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey, 'x-firebase-appid': appId, referer: site },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Reply with the single word OK.' }] }], generationConfig: { temperature: 0 } })
    });
    const body = await r.text();
    let m = body;
    try { const j = JSON.parse(body); m = j.error ? (j.error.status || '') + ' ' + j.error.message : 'answered: ' + j.candidates[0].content.parts[0].text; } catch (e) { /* keep the text */ }
    console.log('::notice::' + label + ' -> ' + r.status + ' ' + String(m).replace(/\s+/g, ' ').slice(0, 350));
  } catch (e) {
    console.log('::notice::' + label + ' -> network error ' + String(e && e.message || e).slice(0, 200));
  }
}
