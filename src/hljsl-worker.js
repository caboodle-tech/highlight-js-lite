/* eslint-disable no-restricted-globals */

// Polyfill Array.some
if (!Array.prototype.some) {
    // eslint-disable-next-line no-extend-native
    Array.prototype.some = (callback, thisArg) => {
        if (this == null) {
            throw new TypeError('Array.prototype.some called on null or undefined');
        }

        if (typeof callback !== 'function') {
            throw new TypeError(`${callback} is not a function`);
        }

        const array = Object(this);
        // eslint-disable-next-line no-bitwise
        const length = array.length >>> 0;

        for (let i = 0; i < length; i++) {
            if (i in array && callback.call(thisArg, array[i], i, array)) {
                return true;
            }
        }

        return false;
    };
}

// eslint-disable-next-line max-len
const commonEntities = ['&lt;', '&gt;', '&amp;', '&quot;', '&apos;', '&nbsp;', '&copy;', '&reg;', '&trade;', '&mdash;', '&ndash;', '&deg;', '&euro;', '&pound;', '&yen;', '&cent;', '&micro;', '&sect;', '&para;', '&hellip;', '&times;', '&divide;', '&plusmn;', '&frac12;', '&frac14;', '&frac34;', '&br;', '&em;', '&strong;', '&sub;', '&sup;'];

// eslint-disable-next-line max-len
const validCodeLanguages = ['1c', 'abnf', 'accesslog', 'actionscript', 'ada', 'angelscript', 'apache', 'applescript', 'arcade', 'arduino', 'armasm', 'asciidoc', 'aspectj', 'autohotkey', 'autoit', 'avrasm', 'awk', 'axapta', 'bash', 'basic', 'bnf', 'brainfuck', 'c', 'cal', 'capnproto', 'ceylon', 'clean', 'clojure-repl', 'clojure', 'cmake', 'coffeescript', 'coq', 'cos', 'cpp', 'crmsh', 'crystal', 'csharp', 'csp', 'css', 'd', 'dart', 'delphi', 'diff', 'django', 'dns', 'dockerfile', 'dos', 'dsconfig', 'dts', 'dust', 'ebnf', 'elixir', 'elm', 'erb', 'erlang-repl', 'erlang', 'excel', 'fix', 'flix', 'fortran', 'fsharp', 'gams', 'gauss', 'gcode', 'gherkin', 'glsl', 'gml', 'go', 'golo', 'gradle', 'graphql', 'groovy', 'haml', 'handlebars', 'haskell', 'haxe', 'hsp', 'http', 'hy', 'html', 'inform7', 'ini', 'irpf90', 'isbl', 'java', 'javascript', 'js', 'jboss-cli', 'json', 'julia-repl', 'julia', 'kotlin', 'lasso', 'latex', 'ldif', 'leaf', 'less', 'lisp', 'livecodeserver', 'livescript', 'llvm', 'lsl', 'lua', 'makefile', 'markdown', 'mathematica', 'matlab', 'maxima', 'mel', 'mercury', 'mipsasm', 'mizar', 'mojolicious', 'monkey', 'moonscript', 'n1ql', 'nestedtext', 'nginx', 'nim', 'nix', 'node-repl', 'nsis', 'objectivec', 'ocaml', 'openscad', 'oxygene', 'parser3', 'perl', 'pf', 'pgsql', 'php-template', 'php', 'plaintext', 'pony', 'powershell', 'processing', 'profile', 'prolog', 'properties', 'protobuf', 'puppet', 'purebasic', 'python-repl', 'python', 'q', 'qml', 'r', 'reasonml', 'rib', 'roboconf', 'routeros', 'rsl', 'ruby', 'ruleslanguage', 'rust', 'sas', 'scala', 'scheme', 'scilab', 'scss', 'shell', 'smali', 'smalltalk', 'sml', 'sqf', 'sql', 'stan', 'stata', 'step21', 'stylus', 'subunit', 'swift', 'taggerscript', 'tap', 'tcl', 'thrift', 'tp', 'twig', 'typescript', 'ts', 'vala', 'vbnet', 'vbscript-html', 'vbscript', 'verilog', 'vhdl', 'vim', 'wasm', 'wren', 'x86asm', 'xl', 'xml', 'xquery', 'yaml', 'zephir'];

