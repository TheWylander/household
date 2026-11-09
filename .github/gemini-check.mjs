/* One-off check that receipt reading works through this Firebase project: asks Gemini, through Firebase AI Logic,
   to read a made-up receipt the same way the app does, with each model the app tries. Prints what came back. */
import { readFile } from 'node:fs/promises';

const cfg = await readFile('firebase-config.js', 'utf8');
const pick = (k) => (new RegExp(k + '\\s*:\\s*["\']([^"\']+)["\']').exec(cfg) || [])[1];
const apiKey = pick('apiKey'), project = pick('projectId'), appId = pick('appId');
const [owner, repo] = String(process.env.GITHUB_REPOSITORY || '').split('/');
const site = 'https://' + owner.toLowerCase() + '.github.io/' + repo + '/';
const schema = { type: 'object', properties: {
  shop: { type: 'string' }, date: { type: 'string' }, total: { type: 'number' }, category: { type: 'string', enum: ['Groceries', 'Other'] },
  items: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, price: { type: 'number' } }, required: ['name', 'price'] } }
}, required: ['shop', 'date', 'total', 'category', 'items'] };
const receipt = ['COLES ARTARMON', '07/11/2026 14:32', 'GOLDEN CRUMPET ROUNDS 6PK   2.50', 'NESCAFE BLEND 43 140G   7.25', 'BANANAS 1.1KG @ $3.79/KG   4.17',
  'FULL CREAM MILK 3L   4.95', 'GILLETTE RAZOR BLADES 4PK   16.00', 'SUNRICE BASMATI 5KG   17.50', 'TOTAL   $52.37', 'EFTPOS   $52.37'].join('\n');
const prompt = 'This is a shop receipt from Australia, typed out. Read it. Give the shop, the date, the total paid, the best category from the list, and every item bought with what it finally cost. ' +
  'Leave out subtotals, GST, savings, payment, card and change lines.\n\n' + receipt;
let ok = false;
for (const model of ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite']) {
  const r = await fetch('https://firebasevertexai.googleapis.com/v1beta/projects/' + project + '/models/' + model + ':generateContent', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey, 'x-firebase-appid': appId, referer: site },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', responseJsonSchema: schema, temperature: 0 } })
  });
  const body = await r.text();
  if (!r.ok) { let m = body; try { m = JSON.parse(body).error.message; } catch (e) { /* keep the text */ } console.log('::warning::' + model + ': ' + r.status + ' ' + String(m).slice(0, 400)); continue; }
  try {
    const j = JSON.parse(JSON.parse(body).candidates[0].content.parts[0].text);
    console.log('::notice::' + model + ' read it: ' + j.shop + ', ' + j.date + ', $' + j.total + ', ' + j.category + ', ' + j.items.length + ' items (' + j.items.map((x) => x.name + ' ' + x.price).join('; ') + ')');
    ok = true;
  } catch (e) { console.log('::warning::' + model + ': answered, but not in the shape asked for: ' + body.slice(0, 300)); }
}
if (!ok) process.exitCode = 1;
