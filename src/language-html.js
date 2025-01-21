/**
 * @deprecated
 *
 * With correct HLJS settings HTML is handled as xml or django. This was an unnecessary lesson in
 * wasted time and pain. I will keep this language file for reference but it is not needed.
 */
export default () => ({
    case_insensitive: true,  // HTML is case-insensitive.
    contains: [
        {
            // Handle HTML comments (e.g., <!-- comment -->).
            className: 'comment',
            begin: /(&lt;|<)!--/,  // Match the start of a comment.
            end: /--(&gt;|>)/,  // Match the end of a comment.
            relevance: 10
        },
        {
            // Handle conditional comments (e.g., <!--[if IE]> ... <![endif]-->).
            className: 'comment',
            begin: /(&lt;|<)!\[/,  // Match the start of a conditional comment.
            end: /\](&gt;|>)/,  // Match the end of a conditional comment.
            relevance: 10
        },
        {
            className: 'symbol',
            begin: /&gt;|>/,
            relevance: 1
        },
        {
            className: 'symbol',
            begin: /\/&gt;|\/>s/,
            relevance: 1
        },
        {
            className: 'keyword',  // Valueless HTML attributes
            begin: /\b(?:async|autofocus|autoplay|checked|controls|default|defer|disabled|formnovalidate|hidden|ismap|loop|multiple|muted|novalidate|open|readonly|required|reversed|selected)\b/,
            relevance: 10
        },
        {
            // Detect opening tags (e.g., <meta>, <div>) excluding closing tags (</div>).
            className: 'symbol',
            begin: /(&lt;|<)(?!\/)/,  // Match opening tag but exclude tags with a / immediately after <.
            relevance: 5,
            contains: [
                // DOCTYPE declaration.
                {
                    className: 'symbol',  // Equal sign (!).
                    begin: /!/,
                    relevance: 5
                },
                {
                    className: 'tag',
                    begin: /DOCTYPE[ a-z0-9-'"]+/i,
                    relevance: 5
                },
                // The following rule is broken but as close as we can get, so we fix it with JS.
                {
                    className: 'tag',  // Specifically for tag names.
                    begin: /[a-z0-9-]+/i,
                    end: /(?=\s|(&gt;|>)|(&lt;|<))/,
                    relevance: 5
                },
                {
                    className: 'keyword',  // Attribute names within tags.
                    begin: /\s*[a-z0-9-]+\s*(?=\s*=\s*['"]?)/i,  // Match attributes that require an equals sign.
                    relevance: 5,
                    contains: [
                        {
                            className: 'symbol',  // Equal sign (=).
                            begin: /=/,
                            relevance: 0
                        },
                        {
                            className: 'symbol',  // Quotation marks.
                            begin: /['"]/,
                            end: /['"]/,
                            relevance: 0,
                            contains: [
                                {
                                    className: 'attr',  // Attribute values inside quotes.
                                    begin: /[^'"]+/  // Match everything except quotes.
                                }
                            ]
                        }
                    ]
                },
                {
                    className: 'symbol',
                    begin: /\/&gt;|\/>s/,
                    relevance: 1
                },
                {
                    className: 'symbol',  // Closing tag symbol (>, />).
                    begin: /(&gt;|>)/,
                    relevance: 5
                }
            ]
        },
        {
            // Detect closing tags (e.g., </body>).
            className: 'symbol',
            begin: /(&lt;|<)\//,  // Match closing tag symbol </.
            relevance: 5,
            contains: [
                {
                    className: 'tag',  // Tag name within closing tag.
                    begin: /[a-z0-9-]+/i,
                    end: /(?=\s*(&gt;|>))/,
                    relevance: 5
                },
                {
                    className: 'symbol',  // Closing tag symbol (>, />).
                    begin: /(&gt;|>)/,
                    relevance: 0
                }
            ]
        },
        {
            // Detect opening tags like <div> and exclude closing tags like </div>.
            className: 'symbol',
            begin: /(&lt;|<)(?!\/)/,  // Match opening tag symbol < or &lt;, excluding closing tags.
            end: /(&gt;|>)/,  // Match closing tag symbol > or &gt;.
            relevance: 10,
            contains: [
                {
                    className: 'tag',  // Match tag names inside < >.
                    begin: /[a-z][a-z0-9-]*/i,
                    relevance: 5
                },
                {
                    className: 'keyword',  // Match valueless attributes within the tag.
                    begin: /\b[a-z][a-z0-9-]*\b(?=\s|\/|&gt;|>)/i,  // Match only valueless attributes.
                    relevance: 10
                },
                {
                    className: 'symbol',  // Match the closing tag symbol > or />.
                    begin: /\/?(&gt;|>)/,
                    relevance: 0
                }
            ]
        }
    ]
});


/**
 * Highlight.js v11+ no longer sanitizes code for you so unless the user remembered
 * to use HTML entities we can check for the following entities and symbols to determine
 * if the code is HTML like.
 */
export default [
    '&copy;',   '©',
    '&reg;',    '®',
    '&trade;',  '™',
    '&mdash;',  '—',
    '&ndash;',  '–',
    '&deg;',    '°',
    '&euro;',   '€',
    '&pound;',  '£',
    '&yen;',    '¥',
    '&cent;',   '¢',
    '&micro;',  'µ',
    '&sect;',   '§',
    '&para;',   '¶',
    '&hellip;', '…',
    '&times;',  '×',
    '&divide;', '÷',
    '&plusmn;', '±',
    '&frac12;', '½',
    '&frac14;', '¼',
    '&frac34;', '¾',
    '&quot;',   // Do not check for the actual symbol that could exist in other languages besides HTML
    '&apos;',   // Do not check for the actual symbol that could exist in other languages besides HTML
    '&nbsp;',   // Do not check for the actual symbol that could exist in other languages besides HTML
    '&br;',     // No visible symbol (line break)
    '&em;',     // No visible symbol (emphasis tag)
    '&strong;', // No visible symbol (strong emphasis tag)
    '&sub;',    // No visible symbol (subscript tag)
    '&sup;'     // No visible symbol (superscript tag)
];