const copyToClipboardMap = {
    af: 'Kopieer kode na knipbord',
    am: 'ኮድ ኮድ በቁምፊዎች ውስጥ አጽዳ',
    ar: 'نسخ الكود إلى الحافظة',
    az: 'Kodunu kopyala',
    be: 'Скапіраваць код у буфер абмену',
    bg: 'Копиране на код в клипборда',
    bn: 'কোড ক্লিপবোর্ডে কপি করুন',
    bs: 'Kopiraj kod u međuspremnik',
    ca: 'Copiar el codi al porta-retalls',
    cs: 'Kopírovat kód do schránky',
    cy: "Copïo cod i'r clipfwrdd",
    da: 'Kopier kode til udklipsholderen',
    el: 'Αντιγραφή κώδικα στο πρόχειρο',
    en: 'Copy code to clipboard',
    et: 'Kopeeri kood lõikelauale',
    eu: 'Kodea arbelean kopiatu',
    fa: 'کپی کد به کلیپ بورد',
    fi: 'Kopioi koodi leikepöydälle',
    fil: 'Kopyahin ang code sa clipboard',
    ga: 'Cóipeáil an cód chuig an ghréasán',
    gl: 'Copiar o código no portapapeis',
    gu: 'કોડને ક્લિપબોર્ડ પર કપિ કરો',
    he: 'העתק קוד ללוח',
    hi: 'कोड को क्लिपबोर्ड पर कॉपी करें',
    hr: 'Kopiraj kod u međuspremnik',
    hu: 'Kód másolása a vágólapra',
    hy: 'Պատճենել ծրագիրը բֆերում',
    id: 'Salin kode ke papan klip',
    is: 'Afrita kóða í klippiborð',
    it: 'Copia codice negli appunti',
    ja: 'コードをクリップボードにコピー',
    ka: 'კოდის კოპირება ბუფერში',
    kk: 'Кодты буферге көшіру',
    km: 'ចម្លង​កូដ​ទៅ​ក្ដារ​ប្លុក​កម្មវិធី',
    kn: 'ಕೋಡ್ ಅನ್ನು ಕ್ಲಿಪ್‌ಬೋರ್ಡ್‌ಗೆ ನಕಲಿಸಿ',
    ko: '코드를 클립보드에 복사',
    ku: 'Koda li clipboardê bixwîne',
    ky: 'Коду буферге көчүр',
    lo: 'ສຳ ເນົາ ໂຄດ ໃສ່ ບາດປະ ເພດ',
    lt: 'Kopijuoti kodą į iškarpinę',
    lv: 'Kopēt kodu uz starpliktuvi',
    mk: 'Копирајте го кодот во клипборд',
    ml: 'കോഡ് ക്ലിപ്പ്‌ബോര്‍ഡിലേക്ക് പകർത്തുക',
    mn: 'Кодыг хавтас руу хуулах',
    mr: 'कोड क्लिपबोर्डवर कॉपी करा',
    ms: 'Salin kod ke papan klip',
    my: 'ကုဒ်ကို clipboard သို့ ကူးယူပါ',
    ne: 'कोडलाई क्लिपबोर्डमा कपि गर्नुहोस्',
    nl: 'Code kopiëren naar klembord',
    nn: 'Kopier kode til utklippstavle',
    no: 'Kopier kode til utklippstavle',
    or: 'କୋଡକୁ କ୍ଲିପବୋର୍ଡରେ କପି କରନ୍ତୁ',
    pa: "ਕੋਡ ਨੂੰ ਕਲਿੱਪਬੋਰਡ 'ਤੇ ਕਾਪੀ ਕਰੋ",
    pl: 'Skopiuj kod do schowka',
    pt: 'Copiar código para a área de transferência',
    ro: 'Copiază codul în clipboard',
    ru: 'Копировать код в буфер обмена',
    si: 'කේතය ක්ලිප් බෝඩ්යයට පිටුවට අනුකූල කරන්න',
    sk: 'Kopírovať kód do schránky',
    sl: 'Kopiraj kodo v odložišče',
    sq: 'Kopjo kodin në clipboard',
    sr: 'Копирај код у међуспремник',
    sv: 'Kopiera kod till urklipp',
    sw: 'Nakili kanuni kwenye ubao wa kunakili',
    ta: 'குறியீட்டை கிளிப்போர்டுக்கு நகலிக்கவும்',
    te: 'కోడ్ను క్లిప్‌బోర్డ్‌కు కాపీ చేయండి',
    th: 'คัดลอกโค้ดไปยังคลิปบอร์ด',
    tl: 'Kopyahin ang code sa clipboard',
    tr: 'Kodu panoya kopyala',
    uk: 'Скопіювати код у буфер обміну',
    ur: 'کوڈ کو کلپ بورڈ پر کاپی کریں',
    uz: 'Kodni joylashtirish saqlab olish',
    vi: 'Sao chép mã vào clipboard',
    yo: 'Fikun koodu si afikun',
    zh: '复制代码到剪贴板',
    zu: 'Casha ikhodi ekopishweni'
};

