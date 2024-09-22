# Highlight JS Lite (HLJSL)

HLJSL is a simple wrapper for the [highlight.js](https://github.com/highlightjs/highlight.js) library and is designed to be a drop-in solution with minimal or no configuration required. Out of the box HLJSL provides:

- Automatic code highlighting for `<pre><code>` blocks using a Web Worker for performance.
- Automatic line numbers for `<pre><code>` blocks which can be disabled according to preference.
- Automatic `pre` padding (left-padding) correction allowing you to indent `<pre><code>` blocks just like any other code in your source files; view the source of the [demo page](https://caboodle-tech.github.io/highlight-js-lite/) for examples.
- Copy code to clipboard button with built-in language (i18n) support.
- Light and dark theme support with the ability to easily build your own theme.

## Usage

HLJS comes precompiled and can be added to your site by including the appropriate files from the `dist` folder to your site: Include the `hljsl.min.css` and `hljsl.min.js` files in the `<head>` of your pages. Do not add the `hljs.min.js` file (notice the lack of `l` after `hljs`) this will be loaded by the Web Worker when needed.

The precompiled version of HLJSL uses a modified version of the light and dark StackOverflow theme. If you would like to compile HLJSL with a different theme the process is fairly simple and is covered in the [Compile With a Different Theme](#compile-with-a-different-theme) section below.

For greater control over HLJSL there are configuration options you can modify covered in the next section. See the [public methods](#public-methods) section if you would like to use HLJSL manually or in conjunction with your own application.

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
<pre class="hide-numbers">
    <code>
        <!--
            The class hide-numbers will hide the line numbers even
            if they are supposed to display in your code blocks.
        -->
    <code>
</pre>

<pre class="show-numbers">
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

HLJSL uses sassy css (sass, or scss specifically) for themes. If you would like to modify the built in theme, use a different theme, or create your own theme you should download a copy of this repository and edit the `src/scss/hljsl.scss` file.

If you want to use a different theme you should edit the first line of the `hljsl.scss` file to point to the theme you want. New themes should be added in the `theme` directory following the pattern of the `caboodle-tech.scss` file.

Once you have modified the theme to your liking or created and added your own you can compile your own production files with the following commands:

```bash
# Open a terminal at the root of the repository and run the following:
pnpm install   # Only required once
pnpm run build # Build the entire production release

# Note: You can use `npm` instead of `pnpm` but any pull request you submit may not be accepted!
```

You can now add the `hljsl.min.css` file in the `dist` directory to your site to override the original styles HLJSL comes precompiled with.

## Custom Builds

If you would like full control over HLJSL's build process you can download a copy of this repository and use the following commands at the root the repository:

```bash
# Run once to install dependencies:
pnpm install 

# Make any changes you wish in the `src` directory then run:
# All files created by a build command will be output to the `dist` directory.
pnpm run build

# Note: You can use `npm` instead of `pnpm` but any pull request you submit may not be accepted!
```

## Public Methods

The primary instance of HLJSL added globally to the page as `hljsl` has the following publicly available methods:

#### **connect**

- Connect to HLJSL's web worker. This is automatically done but you can trigger it earlier if you like.

#### **disconnect**

- Disconnect from HLJSL's web worker.

#### **getAutoRunStatus**

- Check the status of the page being auto loaded (processed). Prevents instances of HLJSL from stepping on one another.

#### **getQuerySelectorFindAllString(find)**

- An array of element tags, .classes, and/or #ids to locate in the page. Returns a string that can be used by querySelectorAll to find only the specified elements in the page.

#### **getQuerySelectorNotWithinString(find, notWithin)**

- Builds a query string to be used by querySelectorAll that allows not searching within .classes, #ids, and/or elements. `find` should be the query string for the element to find and `notWithin` should be an array of .classes, #ids, and/or elements to not search within.

#### **getUserLanguage**

- Detect what language the user is viewing the page in. If you want to set a language you should add the `lang` attribute to the HTML tag before HLJSL runs.

#### **getVersion**

- The version of HLJSL being used.

#### **highlight(codeElem)**

- Highlight a code element with HLJS using the HLJSL web worker.

#### **highlightAll(container)**

- Process all code blocks found within the provided container (element).

#### **isConnected**

- Check if HLJSL's Web worker is connected.

#### **setConfig(config)**

- Allows changing the default settings being used by this instance of HLJSL.

## Contributions

HLJSL is an open source (Commons Clause: MIT) community supported project, if you would like to help please consider <a href="https://github.com/caboodle-tech/highlight-js-lite/issues" target="_blank">tackling an issue</a> or <a href="https://ko-fi.com/caboodletech" target="_blank">making a donation</a> to keep the project alive.