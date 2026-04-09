Summary
When hljsl.min.js is loaded from a different origin than the page (common case: app on http://127.0.0.1:… or http://localhost:…, script from https://cdn.jsdelivr.net/…), the browser throws when HLJSL tries to start the Web Worker:

Uncaught SecurityError: Failed to construct 'Worker': Script at ... cannot be accessed from origin 'http://127.0.0.1:5000/'.
So integration via the documented CDN URL can break in normal local/dev setups without any misconfiguration of “files in the same folder” on the CDN.

Expected behavior
HLJSL should either:

work when loaded from a CDN while the page is another origin, or
fail gracefully (e.g. main-thread fallback) with a clear message, or
document this limitation prominently and recommend a pattern that always works.
Actual behavior
new Worker(<url>) uses the full URL of hljsl.min.js, which is cross-origin relative to the document. Many browsers reject constructing a classic worker from that URL, producing SecurityError before worker-side code (including importScripts for hljs.min.js) runs.

Note: keeping hljsl.min.js and hljs.min.js in the same directory on the CDN is necessary for relative importScripts inside the worker, but it does not fix cross-origin worker script restrictions on the initial Worker constructor.

Steps to reproduce
Serve any HTML page from HTTP on 127.0.0.1 or localhost (e.g. http://127.0.0.1:5000).
Include HLJSL from jsDelivr (or any HTTPS CDN) per the README, e.g.
https://cdn.jsdelivr.net/gh/caboodle-tech/highlight-js-lite@latest/dist/hljsl.min.js
Load the page and observe the console.
Environment
Browser: Chromium-based (error observed as above); behavior may vary slightly by browser.
Page origin: http://127.0.0.1:… (or non-HTTPS dev server).
HLJSL: loaded from https://cdn.jsdelivr.net/… (different scheme/host/port → different origin).
Possible fix (high level)
Avoid new Worker(crossOriginAbsoluteUrlTohljsl.min.js) as the only path.

Option A — Same-origin worker entry via Blob URL

On the main thread, resolve the base URL of the deployed script (directory containing hljsl.min.js) from the real load URL — do not hardcode jsDelivr; use import.meta.url / document.currentScript / equivalent so self-hosted and pinned tags keep working.
Create a small worker bootstrap whose only job is to importScripts(absoluteUrlToHljsMinJs) (and any other worker chunks), where absoluteUrlToHljsMinJs is new URL('hljs.min.js', baseUrl).href (or string concat with a normalized base).
Instantiate the worker with new Worker(URL.createObjectURL(new Blob([bootstrapSource], { type: 'application/javascript' }))) so the worker object is created from a blob: URL (same origin as the document), while Highlight.js still loads from the same logical dist/ as the main bundle.
Option B — Main-thread fallback

If Worker construction throws SecurityError (or workers are unavailable), run highlighting on the main thread so CDN users never see a hard failure.

Option C — Document + ergonomics

If cross-origin workers are intentionally unsupported, state that explicitly in the README (“CDN script + different origin page may fail; self-host dist/ on your origin or use HTTPS same-site”) and optionally detect + console.warn once with that guidance.