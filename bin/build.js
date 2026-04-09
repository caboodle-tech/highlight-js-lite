import Fs from 'fs';
import Path from 'path';
import Terser from '@rollup/plugin-terser';
import { rollup as Rollup } from 'rollup';

const LicenseHeader = () => ({
    name: 'prepend-license',
    generateBundle(options, bundle) {
        for (const chunk of Object.values(bundle)) {
            if (chunk.type === 'chunk') {
                chunk.code = `${licenseHeader}\n${chunk.code}`;
            }
        }
    }
});

const ReplaceVersion = () => ({
    name: 'replace-version',
    transform(code) {
        const versionPattern = /const Version = '.*?';/;
        const newCode = code.replace(versionPattern, `const Version = '${info.version}';`);
        return {
            code: newCode,
            map: null
        };
    }
});

const root = Path.resolve(import.meta.dirname, '../');

const info = JSON.parse(Fs.readFileSync(Path.join(root, 'package.json'), { encoding: 'utf8' }));
let licenseHeader = `/**
 * Highlight JS Lite v{{version}} Copyright (c) {{year}} Caboodle Tech Inc.
 * License and source code available at: https://github.com/caboodle-tech/highlight-js-lite
 */`;
licenseHeader = licenseHeader.replace('{{version}}', info.version);
licenseHeader = licenseHeader.replace('{{year}}', new Date().getFullYear());

const compileJsOnBuild = [
    {
        src: Path.join(root, 'src', 'hljsl.js'),
        dest: Path.join(root, 'dist', 'hljsl.min.js')
    },
    {
        src: Path.join(root, 'src', 'hljsl.js'),
        dest: Path.join(root, 'website', 'hljsl.min.js')
    }
];

const copyCssOnBuild = [
    {
        src: Path.join(root, 'src', 'css', 'hljsl.css'),
        dest: Path.join(root, 'dist', 'hljsl.min.css')
    },
    {
        src: Path.join(root, 'src', 'css', 'hljsl.css'),
        dest: Path.join(root, 'website', 'hljsl.min.css')
    },
    {
        src: Path.join(root, 'src', 'css', 'demo.css'),
        dest: Path.join(root, 'website', 'demo.min.css')
    }
];

const copyOnBuild = [
    {
        src: Path.join(root, 'src', 'hljs.min.js'),
        dest: Path.join(root, 'dist', 'hljs.min.js')
    },
    {
        src: Path.join(root, 'src', 'hljs.min.js'),
        dest: Path.join(root, 'website', 'hljs.min.js')
    },
    {
        src: Path.join(root, 'src', 'fonts'),
        dest: Path.join(root, 'website', 'fonts')
    },
    {
        src: Path.join(root, 'src', 'index.html'),
        dest: Path.join(root, 'website', 'index.html')
    }
];

const buildHighlighter = async() => {
    for (const item of compileJsOnBuild) {
        const bundleOptions = {
            input: item.src,
            plugins: [
                ReplaceVersion(),
                Terser(),
                LicenseHeader()
            ]
        };

        try {
            const bundle = await Rollup(bundleOptions);
            await bundle.write(
                {
                    file: item.dest,
                    format: 'iife',
                    esModule: false,
                    generatedCode: {
                        constBindings: true,
                        arrowFunctions: true
                    }
                }
            );
        } catch (err) {
            console.error('Build failed:', err);
        }
    }
};

/**
 * Writes native CSS with the project license banner (no preprocessor or minifier).
 */
const buildCss = () => {
    for (const item of copyCssOnBuild) {
        try {
            const css = Fs.readFileSync(item.src, { encoding: 'utf8' });
            const dir = Path.dirname(item.dest);
            if (!Fs.existsSync(dir)) {
                Fs.mkdirSync(dir, { recursive: true });
            }
            Fs.writeFileSync(item.dest, `${licenseHeader}\n${css}`);
        } catch (error) {
            console.error(`Error processing CSS file ${item.src}:`, error);
        }
    }
};

const copyFiles = () => {
    const copyRecursiveSync = (src, dest) => {
        const stats = Fs.statSync(src);
        if (stats.isDirectory()) {
            if (!Fs.existsSync(dest)) {
                Fs.mkdirSync(dest);
            }
            const files = Fs.readdirSync(src);
            for (const file of files) {
                const srcFile = Path.join(src, file);
                const destFile = Path.join(dest, file);
                copyRecursiveSync(srcFile, destFile);
            }
        } else {
            Fs.copyFileSync(src, dest);
        }
    };

    for (const item of copyOnBuild) {
        copyRecursiveSync(item.src, item.dest);
    }
};

await buildHighlighter();
buildCss();
copyFiles();
