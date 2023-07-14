/* eslint-disable no-param-reassign */
class HighlightLite {

    #autoLoad = true;

    #hideNumbers = false;

    #lang = 'en-us';

    #lazyLoad = true;

    #root = '';

    #worker = null;

    #version = '1.0.0';

    constructor() {
        this.#initialize();
        this.#lang = this.getUserLanguage();
        this.#processBlocks();
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
    async #correctPadding(elem) {
        // We must ignore any empty lines until actual code is encountered.
        let indentation = 0;
        let doIndentation = true;
        // Break the code into their lines for processing.
        const lines = elem.innerText.split('\n');
        // Process each line.
        lines.forEach((line, i) => {
            // If we still haven't figured out indentation keep checking.
            if (indentation === 0 && doIndentation) {
                if (line.length !== 0) {
                    /**
                     * This line has code which indicates the unnecessary indentation
                     * that HLJSL removes to left align the code perfectly.
                     */
                    const match = line.match(/^\s+/);
                    indentation = match ? match[0].length : 0;
                    doIndentation = false;
                }
            }
            // Remove the unnecessary indentation (padding) at the start of each line.
            lines[i] = line.substring(indentation);
        });
        // Make the replacement in the DOM any extra empty new line at the end.
        elem.innerText = lines.join('\n').trimEnd();
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

    async #ensureBaseStyles() {
        const stylesheets = document.styleSheets;
        for (let i = 0; i < stylesheets.length; i++) {
            const { href } = stylesheets[i];
            if (href.includes('/hljsl')) {
                return;
            }
        }
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = `${this.#root}/hljsl.min.css`;
        document.head.appendChild(link);
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
        elem.parentElement.classList.add('hljs');
        // eslint-disable-next-line no-param-reassign
        elem.dataset.hljslId = this.createId();
        const msg = {
            code: elem.innerText,
            codeLang: elem.classList.toString(),
            id: elem.dataset.hljslId,
            pageLang: this.#lang,
            root: this.#root
        };
        // Message the web worker.
        this.#worker.postMessage(JSON.stringify(msg));
    }

    /**
     * Process all code blocks found within the provided container (element).
     *
     * @param {HTMLElement} container The code element to highlight.
     */
    highlightAll(container) {
        // eslint-disable-next-line no-param-reassign
        if (!container) { container = document; }
        // Find all the code blocks in this element.
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

    /**
     * Using a mutation observer watch for pre code blocks being added to the page
     * and immediately start to process them.
     */
    #processBlocks() {
        const bodyObserver = new MutationObserver((mutationList, observer) => {
            for (let i = 0; i < mutationList.length; i++) {
                const mutation = mutationList[i];
                // Do no process unnecessary events; this may be unnecessary.
                if (mutation.type !== 'childList') {
                    return;
                }
                // Skip all elements that are not the body.
                if (mutation.target.nodeName !== 'BODY') {
                    return;
                }
                /**
                 * Body element has been added to the DOM so search it and process
                 * all the code blocks found inside it.
                 */
                this.#ensureBaseStyles();
                const blocks = mutation.target.querySelectorAll('pre code');
                blocks.forEach(async (block) => {
                    block.parentElement.classList.add('hljs');
                    // Before fixing the padding check if we need to hide line numbers.
                    if (this.#hideNumbers) {
                        block.classList.add('hide-numbers');
                    }
                    await this.#correctPadding(block);
                    // Stop processing if autoLoad is false; we only fix the padding and spacing.
                    if (!this.#autoLoad) { return; }
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
                });
                /**
                 * Stop the observer to reduce resource use on this page. If any
                 * code blocks are added later the user will need to manually
                 * call the `highlight` or `highlightAll` methods.
                 */
                observer.disconnect();
            }
        });
        // Start the observer.
        bodyObserver.observe(document.documentElement, { childList: true, subtree: true });
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

}

const hljsl = new HighlightLite();

// Rollup will create an iife and we want only some methods to be publicly accessible.
export default hljsl;
