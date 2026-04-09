/**
* @fileoverview Entry point for HLJSL that handles initialization in different environments
* and manages singleton instances of the Highlighter and Webworker classes.
*
* When this file is served from a known public CDN (jsDelivr, unpkg, cdnjs, Skypack, esm.sh,
* jspm), the browser build injects `<link rel="stylesheet" href="…/hljsl.min.css">` into
* `document.head` before the first existing author stylesheet so theme tokens apply predictably.
* Set `window.hljslConfig = { cdnAutoAssets: false }` before the script to skip, or
* `cdnAutoAssets: true` to force injection from any host. Highlight.js is not injected on the
* page; the worker loads `hljs.min.js` from the same directory via `importScripts`.
*/

import Highlighter from './highlighter.js';
import Webworker from './webworker.js';

/**
* Gets the running script's directory path for all environments
* @returns {string} Absolute path to the directory containing this script
*/
const scriptDirname = (() => {
    const absolutePath = (scriptUrl) => {
        const path = scriptUrl.pathname.endsWith('/') ?
            scriptUrl.pathname :
            scriptUrl.pathname.substring(0, scriptUrl.pathname.lastIndexOf('/') + 1);
        return scriptUrl.origin + path.replace(/\/{2,}/g, '/');
    };

    // Web Worker environment
    if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
        // When the worker was bootstrapped via a Blob URL (CORS-safe CDN loading),
        // the main thread sets `self.__hljslScriptBase` before calling
        // `importScripts`.  Prefer that over `self.location.href` which would be
        // an opaque blob: URL and would make relative asset resolution fail.
        if (typeof self.__hljslScriptBase === 'string' && self.__hljslScriptBase) {
            return self.__hljslScriptBase;
        }
        return absolutePath(new URL(self.location.href));
    }

    // Non-module script environment
    if (typeof document !== 'undefined' && document.currentScript) {
        return absolutePath(new URL(document.currentScript.src));
    }

    // ES module environment
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
* Initializes HLJSL in the appropriate environment
* @param {Object} config Configuration options for Highlighter
* @returns {Highlighter|Webworker} The appropriate singleton instance
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
