// Updated from package.json on build.
const Version = '???';

/**
 * @class DOMWatcher
 * @description A utility class to observe and react to dynamic DOM changes using a MutationObserver.
 * This class allows you to watch for specific elements based on a selector, and call a callback
 * when those elements are added to the DOM, including any existing matching elements at the time
 * of the observation.
 *
 */
class DOMWatcher {

    constructor() {
        this.watchers = new Map();
        this.observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1) this.checkNode(node);
                });
            });
        });

        this.observer.observe(document.documentElement, {
            childList: true,
            subtree: true
        });
    }

    watch(selector, callback, once = true) {
        const watchId = Symbol();
        if (!this.watchers.has(selector)) {
            this.watchers.set(selector, new Map());
        }

        const wrappedCallback = (element) => {
            callback(element);
            if (once) {
                this.unwatch(selector, watchId);
            }
        };

        this.watchers.get(selector).set(watchId, wrappedCallback);

        // Check existing elements
        document.querySelectorAll(selector).forEach(wrappedCallback);

        return {
            unwatch: () => this.unwatch(selector, watchId)
        };
    }

    unwatch(selector, id) {
        const callbacks = this.watchers.get(selector);
        callbacks?.delete(id);
        if (callbacks?.size === 0) {
            this.watchers.delete(selector);
        }
    }

    checkNode(node) {
        if (!node.matches) return;

        this.watchers.forEach((callbacks, selector) => {
            if (node.matches(selector)) {
                callbacks.forEach((callback) => callback(node));
            }

            // Check children
            node.querySelectorAll(selector).forEach((elem) => {
                callbacks.forEach((callback) => callback(elem));
            });
        });
    }

    disconnect() {
        this.observer.disconnect();
        this.watchers.clear();
    }

}

/**
 * @class Highlighter
 * @description Handles syntax highlighting of code blocks using Web Workers and intersection observers
 */
class Highlighter {

    // Private static instance for singleton pattern
    static #instance = null;

