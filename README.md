# Highlight JS Lite (HLJSL)

HLJSL is a simple wrapper for the [highlight.js](https://github.com/highlightjs/highlight.js) library and is designed to be a drop-in solution with minimal or no configuration required. Out of the box HLJSL provides:

- Automatic code highlighting for `<pre><code>` blocks using a Web Worker for performance.
- Automatic line numbers for `<pre><code>` blocks which can be disabled according to preference.
- Automatic `pre` padding (left-padding) correction allowing you to indent `<pre><code>` blocks just like any other code in your source files; view the source of the [demo page](https://caboodle-tech.github.io/highlight-js-lite/) for examples.
- Copy code to clipboard button with built-in language (i18n) support (hidden on single-line non-editor blocks).
- Light and dark appearance using modern CSS (`light-dark()`, `color-scheme`, optional `html.light` / `html.dark` or theme radios), customizable by overriding CSS custom properties.

## Usage

### Self-hosted (`dist` folder) — full control

HLJSL is not an npm package; ship the built files from the `dist` folder (or your own build output) with your site. Include `hljsl.min.css` and `hljsl.min.js` in the `<head>` (or wherever you load assets) so you control order relative to your own CSS:

```html
<link rel="stylesheet" href="./hljsl.min.css">
<script src="./hljsl.min.js"></script>
```

Do not add `hljs.min.js` as a `<script>` on the page (the name is easy to confuse). Highlight.js is loaded inside the Web Worker via `importScripts` from the same directory as `hljsl.min.js`.

Do not try to include a separate “worker” file. HLJSL starts the worker automatically and points it at the same `hljsl.min.js` URL you already loaded; there is no second worker bundle to add.

### CDN (jsDelivr + GitHub)

You can also load the same files from [jsDelivr’s GitHub CDN](https://www.jsdelivr.com/?docs=gh) (no npm involved). `hljsl.min.js`, `hljsl.min.css`, and `hljs.min.js` must stay in the same directory on that URL so the worker can fetch Highlight.js.

Prefer `@latest` (tracks the repository’s default branch; ensure `dist/` is present there):

```html
<script src="https://cdn.jsdelivr.net/gh/caboodle-tech/highlight-js-lite@latest/dist/hljsl.min.js"></script>
```

Or pin a release tag for reproducible builds, e.g. `v4.0.0`:

```html
<script src="https://cdn.jsdelivr.net/gh/caboodle-tech/highlight-js-lite@v4.0.0/dist/hljsl.min.js"></script>
```

On known CDN hosts, HLJSL injects `<link rel="stylesheet" href="…/hljsl.min.css">` early in `<head>` (before your other stylesheets) so your CSS can override tokens. To skip that and link CSS yourself (like self-hosted usage), set before the script:

```javascript
window.hljslConfig = { cdnAutoAssets: false };
```

Use `cdnAutoAssets: true` to force injection from any origin.

## Configure

HLJSL is designed to require zero configuration but there are two ways to modify the default settings. Using [query strings](https://en.wikipedia.org/wiki/Query_string) at the end of HLJSL’s `src` URL allows some options:

- **autoLoad=false** will disable auto loading (auto processing) of 
code blocks.
- **lazyLoad=false** will disable lazy loading (lazy processing) of 
code blocks.
- **hideNumbers=true** will disable showing the line numbers on 
processed blocks.

For example:

```html
<script src="./hljsl.min.js?autoLoad=false&lazyLoad=false"></script>
```

You can also use the CSS classes `hide-numbers` and `show-numbers` to override settings for individual `<pre><code>` blocks.

A global configuration object before the HLJSL `<script>` allows full control:

```javascript
window.hljslConfig = {
    autoLoad: true,             // Auto process all pre code blocks
    cdnAutoAssets: undefined,   // Omit for CDN auto-detect; false disables CSS inject; true forces it
    hideNumbers: false,         // Hide line numbers for code blocks
    ignoreElements: [],         // Tags, .classes, and/or #ids not to look within
    lang: 'en-us',              // Language for UI strings (e.g. copy button title)
    lazyLoad: true,             // Process blocks when they may enter view
    minLineNumbers: false,      // true / number: hide line numbers when line count is small
    onlyAutoProcess: ['body']   // Tags, .classes, and/or #ids to search within
};
```

Omitted keys keep HLJSL defaults.

## Styling (CSS variables)

Set seed custom properties on `:root` (or a scoped ancestor) in CSS that loads after `hljsl.min.css`, or place overrides in a higher-priority `@layer`:

- `--highlight-*` (syntax and chrome colors)
- `--editor-control-*` (editor toolbar)

Rules in the sheet use resolved tokens named `--hljsl-r-*`; override the seeds above. With `@layer`, either keep HLJSL in a lower layer than your overrides, or use unlayered author CSS if you need it to win over layered HLJSL.

## Public Methods

The global `hljsl` instance exposes:

#### `connect`

- Connect to HLJSL’s web worker (normally automatic).

#### `disconnect`

- Terminate the web worker and disconnect the DOM observer used for auto-load.

#### `getAutoRunStatus`

- Whether auto processing is enabled.

#### `getQuerySelectorFindAllString(find)`

- Builds a query string from an array of tags / classes / ids.

#### `getQuerySelectorNotWithinString(find, notWithin)`

- Builds a query string that excludes certain containers.

#### `getUserLanguage`

- Resolved page language (e.g. for i18n). Set `<html lang="…">` to influence this.

#### `getVersion`

- HLJSL version string.

#### `highlight(codeElem)`

- Highlight a single `<code>` element via the worker.

#### `highlightAll(container)`

- Highlight all matching blocks in `document` or inside `container`.

#### `isConnected`

- Whether the worker is active.

#### `setConfig(config)`

- Update options at runtime (same shape as `hljslConfig` where supported).

## Build from source

To produce the `dist/` artifacts locally (for self-hosting or contributing):

```bash
npm install
npm run build
```

Outputs include `dist/hljsl.min.js`, `dist/hljsl.min.css`, and `dist/hljs.min.js`. Edit `src/css/hljsl.css` or other sources as needed, then rebuild.

## Contributions

HLJSL is an open source (Commons Clause: MIT) community supported project. Please consider [tackling an issue](https://github.com/caboodle-tech/highlight-js-lite/issues) or [making a donation](https://ko-fi.com/caboodletech) to keep the project alive.
