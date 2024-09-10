import HtmlLanguage from './language-html.js';
import commonEntities from './entities.js';
import copyToClipboardMap from './i18n.js';
import validCodeLanguages from './languages.js';

class Webworker {

    // Private static property to hold the instance.
    static #instance = null;

    constructor(scriptDirname) {
        if (Webworker.#instance) {
            return Webworker.#instance;
        }
        Webworker.#instance = this;

        importScripts(`${scriptDirname}hljs.min.js`);
        this.#registerAliases();
        this.#registerHtmlAsLanguage();
        self.onmessage = this.onMessage.bind(this);
    }

    /**
     * Builds the HTML for a "Copy to Clipboard" button.
     *
     * @param {string} pageLang The language of the page, used to determine the button's title.
     * @returns {string} The HTML from the "Copy to Clipboard" button.
     */
    buildCopyToClipboardButton(pageLang) {
        const langKey = pageLang.toLowerCase().split('-')[0];
        let title = copyToClipboardMap.en;
        if (copyToClipboardMap[langKey]) {
            title = copyToClipboardMap[langKey];
        }
        // eslint-disable-next-line max-len
        return `<button type="button" aria-pressed="false" class="hljsl-clipboard" title="${title}" onclick="hljsl.copyToClipboard(this);" onkeydown="hljsl.copyToClipboard(this);"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M21 2h-19v19h-2v-21h21v2zm3 2v20h-20v-20h20zm-2 2h-1.93c-.669 0-1.293.334-1.664.891l-1.406 2.109h-6l-1.406-2.109c-.371-.557-.995-.891-1.664-.891h-1.93v16h16v-16zm-3 6h-10v1h10v-1zm0 3h-10v1h10v-1zm0 3h-10v1h10v-1z"/></svg></button>`;
    }

    /**
     * Builds an HTML table representation of the given code with line numbers.
     *
     * @param {string} code The code to be converted into an HTML table.
     * @param {string} [pageLang='en'] The language code for localization, default is 'en'.
     * @returns {string} The HTML string of the table with line numbers and a copy-to-clipboard button.
     */
    buildTable(code, pageLang = 'en') {
        let table = `${this.buildCopyToClipboardButton(pageLang)}<table class="hljsl-table">\n<tbody>\n`;
        const lines = code.trim().split('\n');
        lines.forEach((line, i) => {
            if (line.length === 0) {
                // eslint-disable-next-line no-param-reassign
                line = '<br>';
            }
            table += `<tr><td>${i + 1}</td><td>${line}</td></tr>\n`;
        });
        return `${table.trim()}</tbody></table>`;
    }

    /**
     * The HTML language is difficult to highlight so patch mistakes.
     *
     * @param {object} result The Highlight.js result object.
     */
    #doctorHtmlResult(result) {
        // Fix tags without attributes bleeding into following text.
        // eslint-disable-next-line max-len
        result.value = result.value.replace(/<span class="hljs-symbol">(&gt;|>)<\/span>\s*<span class="hljs-tag">([\s\S]*?)<\/span>/g, (match, symbol, tagContent) => `<span class="hljs-symbol">${symbol}</span><span class="hljs-text">${tagContent}</span>`);
    }

    /**
     * Handles incoming messages, processes the code for syntax highlighting, and sends back the result.
     *
     * @param {MessageEvent} evt The message event containing the data to be processed.
     * @property {string} evt.data The JSON string containing the message data.
     * @property {Object} msg The parsed message object.
     * @property {string} msg.id The unique identifier for the message.
     * @property {string} msg.pageLang The language of the page.
     * @property {string} msg.code The code to be highlighted.
     * @property {string} msg.codeLang The languages specified for the code.
     */
    onMessage(evt) {
        const msg = JSON.parse(evt.data);
        const { id } = msg;
        const { pageLang } = msg;
        const { code } = msg;
        let codeLang = msg.codeLang.split(' ');
        codeLang = codeLang.filter((value) => validCodeLanguages.includes(value));

        // If no language was provided see if this looks like HTML.
        if (codeLang.length === 0) {
            if (commonEntities.some((entity) => code.includes(entity))) {
                codeLang = ['html'];
            }
        }

        // Have highlight.js highlight the code.
        let result = '';
        if (codeLang.length === 0 || !codeLang[0]) {
            result = self.hljs.highlightAuto(code);
        } else {
            result = self.hljs.highlightAuto(code, codeLang);
        }

        // If no language was detected try the second best.
        if (!result.language && result?.secondBest?.language) {
            result = result.secondBest;
        }

        // HLJS encodes & to &amp; undo this because it breaks already encoded HTML entities.
        if (result.value) {
            result.value = result.value.replace(/&amp;([a-z]+;)/gi, '&$1');
        }

        // Fix HTML.
        if (result.language === 'html') {
            this.#doctorHtmlResult(result);
        }

        // Send back the result.
        const reply = {
            code: this.buildTable(result.value, pageLang),
            id,
            language: result.language
        };
        self.postMessage(JSON.stringify(reply));
    }

    /**
     * Registers language aliases for the highlight.js library.
     *
     * This method sets up aliases for specific languages to ensure that they can be referenced by
     * multiple names. For example, it aliases `vim-script` as `vim` and various versions of PHP as
     * `php`.
     */
    #registerAliases() {
        // Aliasing `vim-script` as `vim`.
        hljs.registerAliases(['vim-script'], { languageName: 'vim' });

        // Aliasing PHP versions as `php`.
        hljs.registerAliases(['php5', 'php6', 'php7', 'php8', 'php9'], { languageName: 'php' });
    }

    /**
     * Registers HTML as a language for syntax highlighting.
     *
     * This method configures the syntax highlighting rules for HTML, including:
     * - Case insensitivity.
     * - Keywords for HTML tags.
     * - Tag detection with attributes.
     * - JavaScript detection within <script> tags.
     * - Multi-line and single-line comment detection.
     * - Symbol detection within comments and tags.
     */
    #registerHtmlAsLanguage() {
        self.hljs.registerLanguage('html', HtmlLanguage);
    }

}

export default Webworker;
