// Updated from package.json on build.
const Version = '???';

import Editor from './editor.js';
import DOMWatcher from './dom-watcher.js';
import languageDetector from './language-detector.js';

/**
 * @class Highlighter
 * @description Handles syntax highlighting of code blocks using Web Workers and intersection observers
 */
class Highlighter {

    // Private static instance for singleton pattern
    static #instance = null;

    // Consolidated regex patterns
    #regex = {
        closingSpan: /<\/span>/,
        langValidation: /^[a-zA-Z]{2}(-[a-zA-Z]{2})?$/,
        leadingWhitespace: /^\s*/,
        lineBreak: /(<br[^>]*>)/gi,
        openingSpan: /<span[^>]*>/
    };

    // Configuration and state
    #autoLoad = true;
    #editor = new Editor();
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

        window.languageDetector = languageDetector;

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
        // Process all intersecting entries at once
        const intersectingEntries = entries.filter((entry) => entry.isIntersecting);

        // Process highlighting as quickly as possible
        intersectingEntries.forEach((entry) => {
            this.highlight(entry.target);
        });

        // Batch the observer disconnection for better performance
        if (intersectingEntries.length > 0) {
            // Use a single timeout for all processed entries
            requestAnimationFrame(() => {
                intersectingEntries.forEach((entry) => {
                    if (entry.target.hasAttribute('data-hljsl-id') &&
                        !entry.target.hasAttribute('data-unprocessed')) {
                        observer.unobserve(entry.target);
                    }
                });
            });
        }
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
        let button = evt.currentTarget || evt.target;
        if (button.nodeName !== 'BUTTON') {
            button = button.closest('button');
        }
        if (!button) return;

        // Only process this event if we can find the table with the code to copy
        let pre = button.closest('code, pre');
        if (!pre) {
            pre = button.closest('div');
            if (!pre) return;

            pre = pre.nextElementSibling;
            if (!pre || pre.nodeName !== 'PRE') return;
        };

        /**
         * Helper function to dedent a block of text by removing the common leading whitespace.
         * @param {string} text The text to dedent
         * @returns {string} The dedented text
         */
        function dedent(text) {
            const lines = text.split('\n');
            const nonEmptyLines = lines.filter((line) => line.trim());
            if (nonEmptyLines.length === 0) return text;

            const minIndent = Math.min(...nonEmptyLines.map((line) => {
                const match = line.match(/^[ \t]*/);
                return match ? match[0].length : 0;
            }));

            return lines.map((line) => line.slice(minIndent)).join('\n');
        }

        function getBlockTemplates(pre) {
            let preText = '';
            let postText = '';

            // Find the preceding template
            // Walk backwards from pre, skipping over .editor-controls
            let prevElement = pre.previousElementSibling;

            // Skip past .editor-controls to find potential template
            if (prevElement?.classList.contains('editor-controls')) {
                prevElement = prevElement.previousElementSibling;
            }

            // If we found a template, it belongs to this pre
            if (prevElement?.nodeName === 'TEMPLATE') {
                const content = prevElement.innerHTML.replace(/^\n/, '').replace(/\n$/, '');
                if (content.trim()) {
                    preText = `${dedent(content)}\n`;
                }
            }

            /**
             * A template after pre could belong to:
             * 1. This pre (if nothing follows)
             * 2. The next pre (if there's another editor block coming)
             */

            let nextElement = pre.nextElementSibling;

            // Skip past any immediate non-template elements (like remaining controls)
            while (nextElement &&
           nextElement.nodeName !== 'TEMPLATE' &&
           nextElement.nodeName !== 'PRE' &&
           !nextElement.classList.contains('editor-controls')) {
                nextElement = nextElement.nextElementSibling;
            }

            // If we hit a template, check what comes after it
            if (nextElement?.nodeName === 'TEMPLATE') {
                const templateElement = nextElement;
                const afterTemplate = templateElement.nextElementSibling;

                // Check if there's an editor-controls + pre combo after this template
                // If so, the template belongs to the NEXT block, not this one
                if (afterTemplate?.classList.contains('editor-controls')) {
                    const potentialPre = afterTemplate.nextElementSibling;
                    if (potentialPre?.nodeName === 'PRE' && potentialPre.classList.contains('editor')) {
                        // Template belongs to next block, don't assign it to postText
                        return { preText, postText };
                    }
                }

                // Check if there's a pre directly after the template
                if (afterTemplate?.nodeName === 'PRE' && afterTemplate.classList.contains('editor')) {
                    // Template belongs to next block
                    return { preText, postText };
                }

                // Otherwise, this template belongs to the current pre
                const content = templateElement.innerHTML.replace(/^\n/, '').replace(/\n$/, '');
                if (content.trim()) {
                    postText = `\n\n${dedent(content)}`;
                }
            }

            return { preText, postText };
        }

        const { preText, postText } = getBlockTemplates(pre);

        // let preText = '';
        // let postText = '';
        // if (pre.classList.contains('editor')) {
        //     // Check for preText (template before pre)
        //     const prev = pre.previousElementSibling;
        //     if (prev && prev.previousElementSibling) {
        //         if (prev.previousElementSibling.nodeName === 'TEMPLATE') {
        //             let rawText = prev.previousElementSibling.innerHTML.replace(/^\n/, '').replace(/\n$/, '');
        //             rawText = dedent(rawText);
        //             if (rawText) {
        //                 preText = `${rawText.replace(/\\n/g, '\n')}\n`;
        //             }
        //         }
        //     }
        //     // Check for postText (template after pre)
        //     const next = pre.nextElementSibling;
        //     if (next && next.nodeName === 'TEMPLATE') {
        //         let rawText = next.innerHTML.replace(/^\n/, '').replace(/\n$/, '');
        //         rawText = dedent(rawText);
        //         if (rawText) {
        //             postText = `\n\n${rawText.replace(/\\n/g, '\n')}`;
        //         }
        //     }
        // }

        const table = pre.querySelector('table');
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

        const fullText = `${preText}${tmpDiv.textContent.trimEnd()}${postText}`;
        navigator.clipboard.writeText(fullText)
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
        elem.querySelector('.fixed-padding')
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

        // Use textContent to get the actual decoded text for processing
        const lines = code.textContent.split('\n');

        // Handle first line edge case when it's on the same line as the code tag
        if (lines.length > 1 && lines[0].trim() !== '') {
            const firstLineIndent = lines[0].match(this.#regex.leadingWhitespace)[0].length;
            if (firstLineIndent === 0) {
                const secondLineIndent = lines[1].match(this.#regex.leadingWhitespace)[0].length;
                lines[0] = ' '.repeat(secondLineIndent) + lines[0];
            }
        }

        // Process all lines in a single pass
        let startIndex = 0;
        let endIndex = lines.length - 1;
        let minIndent = Infinity;

        // Find bounds and minimum indent in a single pass
        for (let i = 0; i < lines.length; i++) {
            const trimmed = lines[i].trim();

            // Skip empty lines at the start
            if (trimmed === '' && i === startIndex) {
                startIndex += 1;
                continue;
            }

            // Track last non-empty line
            if (trimmed !== '') {
                endIndex = i;
                // Calculate indent using actual whitespace characters
                const leadingWhitespace = lines[i].match(this.#regex.leadingWhitespace);
                const indent = leadingWhitespace ? leadingWhitespace[0].length : 0;
                if (indent < minIndent) minIndent = indent;
            }
        }

        // Safety check
        minIndent = minIndent === Infinity ? 0 : minIndent;

        // Extract and process lines in one go
        const processedLines = lines.slice(startIndex, endIndex + 1).map((line) => {
            if (line.trim() === '') return '';
            return line.substring(minIndent);
        });

        if (processedLines.length === 0) {
            processedLines.push('');
        }

        // Apply the processed content - textContent will auto-encode HTML entities
        code.textContent = processedLines.join('\n').trimEnd();
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

        // Ensure elem is a <code> element or find a suitable one
        if (elem.nodeName.toLowerCase() !== 'code') {
            const codeChild = elem.querySelector('code');
            if (codeChild) {
                elem = codeChild;
            } else {
                const codeParent = elem.closest('code');
                if (codeParent) {
                    elem = codeParent;
                } else {
                    // No <code> element found; bail
                    return;
                }
            }
        }

        if (this.#hideNumbers) {
            elem.classList.add('hide-numbers');
        }

        if (!this.isConnected()) {
            this.connect();
        }

        if (elem.hasAttribute('data-hljsl-id') && elem.hasAttribute('data-unprocessed')) return;

        // If elem contains a table, handle it differently
        let innerText = '';
        if (elem.querySelector('table')) {
            const cells = elem.querySelectorAll('table tr td:nth-child(2)');
            innerText = Array.from(cells).map((cell) => cell.textContent).join('\n');
        } else {
            elem = this.#correctPadding(elem);
            elem.classList.add('hljs');
            elem.dataset.hljslId = this.createId();
            elem.dataset.unprocessed = 'true';
            innerText = this.#getTrueInnerText(elem);
        }

        // Check if element should be treated as an editor
        let editor = false;
        if (elem?.classList?.contains('editor') || elem.parentElement?.classList?.contains('editor')) {
            editor = true;
        }

        // Check if language should be locked; used for code editor mode
        let locked = false;
        if (elem.classList.contains('locked')) {
            locked = true;
        }

        const msg = {
            code: innerText,
            codeLang: elem.classList.toString(),
            editor,
            id: elem.dataset.hljslId,
            locked,
            pageLang: this.#lang
        };

        this.#worker.postMessage(msg);

        // Fail safe retry
        setTimeout(() => {
            if (elem.hasAttribute('data-unprocessed')) {
                this.#worker.postMessage(msg);
            }
        }, 3000);
    }

    /**
     * @param {HTMLElement} container Optional container to search within
     */
    highlightAll(container) {
        // Cache selector creation for performance
        const selector = container ? 'pre code' :
            this.getQuerySelectorNotWithinString('pre code', this.#ignoreElements);

        if (!container) {
            // Cache these calculations
            const autoProcessSelector = this.getQuerySelectorFindAllString(this.#onlyAutoProcess);
            const containers = document.querySelectorAll(autoProcessSelector);

            // Process each container in batches
            for (let i = 0; i < containers.length; i++) {
                const blocks = containers[i].querySelectorAll(selector);
                for (let j = 0; j < blocks.length; j++) {
                    this.highlight(blocks[j]);
                }
            }
            return;
        }

        // Process direct container
        const blocks = container.querySelectorAll(selector);
        for (let i = 0; i < blocks.length; i++) {
            this.highlight(blocks[i]);
        }
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
        const msg = evt.data;
        const elem = document.querySelector(`[data-hljsl-id="${msg.id}"]`);

        if (!elem) return;

        const pre = elem.closest('pre');
        if (!pre) return;

        elem.removeAttribute('data-unprocessed');
        elem.classList.forEach((cls) => {
            if (cls.startsWith('language-')) {
                elem.classList.remove(cls);
            }
        });

        if (msg.language) {
            /**
             * Language will always be a string but if isbl was detected or an
             * error occurred it will be a comma separated list of languages.
             */
            msg.language.split(',').forEach((lang) => {
                elem.classList.add(`language-${lang.trim()}`);
            });
        }

        if (this.#minLineNumbersEnabled && msg.lines < this.#minLineNumbers) {
            elem.classList.add('hide-numbers');
        }

        if (pre.classList.contains('editor')) {
            pre.dataset.displayLanguage = msg.displayLanguage;
            this.#editor.deactivateEditor(pre);
        }

        // In editor mode, don't trim to preserve user's whitespace
        elem.innerHTML = msg.editor ? msg.code : msg.code.trim();
        elem.parentElement.classList.add('hljsl');
        elem.classList.add('hljs');
        elem.parentElement.innerHTML = elem.outerHTML.trim();

        const button = pre.querySelector('button.hljsl-clipboard');
        button.addEventListener('click', this.#copyToClipboard);
        button.addEventListener('keydown', this.#copyToClipboard);

        if (pre.classList.contains('editor')) {
            this.#editor.activateEditor(pre);
        }
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
