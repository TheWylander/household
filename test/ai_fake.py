"""Stand-ins for Firebase's app and AI Logic modules, so the browser tests can snap a receipt without calling Gemini.
The page sets window.__aiReply to what Gemini would send back, and window.__aiMode to make it fail like the real thing."""

APP = """
const apps = [];
export function getApps() { return apps; }
export function initializeApp(options, name) { const a = { name, options }; apps.push(a); return a; }
"""

AI = """
export class GoogleAIBackend {}
export function getAI(app, opts) { return { app, opts }; }
export function getGenerativeModel(ai, params) {
  return { generateContent: async (parts) => {
    const img = parts[1] && parts[1].inlineData;
    window.__aiCalls = (window.__aiCalls || []).concat([{ model: params.model, config: params.generationConfig, prompt: parts[0], mime: img && img.mimeType, size: img ? img.data.length : 0 }]);
    await new Promise((r) => setTimeout(r, 150));
    const mode = window.__aiMode || 'ok';
    if (mode === 'setup') { const e = new Error('AI Logic: The Firebase AI Logic API is not enabled in your project. (AI/api-not-enabled)'); e.code = 'api-not-enabled'; throw e; }
    if (mode === 'quota') { const e = new Error('AI Logic: Error fetching from the API: [429 ] Resource has been exhausted (AI/fetch-error)'); e.code = 'fetch-error'; e.customErrorData = { status: 429 }; throw e; }
    if (mode === 'missing' && params.model === 'gemini-3.5-flash-lite') { const e = new Error('AI Logic: models/gemini-3.5-flash-lite is not found (AI/fetch-error)'); e.code = 'fetch-error'; e.customErrorData = { status: 404 }; throw e; }
    return { response: { text: () => JSON.stringify(window.__aiReply) } };
  } };
}
"""


def route(ctx):
    ctx.route('**/firebase-app.js', lambda r: r.fulfill(status=200, content_type='text/javascript', body=APP))
    ctx.route('**/firebase-ai.js', lambda r: r.fulfill(status=200, content_type='text/javascript', body=AI))


def reply(today_iso):
    """A Coles receipt as Gemini would read it."""
    return {'shop': 'Coles Artarmon', 'date': today_iso, 'total': 52.37, 'category': 'Other', 'items': [
        {'name': 'Golden Crumpet Rounds 6 Pack', 'price': 2.5}, {'name': 'Nescafe Blend 43 140g', 'price': 7.25},
        {'name': 'Bananas 1.1 kg', 'price': 4.17}, {'name': 'Full Cream Milk 3 L', 'price': 4.95},
        {'name': 'Gillette Razor Blades 4 Pack', 'price': 16}, {'name': 'SunRice Basmati 5 kg', 'price': 17.5}]}
