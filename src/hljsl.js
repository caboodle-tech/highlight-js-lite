/**
 * @fileoverview HLJSL entry: creates the Highlighter or Webworker singleton and resolves the
 * script directory for loading assets. On known CDN hosts (jsDelivr, unpkg, cdnjs, Skypack,
 * esm.sh, jspm) the build may inject `hljsl.min.css` before the first author stylesheet;
 * `window.hljslConfig.cdnAutoAssets` false skips that, true forces it from any host. Highlight.js
 * loads inside the worker through `importScripts` from the same directory as hljsl.
 */

import Highlighter from './highlighter.js';
import Webworker from './webworker.js';

/**
 * Resolves this script's directory URL in the main thread, worker, or ESM context.
 * @returns {string|undefined} Absolute base URL ending with `/`, or undefined if unknown
 */
const scriptDirname = (() => {
    const absolutePath = (scriptUrl) => {
        const path = scriptUrl.pathname.endsWith('/') ?
            scriptUrl.pathname :
            scriptUrl.pathname.substring(0, scriptUrl.pathname.lastIndexOf('/') + 1);
        return scriptUrl.origin + path.replace(/\/{2,}/g, '/');
    };

    if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
        /*
         * Blob bootstrapped workers see `self.location` as a blob URL. Prefer
         * `self.__hljslScriptBase`, set on the main thread before `importScripts`,
         * so sibling assets (e.g. hljs.min.js) resolve against the real script directory.
         */
        if (typeof self.__hljslScriptBase === 'string' && self.__hljslScriptBase) {
            return self.__hljslScriptBase;
        }
        return absolutePath(new URL(self.location.href));
    }

    /*
     * Main thread: classic tag via `document.currentScript`, otherwise ESM via `import.meta.url`.
     */
    if (typeof document !== 'undefined' && document.currentScript) {
        return absolutePath(new URL(document.currentScript.src));
    }

    if (typeof import.meta !== 'undefined' && import.meta.url) {
        return absolutePath(new URL(import.meta.url));
    }
})();

// Environment detection
const isWorker = typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope;

/**
 * @param {string} hostname
 * @returns {boolean}
 */
const isHostLikelyCdn = (hostname) => {
    if (!hostname) {
        return false;
    }

    return (
        hostname.endsWith('jsdelivr.net') ||
        hostname === 'unpkg.com' ||
        hostname.endsWith('.unpkg.com') ||
        hostname.endsWith('skypack.dev') ||
        hostname === 'esm.sh' ||
        hostname.endsWith('.esm.sh') ||
        hostname.endsWith('cdnjs.cloudflare.com') ||
        hostname.endsWith('jspm.io')
    );
};

/**
 * @returns {boolean}
 */
const shouldInjectHljslStylesheet = () => {
    if (isWorker) {
        return false;
    }

    if (typeof document === 'undefined' || !document.head) {
        return false;
    }

    if (typeof window !== 'undefined' && window.hljslConfig?.cdnAutoAssets === false) {
        return false;
    }

    if (!scriptDirname) {
        return false;
    }

    try {
        const { hostname } = new URL(scriptDirname);

        if (typeof window !== 'undefined' && window.hljslConfig?.cdnAutoAssets === true) {
            return true;
        }

        return isHostLikelyCdn(hostname);
    } catch {
        return false;
    }
};

/**
 * Inserts HLJSL stylesheet before the first existing stylesheet so site CSS can override.
 * @param {string} baseDir Absolute URL base ending with `/`
 */
const injectHljslStylesheetEarly = (baseDir) => {
    if (document.getElementById('hljsl-cdn-stylesheet')) {
        return;
    }

    const link = document.createElement('link');
    link.id = 'hljsl-cdn-stylesheet';
    link.rel = 'stylesheet';
    link.href = `${baseDir}hljsl.min.css`;
    link.setAttribute('data-hljsl-cdn', '');

    const { head } = document;
    const before = head.querySelector('link[rel="stylesheet"], link[rel="preload"][as="style"], style');

    if (before) {
        head.insertBefore(link, before);
    } else {
        head.insertBefore(link, head.firstChild);
    }
};

if (!isWorker && shouldInjectHljslStylesheet()) {
    injectHljslStylesheetEarly(scriptDirname);
}

// Singleton instances
let instance = null;

/**
 * Returns the Highlighter or Webworker singleton for this environment.
 * @param {Object} config Options passed to Highlighter on the main thread
 * @returns {Highlighter|Webworker}
 */
const InitializeHljsl = (config = {}) => {
    if (instance) return instance;

    instance = isWorker ?
        new Webworker(scriptDirname) :
        new Highlighter(scriptDirname, config);

    return instance;
};

// Auto-initialize in the appropriate environment
if (isWorker) {
    InitializeHljsl();
} else {
    window.hljsl = InitializeHljsl();
}
