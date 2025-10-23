import copyToClipboardMap from './i18n.js';
import languageDetector from './language-detector.js';
import { languageCodes, languageDisplayNames } from './languages.js';

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
        /(?:<|&lt;)%.*?%(?:>|&gt;)/,                   // Basic EJS
        /(?:<|&lt;)%=.*?%(?:>|&gt;)/,                  // EJS output
        /(?:<|&lt;)%-.*?%(?:>|&gt;)/,                  // EJS unescaped output
        /(?:<|&lt;)%#.*?%(?:>|&gt;)/,                  // EJS comments
        // Handlebars/Mustache patterns
        /\{\{.*?\}\}/,                                 // Basic interpolation
        /\{\{#.*?\}\}.*?\{\{\/.*?\}\}/,                // Block helpers
        /\{\{!.*?\}\}/,                                // Comments
        /\{\{>.*?\}\}/,                                // Partials
        /\{\{#if\s+.*?\}\}.*?\{\{\/if\}\}/,            // Conditionals
        /\{\{#each\s+.*?\}\}.*?\{\{\/each\}\}/,        // Iteration
        // Other template engines
        /\{%.*?%\}/,                                   // Nunjucks/Liquid/Twig blocks
        /\{#.*?#\}/,                                   // Jinja2 comments
        /\{%.*?\s+.*?\s*%\}/,                          // Twig blocks
        /(?:<|&lt;)%-.*?%(?:>|&gt;)/,                  // Pug unescaped output
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
     * @param {boolean} [editor=false] Whether the code is for an editor element
     * @returns {{table: string, lines: number}} Table HTML and line count
     */
    #buildTable(code, pageLang = 'en', editor = false) {
    // In editor mode, preserve whitespace including trailing newlines
        const lines = editor ? code.split('\n') : code.trim().split('\n');
        const copyButton = this.#buildCopyToClipboardButton(pageLang);

        // Start building HTML
        let html = `${copyButton}<table class="hljsl-table"><tbody>`;

        let openSpan = '';
        const openingPattern = this.#spanPatterns.opening;
        const closingPattern = this.#spanPatterns.closing;

        // Process actual code lines
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];

            // Handle span continuation
            if (openSpan) {
                line = openSpan + line;
            }

            const openingMatch = line.match(openingPattern);
            const closingMatch = line.match(closingPattern);

            if (openingMatch && !closingMatch) {
                // eslint-disable-next-line prefer-destructuring
                openSpan = openingMatch[0];
            } else if (closingMatch) {
                openSpan = '';
            }

            // Ensure empty lines are copyable
            if (!line) {
                line = '<span></span>';
            }

            html += `<tr><td>${i + 1}</td><td>${line}</td></tr>`;
        }

        /**
         * Add extra lines for editor mode if needed
         * @deprecated
         * if (editor && lines.length === 1) {
         *     html += `<tr><td>${lines.length + 1}</td><td><span></span></td></tr>`;
         *     html += `<tr><td>${lines.length + 2}</td><td><span></span></td></tr>`;
         * }
         */

        html += '</tbody></table>';

        const totalLines = editor && lines.length === 1 ? lines.length + 2 : lines.length;

        return {
            table: html,
            lines: totalLines
        };
    }

    /**
     * Determine what the display language should be based on the first recognized language class
     * @param {array} langs An array of possible code languages
     * @param {boolean} [withKey] Should the key be returned for the matching language as well; default false
     * @returns The language name meant for display or null if not determined
     */
    #getDisplayLanguage(langs, withKey = false) {
        for (let lang of langs) {
            lang = lang.trim();
            if (languageDisplayNames.has(lang)) {
                if (withKey) {
                    return { key: lang, val: languageDisplayNames.get(lang) };
                }
                return languageDisplayNames.get(lang);
            }
        }
        if (withKey) {
            return { key: null, val: null };
        }
        return null;
    }

    /**
     * Handles incoming messages for code highlighting
     * @param {MessageEvent<string>} evt The message event containing the code
     */
    #onMessage(evt) {
        const msg = evt.data;
        const { id, pageLang, code, editor, locked } = msg;
        let codeLang = this.#processLanguages(msg.codeLang, code);
        let displayLanguage = this.#getDisplayLanguage(codeLang); // Preset in case an error occurs

        if (editor && !locked) {
            codeLang = languageDetector.detect(code, { bias: codeLang });
            displayLanguage = null;
        }

        try {
            const preprocessedCode = this.#preprocessCode(code);
            let result = this.#highlightCode(preprocessedCode, codeLang);

            console.log('Original code', code);
            console.log('Preprocessed code', preprocessedCode);

            // If no language was detected try the second best
            if (!result.language && result?.secondBest?.language) {
                result = result.secondBest;
            }

            const { table, lines } = this.#buildTable(result.value, pageLang, editor);

            // Correct common edge-case in language detection; we usually want python in this case
            if (result.language === 'isbl') {
                result.language = 'python, isbl';
            }

            // We highlight HTML as Django, correct this so the display language shows HTML still
            if (codeLang[0] && codeLang[0] === 'django') {
                codeLang.unshift('html');
            }

            let languageKey = '';

            // Determine language key and display value based on locked status
            if (locked && codeLang[0] && languageDisplayNames.has(codeLang[0])) {
            // Case 1: Locked with valid language in codeLang[0]
                displayLanguage = languageDisplayNames.get(codeLang[0]);
                // eslint-disable-next-line prefer-destructuring
                languageKey = codeLang[0];
            } else if (locked) {
            // Case 2: Locked but need to get display language; this will now be the locked language
                const langData = this.#getDisplayLanguage(codeLang, true);
                displayLanguage = langData.val;
                languageKey = langData.key;
            } else if (code === null || code === undefined || code.trim() === '') {
            // Case 3: Empty code, default to plaintext
                displayLanguage = ['Plaintext'];
                languageKey = 'plaintext';
            } else {
            // Case 4: Not locked
                const langData = this.#getDisplayLanguage(result.language.split(','), true);
                displayLanguage = langData.val;
                languageKey = langData.key;
            }

            // Set the result language after determining the correct value
            result.language = languageKey;

            self.postMessage({
                code: table,
                id,
                displayLanguage,
                language: result.language,
                lines,
                locked,
                editor // Pass editor flag back so highlighter knows not to trim
            });
        } catch (error) {
            const copyButton = this.#buildCopyToClipboardButton(pageLang);
            const table = `
            ${copyButton}<table class="hljsl-table">
                <tbody>
                    <tr>
                        <td>1</td>
                        <td>${error}</td>
                    </tr>
                </tbody>
            </table>`;

            self.postMessage({
                code: table,
                id,
                displayLanguage,
                language: codeLang.join(','),
                lines: error.toString().split('\n').length,
                locked,
                editor
            });
        }
    }

    /**
     * Processes and expands language hints for better detection
     * @param {string} codeLang Original language string
     * @param {string} code The code to analyze
     * @returns {string[]} Expanded array of language hints
     */
    #processLanguages(codeLang, code) {
        let langs = codeLang.toLowerCase().split(' ')
            .filter((value) => languageCodes.has(value));

        // If no languages were specified, try to detect them
        if (langs.length === 0) {
            return [];
        }

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
        self.hljs.registerAliases(['md'], { languageName: 'markdown' });
        self.hljs.registerAliases(['py'], { languageName: 'python' });
        self.hljs.registerAliases(['vim-script'], { languageName: 'vim' });
        self.hljs.registerAliases(
            ['php5', 'php6', 'php7', 'php8', 'php9'],
            { languageName: 'php' }
        );
    }

}

export default Webworker;
