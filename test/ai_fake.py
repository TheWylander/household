"""Stand-ins for Firebase's app, AI Logic and App Check modules, so the browser tests can snap a receipt without calling
Gemini or reCAPTCHA. The page sets window.__aiReply to what Gemini would send back, and window.__aiMode to make it fail
like the real thing. App Check set-ups land in window.__appCheck, and the AI Logic options in window.__aiOpts."""

APP = """
const apps = [];
export function getApps() { return apps; }
export function initializeApp(options, name) { const a = { name, options }; apps.push(a); return a; }
"""

AI = """
export class GoogleAIBackend {}
export function getAI(app, opts) { window.__aiOpts = { app: app.name, limited: !!(opts && opts.useLimitedUseAppCheckTokens) }; return { app, opts }; }
export function getGenerativeModel(ai, params) {
  return { generateContent: async (parts) => {
    const img = parts[1] && parts[1].inlineData;
    window.__aiCalls = (window.__aiCalls || []).concat([{ model: params.model, config: params.generationConfig, prompt: parts[0], mime: img && img.mimeType, size: img ? img.data.length : 0 }]);
    await new Promise((r) => setTimeout(r, 150));
    const mode = window.__aiMode || 'ok';
    if (mode === 'setup') { const e = new Error('AI Logic: The Firebase AI Logic API is not enabled in your project. (AI/api-not-enabled)'); e.code = 'api-not-enabled'; throw e; }
    if (mode === 'config') { const e = new Error('AI Logic: Error fetching from the API: [404 ] Firebase AI Logic genai config not found. (AI/fetch-error)'); e.code = 'fetch-error'; e.customErrorData = { status: 404 }; throw e; }
    if (mode === 'enforce') { const e = new Error('AI Logic: Error fetching from the API: [403 ] PERMISSION_DENIED: To access this model, you must enforce Firebase App Check. (AI/fetch-error)'); e.code = 'fetch-error'; e.customErrorData = { status: 403 }; throw e; }
    if (mode === 'unattested') { const e = new Error('AI Logic: Error fetching from the API: [401 ] Firebase App Check token is invalid. (AI/fetch-error)'); e.code = 'fetch-error'; e.customErrorData = { status: 401 }; throw e; }
    if (mode === 'recaptcha') { const e = new Error('AppCheck: ReCAPTCHA error. (appCheck/recaptcha-error).'); e.code = 'appCheck/recaptcha-error'; throw e; }
    if (mode === 'quota') { const e = new Error('AI Logic: Error fetching from the API: [429 ] Resource has been exhausted (AI/fetch-error)'); e.code = 'fetch-error'; e.customErrorData = { status: 429 }; throw e; }
    if (mode === 'missing' && params.model === 'gemini-3.5-flash-lite') { const e = new Error('AI Logic: models/gemini-3.5-flash-lite is not found (AI/fetch-error)'); e.code = 'fetch-error'; e.customErrorData = { status: 404 }; throw e; }
    return { response: { text: () => JSON.stringify(window.__aiReply) } };
  } };
}
"""

APP_CHECK = """
export class ReCaptchaEnterpriseProvider { constructor(key) { this.key = key; } }
export class CustomProvider { constructor(o) { this.o = o; } }
export function initializeAppCheck(app, opts) {
  window.__appCheck = (window.__appCheck || []).concat([{ app: app.name, key: opts.provider.key || null, custom: opts.provider instanceof CustomProvider,
    debug: self.FIREBASE_APPCHECK_DEBUG_TOKEN || null, auto: opts.isTokenAutoRefreshEnabled }]);
  return { app };
}
"""


def route(ctx):
    ctx.route('**/firebase-app.js', lambda r: r.fulfill(status=200, content_type='text/javascript', body=APP))
    ctx.route('**/firebase-ai.js', lambda r: r.fulfill(status=200, content_type='text/javascript', body=AI))
    ctx.route('**/firebase-app-check.js', lambda r: r.fulfill(status=200, content_type='text/javascript', body=APP_CHECK))


def reply(today_iso):
    """A Coles receipt as Gemini would read it."""
    return {'shop': 'Coles Artarmon', 'date': today_iso, 'total': 52.37, 'category': 'Other', 'items': [
        {'name': 'Golden Crumpet Rounds 6 Pack', 'price': 2.5}, {'name': 'Nescafe Blend 43 140g', 'price': 7.25},
        {'name': 'Bananas 1.1 kg', 'price': 4.17}, {'name': 'Full Cream Milk 3 L', 'price': 4.95},
        {'name': 'Gillette Razor Blades 4 Pack', 'price': 16}, {'name': 'SunRice Basmati 5 kg', 'price': 17.5}]}
