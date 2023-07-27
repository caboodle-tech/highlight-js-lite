# Highlight JS Lite (HLJSL)

HLJSL is a simple wrapper for the [highlight.js](https://github.com/highlightjs/highlight.js) library and is designed to be a drop-in solution with minimal or no configuration required. Out of the box HLJSL provides:

- Automatic code highlighting for `<pre><code>` blocks using WebWorkers for performance.
- Automatic line numbers for `<pre><code>` blocks which can be disabled according to preference.
- Automatic pre padding (left-padding) correction allowing you to indent `<pre><code>` blocks just like any other code in your source files; view this pages source for examples.
- Copy code to clipboard button with built-in language (i18n) support.
- Light and dark theme support with the ability to easily build your own theme.

## Usage

HLJS comes precompiled and can be added to your site by downloading the [latest release](https://github.com/caboodle-tech/highlight-js-lite/releases) and following these steps:

1.  Extract (unzip) the files and place them into a directory within your project. Do not split up the files, they must stay together in the same directory.
2.  In the `<head>` of your sites pages add a `<script>` tag to load the `hljsl.min.js` file and then a `<link>` tag to load the `hljsl.min.css` file.
3.  Make sure to place all the code you want to be auto highlighted inside `<pre><code>` blocks. Enjoy!

The precompiled version of HLJSL uses the light and dark StackOverflow theme. If you would like to compile HLJSL with a different theme the process is fairly simple and is covered in the [Compile With a Different Theme](#compile-with-a-different-theme) section below.

## Configure

HLJSL is designed to require zero configuration but there two ways to modify the default settings for HLJSL. Using [query strings](https://en.wikipedia.org/wiki/Query_string) at the end of the HLJSL's src url will allow you to modify some of the core settings but not all of them:

- **autoLoad=false** will disable auto loading (auto processing) of code blocks.
- **lazyLoad=false** will disable lazy loading (lazy processing) of code blocks.
- **hideNumbers=true** will disable showing the line numbers on processed blocks.

For example if you wanted full control of when HLJSL processes code blocks you would add code similar to the following in your head tag:

```html
<script src="./hljsl.min.js?autoLoad=false&lazyLoad=false"></script>
```

You can also use the css classes `hide-numbers` and `show-numbers` to overwrite the current settings for individual `<pre><code>` blocks:

```html
<pre class="hljsl hide-numbers">
    <code>
        <!--
            The class hide-numbers will hide the line numbers even
            if they are supposed to display in your code blocks.
        -->
    <code>
</pre>

<pre class="hljsl show-numbers">
    <code>
        <!--
            The class show-numbers will show the line numbers even
            if they are supposed to be hidden by your settings.
        -->
    <code>
</pre>
```

A more advanced way that allows complete control over all of HLJSL's settings is to set a global configuration object **before** the `<script>` tag that loads HLJSL:

```javascript
window.hljslConfig = {
    autoLoad: true,             // Auto process all pre code blocks
    hideNumbers: false,         // Hide the line numbers for code blocks
    ignoreElements: [],         // Tags, .classes, and/or #ids not to look within
    lang: 'en-us',              // Language help messages should display in
    lazyLoad: true,             // Process code blocks only when they may come into view
    onlyAutoProcess: ['body']   // Tags, .classes, and/or #ids of elements to look within
}
```

You may include or exclude any combination of these options. Any missing options from the global configuration object will use HLJSL's default for that option.

## Compile With a Different Theme

HLJSL uses sassy css for themes. If you would like to modify the built in theme, use a different theme, or create your own theme you should download a copy of this repository and edit the `src/scss/hljsl.scss` file.

If you want to use a different theme you should edit the first line of the `hljsl.scss` file to point to the theme you want. New themes should be added in the `theme` directory following the pattern of the `stackoverflow.scss` file.

Once you have modified the theme to your liking or created and added your own you can compile your own production files with the following commands:

```bash
# Open a terminal at the root of the repository
npm install   # Only required once
npm run build # Build the entire production release
```

You can now add the `hljsl.min.css` file in the `dist` directory to your site to override the original styles HLJSL comes precompiled with.

## Custom Builds

If you would like full control over HLJSL's build process you can download a copy of this repository and use the following commands at the root the repository:

```bash
npm install # Run once to install dependencies

# Make any changes you wish in the `src` directory then run:
npm run build     # Complete production build of HLJSL
npm run build:css # Compile only the scss files of HLJSL
npm run build:zip # Bundle all currently compiled files into a zip

# All files created by a build command will be output to the `dist` directory
```

## Contributions

HLJSL is an open source (Commons Clausee: MIT) community supported project, if you would like to help please consider <a href="https://github.com/caboodle-tech/highlight-js-lite/issues" target="_blank">tackling an issue</a> or <a href="https://ko-fi.com/caboodletech" target="_blank">making a donation</a> to keep the project alive.