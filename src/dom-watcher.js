/**
 * @class DOMWatcher
 * @description A utility class to observe and react to dynamic DOM changes using a MutationObserver.
 * This class allows you to watch for specific elements based on a selector, and call a callback
 * when those elements are added to the DOM, including any existing matching elements at the time
 * of the observation.
 */
class DOMWatcher {

    constructor() {
        this.watchersBySelector = new Map();
        this.observedElements = new WeakSet(); // Track elements we've already processed
        this.observer = new MutationObserver(this.handleMutations.bind(this));
        this.observer.observe(document.documentElement, {
            childList: true,
            subtree: true
        });
    }

    handleMutations(mutations) {
        // Process all added nodes in a single batch
        const addedNodes = new Set();
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === 1) addedNodes.add(node);
            });
        });

        // Check each node against selectors
        addedNodes.forEach(this.checkNode.bind(this));
    }

    watch(selector, callback, once = true) {
        const watchId = Symbol();
        if (!this.watchersBySelector.has(selector)) {
            this.watchersBySelector.set(selector, new Map());
        }

        const wrappedCallback = (element) => {
            // Skip if we've already processed this element
            if (this.observedElements.has(element)) {
                return;
            }

            // Mark as processed
            this.observedElements.add(element);

            // Call the callback
            callback(element);

            if (once) {
                this.unwatch(selector, watchId);
            }
        };

        this.watchersBySelector.get(selector).set(watchId, wrappedCallback);

        // Check existing elements
        const existingElement = document.querySelector(selector);
        if (existingElement) {
            wrappedCallback(existingElement);
        }

        return {
            unwatch: () => this.unwatch(selector, watchId)
        };
    }

    unwatch(selector, id) {
        const callbacks = this.watchersBySelector.get(selector);
        if (callbacks) {
            callbacks.delete(id);
            if (callbacks.size === 0) {
                this.watchersBySelector.delete(selector);
            }
        }
    }

    checkNode(node) {
        if (!node.matches) return;

        this.watchersBySelector.forEach((callbacks, selector) => {
            // Check if the node itself matches
            if (node.matches(selector)) {
                callbacks.forEach((callback) => callback(node));
            } else {
                // If parent doesn't match, check for first matching child
                const matchingChild = node.querySelector(selector);
                if (matchingChild) {
                    callbacks.forEach((callback) => callback(matchingChild));
                }
            }
        });
    }

    disconnect() {
        this.observer.disconnect();
        this.watchersBySelector.clear();
    }

}

export default DOMWatcher;
