import copyToClipboardMap from './i18n.js';
import validCodeLanguages from './languages.js';

class Webworker {

    // Private static property to hold the instance.
    static #instance = null;

    #commonEntityMap = [
        { entity: '&lt;', symbol: '<', regex: /&lt;/g },
        { entity: '&gt;', symbol: '>', regex: /&gt;/g },
        { entity: '&amp;', symbol: '&', regex: /&amp;/g },
        { entity: '&quot;', symbol: '"', regex: /&quot;/g },
        { entity: '&apos;', symbol: "'", regex: /&apos;/g },
        { entity: '&semi;', symbol: ';', regex: /&semi;/g }
    ];

    constructor(scriptDirname) {
        if (Webworker.#instance) {
            return Webworker.#instance;
        }
        Webworker.#instance = this;

        importScripts(`${scriptDirname}hljs.min.js`);
        this.#registerAliases();
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
        return `<button type="button" aria-pressed="false" class="hljsl-clipboard" title="${title}"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M21 2h-19v19h-2v-21h21v2zm3 2v20h-20v-20h20zm-2 2h-1.93c-.669 0-1.293.334-1.664.891l-1.406 2.109h-6l-1.406-2.109c-.371-.557-.995-.891-1.664-.891h-1.93v16h16v-16zm-3 6h-10v1h10v-1zm0 3h-10v1h10v-1zm0 3h-10v1h10v-1z"/></svg></button>`;
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
        let openSpan = ''; // Keep track of any open span.

        lines.forEach((line, i) => {
            let modifiedLine = line;

            // Check if there is an opening span tag in the line.
            const openingSpanMatch = modifiedLine.match(/<span[^>]*>/);
            const closingSpanMatch = modifiedLine.match(/<\/span>/);

            // If we have an open span but no closing span, keep it open and prepend it to the next line.
            if (openSpan) {
                modifiedLine = openSpan + modifiedLine; // Prepend the open span to the current line.
            }

            // If there is an opening span and no closing span, keep it for the next line.
            if (openingSpanMatch && !closingSpanMatch) {
                [openSpan] = openingSpanMatch; // Save the opening span for the next line.
            } else if (closingSpanMatch) {
                openSpan = ''; // Close the span and reset.
            }

            // If the line is empty, replace it with a <br> tag.
            if (modifiedLine.length === 0) {
                modifiedLine = '<br>';
            }

            // Add the line number and content to the table.
            table += `<tr><td>${i + 1}</td><td>${modifiedLine}</td></tr>\n`;
        });

        return `${table.trim()}</tbody></table>`;
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
        let codeLang = msg.codeLang.toLowerCase().split(' ');
        codeLang = codeLang.filter((value) => validCodeLanguages.includes(value));

        /**
         * Help highlight languages that are commonly broken during the highlighting process.
         */
        if (codeLang.includes('css')) {
            codeLang.push('scss', 'less');
        }

        if (codeLang.includes('ini')) {
            codeLang.push('abnf', 'yaml');
        }

        if (codeLang.includes('php')) {
            codeLang.push('php-template');
        }

        let preprocessedCode = code;
        this.#commonEntityMap.forEach((entityObj) => {
            preprocessedCode = preprocessedCode.replace(entityObj.regex, entityObj.symbol);
        });

        // Have highlight.js highlight the code.
        let result = '';
        if (codeLang.length === 0 || !codeLang[0]) {
            result = self.hljs.highlightAuto(preprocessedCode);
        } else {
            result = self.hljs.highlightAuto(preprocessedCode, codeLang);
        }

        // If no language was detected try the second best.
        if (!result.language && result?.secondBest?.language) {
            result = result.secondBest;
        }

        // HLJS encodes & to &amp; undo this because it breaks already encoded HTML entities.
        if (result.value) {
            result.value = result.value.replace(/&amp;([a-z]+;)/gi, '&$1');
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
        // Aliasing Vim Script as `vim`.
        self.hljs.registerAliases(['vim-script'], { languageName: 'vim' });

        // Aliasing PHP versions as `php`.
        self.hljs.registerAliases(['php5', 'php6', 'php7', 'php8', 'php9'], { languageName: 'php' });
    }

}

export default Webworker;
