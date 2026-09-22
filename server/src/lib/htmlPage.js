/**
 * The few pages the API itself serves to a person (unsubscribe, an expired
 * download link). The API's global security policy is default-src 'none' —
 * right for JSON, but it would strip these pages of their styles — so each page
 * sends its own policy: inline styles and a same-origin form, nothing else.
 */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function htmlPage(res, { title, body }) {
  res.set({
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex',
  });
  return res.type('html').send(`<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0B1110;color:#F2ECE1;font:17px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:28rem;padding:2.5rem 1.5rem;text-align:center}
h1{font-size:1.6rem;margin:0 0 .75rem}p{color:#C9BFAE;margin:.5rem 0}
a{color:#C9A55C}button{margin-top:1.25rem;border:0;border-radius:999px;background:#C9A55C;color:#0B1110;font:600 1rem system-ui,sans-serif;padding:.9rem 2rem;cursor:pointer}
</style></head><body><main><h1>${esc(title)}</h1>${body}</main></body></html>`);
}
