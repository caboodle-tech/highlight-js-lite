/**
 * @fileoverview List of common HTML entities and symbols that could be found in code.
 */

/**
 * Highlight.js v11+ no longer sanitizes code for you so unless the user remembered to use HTML
 * entities we can check for the following entities and symbols to determine if the code if HTML like.
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
