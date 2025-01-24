import copyToClipboardMap from './i18n.js';
import validCodeLanguages from './languages.js';

/**
 * @typedef {Object} MessageData
 * @property {string} id Unique identifier for the message
 * @property {string} pageLang Language code for the page
 * @property {string} code Code to be highlighted
 * @property {string} codeLang Language(s) specified for the code
 */

/**
 * @typedef {Object} HighlightResult
 * @property {string} value Highlighted code HTML
 * @property {string} [language] Detected language
 * @property {Object} [secondBest] Second best language match
 * @property {string} secondBest.language Second best detected language
 */

/**
 * Web worker class for syntax highlighting code using highlight.js
 */
class Webworker {

    // Private static property to hold the instance
    static #instance;

    // Private fields with initialized values
    #validLanguagesSet = new Set(validCodeLanguages);
    #tableLines = [];

    // Map of HTML entities to their symbol representations
    #commonEntityMap = new Map([
        ['&lt;', { symbol: '<', regex: /&lt;/g }],
        ['&gt;', { symbol: '>', regex: /&gt;/g }],
        ['&amp;', { symbol: '&', regex: /&amp;/g }],
        ['&quot;', { symbol: '"', regex: /&quot;/g }],
        ['&apos;', { symbol: "'", regex: /&apos;/g }],
        ['&semi;', { symbol: ';', regex: /&semi;/g }]
    ]);

    // Pre-compiled regex patterns for detecting various template syntaxes
    #possibleJsTemplate = Object.freeze([
        // EJS-style patterns
        /(?:<|&lt;)%.*?%(?:>|&gt;)/,                    // Basic EJS
        /(?:<|&lt;)%=.*?%(?:>|&gt;)/,                   // EJS output
        /(?:<|&lt;)%-.*?%(?:>|&gt;)/,                   // EJS unescaped output
        /(?:<|&lt;)%#.*?%(?:>|&gt;)/,                   // EJS comments
        // Handlebars/Mustache patterns
        /\{\{.*?\}\}/,                                   // Basic interpolation
        /\{\{#.*?\}\}.*?\{\{\/.*?\}\}/,                 // Block helpers
        /\{\{!.*?\}\}/,                                 // Comments
        /\{\{>.*?\}\}/,                                 // Partials
        /\{\{#if\s+.*?\}\}.*?\{\{\/if\}\}/,            // Conditionals
        /\{\{#each\s+.*?\}\}.*?\{\{\/each\}\}/,        // Iteration
        // Other template engines
        /\{%.*?%\}/,                                    // Nunjucks/Liquid/Twig blocks
        /\{#.*?#\}/,                                    // Jinja2 comments
        /\{%.*?\s+.*?\s*%\}/,                          // Twig blocks
        /(?:<|&lt;)%-.*?%(?:>|&gt;)/,                   // Pug unescaped output
        /\{\{%.*?%\}\}/,                               // Twig special blocks
        // Generic patterns
        /(?:\{\{|(?:<|&lt;)%).*?for\s+.*?\s+in\s+.*?/, // Generic iteration
        /\{\{.*?\|.*?\}\}/                             // Filter syntax
    ]);

    // Class level regex patterns for span detection
    #spanPatterns = {
        opening: /<span[^>]*>/,
        closing: /<\/span>/
    };

    /**
     * Initialize the web worker and set up highlight.js
     * @param {string} scriptDirname Directory path for the highlight.js script
     */
    constructor(scriptDirname) {
        if (Webworker.#instance) {
            return Webworker.#instance;
        }

        try {
            importScripts(`${scriptDirname}hljs.min.js`);
            this.#registerAliases();
            self.onmessage = this.#onMessage.bind(this);
            Webworker.#instance = this;
        } catch (error) {
            console.error('Failed to initialize webworker:', error);
            throw error;
        }
    }

    /**
     * Builds the HTML for a "Copy to Clipboard" button
     * @param {string} pageLang The language code for button text
     * @returns {string} HTML markup for the button
     */
    #buildCopyToClipboardButton(pageLang) {
        const langKey = pageLang.toLowerCase().split('-')[0];
        const title = copyToClipboardMap[langKey] ?? copyToClipboardMap.en;

        /* eslint-disable */
        return `<button type="button" aria-pressed="false" class="hljsl-clipboard" title="${title}">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
            <path d="M21 2h-19v19h-2v-21h21v2zm3 2v20h-20v-20h20zm-2 2h-1.93c-.669 0-1.293.334-1.664.891l-1.406 2.109h-6l-1.406-2.109c-.371-.557-.995-.891-1.664-.891h-1.93v16h16v-16zm-3 6h-10v1h10v-1zm0 3h-10v1h10v-1zm0 3h-10v1h10v-1z"/>
            </svg>
        </button>`.replace(/\s+/g, ' ').trim();
        /* eslint-enable */
    }

    /**
     * Builds an HTML table with line numbers from highlighted code
     * @param {string} code The highlighted code HTML
     * @param {string} [pageLang='en'] Language code for the copy button
     * @returns {{table: string, lines: number}} Table HTML and line count
     */
    #buildTable(code, pageLang = 'en') {
        this.#tableLines.length = 0;
        let openSpan = '';

        const lines = code.trim().split('\n');
        const copyButton = this.#buildCopyToClipboardButton(pageLang);
        this.#tableLines.push(`${copyButton}<table class="hljsl-table"><tbody>`);

        for (let i = 0; i < lines.length; i++) {
            let modifiedLine = lines[i];

            // If we have an open span, prepend it
            if (openSpan) {
                modifiedLine = openSpan + modifiedLine;
            }

            const openingSpanMatch = modifiedLine.match(this.#spanPatterns.opening);
            const closingSpanMatch = modifiedLine.match(this.#spanPatterns.closing);

            // Handle span tag continuation across lines
            if (openingSpanMatch && !closingSpanMatch) {
                [openSpan] = openingSpanMatch;
            } else if (closingSpanMatch) {
                openSpan = '';
            }

            // Ensure empty lines are copyable
            if (!modifiedLine) {
                modifiedLine = '<span> </span>';
            }

            this.#tableLines.push(
                `<tr><td>${i + 1}</td><td>${modifiedLine}</td></tr>`
            );
        }

        this.#tableLines.push('</tbody></table>');
        return {
            table: this.#tableLines.join('\n'),
            lines: lines.length
        };
    }

    /**
     * Handles incoming messages for code highlighting
     * @param {MessageEvent<string>} evt The message event containing the code
     */
    #onMessage(evt) {
        try {
            const msg = JSON.parse(evt.data);
            const { id, pageLang, code } = msg;
            const codeLang = this.#processLanguages(msg.codeLang, code);

            const preprocessedCode = this.#preprocessCode(code);
            let result = this.#highlightCode(preprocessedCode, codeLang);

            // If no language was detected try the second best
            if (!result.language && result?.secondBest?.language) {
                result = result.secondBest;
            }

            const { table, lines } = this.#buildTable(result.value, pageLang);

            self.postMessage(JSON.stringify({
                code: table,
                id,
                language: result.language,
                lines
            }));
        } catch (error) {
            console.error('Message processing failed:', error);
            self.postMessage(JSON.stringify({
                code: msg,
                id,
                language: result.language,
                lines: msg.split('\n').length
            }));
        }
    }

    /**
     * Processes and expands language hints for better detection
     * @param {string} codeLang Original language string
     * @param {string} code The code to analyze
     * @returns {string[]} Expanded array of language hints
     */
    #processLanguages(codeLang, code) {
        const langs = codeLang.toLowerCase().split(' ')
            .filter((value) => this.#validLanguagesSet.has(value));

        // Help highlight languages that are commonly broken during the highlighting process
        if (langs.includes('css')) {
            langs.push('scss', 'less');
        }

        if (langs.includes('html')) {
            langs = langs.filter((lang) => lang !== 'html' && lang !== 'language-html');
            langs.push('django');
            if (this.#possibleJsTemplate.some((regex) => regex.test(code))) {
                langs.push('javascript');
            }
            langs.push('xml');
        }

        if (langs.includes('ini')) {
            langs.push('abnf', 'yaml');
        }

        if (langs.includes('php')) {
            langs.push('php-template');
        }

        return langs;
    }

    /**
     * Preprocesses code by converting HTML entities to symbols
     * @param {string} code Raw code with HTML entities
     * @returns {string} Processed code with actual symbols
     */
    #preprocessCode(code) {
        let result = code;
        for (const [, { symbol, regex }] of this.#commonEntityMap) {
            result = result.replace(regex, symbol);
        }
        return result;
    }

    /**
     * Highlights code using highlight.js
     * @param {string} code Code to highlight
     * @param {string[]} languages Array of language hints
     * @returns {HighlightResult} Highlighted code result
     */
    #highlightCode(code, languages) {
        return languages.length && languages[0] ?
            self.hljs.highlightAuto(code, languages) :
            self.hljs.highlightAuto(code);
    }

    /**
     * Registers language aliases for highlight.js
     * Helps with language detection by mapping variant names
     */
    #registerAliases() {
        self.hljs.registerAliases(['vim-script'], { languageName: 'vim' });
        self.hljs.registerAliases(
            ['php5', 'php6', 'php7', 'php8', 'php9'],
            { languageName: 'php' }
        );
    }

}

export default Webworker;
