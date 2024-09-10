import Highlighter from './highlighter.js';
import Webworker from './webworker.js';

// Return the running scripts directory path regardless of script type or location.
const scriptDirname = (() => {
    const absolutePath = (scriptUrl) => {
        // Ensure there's no double slash by checking if the pathname already ends with '/'.
        const path = scriptUrl.pathname.endsWith('/') ?
            scriptUrl.pathname :
            scriptUrl.pathname.substring(0, scriptUrl.pathname.lastIndexOf('/') + 1);
        // Webworker environments can add another slash so double check.
        return scriptUrl.origin + path.replace(/\/{2,}/g, '/');
    };

    // Web Worker environment.
    if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
        if (typeof self.location !== 'undefined') {
            return absolutePath(new URL(self.location.href));
        }
        return '';
    }

    // Main thread (non-module script).
    if (typeof document !== 'undefined' && typeof document.currentScript !== 'undefined') {
        return absolutePath(new URL(document.currentScript.src));
    }

    // ESM environment (module script).
    if (typeof import.meta !== 'undefined' && import.meta.url) {
        return absolutePath(new URL(import.meta.url));
    }

    return '';
})();

// Do not allow duplicate instances of anything!
let HighlighterInstance = null;
let WebworkerInstance = null;

// Auto run Highlighter.
const InitializesHljsl = (config = {}) => {

    if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
        if (WebworkerInstance) {
            return WebworkerInstance;
        }
        WebworkerInstance = new Webworker(scriptDirname);
    } else {
        if (HighlighterInstance) {
            return HighlighterInstance;
        }
        HighlighterInstance = new Highlighter(scriptDirname, config);
        return HighlighterInstance;
    }

};

if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
    // We don't need hljsl to be available in the webworker.
    InitializesHljsl();
} else {
    // Allow hljsl to be available in global scope like highlight.js normally is.
    window.hljsl = InitializesHljsl();
}