    // Consolidated regex patterns
    #regex = {
        langValidation: /^[a-zA-Z]{2}(-[a-zA-Z]{2})?$/,
        lineBreak: /<br\s*\/?>/gi,
        openingSpan: /<span[^>]*>/,
        closingSpan: /<\/span>/
    };

    // Configuration and state
    #autoLoad = true;
    #hideNumbers = false;
    #ignoreElements = [];
    #lang = 'en-us';
    #lazyLoad = true;
    #minLineNumbers = 5;
    #minLineNumbersEnabled = false;
    #onlyAutoProcess = ['body'];
    #root = '';
    #worker = null;
    #version = Version;

    // DOMWatcher instance for efficient DOM observation
    #domWatcher = null;

    /**
     * @constructor
     * @param {string} scriptDirname Directory path for script resources
     * @param {Object} config Configuration options
     */
    constructor(scriptDirname, config = {}) {
        // Only the primary instance of HLJSL should auto run
        if (Highlighter.#instance) {
            return Highlighter.#instance;
        }
        Highlighter.#instance = this;

        // Record the script dirname
        this.#root = scriptDirname;

        // Initialize DOMWatcher
        this.#domWatcher = new DOMWatcher();

        // Run basic setup tasks and check GET parameters for config options
        this.#initialize();

        // Set or check for alternative config options
        if (Object.keys(config).length === 0) {
            this.#checkForGlobalConfig();
        } else {
            this.setConfig(config);
        }

        // Start processing code blocks once the body is loaded
        this.#initializeCodeProcessing();
    }

    /**
     * @param {Array} entries Observed intersection entries
     * @param {IntersectionObserver} observer The intersection observer instance
     */
    #blockInView(entries, observer) {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                this.highlight(entry.target);
                // Stop watching this block after processing
                setTimeout(() => {
                    if (entry.target.hasAttribute('data-hljsl-id') && !entry.target.hasAttribute('data-unprocessed')) {
                        observer.disconnect();
                    }
                }, 500);
            }
        });
    }

    /**
     * Helper method that checks for and uses the users global config if set
     */
    #checkForGlobalConfig() {
        const globalConfig = window.hljslConfig;
        if (!globalConfig) return;
        this.setConfig(globalConfig);
    }

    /**
     * @returns {string} Unique identifier
     */
    createId() {
        return `${Date.now().toString(36)}${Math.random().toString(36).substring(2)}`.toUpperCase();
    }

    /**
     * Connect to HLJSL's web worker
     */
    connect() {
        if (this.#worker) return;
        const worker = new Worker(`${this.#root}/hljsl.min.js`);
        this.#worker = worker;
        worker.onmessage = this.#receiveResponse.bind(this);
    }

    /**
     * Copy code from a block to the users clipboard
     * @param {HTMLElement} evt The event that triggered this function
     */
    #copyToClipboard(evt) {
        // Only process this event if we can find the table with the code to copy
        let elem = evt.target;
        while (elem && elem.nodeName !== 'CODE' && elem.nodeName !== 'PRE') {
            elem = elem.parentElement;
        }
        if (!elem) return;

        const button = elem.querySelector('button.hljsl-clipboard');
        const table = elem.querySelector('table');
        if (!table || !button) return;

        // Visually show the table is being copied
        button.ariaPressed = true;
        table.classList.add('copy-to-clipboard');

        // Remove the visual effect
        setTimeout(() => {
            table.classList.remove('copy-to-clipboard');
            button.ariaPressed = false;
        }, 500);

        // Copy the table to the users clipboard
        const cells = table.querySelectorAll('tr td:nth-child(2)');
        const tmpDiv = document.createElement('div');
        cells.forEach((cell) => {
            tmpDiv.textContent += `${cell.textContent}\n`;
        });

        navigator.clipboard.writeText(tmpDiv.textContent.trimEnd())
            .catch((error) => {
                console.error('Failed to copy text to clipboard:', error);
            });
    }

    /**
     * @param {HTMLElement} elem The code element to process
     * @returns {HTMLElement} The processed code element
     */
    #correctPadding(elem) {
        // Don't waste time reprocessing a block
        if (elem.classList.contains('fixed-padding') ||
            elem.parentElement.classList.contains('fixed-padding') ||
            elem.querySelector('fixed-padding')
        ) return elem;

        // Enforce proper <pre><code> structure
        let pre;
        let code;
        if (elem.nodeName === 'PRE') {
            pre = elem;
            code = elem.querySelector('code');
            if (!code) {
                code = document.createElement('CODE');
                code.innerHTML = pre.innerHTML;
                pre.innerHTML = '';
                pre.appendChild(code);
            }
        } else if (elem.nodeName === 'CODE') {
            code = elem;
            pre = elem.closest('pre');
            if (!pre) {
                pre = document.createElement('PRE');
                code.parentElement.insertBefore(pre, elem);
                pre.appendChild(code);
            }
        } else {
            pre = document.createElement('PRE');
            code = document.createElement('CODE');
            code.innerHTML = elem.innerHTML;
            pre.appendChild(code);
            elem.parentElement.insertBefore(pre, elem);
            elem.parentElement.removeChild(elem);
        }

        // Use innerHTML to preserve HTML entities when splitting into lines
        const lines = code.innerHTML.split('\n');

        // Handle first line edge case when it's on the same line as the code tag
        if (lines.length > 1 && lines[0].trim() !== '') {
            const firstLineIndent = lines[0].match(/^\s*/)[0].length;
            if (firstLineIndent === 0) {
                const secondLineIndent = lines[1].match(/^\s*/)[0].length;
                lines[0] = ' '.repeat(secondLineIndent) + lines[0];
            }
        }

        // Remove empty lines from start and end
        let startIndex = 0;
        let endIndex = lines.length - 1;

        while (startIndex < lines.length && lines[startIndex].trim() === '') {
            startIndex += 1;
        }
        while (endIndex >= 0 && lines[endIndex].trim() === '') {
            endIndex -= 1;
        }

        // Extract the relevant lines
        const processedLines = lines.slice(startIndex, endIndex + 1);

        if (processedLines.length === 0) {
            processedLines.push('');
        }

        // Find the minimum indentation across all non-empty lines
        let minIndent = Infinity;
        for (const line of processedLines) {
            if (line.trim() === '') continue;
            const match = line.match(/^\s*/);
            if (match) {
                minIndent = Math.min(minIndent, match[0].length);
            }
        }
        minIndent = minIndent === Infinity ? 0 : minIndent;

        // Remove the common indentation from all lines
        processedLines.forEach((line, i) => {
            if (line.trim() === '') {
                processedLines[i] = '';
            } else {
                const match = line.match(/^\s*/);
                const currentIndent = match ? match[0].length : 0;
                processedLines[i] = line.substring(Math.min(currentIndent, minIndent));
            }
        });

        // Apply the processed content while preserving HTML entities
        code.innerHTML = processedLines.join('\n').trimEnd();
        code.classList.add('fixed-padding');

        // Clean up any extra whitespace in the pre tag
        pre.innerHTML = pre.innerHTML.trim();

        return pre.firstElementChild;
    }

    /**
     * Disconnect from HLJSL's web worker
     */
    disconnect() {
        if (!this.#worker) return;
        this.#worker.terminate();
        this.#worker = null;
        if (this.#domWatcher) {
            this.#domWatcher.disconnect();
            this.#domWatcher = null;
        }
    }

    /**
     * Returns the current auto-load processing status
     * @returns {boolean} True if auto processing is enabled, false otherwise
     */
    getAutoRunStatus() {
        return this.#autoLoad;
    }

    /**
     * Helper method to return the true innerText in a more reliant way
     * @param {HTMLElement} elem The element to get the true innerText from
     * @returns {string} The innerText always including newlines
     */
    #getTrueInnerText(elem) {
        return elem.innerHTML.replace(this.#regex.lineBreak, '\n');
    }

    /**
     * @param {array} find Array of element tags, classes, and/or ids to locate
     * @returns {string} The querySelectorAll string
     */
    getQuerySelectorFindAllString(find = []) {
        if (find.length === 0) return '';
        return find.join(', ');
    }

    /**
     * @param {string} find The query selector to find
     * @param {array} notWithin Array of elements to not search in
     * @returns {string} The proper query selector string
     */
    getQuerySelectorNotWithinString(find, notWithin = []) {
        if (notWithin.length === 0) return find;
        const ignoredSelectors = notWithin.join(', ');
        return `:not(${ignoredSelectors}) > ${find}`;
    }

    /**
     * @returns {string} The users valid BCP 47 language code
     */
    getUserLanguage() {
        let userLanguage = navigator.language || navigator.userLanguage;
        const htmlLang = document.documentElement.lang;
        if (htmlLang && this.#regex.langValidation.test(htmlLang)) {
            userLanguage = htmlLang;
        }
        return userLanguage;
    }

    /**
     * @returns {string} The current version of HLJSL
     */
    getVersion() {
        return this.#version;
    }

    /**
     * @param {HTMLElement} elem The code element to highlight
     */
    highlight(elem) {
        // Handle closed details elements
        const details = elem.closest('details');
        if (details && !details?.dataset?.hljslDelay) {
            details.dataset.hljslDelay = 'true';
            setTimeout(() => {
                this.highlight(elem);
            }, 1);
            return;
        }

        if (this.#hideNumbers) {
            elem.classList.add('hide-numbers');
        }

        elem = this.#correctPadding(elem);

        if (!this.isConnected()) {
            this.connect();
        }

        if (elem.hasAttribute('data-hljsl-id') && !elem.hasAttribute('data-unprocessed')) return;

        if (this.#hideNumbers) {
            elem.parentElement.classList.add('hide-numbers');
        }

        elem = this.#correctPadding(elem);
        elem.classList.add('hljs');
        elem.dataset.hljslId = this.createId();
        elem.dataset.unprocessed = 'true';

        const msg = {
            code: this.#getTrueInnerText(elem),
            codeLang: elem.classList.toString(),
            id: elem.dataset.hljslId,
            pageLang: this.#lang
        };

        this.#worker.postMessage(JSON.stringify(msg));

        // Fail safe retry
        setTimeout(() => {
            if (elem.hasAttribute('data-unprocessed')) {
                this.#worker.postMessage(JSON.stringify(msg));
            }
        }, 3000);
    }

    /**
     * @param {HTMLElement} container Optional container to search within
     */
    highlightAll(container) {
        if (!container) {
            const selector = this.getQuerySelectorNotWithinString('pre code', this.#ignoreElements);
            const autoProcess = this.getQuerySelectorFindAllString(this.#onlyAutoProcess);
            document.querySelectorAll(autoProcess).forEach((elem) => {
                elem.querySelectorAll(selector).forEach((block) => {
                    this.highlight(block);
                });
            });
            return;
        }

        container.querySelectorAll('pre code').forEach((block) => {
            this.highlight(block);
        });
    }

    /**
     * Initialize HLJSL and check for settings
     */
    #initialize() {
        this.#lang = this.getUserLanguage();

        let hljsScriptSrc = '';
        const scripts = document.getElementsByTagName('script');
        for (let i = 0; i < scripts.length; i++) {
            const { src } = scripts[i];
            if (src.includes('hljsl.min.js')) {
                if (src.indexOf('?')) {
                    hljsScriptSrc = src.substring(src.indexOf('?'));
                }
                break;
            }
        }

        const urlParams = new URLSearchParams(hljsScriptSrc);
        if (urlParams.get('autoLoad')) {
            this.#autoLoad = this.isTrue(urlParams.get('autoLoad'));
        }
        if (urlParams.get('hideNumbers')) {
            this.#hideNumbers = this.isTrue(urlParams.get('hideNumbers'));
        }
        if (urlParams.get('lazyLoad')) {
            this.#lazyLoad = this.isTrue(urlParams.get('lazyLoad'));
        }
        if (urlParams.get('minLineNumbers')) {
            const minLineNumbersParam = urlParams.get('minLineNumbers');
            if (minLineNumbersParam !== null) {
                if (this.isTrue(minLineNumbersParam)) {
                    this.#minLineNumbersEnabled = true;
                } else if (!isNaN(parseInt(minLineNumbersParam, 10))) {
                    this.#minLineNumbers = parseInt(minLineNumbersParam, 10);
                    this.#minLineNumbersEnabled = true;
                } else {
                    this.#minLineNumbersEnabled = false;
                }
            }
        }

        window.hljsl = this;
    }

    /**
     * Wait for the body to be loaded before processing code blocks
     * @returns {Promise} Resolves when the body is loaded
     */
    #initializeCodeProcessing() {
        if (!this.#autoLoad) return;

        this.#domWatcher.watch('pre code', (block) => {
            if (block.hasAttribute('data-hljsl-id') && !block.hasAttribute('data-unprocessed')) {
                return;
            }

            if (this.#lazyLoad) {
                const observer = new IntersectionObserver(
                    this.#blockInView.bind(this),
                    { root: null, rootMargin: '100%', threshold: 0 }
                );
                observer.observe(block);
            } else {
                this.highlight(block);
            }
        }, false);
    }

    /**
     * @returns {boolean} Web worker connection state
     */
    isConnected() {
        return this.#worker !== null;
    }

    /**
     * @param {string} str String to convert to boolean
     * @returns {boolean} Converted boolean value
     */
    isTrue(str) {
        if (typeof str === 'string') {
            str = str.trim().toLowerCase();
        }
        switch (str) {
            case true:
            case 'true':
            case 1:
            case '1':
            case 'on':
            case 'yes':
                return true;
            default:
                return false;
        }
    }

    /**
     * Receives response from HLJSL's web worker
     * @param {MessageEvent} evt Response from web worker
     */
    #receiveResponse(evt) {
        const msg = JSON.parse(evt.data);
        const elem = document.querySelector(`[data-hljsl-id="${msg.id}"]`);

        if (!elem) return;

        elem.removeAttribute('data-unprocessed');

        if (msg.language) {
            elem.classList.add(`language-${msg.language}`);
        }

        if (this.#minLineNumbersEnabled && msg.lines < this.#minLineNumbers) {
            elem.classList.add('hide-numbers');
        }

        elem.innerHTML = msg.code.trim();
        elem.parentElement.classList.add('hljsl');
        elem.classList.add('hljs');
        elem.parentElement.innerHTML = elem.outerHTML.trim();

        const button = document.querySelector(`[data-hljsl-id="${msg.id}"] button.hljsl-clipboard`);
        button.addEventListener('click', this.#copyToClipboard);
        button.addEventListener('keydown', this.#copyToClipboard);
    }

    /**
     * @param {object} config Settings to apply
     */
    setConfig(config) {
        if (this.whatIs(config) !== 'object') return;

        if (this.whatIs(config.autoLoad) === 'boolean') {
            this.#autoLoad = config.autoLoad;
        }

        if (this.whatIs(config.hideNumbers) === 'boolean') {
            this.#hideNumbers = config.hideNumbers;
        }

        if (this.whatIs(config.ignoreElements) === 'array') {
            this.#ignoreElements = config.ignoreElements;
        }

        if (this.whatIs(config.lang) === 'string') {
            this.#lang = config.lang;
        }

        if (this.whatIs(config.lazyLoad) === 'boolean') {
            this.#lazyLoad = config.lazyLoad;
        }

        if (this.whatIs(config.minLineNumbers) === 'boolean') {
            this.#minLineNumbersEnabled = config.minLineNumbers;
        } else if (this.whatIs(config.minLineNumbers) === 'number') {
            this.#minLineNumbers = config.minLineNumbers;
            this.#minLineNumbersEnabled = true;
        }

        if (this.whatIs(config.onlyAutoProcess) === 'array' && config.onlyAutoProcess.length > 0) {
            this.#onlyAutoProcess = config.onlyAutoProcess;
        }
    }

    /**
     * Get the type of any value
     * @param {*} unknown Value to check type of
     * @return {string|undefined} Type in lowercase or undefined
     */
    whatIs(unknown) {
        try {
            return {}.toString.call(unknown).match(/\s([^\]]+)/)[1].toLowerCase();
        } catch (e) { return undefined; }
    }

}

export default Highlighter;
