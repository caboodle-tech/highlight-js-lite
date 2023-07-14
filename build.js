import * as Sass from 'sass'
import Archiver from 'archiver';
import Fs from 'fs';
import Path from 'path';
import Print from './print.js';
import Terser from '@rollup/plugin-terser';
import { fileURLToPath } from 'url';
import {rollup as Rollup} from 'rollup';

// eslint-disable-next-line no-underscore-dangle
const __filename = fileURLToPath(import.meta.url);
// eslint-disable-next-line no-underscore-dangle
const __dirname = Path.dirname(__filename);

class Builder {

    async build() {
        Print.notice('Building Highlight JS Lite:');
        if(!await this.buildHljsl() ) { return };
        if(!await this.buildHljslWebworker()) {return };
        if(!await this.buildHljslCss()) { return };
        if(!await this.buildHljslDemoCss()) { return };
        if(!this.bundleProductionFiles()) {return };

        const filesToZip = [
            Path.join(__dirname, 'dist/hljsl.min.css'),
            Path.join(__dirname, 'dist/hljsl.min.js'),
            Path.join(__dirname, 'dist/hljsl.min.js.map'),
            Path.join(__dirname, 'dist/hljsl-worker.min.js'),
            Path.join(__dirname, 'dist/hljsl-worker.min.js.map'),
        ];
        this.zipProductionBundle(filesToZip, Path.join(__dirname, 'dist/hljsl.zip'));
    }

    async buildHljsl() {
        const inputObj = { 
            input: Path.join(__dirname, 'src/hljsl.js')
        };

        const outputObj = {
            file: Path.join(__dirname, 'dist/hljsl.min.js'),
            format: 'iife',
            name: 'hljsl',
            plugins: [Terser()],
            sourcemap: true
        };

        return new Promise(resolve => {
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
        const src = Path.join(__dirname, 'src/scss/hljsl.scss');
        const dest = Path.join(__dirname, 'dist/hljsl.min.css');
        const ops = { style: 'compressed' };

        return new Promise(resolve => {
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
        const src = Path.join(__dirname, 'src/scss/demo.scss');
        const dest = Path.join(__dirname, 'dist/demo.min.css');
        const ops = { style: 'compressed' };

        return new Promise(resolve => {
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

    async buildHljslWebworker() {
        const inputObj = { 
            input: Path.join(__dirname, 'src/hljsl-worker.js')
        };

        const outputObj = {
            file: Path.join(__dirname, 'dist/hljsl-worker.min.js'),
            format: 'cjs',
            plugins: [Terser()],
            sourcemap: true
        }

        return new Promise(resolve => {
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
                Path.join(__dirname, 'dist/index.html')
            );
            this.copyFile(
                Path.join(__dirname, 'src/highlight.min.js'),
                Path.join(__dirname, 'dist/highlight.min.js')
            );
            this.copyDirectory(
                Path.join(__dirname, 'src/fonts'),
                Path.join(__dirname, 'dist/fonts')
            );
        } catch(err) {
            Print.error(`Could not copy static files to production:\n${err}`);
            return false
        }
        Print.success('Copied static files to production bundle successfully.');
        return true
    }

    async #compileSass(src, dest, ops = {}) {
        let result = Sass.compile(src, ops);
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

        Print.notice('Zipping precompiled production bundle:')

        archive.on('end', () => {
            Print.success('Zip archive created successfully.');
        });

        archive.on('error', (err) => {
            Print.error(`Error creating zip archive:\n${err}`);
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
builder.build();