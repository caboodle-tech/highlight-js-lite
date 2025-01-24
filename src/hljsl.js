/**
* @fileoverview Entry point for HLJSL that handles initialization in different environments
* and manages singleton instances of the Highlighter and Webworker classes.
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
