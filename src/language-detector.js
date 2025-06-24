/**
 * Fast programming language detection class
 * Optimized for speed with smart sampling and early termination
 */
export class LanguageDetector {

    /** @type {string[]} Default fallback languages */
    #defaultLanguages = ['javascript', 'python', 'java', 'html', 'css', 'cpp', 'go', 'rust', 'typescript', 'php'];

    /** @type {Object} Pre-compiled regex patterns organized by detection strength */
    #patterns = {
        // Definitive patterns - if found, we're very confident
        definitive: [
            // Template languages - must be first to avoid HTML confusion
            { regex: /\{%[\s\S]*?%\}/, langs: ['django'], weight: 50 },
            { regex: /\{%\s*(if|for|block|extends|include|load|endif|endfor|endblock)/, langs: ['django'], weight: 50 },
            { regex: /\{\{\s*\w+\s*\|\s*\w+/, langs: ['django'], weight: 45 },
            { regex: /\{\{[\s\S]*?\}\}/, langs: ['handlebars'], weight: 45 },
            { regex: /<%[\s\S]*?%>/, langs: ['erb'], weight: 45 },

            // Web languages
            { regex: /^\s*<\?php/i, langs: ['php'], weight: 50 },
            { regex: /^\s*<!doctype\s+html/i, langs: ['html'], weight: 50 },
            { regex: /^\s*<html[^>]*>/i, langs: ['html'], weight: 45 },
            { regex: /^\s*<\?xml/i, langs: ['xml'], weight: 45 },

            // System languages with very specific patterns
            { regex: /^#include\s*<iostream>/m, langs: ['cpp'], weight: 50 },
            { regex: /^#include\s*<stdio\.h>/m, langs: ['c'], weight: 50 },
            { regex: /using\s+namespace\s+std/, langs: ['cpp'], weight: 45 },
            { regex: /std::vector|std::string|std::cout/, langs: ['cpp'], weight: 40 },

            // Package/Module declarations
            { regex: /^\s*package\s+main\b/m, langs: ['go'], weight: 50 },
            { regex: /fn\s+main\s*\(\s*\)/, langs: ['rust'], weight: 50 },
            { regex: /public\s+static\s+void\s+main\s*\(\s*String\[\]/i, langs: ['java'], weight: 50 },
            { regex: /^\s*package\s+[\w.]+\s*;/m, langs: ['java'], weight: 35 },

            // Scripting languages with shebangs
            { regex: /^#!/, langs: ['bash', 'python', 'perl', 'ruby'], weight: 35 },
            { regex: /^#!\/bin\/bash/i, langs: ['bash'], weight: 50 },
            { regex: /^#!\/usr\/bin\/bash/i, langs: ['bash'], weight: 50 },
            { regex: /^#!\/usr\/bin\/env\s+python/i, langs: ['python'], weight: 50 },
            { regex: /^#!\/usr\/bin\/env\s+ruby/i, langs: ['ruby'], weight: 50 },
            { regex: /^#!\/usr\/bin\/env\s+perl/i, langs: ['perl'], weight: 50 },

            // Very distinctive language patterns
            { regex: /-module\s*\(\s*\w+\s*\)/, langs: ['erlang'], weight: 50 },
            { regex: /-behaviour\s*\(/, langs: ['erlang'], weight: 45 },
            { regex: /defmodule\s+\w+/, langs: ['elixir'], weight: 50 },
            { regex: /defrecord\s+\w+/, langs: ['elixir'], weight: 45 },
            { regex: /library\s+\w+;/, langs: ['dart'], weight: 50 },
            { regex: /import\s+['"]dart:/, langs: ['dart'], weight: 45 },

            // Config/Build files with unique patterns
            { regex: /cmake_minimum_required\s*\(/i, langs: ['cmake'], weight: 50 },
            { regex: /^FROM\s+[\w\/.:-]+/mi, langs: ['dockerfile'], weight: 50 },
            { regex: /^# Example instructions from https:\/\/docs\.docker\.com\/reference\/builder/mi, langs: ['dockerfile'], weight: 45 },
            { regex: /LoadModule\s+\w+/i, langs: ['apache'], weight: 50 },
            { regex: /^\s*server\s*\{/m, langs: ['nginx'], weight: 50 },

            // Database languages
            { regex: /^\s*(select|SELECT)\s+[\w\*,\s]+\s+(from|FROM)\s+\w+/m, langs: ['sql'], weight: 45 },

            // Functional languages
            { regex: /^\s*module\s+\w+\s+where/mi, langs: ['haskell'], weight: 50 },
            { regex: /^\s*open\s+System/mi, langs: ['fsharp'], weight: 45 },
            { regex: /type\s+\w+\s*=\s*\|/, langs: ['fsharp'], weight: 40 },

            // Assembly languages
            { regex: /^\s*section\s+\./mi, langs: ['x86asm'], weight: 50 },
            { regex: /mov\s+e[a-z]{2},\s*\w+/gi, langs: ['x86asm'], weight: 45 },

            // LaTeX/TeX
            { regex: /\\documentclass\s*\{/i, langs: ['latex'], weight: 50 },
            { regex: /\\begin\s*\{document\}/i, langs: ['latex'], weight: 50 },
            { regex: /\\usepackage\s*\{/i, langs: ['latex'], weight: 40 },

            // MATLAB/Octave
            { regex: /^\s*function\s+[\w,\[\]]+\s*=\s*\w+\s*\(/mi, langs: ['matlab'], weight: 50 },
            { regex: /%%\s/, langs: ['matlab'], weight: 40 },

            // Version control - higher priority for diff detection
            { regex: /^diff\s+--git/m, langs: ['diff'], weight: 50 },
            { regex: /^Index:\s+[\w\/\.]+/m, langs: ['diff'], weight: 50 },
            { regex: /^@@\s+-\d+,\d+\s+\+\d+,\d+\s+@@/m, langs: ['diff'], weight: 50 },
            { regex: /^---\s+[\w\/\.]+/m, langs: ['diff'], weight: 45 },
            { regex: /^\+{3}\s+[\w\/\.]+/m, langs: ['diff'], weight: 45 },

            // Lisp family - order matters for specificity
            { regex: /^\s*\(ns\s+\w+/m, langs: ['clojure'], weight: 50 },
            { regex: /\(defmacro\s+\w+/, langs: ['clojure'], weight: 45 },
            { regex: /\(defprotocol\s+\w+/, langs: ['clojure'], weight: 45 },
            { regex: /\(def\s+\w+[\s\[]/, langs: ['clojure'], weight: 35 },
            { regex: /\(define\s+\w+/, langs: ['scheme'], weight: 45 },
            { regex: /\(lambda\s*\(/, langs: ['scheme'], weight: 40 },
            { regex: /\(defun\s+\w+/, langs: ['lisp'], weight: 45 },

            // Pascal/Delphi distinction
            { regex: /^\s*unit\s+\w+\s*;/mi, langs: ['delphi'], weight: 50 },
            { regex: /^\s*program\s+\w+\s*;/mi, langs: ['pascal'], weight: 50 },
            { regex: /\bClass\s*\(/gi, langs: ['delphi'], weight: 40 },

            // Fortran
            { regex: /^\s*subroutine\s+\w+/mi, langs: ['fortran'], weight: 50 },
            { regex: /^\s*implicit\s+none/mi, langs: ['fortran'], weight: 45 },
            { regex: /^\s*program\s+\w+/mi, langs: ['fortran'], weight: 40 },

            // OCaml
            { regex: /^\s*type\s+\w+\s*=\s*[\|\{]/m, langs: ['ocaml'], weight: 45 },
            { regex: /\|\s*\w+\s*->/, langs: ['ocaml'], weight: 40 },
            { regex: /match\s+\w+\s+with/, langs: ['ocaml'], weight: 40 },

            // TypeScript specific patterns
            { regex: /interface\s+\w+\s*\{/, langs: ['typescript'], weight: 45 },
            { regex: /:\s*(string|number|boolean|any)\s*[=\;\,\)]/g, langs: ['typescript'], weight: 40 },
            { regex: /public\s+\w+\s*:\s*(string|number|boolean)/, langs: ['typescript'], weight: 45 },

            // ActionScript specific
            { regex: /^\s*package\s+[\w.]+\s*\{/m, langs: ['actionscript'], weight: 50 },
            { regex: /:\s*(Array|uint|int|String|Boolean|Number|void)\s*[=\{\(]/, langs: ['actionscript'], weight: 40 },

            // VB.NET vs VBScript
            { regex: /^\s*Imports?\s+System/mi, langs: ['vbnet'], weight: 50 },
            { regex: /^\s*Public\s+Class\s+\w+/mi, langs: ['vbnet'], weight: 45 },
            { regex: /^\s*Namespace\s+\w+/mi, langs: ['vbnet'], weight: 45 },
            { regex: /Set\s+\w+\s*=\s*CreateObject/gi, langs: ['vbscript'], weight: 45 },

            // Prolog
            { regex: /^\s*\w+\s*\([^)]*\)\s*:-/m, langs: ['prolog'], weight: 50 },
            { regex: /:-\s*\w+\s*\(/, langs: ['prolog'], weight: 40 },

            // Smalltalk
            { regex: /^\s*\w+>>\w+:/m, langs: ['smalltalk'], weight: 50 },
            { regex: /\|\s*\w+\s*\w+\s*\|/, langs: ['smalltalk'], weight: 40 },

            // TCL
            { regex: /^\s*proc\s+\w+\s*\{/m, langs: ['tcl'], weight: 50 },
            { regex: /\$\w+\s+\{/, langs: ['tcl'], weight: 35 },

            // Makefile - improved detection
            { regex: /^\w+:\s*$/m, langs: ['makefile'], weight: 45 },
            { regex: /^\t[\w\$]/, langs: ['makefile'], weight: 40 },
            { regex: /^\.PHONY:/m, langs: ['makefile'], weight: 45 },

            // Lua - improved detection
            { regex: /--\[\[[\s\S]*?\]\]/, langs: ['lua'], weight: 45 },
            { regex: /local\s+function\s+\w+/, langs: ['lua'], weight: 40 },
            { regex: /function\s+\w+\s*\([^)]*\)/, langs: ['lua'], weight: 35 },

            // PHP - better detection without <?php
            { regex: /namespace\s+[\w\\]+\s*;/, langs: ['php'], weight: 40 },
            { regex: /use\s+[\w\\]+\s*;/, langs: ['php'], weight: 35 },
            { regex: /require_once\s+/, langs: ['php'], weight: 35 },

            // CSS preprocessors - better distinction
            { regex: /@import\s+['"][^'"]*\.less['"]/, langs: ['less'], weight: 45 },
            { regex: /\.\w+\s*\{\s*\.\w+/, langs: ['less'], weight: 40 },
            { regex: /@\w+\s*:\s*[^;]+;/, langs: ['less'], weight: 35 }

        ],

        // Very strong indicators
        strong: [
            // Language-specific built-ins and distinctive function calls
            { regex: /console\.log\s*\(/, langs: ['javascript'], weight: 25 },
            { regex: /System\.out\.println\s*\(/, langs: ['java'], weight: 30 },
            { regex: /fmt\.Printf?\s*\(/, langs: ['go'], weight: 25 },
            { regex: /println!\s*\(/, langs: ['rust'], weight: 25 },
            { regex: /print\s*\(/, langs: ['python'], weight: 15 },
            { regex: /puts\s+/, langs: ['ruby'], weight: 20 },
            { regex: /echo\s+/, langs: ['php', 'bash'], weight: 10 },
            { regex: /printf\s*\(/, langs: ['c', 'cpp'], weight: 15 },
            { regex: /disp\s*\(/, langs: ['matlab'], weight: 20 },

            // Function definitions by language
            { regex: /def\s+\w+\s*\(/, langs: ['python', 'ruby'], weight: 20 },
            { regex: /function\s+\w+\s*\(/, langs: ['javascript', 'php'], weight: 15 },
            { regex: /fn\s+\w+\s*\(/, langs: ['rust'], weight: 20 },
            { regex: /func\s+\w+\s*\(/, langs: ['go', 'swift'], weight: 18 },
            { regex: /fun\s+\w+\s*\(/, langs: ['kotlin'], weight: 20 },
            { regex: /sub\s+\w+/, langs: ['perl'], weight: 18 },
            { regex: /procedure\s+\w+/gi, langs: ['pascal', 'delphi'], weight: 20 },
            { regex: /defun\s+\w+/, langs: ['lisp'], weight: 25 },
            { regex: /define\s+\w+/, langs: ['scheme'], weight: 20 },
            { regex: /defp?\s+\w+/, langs: ['elixir'], weight: 25 },

            // Import/Include patterns
            { regex: /^from\s+\w+\s+import/m, langs: ['python'], weight: 20 },
            { regex: /^import\s+\w+/m, langs: ['python', 'java', 'go', 'swift'], weight: 12 },
            { regex: /require\s*\(/, langs: ['javascript'], weight: 15 },
            { regex: /require\s+['"][^'"]+['"]/, langs: ['ruby'], weight: 15 },
            { regex: /use\s+\w+::/, langs: ['rust'], weight: 18 },
            { regex: /use\s+\w+/, langs: ['rust', 'php'], weight: 10 },
            { regex: /#include\s*[<"]/, langs: ['c', 'cpp'], weight: 15 },
            { regex: /using\s+namespace/, langs: ['cpp'], weight: 18 },
            { regex: /using\s+System/, langs: ['csharp'], weight: 18 },

            // Language-specific operators and syntax
            { regex: /std::cout\s*<</, langs: ['cpp'], weight: 20 },
            { regex: /cout\s*<</, langs: ['cpp'], weight: 15 },
            { regex: /::\w+/, langs: ['cpp', 'rust', 'scala'], weight: 12 },
            { regex: /=>\s*/, langs: ['javascript', 'rust', 'csharp', 'scala'], weight: 8 },
            { regex: /\$\w+/, langs: ['php', 'bash', 'perl'], weight: 12 },
            { regex: /@\w+/, langs: ['java', 'csharp', 'python'], weight: 8 },
            { regex: /\|>/, langs: ['elixir', 'fsharp'], weight: 15 },
            { regex: /<-/, langs: ['r', 'haskell'], weight: 15 },
            { regex: /\?\?/, langs: ['csharp'], weight: 15 },
            { regex: /\.\./, langs: ['rust', 'perl'], weight: 10 },

            // CoffeeScript distinctive patterns
            { regex: /\w+\s*:\s*\([^)]*\)\s*->/, langs: ['coffeescript'], weight: 25 },
            { regex: /\w+\s*=\s*->/, langs: ['coffeescript'], weight: 20 },
            { regex: /#{[^}]+}/, langs: ['coffeescript'], weight: 20 },
            { regex: /"""\s*[\s\S]*?"""/, langs: ['coffeescript'], weight: 15 },
            { regex: /@\w+/, langs: ['coffeescript'], weight: 20 },
            { regex: /\?\s*\./, langs: ['coffeescript'], weight: 18 },

            // Bash specific patterns
            { regex: /\[\[\s+.*\s+\]\]/, langs: ['bash'], weight: 25 },
            { regex: /\$\([^)]+\)/, langs: ['bash'], weight: 20 },
            { regex: /\${[^}]+}/, langs: ['bash'], weight: 18 },
            { regex: /if\s+\[\s+.*\s+\]/, langs: ['bash'], weight: 20 },
            { regex: /for\s+\w+\s+in\s+.*do/gi, langs: ['bash'], weight: 18 },

            // Dart specific patterns
            { regex: /part\s+['"][^'"]+['"]/, langs: ['dart'], weight: 25 },
            { regex: /part\s+of\s+\w+/, langs: ['dart'], weight: 25 },
            { regex: /factory\s+\w+/, langs: ['dart'], weight: 20 },

            // Elixir specific patterns
            { regex: /\|>\s*\w+/, langs: ['elixir'], weight: 25 },
            { regex: /do\s*$/m, langs: ['elixir'], weight: 15 },
            { regex: /end$/m, langs: ['elixir', 'ruby'], weight: 12 },

            // Ruby specific patterns - improved
            { regex: /\.each\s+do\s*\|/, langs: ['ruby'], weight: 25 },
            { regex: /def\s+self\./, langs: ['ruby'], weight: 25 },
            { regex: /class\s+\w+\s*<\s*\w+/, langs: ['ruby'], weight: 20 },
            { regex: /end\s*$/, langs: ['ruby', 'elixir'], weight: 15 },

            // More language-specific patterns for better accuracy
            { regex: /library\s*\(/, langs: ['r'], weight: 25 },
            { regex: /data\.frame\s*\(/, langs: ['r'], weight: 20 },

            // Config file patterns
            { regex: /RewriteCond\s+/, langs: ['apache'], weight: 18 },
            { regex: /location\s+[^{]+\s*\{/, langs: ['nginx'], weight: 20 },
            { regex: /proxy_pass\s+/, langs: ['nginx'], weight: 18 },
            { regex: /^\s*\[\w+\]/m, langs: ['ini'], weight: 15 }
        ],

        // Medium strength indicators
        medium: [
            // Class and type definitions
            { regex: /\bclass\s+\w+\s*\{/, langs: ['java', 'cpp', 'csharp', 'javascript', 'actionscript'], weight: 8 },
            { regex: /\bclass\s+\w+\s*:/, langs: ['python'], weight: 12 },
            { regex: /\bclass\s+\w+\s*extends/, langs: ['java', 'javascript', 'actionscript'], weight: 10 },
            { regex: /\bstruct\s+\w+/, langs: ['c', 'cpp', 'rust', 'go'], weight: 10 },
            { regex: /\benum\s+\w+/, langs: ['java', 'cpp', 'csharp', 'rust', 'swift'], weight: 8 },
            { regex: /\binterface\s+\w+/, langs: ['java', 'csharp', 'typescript', 'go', 'actionscript'], weight: 10 },
            { regex: /\btrait\s+\w+/, langs: ['scala', 'rust'], weight: 12 },
            { regex: /\btype\s+\w+/, langs: ['haskell', 'scala'], weight: 8 },

            // Variable declarations
            { regex: /\blet\s+\w+/, langs: ['javascript', 'rust', 'swift', 'typescript'], weight: 6 },
            { regex: /\bvar\s+\w+\s*:/, langs: ['actionscript', 'swift', 'typescript'], weight: 8 },
            { regex: /\bvar\s+\w+/, langs: ['javascript', 'csharp', 'go', 'swift'], weight: 5 },
            { regex: /\bconst\s+\w+/, langs: ['javascript', 'cpp', 'rust', 'typescript'], weight: 6 },

            // CSS/Styling
            { regex: /@media\s+/, langs: ['css', 'scss', 'less'], weight: 8 },
            { regex: /@import\s+/, langs: ['css', 'scss', 'less'], weight: 6 },
            { regex: /@mixin\s+/, langs: ['scss'], weight: 10 },
            { regex: /@include\s+/, langs: ['scss'], weight: 10 },
            { regex: /\$\w+\s*:/, langs: ['scss'], weight: 8 }
        ],

        // Light indicators
        light: [
            // Comments by language family
            { regex: /\/\//, langs: ['javascript', 'java', 'cpp', 'csharp', 'go', 'rust', 'swift', 'actionscript', 'kotlin', 'scala'], weight: 2 },
            { regex: /\/\*[\s\S]*?\*\//, langs: ['javascript', 'java', 'cpp', 'csharp', 'go', 'rust', 'actionscript', 'kotlin', 'scala'], weight: 3 },
            { regex: /#[^!]/, langs: ['python', 'ruby', 'bash', 'perl', 'cmake', 'yaml'], weight: 2 },
            { regex: /<!--[\s\S]*?-->/, langs: ['html', 'xml'], weight: 5 },
            { regex: /\(\*[\s\S]*?\*\)/, langs: ['pascal', 'delphi', 'ocaml'], weight: 4 },
            { regex: /;[^;]*$/gm, langs: ['lisp', 'scheme'], weight: 3 },
            { regex: /%[^%]*$/gm, langs: ['matlab', 'erlang'], weight: 3 },
            { regex: /--[^-]*$/gm, langs: ['haskell', 'sql'], weight: 3 },
            { regex: /'/, langs: ['vbnet'], weight: 2 },

            // Basic syntax patterns
            { regex: /\{[^}]*\}/, langs: ['javascript', 'java', 'cpp', 'csharp', 'go', 'rust', 'swift', 'actionscript', 'kotlin', 'scala'], weight: 1 },
            { regex: /;$/gm, langs: ['javascript', 'java', 'cpp', 'csharp', 'go', 'rust', 'actionscript', 'kotlin', 'scala'], weight: 1 },
            { regex: /:\s*$/gm, langs: ['python', 'yaml'], weight: 2 },
            { regex: /\bbegin\b/gi, langs: ['pascal', 'delphi', 'ruby'], weight: 2 },
            { regex: /\bend\b/gi, langs: ['pascal', 'delphi', 'ruby'], weight: 2 }
        ],

        // Special patterns for markup, data, and config languages
        special: [
            // Markup languages
            { regex: /<\w+[^>]*>/, langs: ['html', 'xml'], weight: 12 },
            { regex: /<\/\w+>/, langs: ['html', 'xml'], weight: 10 },
            { regex: /<!\[CDATA\[/, langs: ['xml'], weight: 20 },
            { regex: /xmlns:/, langs: ['xml'], weight: 15 },
            { regex: /<\w+:\w+/, langs: ['xml'], weight: 12 },

            // CSS and preprocessors
            { regex: /\.\w+\s*\{[^}]*\}/, langs: ['css', 'scss', 'less'], weight: 15 },
            { regex: /#\w+\s*\{[^}]*\}/, langs: ['css', 'scss', 'less'], weight: 12 },
            { regex: /\w+\s*:\s*[^;]+;/, langs: ['css', 'scss', 'less'], weight: 8 },

            // Database languages
            { regex: /\b(select|from|where|insert|update|delete|create|table|database)\b/i, langs: ['sql', 'pgsql'], weight: 15 },
            { regex: /\b(join|inner|outer|left|right)\s+join\b/i, langs: ['sql', 'pgsql'], weight: 12 },

            // Data formats
            { regex: /^\s*\{[\s\S]*\}$/m, langs: ['json'], weight: 12 },
            { regex: /^\s*\[[\s\S]*\]$/m, langs: ['json'], weight: 12 },
            { regex: /"\w+"\s*:\s*"/, langs: ['json'], weight: 15 },
            { regex: /---\s*$/m, langs: ['yaml'], weight: 15 },

            // Config files
            { regex: /^\s*\[\w+\]\s*$/m, langs: ['ini', 'toml'], weight: 15 },
            { regex: /^\s*\w+\s*=\s*[^=]/m, langs: ['ini', 'properties', 'toml'], weight: 10 },

            // Documentation
            { regex: /^\s*#+\s+/, langs: ['markdown'], weight: 12 },
            { regex: /\[.*?\]\(.*?\)/, langs: ['markdown'], weight: 10 },
            { regex: /```\w*/, langs: ['markdown'], weight: 15 }
        ]
    };

    constructor() {
        // Pre-compile any dynamic optimizations if needed
        this.#optimizePatterns();
    }

    /**
     * Pre-compile and optimize regex patterns for better performance
     * @private
     */
    #optimizePatterns() {
        // Patterns are already optimized, but we could add runtime optimizations here
        // For now, just ensure all patterns are properly structured
    }

    /**
     * Get a strategic sample of code for analysis
     * Takes beginning, middle, and end portions for better detection while maintaining speed
     * @private
     * @param {string} code - The full code to sample
     * @param {number} maxLength - Maximum length of sample to return
     * @returns {string} Strategic sample of the code
     */
    #getSampleText(code, maxLength = 2500) {
        if (code.length <= maxLength) {
            return code;
        }

        // For very large files, take strategic samples
        // Most language indicators are in the first portion, but some are scattered
        const quarterLength = Math.floor(code.length / 4);

        // Take first 1500 chars (most imports, declarations, etc.)
        const start = code.slice(0, 1500);

        // Take 400 chars from around 1/4 position (catch any missed patterns)
        const quarter = code.slice(quarterLength - 200, quarterLength + 200);

        // Take 300 chars from around 1/2 position (catch middle patterns)
        const middle = code.slice(Math.floor(code.length * 0.4), Math.floor(code.length * 0.4) + 300);

        // Take last 300 chars (catch any end patterns)
        const end = code.slice(-300);

        return `${start}\n${quarter}\n${middle}\n${end}`;
    }

    /**
     * Add weighted scores to languages
     * @private
     * @param {Map<string, number>} scores - Score map to update
     * @param {string[]} languages - Languages to add scores to
     * @param {number} weight - Weight to add
     */
    #addScore(scores, languages, weight) {
        for (let i = 0; i < languages.length; i++) {
            const lang = languages[i];
            scores.set(lang, (scores.get(lang) || 0) + weight);
        }
    }

    /**
     * Process a set of patterns against code
     * @private
     * @param {string} code - Code to analyze
     * @param {Object[]} patterns - Patterns to check
     * @param {Map<string, number>} scores - Score map to update
     * @param {number} maxMatches - Maximum matches to count per pattern
     * @param {boolean} earlyExit - Whether to exit early on very strong matches
     * @returns {boolean} True if very strong match found and early exit enabled
     */
    #processPatterns(code, patterns, scores, maxMatches = 10, earlyExit = false) {
        let foundVeryStrong = false;

        for (let i = 0; i < patterns.length; i++) {
            const { regex, langs, weight } = patterns[i];

            // Reset regex lastIndex to ensure consistent behavior
            if (regex.global) {
                regex.lastIndex = 0;
            }

            const matches = code.match(regex);

            if (matches) {
                const matchCount = Math.min(matches.length, maxMatches);
                this.#addScore(scores, langs, weight * matchCount);

                // Track very strong matches (50+ weight)
                if (weight >= 50) {
                    foundVeryStrong = true;
                }

                // Early exit for definitive patterns with very high confidence
                if (earlyExit && weight >= 50 && matchCount > 0) {
                    // But continue processing other definitive patterns
                    // Don't exit immediately, let all definitive patterns run
                }
            }
        }

        return foundVeryStrong;
    }

    /**
     * Check for special cases like JSON, simple syntax patterns
     * @private
     * @param {string} code - Code to analyze
     * @param {Map<string, number>} scores - Score map to update
     */
    #checkSpecialCases(code, scores) {
        const trimmed = code.trim();

        // JSON detection - be more specific
        if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
            (trimmed.startsWith('[') && trimmed.endsWith(']'))) {

            // Additional JSON indicators
            const hasJsonPatterns = /^[\s\{\[]*"[\w\-]+"\s*:\s*/.test(trimmed) ||
                                  /"\s*:\s*[\[\{"]/.test(trimmed) ||
                                  /"\s*:\s*\d+/.test(trimmed);

            if (hasJsonPatterns) {
                try {
                    JSON.parse(trimmed);
                    scores.set('json', (scores.get('json') || 0) + 30);
                    return; // Early return for confirmed JSON
                } catch (e) {
                    // Not valid JSON, but might be similar syntax
                    if (hasJsonPatterns) {
                        this.#addScore(scores, ['javascript', 'typescript'], 5);
                    }
                }
            }
        }

        // Quick syntax hint scoring - only if no strong matches yet
        const currentScores = Array.from(scores.values());
        const maxScore = currentScores.length > 0 ? Math.max(...currentScores) : 0;

        if (maxScore < 30) {
            if (code.includes('{') && code.includes('}')) {
                this.#addScore(scores, ['javascript', 'java', 'cpp', 'csharp', 'go', 'rust', 'swift', 'actionscript'], 2);
            }

            if (code.includes(';')) {
                this.#addScore(scores, ['javascript', 'java', 'cpp', 'csharp', 'go', 'rust', 'actionscript'], 2);
            }

            // Indentation hints
            const lines = code.split('\n');
            let indentedLines = 0;
            const maxLinesToCheck = Math.min(20, lines.length);

            for (let i = 0; i < maxLinesToCheck; i++) {
                if (/^\s{4,}/.test(lines[i])) {
                    indentedLines++;
                }
            }

            if (indentedLines > 3) {
                this.#addScore(scores, ['python', 'yaml'], 3);
            }
        }

        // Check for specific file type indicators
        if (trimmed.includes('<?xml')) {
            scores.set('xml', (scores.get('xml') || 0) + 25);
        }

        if (trimmed.includes('<!DOCTYPE html')) {
            scores.set('html', (scores.get('html') || 0) + 25);
        }

        // Shell script indicators
        if (trimmed.startsWith('#!')) {
            const shebangLine = trimmed.split('\n')[0];
            if (shebangLine.includes('bash')) {
                scores.set('bash', (scores.get('bash') || 0) + 20);
            } else if (shebangLine.includes('python')) {
                scores.set('python', (scores.get('python') || 0) + 20);
            } else if (shebangLine.includes('ruby')) {
                scores.set('ruby', (scores.get('ruby') || 0) + 20);
            } else if (shebangLine.includes('perl')) {
                scores.set('perl', (scores.get('perl') || 0) + 20);
            }
        }
    }

    /**
     * Apply bias scoring to preferred languages
     * @private
     * @param {Map<string, number>} scores - Score map to update
     * @param {string[]} biasLanguages - Languages to bias towards
     * @param {number} biasWeight - Weight to add for biased languages
     */
    #applyBias(scores, biasLanguages, biasWeight = 5) {
        if (biasLanguages && biasLanguages.length > 0) {
            biasLanguages.forEach((lang) => {
                if (scores.has(lang)) {
                    scores.set(lang, scores.get(lang) + biasWeight);
                }
            });
        }
    }

    /**
     * Detect the most likely programming languages for the given code
     * @param {string} code - The code to analyze
     * @param {Object} options - Detection options
     * @param {string[]} [options.bias=[]] - Languages to bias detection towards
     * @param {number} [options.biasWeight=5] - Weight to add for biased languages
     * @param {number} [options.maxResults=5] - Maximum number of results to return
     * @returns {string[]} Array of detected languages, ordered by likelihood
     */
    detect(code, options = {}) {
        // Handle empty code gracefully
        if (code === null || code === undefined || code.length === 0) {
            return [];
        }

        // Handle edge cases
        if (!code || typeof code !== 'string') {
            return this.#defaultLanguages.slice(0, 3);
        }

        const trimmedCode = code.trim();
        if (trimmedCode.length === 0) {
            return this.#defaultLanguages.slice(0, 3);
        }

        // Extract options - limit to 5 results by default
        const { bias = [], biasWeight = 5, maxResults = 5 } = options;

        // Get strategic sample for analysis
        const sampleCode = this.#getSampleText(trimmedCode);
        const lowerCode = sampleCode.toLowerCase();
        const scores = new Map();

        // Process patterns in order of strength
        // Always process definitive patterns completely
        const foundDefinitive = this.#processPatterns(sampleCode, this.#patterns.definitive, scores, 3, false);

        // If we found definitive patterns, be more selective about other patterns
        if (foundDefinitive) {
            // Still process strong patterns but with more restraint
            this.#processPatterns(sampleCode, this.#patterns.strong, scores, 3);
            // Skip medium patterns if we have strong definitive matches
            const topScore = Math.max(...Array.from(scores.values()));
            if (topScore < 40) {
                this.#processPatterns(sampleCode, this.#patterns.medium, scores, 5);
            }
        } else {
            // No definitive patterns found, process everything
            this.#processPatterns(sampleCode, this.#patterns.strong, scores, 5);
            this.#processPatterns(sampleCode, this.#patterns.medium, scores, 8);
            this.#processPatterns(lowerCode, this.#patterns.light, scores, 15);
        }

        // Always check special cases and template languages
        this.#processPatterns(sampleCode, this.#patterns.special, scores);
        this.#checkSpecialCases(sampleCode, scores);

        // Apply bias
        this.#applyBias(scores, bias, biasWeight);

        // Convert to sorted results
        const sortedResults = Array.from(scores.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([lang]) => lang);

        // If no languages detected, return defaults
        if (sortedResults.length === 0) {
            return this.#defaultLanguages.slice(0, maxResults);
        }

        // Return detected languages, limited to maxResults
        return sortedResults.slice(0, maxResults);
    }

}

export default new LanguageDetector();
