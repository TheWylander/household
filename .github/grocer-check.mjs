// One-off: can GitHub reach Liquorland's specials, and OzBargain's Liquorland deals feed? Prints a few notes.
const UA = 'Mozilla/5.0 (household deals check)';
const urls = [
  ['OzBargain Liquorland feed', 'https://www.ozbargain.com.au/deals/liquorland.com.au/feed'],
  ['OzBargain alcohol feed', 'https://www.ozbargain.com.au/cat/alcohol/feed'],
  ['Liquorland specials page', 'https://www.liquorland.com.au/specials'],
  ['Liquorland catalogue page', 'https://www.liquorland.com.au/catalogue'],
  ['Liquorland home', 'https://www.liquorland.com.au/']
];
for (const [name, url] of urls) {
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, accept: /feed$/.test(url) ? 'application/rss+xml' : 'text/html' }, redirect: 'follow' });
    const t = await r.text();
    const items = (t.match(/<item>/g) || []).length;
    const titles = [...t.matchAll(/<item>\s*<title>([^<]{0,90})/g)].slice(0, 3).map((m) => m[1]);
    const title = (/<title>([^<]{0,80})/.exec(t) || [])[1] || '';
    const guard = /incapsula|_Incapsula_|imperva|akamai|access denied|just a moment|cf-chl|captcha|reese84/i.exec(t);
    console.log(`::notice::${name}: HTTP ${r.status}, ${t.length} bytes, final ${r.url.slice(0, 60)}, items ${items}, title "${title}"${guard ? ', bot check: ' + guard[0] : ''}${titles.length ? ' | ' + titles.join(' || ') : ''}`);
  } catch (e) {
    console.log(`::notice::${name}: failed ${e.message}`);
  }
}
