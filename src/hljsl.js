let autoRunCompleted = false;

/* eslint-disable no-param-reassign */
class HighlightLite {

    #autoLoad = true;

    #hideNumbers = false;

    #ignoreElements = [];

    #lang = 'en-us';

    #lazyLoad = true;

    #onlyAutoProcess = ['body'];

    #root = '';

    #worker = null;

    #version = '1.1.0';

    constructor(config = {}) {
        this.#initialize();
        // Set or check for alternative config options.
        if (Object.keys(config).length === 0) {
            this.#checkForGlobalConfig();
        } else {
            this.setConfig(config);
        }
        // Only the primary instance of HLJSL should auto run.
        if (autoRunCompleted) { return; }
        autoRunCompleted = true;
        this.#waitForBody();
    }

    /**
     * Watch a block for intersection events and when it appears to be coming up
     * in the viewport (or already showing), process the block. This is used to
     * lazy process (load) code blocks.
     *
     * @param {Array} entries An array of observed events that have triggered this function.
     * @param {IntersectionObserver} observer The observer watching this element/event.
     */
    #blockInView(entries, observer) {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                observer.disconnect(); // Block is about to be processed so stop watching it.
                this.highlight(entry.target);
            }
        });
    }

    /**
     * Helper method that checks for and uses the users global config if set.
     */
    #checkForGlobalConfig() {
        const globalConfig = window.hljslConfig;
        if (!globalConfig) { return; }
        this.setConfig(globalConfig);
    }

    /**
     * Create a unique id.
     *
     * @returns {string} A generally unique id.
     */
    createId() {
        return `${Date.now().toString(36)}${Math.random().toString(36).substring(2)}`.toUpperCase();
    }

    /**
     * Connect to HLJSL's web worker.
     *
     * @returns {void} Used as a short circuit only.
     */
    connect() {
        if (this.#worker) {
            return;
        }
        const worker = new Worker(`${this.#root}/hljsl-worker.min.js`);
        worker.onmessage = this.#receiveResponse.bind(this);
        this.#worker = worker;
    }

    /**
     * Copy code from a block to the users clipboard.
     *
     * @param {HTMLElement} button The copy to clipboard button that was pressed.
     * @returns {void} Used as a short circuit.
     */
    copyToClipboard(button) {
        const table = button.nextElementSibling;
        if (table.nodeName !== 'TABLE') { return; }
        // Visually show the table is being copied.
        button.ariaPressed = true;
        table.classList.add('copy-to-clipboard');
        // Actually copy the table to the users clipboard:
        const cells = table.querySelectorAll('tr td:nth-child(2)');
        // Copy data to a temporary div.
        const tmpDiv = document.createElement('div');
        cells.forEach((cell) => {
            tmpDiv.textContent += `${cell.textContent}\n`;
        });
        // Copy the text from the temporary div to the clipboard using the Clipboard API.
        navigator.clipboard.writeText(tmpDiv.textContent.trimEnd())
            .catch((error) => {
                console.error('Failed to copy text to clipboard:', error);
            });
        // Remove the visual effect.
        setTimeout(() => {
            table.classList.remove('copy-to-clipboard');
            button.ariaPressed = false;
        }, 500);
    }

    /**
     * Correct the padding of code blocks.
     *
     * @param {HTMLElement} elem The code element to process.
     */
    #correctPadding(elem) {
        // Don't waste time reprocessing a block.
        if (elem.classList.contains('fixed-padding')
            || elem.parentElement.classList.contains('fixed-padding')
            || elem.querySelector('fixed-padding')
        ) { return elem; }
        // Enforce proper <pre><code> structure.
        let pre;
        let code;
        if (elem.nodeName === 'PRE') {
            // Correct pre element.
            pre = elem;
            code = elem.querySelector('code');
            if (!code) {
                // Incorrect code element.
                code = document.createElement('CODE');
                code.innerText = pre.innerText;
                pre.innerHTML = '';
                pre.appendChild(code);
            }
        } else if (elem.nodeName === 'CODE') {
            // Correct code element.
            pre = elem.closest('pre');
            code = elem;
            if (!pre) {
                // Incorrect pre element.
                pre = document.createElement('PRE');
                code.parentElement.insertBefore(pre, elem);
                pre.appendChild(code);
            }
        } else {
            // Pre and code missing entirely.
            pre = document.createElement('PRE');
            code = document.createElement('CODE');
            code.innerText = elem.innerHTML;
            pre.appendChild(code);
            elem.parentElement.insertBefore(pre, elem);
            elem.parentElement.removeChild(elem);
        }
        // Break the code into their lines for processing.
        const lines = code.innerText.split('\n');
        /**
         * Remove empty lines from the start and end of the code. We cannot
         * use trim because it will wipe the indentation we are trying to find.
         */
        let startIndex = 0;
        let endIndex = lines.length - 1;
        // Find the index of the first non-empty line from the start.
        while (startIndex < lines.length && lines[startIndex].trim() === '') {
            startIndex += 1;
        }
        // Find the index of the first non-empty line from the end.
        while (endIndex >= 0 && lines[endIndex].trim() === '') {
            endIndex -= 1;
        }
        // Calculate the number of empty lines to remove from the start and end.
        const numEmptyLinesAtStart = startIndex;
        const numEmptyLinesAtEnd = lines.length - 1 - endIndex;
        // Remove the empty lines from the start and end of the array.
        lines.splice(0, numEmptyLinesAtStart);
        lines.splice(lines.length - numEmptyLinesAtEnd, numEmptyLinesAtEnd);
        // Just in case we were given a bad code block save it from erroring out here.
        if (lines.length === 0) { lines.push(''); }
        // Count the spaces from the first line, this indicates the indentation we need to remove.
        const match = lines[0].match(/^\s+/);
        const indentation = match ? match[0].length : 0;
        // Remove the unnecessary indentation (padding) at the start of each line.
        lines.forEach((line, i) => {
            lines[i] = line.substring(indentation);
        });
        // Mark the pre tag as highlight.js
        pre.classList.add('hljs');
        // Make the replacement in the DOM and remove any extra empty new line at the end.
        code.innerText = lines.join('\n').trim();
        code.classList.add('fixed-padding');
        pre.innerHTML = pre.innerHTML.trim(); // This breaks the users DOM reference!
        return pre.firstElementChild; // Must return the new code element.
    }

    /**
     * Disconnect from HLJSL's web worker.
     *
     * @returns {void} Used as a short circuit.
     */
    disconnect() {
        if (!this.#worker) {
            return;
        }
        this.#worker.terminate();
        this.#worker = null;
    }

    /**
     * Check the status of the page being auto loaded (processed).
     *
     * @returns {boolean} True if the primary HLJSL instance auto loaded (processed) the page.
     */
    getAutoRunStatus() {
        return autoRunCompleted;
    }

    /**
     * Helper method to return the true innerText in a more reliant and performant way. According to
     * the standards, if an element or its text is hidden by CSS then no newlines are added to the
     * result of innerText. Any call to innerText also triggers a redraw since the elements style
     * has to be taken into account. Here we work around these issues (cheat) by using innerHTML and
     * replacing the <br> (line break) tags with newlines.
     *
     * @param {HTMLElement} elem The element to get the true innerText from.
     *
     * @returns {string} The innerText always including newlines.
     */
    #getTrueInnerText(elem) {
        return elem.innerHTML.replace(/<br\s*\/?>/gi, '\n');
    }

    /**
     * Build the querySelectorAll string to search and find all specified elements.
     *
     * @param {array} find An array of element tags, classes prefixed with the css dot (.), and/or
     *                     ids prefixed with the css pound (#) to locate in the page.
     *
     * @returns {string} The querySelectorAll string to locate all your requested elements.
     */
    getQuerySelectorFindAllString(find = []) {
        if (find.length === 0) { return ''; }
        return find.join(', ');
    }

    /**
     * Builds the query string meant to be used with querySelectorAll and allows not searching
     * within classes, ids, and/or elements.
     *
     * @param {string} find The query selector you would like to find.
     * @param {array} notWithin An array of element tags, classes prefixed with the css dot (.), and/or
     *                          ids prefixed with the css pound (#) to not search in.
     *
     * @returns {string} The proper query selector string to use with querySelectorAll.
     */
    getQuerySelectorNotWithinString(find, notWithin = []) {
        if (notWithin.length === 0) { return find; }
        const ignoredSelectors = notWithin.join(', ');
        return `:not(${ignoredSelectors}) > ${find}`;
    }

    /**
     * Detect what language the user is viewing the page in.
     *
     * @returns {string} The users valid BCP 47 language code.
     */
    getUserLanguage() {
        // Start with the browsers language setting.
        let userLanguage = navigator.language || navigator.userLanguage;
        // Check if lang attribute is set in the HTML tag.
        const htmlLang = document.documentElement.lang;
        if (htmlLang) {
            // Check if the lang attribute is a valid BCP 47 language tag.
            const langRegex = /^[a-zA-Z]{2}(-[a-zA-Z]{2})?$/;
            if (langRegex.test(htmlLang)) {
                // Use the language that the developer set instead.
                userLanguage = htmlLang;
            }
        }
        return userLanguage;
    }

    /**
     * Share the version of HLJSL being used.
     *
     * @returns  {string} The current version on HLJSL.
     */
    getVersion() {
        return this.#version;
    }

    /**
     * Highlight a code element with HLJS using the HLJSL web worker.
     *
     * @param {HTMLElement} elem The code element to highlight.
     */
    highlight(elem) {
        // If the web worker is not connected do so now.
        if (!this.isConnected()) {
            /**
             * NOTE: We do not connect automatically in case this page doesn't
             * have any code blocks to highlight.
             */
            this.connect();
        }
        // Do not waste time reprocessing a block.
        if (elem.hasAttribute('hljsl-id')) { return; }
        /**
         * This should have been added already but a deferred code block that the
         * user wants to manually process will be missing this.
         */
        if (this.#hideNumbers) {
            elem.parentElement.classList.add('hide-numbers');
        }
        elem = this.#correctPadding(elem);
        /**
         * This should have been added already but a deferred code block that the
         * user wants to manually process will be missing this.
         */
        elem.parentElement.classList.add('hljs');
        // eslint-disable-next-line no-param-reassign
        elem.dataset.hljslId = this.createId();
        const msg = {
            code: this.#getTrueInnerText(elem),
            codeLang: elem.classList.toString(),
            id: elem.dataset.hljslId,
            pageLang: this.#lang,
            root: this.#root
        };
        // Message the web worker.
        this.#worker.postMessage(JSON.stringify(msg));
    }

    /**
     * Process all code blocks found within the provided container (element) or leave empty and the
     * user/global settings will be used to find blocks to process.
     *
     * @param {HTMLElement} container The element to search for code blocks within to highlight.
     */
    highlightAll(container) {
        // eslint-disable-next-line no-param-reassign
        if (!container) {
            // No container was provided so process according to the users/global settings.
            const selector = this.getQuerySelectorNotWithinString('pre code', this.#ignoreElements);
            const autoProcess = this.getQuerySelectorFindAllString(this.#onlyAutoProcess);
            const elems = document.querySelectorAll(autoProcess);
            elems.forEach((elem) => {
                const blocks = elem.querySelectorAll(selector);
                blocks.forEach((block) => {
                    // Process each code block found.
                    this.highlight(block);
                });
            });
            return;
        }
        // Find all the code blocks in the provided element.
        const codeBlocks = container.querySelectorAll('pre code');
        codeBlocks.forEach((block) => {
            // Process each code block found.
            this.highlight(block);
        });
    }

    /**
     * Initializes HLJSL by determining its root location and checking for various options (settings).
     */
    #initialize() {
        // Set the apps language.
        this.#lang = this.getUserLanguage();
        // Determine the root (directory) location of HLJSL.
        this.#root = window?.location?.origin;
        let hljsScriptSrc = '';
        const scripts = document.getElementsByTagName('script');
        for (let i = 0; i < scripts.length; i++) {
            const { src } = scripts[i];
            if (src.includes('/hljsl')) {
                if (src.indexOf('?')) {
                    hljsScriptSrc = src.substring(src.indexOf('?'));
                }
                this.#root = src.substring(0, src.indexOf('/hljsl'));
                break;
            }
        }
        // Check for and configure various options (settings).
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
    }

    /**
     * Check if HLJSL's Web worker is connected.
     *
     * @returns {boolean} Boolean indicating the web worker connection state; true is connected.
     */
    isConnected() {
        return !(this.#worker === null);
    }

    /**
     * Convert a string representing a boolean into an actual boolean.
     *
     * @param {string} str The string to convert to the correct boolean value.
     * @returns
     */
    isTrue(str) {
        if (typeof (str) === 'string') {
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

    #processBlock(block) {
        // Process blocks now or lazy load them?
        if (!this.#lazyLoad) {
            // Process blocks now.
            this.highlight(block);
            return;
        }
        // Lazy load blocks instead; recommended for pages with many code blocks.
        const blockObserverOptions = {
            root: null,
            rootMargin: '100%',
            threshold: 0
        };
        const blockObserver = new IntersectionObserver(
            this.#blockInView.bind(this),
            blockObserverOptions
        );
        blockObserver.observe(block);
    }

    /**
     * Automatically process code blocks according to the default or global settings.
     */
    #processBlocks() {
        // We automatically fix all code block padding and show or hide line numbers no matter what.
        document.body.querySelectorAll('pre code').forEach((block) => {
            // Before fixing the padding check if we need to hide line numbers.
            if (this.#hideNumbers) {
                block.classList.add('hide-numbers');
            }
            this.#correctPadding(block);
        });
        // Now process the page according to the users/global settings.
        const selector = this.getQuerySelectorNotWithinString('pre code', this.#ignoreElements);
        const autoProcess = this.getQuerySelectorFindAllString(this.#onlyAutoProcess);
        const elems = document.querySelectorAll(autoProcess);
        elems.forEach((elem) => {
            const blocks = elem.querySelectorAll(selector);
            blocks.forEach((block) => {
                // Stop processing if autoLoad is false; we only fix the padding and spacing.
                if (!this.#autoLoad) { return; }
                this.#processBlock(block);
            });
        });
    }

    /**
     * Receives the response from HLJSL's web worker.
     *
     * @param {MessageEvent} evt The response from HLJSL's web worker.
     */
    #receiveResponse(evt) {
        const msg = JSON.parse(evt.data);
        // Using the elements id to locate the actual element.
        const elem = document.querySelector(`[data-hljsl-id="${msg.id}"]`);
        // Clean the response just in case an empty newline snuck in at the end.
        elem.innerHTML = msg.code.trim();
        // Place the code block on the same line as the pre block to remove those empty lines.
        elem.parentElement.innerHTML = elem.outerHTML.trim();
        /**
         * Make sure the code block has a HLJS language tag. If it already does then this should be
         * the same that was used during the processing. If you were missing the language tag this
         * will be the language HLJS detected this code to be.
         */
        elem.classList.add(msg.language);
    }

    /**
     * Allows changing the default settings being used by this instance of HLJSL.
     *
     * @param {object} config The settings you would like to set.
     * @returns
     */
    setConfig(config) {
        if (this.whatIs(config) !== 'object') { return; }

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

        if (this.whatIs(config.onlyAutoProcess) === 'array') {
            if (config.onlyAutoProcess.length > 0) {
                this.#onlyAutoProcess = config.onlyAutoProcess;
            }
        }
    }

    /**
     * Using a mutation observer watch for pre code blocks being added to the page
     * and immediately start to process them.
     */
    #waitForBody() {
        const bodyObserver = new MutationObserver((mutationList, observer) => {
            for (let i = 0; i < mutationList.length; i++) {
                const mutation = mutationList[i];
                // Do no process unnecessary events; ignores attribute events.
                if (mutation.type !== 'childList') {
                    // eslint-disable-next-line no-continue
                    continue;
                }
                // Skip all elements that are not the body.
                if (mutation.target.nodeName !== 'BODY') {
                    // eslint-disable-next-line no-continue
                    continue;
                }
                /**
                 * Stop the observer to reduce resource use on this page. If any
                 * code blocks are added later the user will need to manually
                 * call the `highlight` or `highlightAll` methods.
                 */
                observer.disconnect();
                /**
                 * Body element has been added to the DOM so search it and process
                 * all the code blocks found inside it.
                 */
                this.#processBlocks();
                return; // Kill the loop so we don't trigger another reprocessing!
            }
        });
        // Start the observer.
        bodyObserver.observe(document.documentElement, { childList: true, subtree: true });
    }

    /**
     * The fastest way to get the actual type of anything in JavaScript.
     *
     * {@link https://jsbench.me/ruks9jljcu/2 | See benchmarks}.
     *
     * @param {*} unknown Anything you wish to check the type of.
     * @return {string|undefined} The type in lowercase of the unknown value passed in or undefined.
     */
    whatIs(unknown) {
        try {
            return ({}).toString.call(unknown).match(/\s([^\]]+)/)[1].toLowerCase();
        } catch (e) { return undefined; }
    }

}

// Primary instance of HLJSL that auto precesses the page.
window.hljsl = new HighlightLite();

// Rollup will create an iife adding HighlightLite globally to the window as HLJSL.
export default HighlightLite;