function addLineNumbers(code, pageLang = 'en') {
    // eslint-disable-next-line prefer-destructuring, no-param-reassign
    pageLang = pageLang.toLowerCase().split('-')[0];
    let title = copyToClipboardMap.en;
    if (copyToClipboardMap[pageLang]) {
        title = copyToClipboardMap[pageLang];
    }
    // eslint-disable-next-line max-len
    let table = `<button type="button" aria-pressed="false" class="hljsl-clipboard" title="${title}" onclick="hljsl.copyToClipboard(this);" onkeydown="hljsl.copyToClipboard(this);"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M21 2h-19v19h-2v-21h21v2zm3 2v20h-20v-20h20zm-2 2h-1.93c-.669 0-1.293.334-1.664.891l-1.406 2.109h-6l-1.406-2.109c-.371-.557-.995-.891-1.664-.891h-1.93v16h16v-16zm-3 6h-10v1h10v-1zm0 3h-10v1h10v-1zm0 3h-10v1h10v-1z"/></svg></button>`;
    table += '<table class="hljsl-table">\n<tbody>\n';
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

onmessage = (evt) => {
    const msg = JSON.parse(evt.data);
    const { id } = msg;
    const { root } = msg;
    const { pageLang } = msg;
    const { code } = msg;
    let codeLang = msg.codeLang.split(' ');
    codeLang = codeLang.filter((value) => validCodeLanguages.includes(value));

    // Try to default to HTML mode since that is a common language to get messed up.
    if (codeLang.length === 0) {
        if (commonEntities.some((entity) => code.includes(entity))) {
            codeLang = ['html'];
        }
    }

    importScripts(`${root}/highlight.min.js`);

    // Define the HTML language definition.
    self.hljs.registerLanguage('html', () => ({
        case_insensitive: true,
        keywords: {
            $pattern: /[a-z0-9]+/i,
            // eslint-disable-next-line max-len
            keyword: ['abbr', 'acronym', 'address', 'area', 'article', 'aside', 'audio', 'base', 'basefont', 'bgsound', 'bdo', 'big', 'blockquote', 'body', 'br', 'button', 'canvas', 'caption', 'center', 'cite', 'code', 'col', 'colgroup', 'dd', 'del', 'details', 'dialog', 'dir', 'div', 'dl', 'dt', 'em', 'embed', 'fieldset', 'figure', 'font', 'form', 'frame', 'frameset', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'header', 'hr', 'html', 'iframe', 'image', 'img', 'input', 'ins', 'kbd', 'label', 'legend', 'link', 'list-item', 'map', 'marquee', 'menu', 'meta', 'meter', 'nav', 'ol', 'output', 'optgroup', 'option', 'p', 'param', 'pre', 'progress', 'q', 'ruby', 'rp', 'rt', 's', 'samp', 'script', 'section', 'select', 'small', 'span', 'strong', 'style', 'sub', 'sup', 'table', 'tbody', 'td', 'textarea', 'tfoot', 'thead', 'title', 'tr', 'tt', 'u', 'ul', 'var', 'video', 'wbr']
        },
        contains: [
            {
                // Tags.
                className: 'tag',
                begin: /<\/?[a-z]+((?:\s+.*?)?)>/i,
                relevance: 10,
                contains: [
                    {
                        // Attributes.
                        className: 'attribute',
                        begin: /[a-z]+\s*=\s*['"]?(.*?)['"]?/i,
                        relevance: 5
                    }
                ]
            },
            {
                // JavaScript inside <script> tags.
                className: 'javascript',
                begin: /<script.*?>/,
                end: /<\/script>/,
                relevance: 8,
                subLanguage: 'javascript',
                excludeBegin: true,
                excludeEnd: true,
                contains: [
                    {
                        // Multi-line comments /* ... */
                        className: 'comment',
                        begin: /\/\*/,
                        end: /\*\//,
                        contains: [
                            {
                                // Symbols inside comments.
                                className: 'symbol',
                                begin: /&[a-z]+;/
                            }
                        ]
                    },
                    {
                        // Single-line comments // ...
                        className: 'comment',
                        begin: /\/\/.*$/
                    }
                ]
            },
            {
                // Comments.
                className: 'comment',
                begin: /<!--(?!>)|&[a-z]+;!--/,
                end: /.*?-->|.*?--&[a-z]+;/,
                relevance: 5,
                contains: [
                    {
                        // Symbols inside comments.
                        className: 'symbol',
                        begin: /&[a-z]+;|<|>/i
                    }
                ]
            },
            {
                // Symbols.
                className: 'symbol',
                begin: /&[a-z]+;|<|>/i
            }
        ]
    }));

    let result = '';

    if (codeLang.length === 0 || !codeLang[0]) {
        result = self.hljs.highlightAuto(code);
    } else {
        result = self.hljs.highlightAuto(code, codeLang);
    }

    // HLJS encodes & to &amp; undo this because it breaks HTML entities.
    if (result.value) {
        result.value = result.value.replace(/&amp;/g, '&');
    }

    const reply = {
        code: addLineNumbers(result.value, pageLang),
        id,
        language: result.language
    };

    postMessage(JSON.stringify(reply));
};
