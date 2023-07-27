import * as Sass from 'sass';
import Archiver from 'archiver';
import Fs from 'fs';
import Path from 'path';
import Terser from '@rollup/plugin-terser';
import { fileURLToPath } from 'url';
import { rollup as Rollup } from 'rollup';
import Print from './print.js';

// eslint-disable-next-line no-underscore-dangle
const __filename = fileURLToPath(import.meta.url);
// eslint-disable-next-line no-underscore-dangle
const __dirname = Path.dirname(__filename);

class Builder {

    async build() {
        Print.notice('Building HLJSL:');
        if (!await this.buildHljsl()) { return; }
        if (!await this.buildHljslWebworker()) { return; }
        if (!await this.buildHljslCss()) { return; }
        if (!await this.buildHljslDemoCss()) { return; }
        if (!this.bundleProductionFiles()) { return; }
        this.buildHljslZip();
    }

    async buildHljsl() {
        const inputObj = {
            input: Path.join(__dirname, 'hljsl.js')
        };

        const outputObj = {
            file: Path.join(__dirname, '../dist/hljsl.min.js'),
            format: 'iife',
            name: 'HLJSL',
            plugins: [Terser()],
            sourcemap: true
        };

        return new Promise((resolve) => {
            this.#rollupBundle(inputObj, outputObj)
                .then(() => {
                    Print.success('HLJSL class bundled successfully.');
                    resolve(true);
                })
                .catch((err) => {
                    Print.error(`Building HLJSL class bundle failed:\n${err}`);
                    resolve(false);
                });
        });
    }

    async buildHljslCss() {
        const src = Path.join(__dirname, 'scss/hljsl.scss');
        const dest = Path.join(__dirname, '../dist/hljsl.min.css');
        const ops = { style: 'compressed' };

        return new Promise((resolve) => {
            this.#compileSass(src, dest, ops)
                .then(() => {
                    Print.success('HLJSL CSS compiled successfully.');
                    resolve(true);
                })
                .catch((err) => {
                    Print.error(`Compiling HLJSL CSS failed:\n${err}`);
                    resolve(false);
                });
        });
    }

    async buildHljslDemoCss() {
        const src = Path.join(__dirname, 'scss/demo.scss');
        const dest = Path.join(__dirname, '../dist/demo.min.css');
        const ops = { style: 'compressed' };

        return new Promise((resolve) => {
            this.#compileSass(src, dest, ops)
                .then(() => {
                    Print.success('HLJSL Demo CSS compiled successfully.');
                    resolve(true);
                })
                .catch((err) => {
                    Print.error(`Compiling HLJSL Demo CSS failed:\n${err}`);
                    resolve(false);
                });
        });
    }

    buildHljslZip() {
        Print.notice('Zipping precompiled production bundle:');
        const filesToZip = [
            Path.join(__dirname, '../dist/hljsl.min.css'),
            Path.join(__dirname, '../dist/hljsl.min.js'),
            Path.join(__dirname, '../dist/hljsl.min.js.map'),
            Path.join(__dirname, '../dist/hljsl-worker.min.js'),
            Path.join(__dirname, '../dist/hljsl-worker.min.js.map')
        ];
        this.zipProductionBundle(filesToZip, Path.join(__dirname, '../dist/hljsl.zip'));
    }

    async buildHljslWebworker() {
        const inputObj = {
            input: Path.join(__dirname, 'hljsl-worker.js')
        };

        const outputObj = {
            file: Path.join(__dirname, '../dist/hljsl-worker.min.js'),
            format: 'cjs',
            plugins: [Terser()],
            sourcemap: true
        };

        return new Promise((resolve) => {
            this.#rollupBundle(inputObj, outputObj)
                .then(() => {
                    Print.success('HLJSL WebWorker class bundled successfully.');
                    resolve(true);
                })
                .catch((err) => {
                    Print.error(`Building HLJSL WebWorker class bundle failed:\n${err}`);
                    resolve(false);
                });
        });
    }

    bundleProductionFiles() {
        try {
            this.copyFile(
                Path.join(__dirname, 'index.html'),
                Path.join(__dirname, '../dist/index.html')
            );
            this.copyFile(
                Path.join(__dirname, 'highlight.min.js'),
                Path.join(__dirname, '../dist/highlight.min.js')
            );
            this.copyDirectory(
                Path.join(__dirname, 'fonts'),
                Path.join(__dirname, '../dist/fonts')
            );
        } catch (err) {
            Print.error(`Could not copy static files to production:\n${err}`);
            return false;
        }
        Print.success('Copied static files to production bundle successfully.');
        return true;
    }

    async #compileSass(src, dest, ops = {}) {
        const result = Sass.compile(src, ops);
        Fs.writeFileSync(dest, result.css);
    }

    copyDirectory(src, dest) {
        if (!Fs.existsSync(dest)) {
            Fs.mkdirSync(dest);
        }

        const files = Fs.readdirSync(src);

        files.forEach((file) => {
            const sourcePath = Path.join(src, file);
            const destinationPath = Path.join(dest, file);

            if (Fs.lstatSync(sourcePath).isDirectory()) {
                this.copyDirectory(sourcePath, destinationPath);
            } else {
                Fs.copyFileSync(sourcePath, destinationPath);
            }
        });
    }

    copyFile(src, dest) {
        Fs.cpSync(src, dest);
    }

    async #rollupBundle(inputObj, outputObj) {
        // Create a Rollup bundle.
        const bundle = await Rollup(inputObj);
        // Save the generated (bundled) code.
        await bundle.write(outputObj);
    }

    zipProductionBundle(filesToZip, dest) {
        const output = Fs.createWriteStream(dest);
        const archive = Archiver('zip', { zlib: { level: 9 } });

        archive.on('end', () => {
            Print.success('Zip archive created successfully.');
            return true;
        });

        archive.on('error', (err) => {
            Print.error(`Error creating zip archive:\n${err}`);
            return false;
        });

        archive.pipe(output);

        filesToZip.forEach((file) => {
            if (Fs.existsSync(file)) {
                const stats = Fs.statSync(file);
                if (stats.isDirectory()) {
                    archive.directory(file, Path.basename(file));
                } else {
                    archive.file(file, { name: Path.basename(file) });
                }
            } else {
                Print.warn(`File not found: ${file}`);
            }
        });

        archive.finalize();
    }

}

const builder = new Builder();

/**
 * Determine what command to run:
 */
let buildCmd = '';

if (process.argv && process.argv.length > 2) {
    // eslint-disable-next-line prefer-destructuring
    buildCmd = process.argv[2];
}

/**
 * Run the chosen command or default to building everything.
 */
switch (buildCmd) {
    case 'css':
        Print.notice('Building HLJSL CSS:');
        (async function css() {
            await builder.buildHljslCss();
            await builder.buildHljslDemoCss();
        }());
        break;
    case 'zip':
        builder.buildHljslZip();
        break;
    default:
        builder.build();
}
