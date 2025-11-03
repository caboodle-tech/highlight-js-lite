class EditableHighlightJS {

    #regex = {
        removeCarriageReturns: /[\r]+/g
    };

    constructor(options = {}) {
        this.activeEditor = null;
        this.cursorX = null;
        this.debounceTimers = new Map();
        this.debounceDelay = options.debounceDelay || 500;
        this.editors = new Set();
        this.tabSize = options.tabSize || 4;
        this.tabString = ' '.repeat(this.tabSize);
        this.suppressHighlighting = false;
        this.pendingOperations = new Map(); // Change to Map to track timeouts
        this.pendingOperationTimeouts = new Map();

        // State machine - replaces multiline and typingAfterSelection flags
        this.EditorState = {
            IDLE: 'idle',
            MULTILINE: 'multiline',
            TYPING_AFTER_SELECTION: 'typing_after_selection'
        };
        this.currentState = this.EditorState.IDLE;
        this.stateTimeout = null;

        // History system
        this.history = new Map();
        this.maxHistorySize = options.maxHistorySize || 50;
        this.historyDebounceDelay = options.historyDebounceDelay || 3500;
        this.historyTimers = new Map();
        this.minChangeThreshold = options.minChangeThreshold || 10; // Minimum characters changed

        // Store bound handlers for proper cleanup
        this.boundHandlers = new WeakMap();
        this.boundGlobalHandlers = {
            multilineKeyDown: this.#handleMultilineKeyDown.bind(this),
            historyKeyDown: this.#handleHistoryKeyDown.bind(this)
        };

        this.#init();
    }

    /**
     * Initialize the editor system
     */
    #init() {
        document.addEventListener('keydown', this.boundGlobalHandlers.multilineKeyDown);
        document.addEventListener('keydown', this.boundGlobalHandlers.historyKeyDown);
    }

    /**
     * Set the current editor state with automatic cleanup
     * @param {string} state - The new state from EditorState enum
     * @param {number} timeout - Optional timeout in ms to auto-return to IDLE
     */
    #setState(state, timeout = 0) {
        // Clear any existing state timeout
        if (this.stateTimeout) {
            clearTimeout(this.stateTimeout);
            this.stateTimeout = null;
        }

        this.currentState = state;

        // If timeout specified, auto-return to IDLE
        if (timeout > 0) {
            this.stateTimeout = setTimeout(() => {
                if (this.currentState === state) {
                    this.currentState = this.EditorState.IDLE;
                    this.activeEditor = null;
                }
                this.stateTimeout = null;
            }, timeout);
        }

        // Clear activeEditor when returning to IDLE
        if (state === this.EditorState.IDLE) {
            this.activeEditor = null;
        }
    }

    /**
     * Activate an editor instance
     * @param {HTMLElement} pre - The pre element containing the editor
     */
    activateEditor(pre) {
        if (this.editors.has(pre)) {
            return;
        }

        const table = pre.querySelector('table');
        if (!table) {
            return;
        }

        // Ensure history is initialized
        if (!pre.dataset.editorHistory) {
            this.#initializeHistory(pre);
        }

        let { displayLanguage } = pre.dataset;
        if (!displayLanguage) {
            displayLanguage = Array.from(pre.querySelector('code')?.classList)
                .find((className) => className.startsWith('language-'))
                ?.replace('language-', '') || 'Plaintext';
        }

        if (!pre.dataset.editorApplied) {
            const clipboard = pre.querySelector('button.hljsl-clipboard');

            const lang = document.createElement('div');
            lang.classList.add('lang');
            lang.innerText = displayLanguage;

            const div = document.createElement('div');
            div.classList.add('editor-controls');
            div.innerHTML = '<svg class="icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M24 10.935v2.131l-8 3.947v-2.23l5.64-2.783-5.64-2.79v-2.223l8 3.948zm-16 3.848l-5.64-2.783 5.64-2.79v-2.223l-8 3.948v2.131l8 3.947v-2.30zm7.047-10.783h-2.078l-4.011 16h2.073l4.016-16z"/></svg>';
            div.appendChild(lang);
            div.appendChild(clipboard);
            pre.insertAdjacentElement('beforebegin', div);

            pre.dataset.editorApplied = true;
        } else {
            const lang = pre.previousElementSibling.querySelector('.lang');
            if (lang) {
                lang.innerText = displayLanguage;
            }
        }

        const debounceHandler = this.#createDebounceHandler(pre);
        pre._debounceHandler = debounceHandler;

        // Create and store bound handlers once
        if (!this.boundHandlers.has(table)) {
            this.boundHandlers.set(table, {
                keyUp: debounceHandler,
                keyDown: this.#handleKeyDown.bind(this),
                mouseDown: this.#handleMouseDown.bind(this),
                paste: this.#handlePastedContent.bind(this),
                mouseUp: this.#handleMouseUp.bind(this)
            });
        }

        const handlers = this.boundHandlers.get(table);
        this.editors.add(pre);
        table.addEventListener('keyup', handlers.keyUp);
        table.addEventListener('keydown', handlers.keyDown);
        table.addEventListener('mousedown', handlers.mouseDown);
        table.addEventListener('paste', handlers.paste);
        table.addEventListener('mouseup', handlers.mouseUp);

        // Make the second column editable
        for (const row of table.rows) {
            const codeCell = row.cells[1];
            if (codeCell) codeCell.contentEditable = true;
        }
    }

    /**
     * Create debounce handler for highlighting updates
     * @param {HTMLElement} pre - The pre element
     * @returns {Function} The debounce handler
     */
    #createDebounceHandler(pre) {
        return (event) => {
            if (this.suppressHighlighting || this.currentState !== this.EditorState.IDLE || this.pendingOperations.size > 0) {
                return;
            }

            if (event && event.type === 'keyup') {
                const { key } = event;
                const hasModifier = event.ctrlKey || event.metaKey || event.altKey;

                if (hasModifier ||
                    ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(key)) {
                    return;
                }

                const selection = window.getSelection();
                if (selection.rangeCount > 0) {
                    const range = selection.getRangeAt(0);
                    if (!range.collapsed && selection.toString().includes('\n')) {
                        return;
                    }
                }
            }

            const existingTimer = this.debounceTimers.get(pre);
            if (existingTimer) {
                clearTimeout(existingTimer);
            }

            const timerId = setTimeout(() => {
                if (!this.suppressHighlighting && this.currentState === this.EditorState.IDLE && this.pendingOperations.size === 0) {
                    this.updateEditor(pre);
                    // Save to history after typing (debounced)
                    this.#saveToHistory(pre, false, false);
                }
                this.debounceTimers.delete(pre);
            }, this.debounceDelay);

            this.debounceTimers.set(pre, timerId);
        };
    }

    /**
     * Temporarily suppress highlighting during operations
     * @param {Function} callback - The operation to perform
     * @param {number} duration - Duration to suppress highlighting
     * @returns {*} The result of the callback
     */
    withSuppressedHighlighting(callback, duration = 1000) {
        this.suppressHighlighting = true;
        try {
            const result = callback();
            if (result instanceof Promise) {
                return result.finally(() => {
                    setTimeout(() => {
                        this.suppressHighlighting = false;
                    }, duration);
                });
            }
            return result;
        } finally {
            setTimeout(() => {
                this.suppressHighlighting = false;
            }, duration);
        }
    }

    /**
     * Track operations that should suppress highlighting
     * @param {string} operationId - Unique operation identifier
     */
    addPendingOperation(operationId) {
        this.pendingOperations.set(operationId, Date.now());
        const timeoutId = setTimeout(() => {
            this.pendingOperations.delete(operationId);
            this.pendingOperationTimeouts.delete(operationId);
        }, 2000);
        this.pendingOperationTimeouts.set(operationId, timeoutId);
    }

    /**
     * Remove pending operation
     * @param {string} operationId - Operation identifier to remove
     */
    removePendingOperation(operationId) {
        this.pendingOperations.delete(operationId);
        const timeoutId = this.pendingOperationTimeouts.get(operationId);
        if (timeoutId) {
            clearTimeout(timeoutId);
            this.pendingOperationTimeouts.delete(operationId);
        }
    }

    /**
     * Initialize history system for an editor
     * @param {HTMLElement} pre - The pre element
     */
    #initializeHistory(pre) {
        const editorId = pre.dataset.editorHistory || this.createId();

        if (this.history.has(editorId)) {
            return;
        }

        pre.dataset.editorHistory = editorId;
        this.history.set(editorId, { states: [], currentIndex: -1 });

        // Create initial state with cursor at end
        const table = pre.querySelector('table');
        const lines = Array.from(table.rows).map((row) => row.cells[1].textContent);
        const lastRowIndex = lines.length - 1;
        const lastLineLength = lines[lastRowIndex] ? lines[lastRowIndex].length : 0;

        const initialState = {
            lines,
            cursorPosition: {
                rowIndex: lastRowIndex,
                columnPosition: lastLineLength
            },
            timestamp: Date.now()
        };

        this.history.get(editorId).states.push(initialState);
        this.history.get(editorId).currentIndex = 0;
    }

    /**
     * Get current cursor position information - improved version
     * @param {HTMLElement} pre - The pre element
     * @returns {Object|null} Cursor position information
     */
    #getCurrentCursorPosition(pre) {
        const selection = window.getSelection();
        if (!selection.rangeCount) return null;

        const range = selection.getRangeAt(0);
        const { activeElement } = document;

        // Make sure we're in a content cell
        if (!pre.contains(activeElement)) {
            return null;
        }

        // Find the actual cell - could be the TD itself or a child element
        const cell = activeElement.tagName === 'TD' ? activeElement : activeElement.closest('td');
        if (!cell || cell.cellIndex !== 1) { // Ensure it's the content cell (index 1)
            return null;
        }

        const table = pre.querySelector('table');
        const row = cell.closest('tr');
        const rowIndex = Array.from(table.rows).indexOf(row);

        // Calculate position within the cell's text content
        const columnPosition = this.#getCursorPosition(cell, range);

        return {
            rowIndex,
            columnPosition
        };
    }

    /**
     * Get current editor state
     * @param {HTMLElement} pre - The pre element
     * @returns {Object|null} The current state
     */
    #getCurrentEditorState(pre) {
        const table = pre.querySelector('table');
        if (!table) return null;

        const lines = Array.from(table.rows).map((row) => {
            if (row.cells[1]) {
                return row.cells[1].textContent;
            }
            return '';
        });

        const cursorPosition = this.#getCurrentCursorPosition(pre);

        return {
            lines,
            cursorPosition,
            timestamp: Date.now()
        };
    }

    /**
     * Calculate the amount of change between two states
     * @param {Object} state1 - First state
     * @param {Object} state2 - Second state
     * @returns {number} Number of changed characters
     */
    #calculateChangeAmount(state1, state2) {
        if (!state1 || !state2) return Infinity;

        const text1 = state1.lines.join('\n');
        const text2 = state2.lines.join('\n');

        return Math.abs(text1.length - text2.length);
    }

    /**
     * Save current state to history
     * @param {HTMLElement} pre - The pre element
     * @param {boolean} immediate - Whether to save immediately or debounce
     * @param {boolean} force - Whether to force save regardless of change threshold
     */
    #saveToHistory(pre, immediate = false, force = false) {
        const editorId = pre.dataset.editorHistory;
        if (!editorId) return;

        if (immediate) {
            this.#doSaveToHistory(pre, force);
        } else {
            const existingTimer = this.historyTimers.get(editorId);
            if (existingTimer) {
                clearTimeout(existingTimer);
            }

            const timerId = setTimeout(() => {
                this.#doSaveToHistory(pre, force);
                this.historyTimers.delete(editorId);
            }, this.historyDebounceDelay);

            this.historyTimers.set(editorId, timerId);
        }
    }

    /**
     * Actually save to history
     * @param {HTMLElement} pre - The pre element
     * @param {boolean} force - Whether to force save regardless of change threshold
     */
    #doSaveToHistory(pre, force = false) {
        const editorId = pre.dataset.editorHistory;
        if (!editorId) {
            return;
        }
        const historyData = this.history.get(editorId);

        const currentState = this.#getCurrentEditorState(pre);
        if (!currentState) {
            return;
        }

        if (historyData.states.length > 0) {
            const lastState = historyData.states[historyData.currentIndex];

            // Check if states are exactly equal (unless forced)
            if (!force && this.#statesEqual(currentState, lastState)) {
                return;
            }

            // Check if enough has changed to warrant a new history entry (unless forced)
            if (!force) {
                const changeAmount = this.#calculateChangeAmount(currentState, lastState);
                if (changeAmount < this.minChangeThreshold) {
                    return;
                }
            }
        }

        if (historyData.currentIndex < historyData.states.length - 1) {
            historyData.states = historyData.states.slice(0, historyData.currentIndex + 1);
        }

        historyData.states.push(currentState);
        historyData.currentIndex = historyData.states.length - 1;

        // Verify it's actually in the Map
        const verifyData = this.history.get(editorId);

        if (historyData.states.length > this.maxHistorySize) {
            historyData.states.shift();
            historyData.currentIndex -= 1;
        }
    }

    /**
     * Check if two states are equal
     * @param {Object} state1 - First state
     * @param {Object} state2 - Second state
     * @returns {boolean} Whether states are equal
     */
    #statesEqual(state1, state2) {
        if (state1.lines.length !== state2.lines.length) return false;
        for (let i = 0; i < state1.lines.length; i++) {
            if (state1.lines[i] !== state2.lines[i]) return false;
        }
        return true;
    }

    /**
     * Get the total text content length of a cell (ignoring HTML markup)
     * @param {HTMLElement} cell - The cell element
     * @returns {number} The total text length
     */
    #getTextContentLength(cell) {
        const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
        let total = 0;
        let node;
        while (node = walker.nextNode()) {
            total += node.textContent.length;
        }
        return total;
    }

    /**
     * Restore cursor position after state restoration
     * @param {HTMLElement} pre - The pre element
     * @param {Object} cursorPosition - The cursor position to restore
     */
    #restoreCursorPosition(pre, cursorPosition) {
        if (!cursorPosition) return;

        const table = pre.querySelector('table');
        if (!table || cursorPosition.rowIndex < 0 || cursorPosition.rowIndex >= table.rows.length) {
            return;
        }

        const targetRow = table.rows[cursorPosition.rowIndex];
        const targetCell = targetRow.cells[1];
        if (!targetCell) return;

        targetCell.contentEditable = true;
        targetCell.focus();

        // Ensure cursor position is within bounds of the actual text content
        // This accounts for any changes made by syntax highlighting
        const actualTextLength = this.#getTextContentLength(targetCell);
        const safePosition = Math.min(cursorPosition.columnPosition || 0, actualTextLength);

        this.#setCursorPosition(targetCell, safePosition);
    }

    /**
     * Undo operation
     * @param {HTMLElement} pre - The pre element
     * @returns {boolean} Whether undo was successful
     */
    undo(pre) {
        const editorId = pre.dataset.editorHistory;
        const historyData = this.history.get(editorId);

        if (!historyData || historyData.currentIndex <= 0) {
            return false;
        }

        historyData.currentIndex -= 1;
        const targetState = historyData.states[historyData.currentIndex];

        this.#restoreEditorState(pre, targetState);
        return true;
    }

    /**
     * Redo operation
     * @param {HTMLElement} pre - The pre element
     * @returns {boolean} Whether redo was successful
     */
    redo(pre) {
        const editorId = pre.dataset.editorHistory;
        const historyData = this.history.get(editorId);

        if (!historyData || historyData.currentIndex >= historyData.states.length - 1) {
            return false;
        }

        historyData.currentIndex += 1;
        const targetState = historyData.states[historyData.currentIndex];

        this.#restoreEditorState(pre, targetState);
        return true;
    }

    /**
     * Restore editor state
     * @param {HTMLElement} pre - The pre element
     * @param {Object} state - The state to restore
     */
    #restoreEditorState(pre, state) {
        const table = pre.querySelector('table');
        if (!table) return;

        const fragment = document.createDocumentFragment();

        state.lines.forEach((lineContent, index) => {
            const row = document.createElement('tr');

            const lineNumCell = document.createElement('td');
            lineNumCell.textContent = index + 1;

            const contentCell = document.createElement('td');
            contentCell.contentEditable = true;
            contentCell.textContent = lineContent;

            row.appendChild(lineNumCell);
            row.appendChild(contentCell);
            fragment.appendChild(row);
        });

        table.innerHTML = '';
        table.appendChild(fragment);

        // Apply highlighting first, then position cursor
        if (window.hljsl) {
            window.hljsl.highlight(pre);
        }

        // Position cursor after highlighting is complete
        // Use setTimeout to ensure highlighting DOM changes are applied
        setTimeout(() => {
            this.#restoreCursorPosition(pre, state.cursorPosition);
        }, 10);
    }

    /**
     * Handle history keyboard shortcuts
     * @param {KeyboardEvent} event - The keyboard event
     */
    #handleHistoryKeyDown(event) {
        // Handle Ctrl+Shift+Z or Cmd+Shift+Z for redo
        if ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === 'z' || event.key === 'Z')) {
            event.preventDefault();
            const activeCell = document.activeElement;
            const pre = activeCell.closest('pre.editor');
            if (pre) {
                this.redo(pre);
            }
            return;
        }

        // Handle Ctrl+Y (or Cmd+Y) for redo
        if ((event.ctrlKey || event.metaKey) && (event.key === 'y' || event.key === 'Y')) {
            event.preventDefault();
            const activeCell = document.activeElement;
            const pre = activeCell.closest('pre.editor');
            if (pre) {
                this.redo(pre);
            }
            return;
        }

        // Handle Ctrl+Z (or Cmd+Z) for undo
        if ((event.ctrlKey || event.metaKey) && !event.shiftKey && (event.key === 'z' || event.key === 'Z')) {
            event.preventDefault();
            const activeCell = document.activeElement;
            const pre = activeCell.closest('pre.editor');
            if (pre) {
                this.undo(pre);
            }
            return;
        }
    }

    /**
     * Get cursor column position - improved version
     * @param {HTMLElement} cell - The cell element
     * @param {Range} [range] - The selection range (optional, defaults to current selection)
     * @returns {number} The column position
     */
    #getCursorPosition(cell, range) {
        if (!range) {
            const selection = window.getSelection();
            if (!selection.rangeCount) return 0;
            range = selection.getRangeAt(0);
        }

        const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
        let total = 0;
        let node;

        while (node = walker.nextNode()) {
            if (node === range.startContainer) {
                return total + range.startOffset;
            }
            total += node.textContent.length;
        }

        // If we didn't find the start container, return the total length
        return total;
    }

    /**
     * Set cursor column (offset) position - improved version
     * @param {HTMLElement} cell - The cell element
     * @param {number} position - The column position
     */
    #setCursorPosition(cell, position) {
        // Ensure the cell is focused first
        if (document.activeElement !== cell) {
            cell.focus();
        }

        const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
        let total = 0;
        let node;

        while (node = walker.nextNode()) {
            const len = node.textContent.length;
            if (total + len >= position) {
                const offset = Math.max(0, Math.min(position - total, len));
                this.#setCursorOffset(node, offset);
                return;
            }
            total += len;
        }

        // Fallback: position at the end
        const fallback = this.#getLastTextNode(cell);
        if (fallback) {
            this.#setCursorOffset(fallback, fallback.textContent.length);
        } else {
            // Create a text node if none exists
            const textNode = document.createTextNode('');
            cell.appendChild(textNode);
            this.#setCursorOffset(textNode, 0);
        }
    }

    /**
     * Replace current selection with text
     * @param {string} text - Text to insert
     * @param {HTMLElement} targetCell - The target cell
     * @param {HTMLElement} pre - The pre element
     */
    #replaceSelection(text, targetCell, pre) {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        const range = selection.getRangeAt(0);

        // Save to history before making changes - force save for selection replacement
        this.#saveToHistory(pre, true, !range.collapsed);

        if (range.collapsed) {
            // No selection, just insert text at cursor
            const textNode = range.startContainer.nodeType === 3 ?
                range.startContainer :
                range.startContainer.firstChild || range.startContainer.appendChild(document.createTextNode(''));

            const offset = range.startOffset;
            textNode.textContent = textNode.textContent.slice(0, offset) + text + textNode.textContent.slice(offset);
            this.#setCursorOffset(textNode, offset + text.length);
        } else {
            // Replace selection with text
            range.deleteContents();
            const textNode = document.createTextNode(text);
            range.insertNode(textNode);
            this.#setCursorOffset(textNode, text.length);
        }
    }

    /**
     * Handle pasted content
     * @param {ClipboardEvent} event - The paste event
     */
    #handlePastedContent(event) {
        event.preventDefault();

        // Clear any state that might interfere
        this.#setState(this.EditorState.IDLE);

        const operationId = `paste-${Date.now()}`;
        this.addPendingOperation(operationId);

        const clipboardData = event.clipboardData || window.clipboardData;
        const pastedContent = clipboardData.getData('text');
        const targetCell = event.target;

        if (!targetCell || !pastedContent) {
            this.removePendingOperation(operationId);
            return;
        }

        const table = targetCell.closest('table');
        const pre = table.closest('pre');

        // Clear any existing debounce timers to prevent conflicts
        const existingTimer = this.debounceTimers.get(pre);
        if (existingTimer) {
            clearTimeout(existingTimer);
            this.debounceTimers.delete(pre);
        }

        this.#saveToHistory(pre, true, true); // Force save for paste operations

        const cleanContent = pastedContent.replace(this.#regex.removeCarriageReturns, '');
        const lines = cleanContent.split('\n');

        // Check if there's a selection and handle it
        const selection = window.getSelection();
        if (selection.rangeCount > 0 && !selection.getRangeAt(0).collapsed) {
            const range = selection.getRangeAt(0);
            // There's a selection, delete it first
            const { startContainer, endContainer, startOffset, endOffset } = range;

            const startRow = startContainer.nodeType === 3 ?
                startContainer.parentNode.closest('tr') :
                startContainer.closest('tr');
            const endRow = endContainer.nodeType === 3 ?
                endContainer.parentNode.closest('tr') :
                endContainer.closest('tr');

            if (startRow && endRow) {
                const rows = Array.from(table.rows);
                const startIndex = rows.indexOf(startRow);
                const endIndex = rows.indexOf(endRow);

                const startCell = startRow.cells[1];
                const endCell = endRow.cells[1];

                // Get text before selection
                let startCellTextBefore = '';
                const startTextNodes = this.#getTextNodes(startCell);
                let startNodeIdx = 0;

                while (startNodeIdx < startTextNodes.length) {
                    const node = startTextNodes[startNodeIdx];
                    if (node === startContainer) {
                        startCellTextBefore += node.textContent.substring(0, startOffset);
                        break;
                    } else {
                        startCellTextBefore += node.textContent;
                    }
                    startNodeIdx += 1;
                }

                // Get text after selection
                let endCellTextAfter = '';
                const endTextNodes = this.#getTextNodes(endCell);
                let endNodeIdx = 0;

                while (endNodeIdx < endTextNodes.length) {
                    const node = endTextNodes[endNodeIdx];
                    if (node === endContainer) {
                        endCellTextAfter += node.textContent.substring(endOffset);
                        endNodeIdx += 1;
                        break;
                    }
                    endNodeIdx += 1;
                }

                while (endNodeIdx < endTextNodes.length) {
                    endCellTextAfter += endTextNodes[endNodeIdx].textContent;
                    endNodeIdx += 1;
                }

                // Replace selection with pasted content
                let lastModifiedRow = startRow; // Track the last row we actually modified

                if (startIndex === endIndex) {
                    // Single line selection
                    const firstLine = lines.shift() || '';
                    startCell.textContent = startCellTextBefore + firstLine;

                    if (lines.length > 0) {
                        // Multi-line paste into single line selection
                        lines.forEach((line, index) => {
                            const isLastLine = index === lines.length - 1;
                            const lineContent = isLastLine ? line + endCellTextAfter : line;

                            const newRow = document.createElement('tr');
                            const lineNumCell = document.createElement('td');
                            const contentCell = document.createElement('td');
                            contentCell.contentEditable = true;
                            contentCell.textContent = lineContent;

                            newRow.appendChild(lineNumCell);
                            newRow.appendChild(contentCell);
                            lastModifiedRow.insertAdjacentElement('afterend', newRow);
                            lastModifiedRow = newRow; // Update tracker
                        });
                    } else {
                        // Single line paste into single line selection
                        startCell.textContent += endCellTextAfter;
                    }
                } else {
                    // Multi-line selection
                    const firstLine = lines.shift() || '';
                    startCell.textContent = startCellTextBefore + firstLine;

                    // Remove rows between start and end (exclusive)
                    for (let i = endIndex - 1; i > startIndex; i--) {
                        rows[i].remove();
                    }

                    if (lines.length > 0) {
                        // Insert new lines
                        lines.forEach((line, index) => {
                            const isLastLine = index === lines.length - 1;
                            const lineContent = isLastLine ? line + endCellTextAfter : line;

                            const newRow = document.createElement('tr');
                            const lineNumCell = document.createElement('td');
                            const contentCell = document.createElement('td');
                            contentCell.contentEditable = true;
                            contentCell.textContent = lineContent;

                            newRow.appendChild(lineNumCell);
                            newRow.appendChild(contentCell);
                            lastModifiedRow.insertAdjacentElement('afterend', newRow);
                            lastModifiedRow = newRow; // Update tracker
                        });

                        // Remove the original end row since we've incorporated its remaining text
                        if (endRow.parentNode) {
                            endRow.remove();
                        }
                    } else {
                        // No additional lines, just append remaining text to start cell
                        startCell.textContent += endCellTextAfter;
                        if (endRow.parentNode) {
                            endRow.remove();
                        }
                    }
                }

                this.#updateLineNumbers(table);

                // Simple: focus the actual last row we modified and position cursor
                // at end of pasted content (before any trailing text)
                const finalCell = lastModifiedRow.cells[1];
                if (finalCell) {
                    finalCell.focus();
                    const cellText = finalCell.textContent;
                    const cursorPos = endCellTextAfter.length > 0 ?
                        cellText.length - endCellTextAfter.length :
                        cellText.length;
                    this.#setCursorPosition(finalCell, cursorPos);
                }

                // Single highlight call after paste completion
                this.#completePasteOperation(pre, operationId);
                return;
            }
        }

        // No selection, single cursor position - FIX: Insert at cursor position
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            if (range.collapsed && lines.length === 1) {
                // Single line paste - insert at cursor position
                const { startContainer, startOffset } = range;
                const textNode = startContainer.nodeType === 3 ?
                    startContainer :
                    startContainer.firstChild || startContainer.appendChild(document.createTextNode(''));

                const beforeText = textNode.textContent.substring(0, startOffset);
                const afterText = textNode.textContent.substring(startOffset);

                textNode.textContent = beforeText + cleanContent + afterText;

                // Calculate final cursor position (after pasted content)
                const finalCursorPosition = startOffset + cleanContent.length;

                // Get row and cell info for cursor restoration after highlighting
                const row = targetCell.closest('tr');
                const table = targetCell.closest('table');
                const rowIndex = Array.from(table.rows).indexOf(row);

                // Position cursor after pasted content, then highlight with cursor restoration
                this.#setCursorOffset(textNode, finalCursorPosition);

                // Complete paste with cursor position saved
                this.#completePasteOperationWithCursor(pre, operationId, rowIndex, finalCursorPosition);
                return;
            }
        }

        // Multi-line paste at cursor position - original behavior
        const selection2 = window.getSelection();
        if (selection2.rangeCount > 0) {
            const range = selection2.getRangeAt(0);
            const { startContainer, startOffset } = range;

            // Get text before and after cursor
            const textNode = startContainer.nodeType === 3 ?
                startContainer :
                startContainer.firstChild;

            if (textNode && textNode.nodeType === 3) {
                const beforeText = textNode.textContent.substring(0, startOffset);
                const afterText = textNode.textContent.substring(startOffset);

                // Set first line with text before cursor
                const firstLine = lines.shift() || '';
                targetCell.textContent = beforeText + firstLine;
                let lastRow = targetCell.closest('tr');

                // Add remaining lines
                lines.forEach((line, index) => {
                    const isLastLine = index === lines.length - 1;
                    const lineContent = isLastLine ? line + afterText : line;

                    const newRow = document.createElement('tr');
                    const lineNumCell = document.createElement('td');
                    const contentCell = document.createElement('td');
                    contentCell.contentEditable = true;
                    contentCell.textContent = lineContent;

                    newRow.appendChild(lineNumCell);
                    newRow.appendChild(contentCell);
                    lastRow.insertAdjacentElement('afterend', newRow);
                    lastRow = newRow;
                });

                this.#updateLineNumbers(table);

                // Position cursor at end of pasted content
                const lastCell = lastRow.cells[1];
                if (lastCell) {
                    lastCell.focus();
                    const cursorPos = afterText.length > 0 ?
                        lastCell.textContent.length - afterText.length :
                        lastCell.textContent.length;
                    this.#setCursorPosition(lastCell, cursorPos);
                }

                // Single highlight call after paste completion
                this.#completePasteOperation(pre, operationId);
                return;
            }
        }

        // Fallback to original behavior if we can't determine cursor position
        targetCell.textContent = lines.shift();
        let lastRow = targetCell.closest('tr');

        lines.forEach((line) => {
            const newRow = document.createElement('tr');
            const lineNumCell = document.createElement('td');
            const contentCell = document.createElement('td');
            contentCell.contentEditable = true;
            contentCell.textContent = line;

            newRow.appendChild(lineNumCell);
            newRow.appendChild(contentCell);
            lastRow.insertAdjacentElement('afterend', newRow);
            lastRow = newRow;
        });

        this.#updateLineNumbers(table);

        const lastCell = lastRow.cells[1];
        if (lastCell) {
            const lastTextNode = this.#getLastTextNode(lastCell);
            if (lastTextNode) {
                const range = document.createRange();
                const sel = window.getSelection();
                range.setStart(lastTextNode, lastTextNode.length);
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);
            } else {
                const emptyTextNode = document.createTextNode('');
                lastCell.appendChild(emptyTextNode);
                const range = document.createRange();
                const sel = window.getSelection();
                range.setStart(emptyTextNode, 0);
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);
            }
            lastCell.focus();
        }

        // Single highlight call after paste completion
        this.#completePasteOperation(pre, operationId);
    }

    /**
     * Complete paste operation with single highlight call
     * @param {HTMLElement} pre - The pre element
     * @param {string} operationId - The operation ID to remove
     */
    #completePasteOperation(pre, operationId) {
        // Use setTimeout to ensure DOM has settled
        setTimeout(() => {
            this.removePendingOperation(operationId);
            // Single, definitive highlight call
            if (window.hljsl) {
                window.hljsl.highlight(pre);
            }
        }, 150);
    }

    /**
     * Complete paste operation with cursor position restoration after highlighting
     * @param {HTMLElement} pre - The pre element
     * @param {string} operationId - The operation ID to remove
     * @param {number} rowIndex - The row index where cursor should be
     * @param {number} columnPosition - The column position where cursor should be
     */
    #completePasteOperationWithCursor(pre, operationId, rowIndex, columnPosition) {
        // Use setTimeout to ensure DOM has settled
        setTimeout(() => {
            this.removePendingOperation(operationId);
            // Single, definitive highlight call
            if (window.hljsl) {
                window.hljsl.highlight(pre);
            }

            // Restore cursor after highlighting completes
            setTimeout(() => {
                const table = pre.querySelector('table');
                if (table && rowIndex >= 0 && rowIndex < table.rows.length) {
                    const targetRow = table.rows[rowIndex];
                    const targetCell = targetRow.cells[1];
                    if (targetCell) {
                        targetCell.focus();
                        this.#setCursorPosition(targetCell, columnPosition);
                    }
                }
            }, 50); // Give highlighting time to complete
        }, 150);
    }

    /**
     * Handle keydown events
     * @param {KeyboardEvent} event - The keyboard event
     */
    #handleKeyDown(event) {
        // Exit typing mode for navigation keys
        if (this.currentState === this.EditorState.TYPING_AFTER_SELECTION &&
            ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Tab', 'Enter'].includes(event.key)) {
            this.#setState(this.EditorState.IDLE);
        }

        const cell = event.target;
        const row = cell.closest('tr');
        const table = row.closest('table');
        const pre = table.closest('pre');
        if (!cell.isContentEditable) return;

        const selection = window.getSelection();
        if (!selection.rangeCount) {
            // No range - create one at the start of the cell
            const range = document.createRange();
            const firstNode = cell.firstChild || cell.appendChild(document.createTextNode(''));
            range.setStart(firstNode, 0);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
        }
        const range = selection.getRangeAt(0);

        // Handle Escape key - accessibility escape hatch
        if (event.key === 'Escape') {
            event.preventDefault();

            // Blur the current cell
            cell.blur();

            // Find next focusable element after the editor
            const focusableElements = document.querySelectorAll(
                'a, button, input, textarea, select, [tabindex]:not([tabindex="-1"])'
            );
            const elementsArray = Array.from(focusableElements);
            const editorControls = pre.previousElementSibling;
            const currentIndex = elementsArray.indexOf(editorControls);

            // Focus next element, or if none found, just blur
            if (currentIndex >= 0 && currentIndex < elementsArray.length - 1) {
                elementsArray[currentIndex + 1].focus();
            }

            return;
        }

        // Handle regular character input - this fixes the selection replacement issue
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
            event.preventDefault();
            this.#replaceSelection(event.key, cell, pre);
            return;
        }

        // Handle Ctrl-X (cut) for single line with selection
        if ((event.key === 'x' || event.key === 'X') && (event.ctrlKey || event.metaKey)) {
            const selection = window.getSelection();
            if (selection.rangeCount > 0 && this.currentState !== this.EditorState.MULTILINE) {
                const range = selection.getRangeAt(0);

                // Only handle if there's a selection (not collapsed)
                if (!range.collapsed) {
                    const selectedText = selection.toString();

                    // Check if it's a single-line selection (no newlines)
                    if (!selectedText.includes('\n')) {
                        event.preventDefault();

                        // Copy to clipboard
                        navigator.clipboard.writeText(selectedText);

                        // Delete the selection
                        range.deleteContents();
                        this.#saveToHistory(pre, true, true); // Force save for cut operation
                        this.#forceContentEditable(table);
                        return;
                    }
                }
            }
            // If multiline or no selection, let it fall through to multiline handler
        }

        if ((event.key === 'a' || event.key === 'A') && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();

            // Clear any existing pending operations to prevent conflicts
            this.pendingOperations.clear();

            const operationId = `select-all-${Date.now()}`;
            this.addPendingOperation(operationId);

            if (table) {
                const range = document.createRange();
                const firstRow = table.rows[0];
                const firstCell = firstRow.cells[1];
                const firstTextNode = this.#getTextNodes(firstCell)[0];

                const lastRow = table.rows[table.rows.length - 1];
                const lastCell = lastRow.cells[1];
                const textNodes = this.#getTextNodes(lastCell);
                const lastTextNode = textNodes[textNodes.length - 1];

                if (firstTextNode && lastTextNode) {
                    range.setStart(firstTextNode, 0);
                    range.setEnd(lastTextNode, lastTextNode.textContent.length);

                    selection.removeAllRanges();
                    selection.addRange(range);

                    this.activeEditor = pre;
                    this.#setState(this.EditorState.MULTILINE);
                }
            }

            setTimeout(() => {
                this.removePendingOperation(operationId);
            }, 100);

            return;
        }

        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault();
            const rows = Array.from(table.rows);
            const currentIndex = rows.indexOf(row);
            const targetIndex = event.key === 'ArrowUp' ? currentIndex - 1 : currentIndex + 1;

            if (this.cursorX === null) {
                this.cursorX = this.#getCursorPosition(cell, range);
            }

            if (targetIndex >= 0 && targetIndex < rows.length) {
                const targetCell = rows[targetIndex].cells[1];
                const targetTextLength = targetCell.textContent ? targetCell.textContent.length : 0;

                if (this.cursorX <= targetTextLength) {
                    this.#setCursorPosition(targetCell, this.cursorX);
                } else {
                    const fallbackColumn = event.key === 'ArrowUp' ? 0 : targetTextLength;
                    this.#setCursorPosition(targetCell, fallbackColumn);
                }
            }
            return;
        }

        this.cursorX = null;

        if (event.key === 'Tab') {
            event.preventDefault();

            const { startContainer, startOffset } = range;
            const node = startContainer.nodeType === 3 ? startContainer : startContainer.firstChild;
            if (!node) return;
            if (event.shiftKey) {
                const text = node.textContent;
                const indentMatch = text.slice(0, startOffset).match(/^ +/);
                const currentIndent = indentMatch ? indentMatch[0].length : 0;
                const removeCount = Math.min(this.tabSize, currentIndent);
                node.textContent = text.slice(0, startOffset - removeCount) + text.slice(startOffset);
                this.#setCursorOffset(node, startOffset - removeCount);
            } else {
                node.textContent = node.textContent.slice(0, startOffset) + this.tabString + node.textContent.slice(startOffset);
                this.#setCursorOffset(node, startOffset + this.tabSize);
            }

            this.#saveToHistory(pre, true, true); // Force save for tab operations
        } else if (event.key === 'Enter') {
            event.preventDefault();

            const { startContainer, startOffset } = range;
            const node = startContainer;
            const currentTextNode = node.nodeType === 3 ? node : node.firstChild;
            let indent = '';
            const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
            const firstTextNode = walker.nextNode();
            if (firstTextNode) {
                const match = firstTextNode.textContent.match(/^\s*/);
                indent = match ? match[0] : '';
            }
            const newRow = row.cloneNode(true);
            const newCell = newRow.cells[1];
            newCell.innerHTML = '';
            if (currentTextNode && currentTextNode.nodeType === 3) {
                const before = currentTextNode.textContent.slice(0, startOffset);
                const after = currentTextNode.textContent.slice(startOffset);
                currentTextNode.textContent = before;
                const afterNode = document.createTextNode(indent + after);
                newCell.appendChild(afterNode);
                let sibling = currentTextNode.parentNode.nextSibling;
                while (sibling) {
                    const next = sibling.nextSibling;
                    newCell.appendChild(sibling);
                    sibling = next;
                }
            }
            row.parentNode.insertBefore(newRow, row.nextSibling);
            this.#updateLineNumbers(table);
            this.#focusCell(newCell, indent.length);
            this.#saveToHistory(pre, true, true); // Force save for enter operations
        } else if (event.key === 'Backspace') {
            const cursorPos = range.startOffset;
            if (cursorPos === 0 && row.previousElementSibling) {
                event.preventDefault();

                const prevRow = row.previousElementSibling;
                const prevCell = prevRow.cells[1];
                const textNodes = this.#getTextNodes(cell);
                let mergedText = '';
                for (const node of textNodes) {
                    mergedText += node.textContent;
                }
                const lastNode = this.#getLastTextNode(prevCell);
                if (lastNode) {
                    const offset = lastNode.textContent.length;
                    lastNode.textContent += mergedText;
                    row.remove();
                    this.#updateLineNumbers(table);
                    this.#setCursorOffset(lastNode, offset);
                } else {
                    prevCell.appendChild(document.createTextNode(mergedText));
                    row.remove();
                    this.#updateLineNumbers(table);
                    this.#focusCell(prevCell, prevCell.textContent.length);
                }
                this.#saveToHistory(pre, true, true); // Force save for backspace operations
            } else if (!range.collapsed) {
                // Handle selection deletion for backspace
                event.preventDefault();
                range.deleteContents();
                this.#saveToHistory(pre, true, true); // Force save for selection deletion
            } else {
                cell.contentEditable = true;
                cell.focus();
                range.deleteContents();
                this.#setCursorOffset(range.startContainer, range.startOffset);
            }

            this.#removeMalformedRows(table);
            this.#forceContentEditable(table);
        } else if (event.key === 'Delete') {
            // Handle selection deletion for delete key
            if (!range.collapsed) {
                event.preventDefault();
                range.deleteContents();
                this.#saveToHistory(pre, true, true); // Force save for delete operations
                this.#forceContentEditable(table);
            }
        }
    }

    /**
     * Handle multiline keyboard operations
     * @param {KeyboardEvent} event - The keyboard event
     */
    #handleMultilineKeyDown(event) {
        if (this.currentState !== this.EditorState.MULTILINE &&
            this.currentState !== this.EditorState.TYPING_AFTER_SELECTION) {
            return;
        }

        if (!this.activeEditor) {
            return;
        }

        // Handle continued typing after selection deletion
        if (this.currentState === this.EditorState.TYPING_AFTER_SELECTION &&
            event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
            event.preventDefault();

            // Reset the timeout - continue typing mode
            this.#setState(this.EditorState.TYPING_AFTER_SELECTION, 100);

            // Insert character at current cursor position
            const selection = window.getSelection();
            if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                const textNode = range.startContainer;
                const offset = range.startOffset;

                if (textNode.nodeType === 3) {
                    textNode.textContent = textNode.textContent.slice(0, offset) + event.key + textNode.textContent.slice(offset);
                    this.#setCursorOffset(textNode, offset + 1);
                }
            }
            return;
        }

        // Exit typing mode for any other key
        if (this.currentState === this.EditorState.TYPING_AFTER_SELECTION) {
            this.#setState(this.EditorState.IDLE);
            return;
        }

        const isMultilineOperation = ['c', 'C', 'x', 'X', 'Tab', 'Backspace', 'Delete', 'Enter', 'Escape'].includes(event.key) ||
                                    (event.ctrlKey || event.metaKey) ||
                                    (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey);

        if (isMultilineOperation) {
            const operationId = `multiline-${event.key}-${Date.now()}`;
            this.addPendingOperation(operationId);
            setTimeout(() => {
                this.removePendingOperation(operationId);
            }, 200);
        }

        if ((event.key === 'c' || event.key === 'C') && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();

            const selection = window.getSelection();
            const range = selection.getRangeAt(0);
            const { startContainer, endContainer } = range;

            const startRow = startContainer.nodeType === 3 ?
                startContainer.parentNode.closest('tr') :
                startContainer.closest('tr');
            const endRow = endContainer.nodeType === 3 ?
                endContainer.parentNode.closest('tr') :
                endContainer.closest('tr');

            if (!startRow && !endRow) return;

            const table = startRow.closest('table');
            const rows = Array.from(table.rows);
            const startIndex = rows.indexOf(startRow);
            const endIndex = rows.indexOf(endRow);

            let selectedText = '';
            for (let i = Math.min(startIndex, endIndex); i <= Math.max(startIndex, endIndex); i++) {
                const cell = rows[i].cells[1];
                if (!cell) continue;
                selectedText += `${cell.textContent}\n`;
            }
            selectedText = selectedText.trim() || '';

            navigator.clipboard.writeText(selectedText);
            return;
        }

        if ((event.key === 'x' || event.key === 'X') && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();

            const selection = window.getSelection();
            const range = selection.getRangeAt(0);
            const { startContainer, endContainer } = range;

            const startRow = startContainer.nodeType === 3 ?
                startContainer.parentNode.closest('tr') :
                startContainer.closest('tr');
            const endRow = endContainer.nodeType === 3 ?
                endContainer.parentNode.closest('tr') :
                endContainer.closest('tr');

            if (!startRow && !endRow) return;

            const table = startRow.closest('table');
            const pre = table.closest('pre');
            const rows = Array.from(table.rows);
            const startIndex = rows.indexOf(startRow);
            const endIndex = rows.indexOf(endRow);

            let selectedText = '';
            for (let i = Math.min(startIndex, endIndex); i <= Math.max(startIndex, endIndex); i++) {
                const cell = rows[i].cells[1];
                if (!cell) continue;
                selectedText += `${cell.textContent}\n`;
            }
            selectedText = selectedText.trim() || '';

            navigator.clipboard.writeText(selectedText);

            // Now delete the selection (same logic as Delete/Backspace)
            this.#saveToHistory(pre, true, true); // Force save for cut operations

            const { startOffset, endOffset } = range;
            const startCell = startRow.cells[1];
            const endCell = endRow.cells[1];

            let startCellTextBefore = '';
            const startTextNodes = this.#getTextNodes(startCell);
            let startNodeIdx = 0;

            while (startNodeIdx < startTextNodes.length) {
                const node = startTextNodes[startNodeIdx];
                if (node === startContainer) {
                    startCellTextBefore += node.textContent.substring(0, startOffset);
                    break;
                } else {
                    startCellTextBefore += node.textContent;
                }
                startNodeIdx += 1;
            }

            let endCellTextAfter = '';
            const endTextNodes = this.#getTextNodes(endCell);
            let endNodeIdx = 0;

            while (endNodeIdx < endTextNodes.length) {
                const node = endTextNodes[endNodeIdx];
                if (node === endContainer) {
                    endCellTextAfter += node.textContent.substring(endOffset);
                    endNodeIdx += 1;
                    break;
                }
                endNodeIdx += 1;
            }

            while (endNodeIdx < endTextNodes.length) {
                endCellTextAfter += endTextNodes[endNodeIdx].textContent;
                endNodeIdx += 1;
            }

            if (startIndex === endIndex) {
                startCell.textContent = startCellTextBefore + endCellTextAfter;
            } else {
                startCell.textContent = startCellTextBefore + endCellTextAfter;
                for (let i = endIndex; i > startIndex; i--) {
                    rows[i].remove();
                }
                this.#updateLineNumbers(table);
            }

            this.#removeMalformedRows(table);

            if (table.rows.length === 0) {
                const newRow = document.createElement('tr');
                const lineNumCell = document.createElement('td');
                lineNumCell.textContent = '1';
                const contentCell = document.createElement('td');
                contentCell.contentEditable = true;

                // Create an empty text node and place cursor in it
                const textNode = document.createTextNode('');
                contentCell.appendChild(textNode);

                newRow.appendChild(lineNumCell);
                newRow.appendChild(contentCell);
                table.appendChild(newRow);

                // Programmatically click to establish proper focus (fixes HighlightJS span issue)
                contentCell.click();

                // Also manually set the cursor as backup
                const range = document.createRange();
                const sel = window.getSelection();
                range.setStart(textNode, 0);
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);
            } else {
                startCell.contentEditable = true;
                startCell.focus();
                this.#setCursorPosition(startCell, startCellTextBefore.length);
            }

            this.#setState(this.EditorState.IDLE);

            // Don't highlight empty editors - HighlightJS creates empty spans that break typing
            const hasContent = table.rows.length > 0 &&
                              Array.from(table.rows).some((row) => row.cells[1]?.textContent.trim());
            if (hasContent && window.hljsl) {
                window.hljsl.highlight(pre);
            }

            this.#forceContentEditable(table);
            return;
        }

        if (event.key === 'Tab') {
            const selection = window.getSelection();
            const range = selection.getRangeAt(0);
            const { startContainer, endContainer } = range;

            const startRow = startContainer.nodeType === 3 ?
                startContainer.parentNode.closest('tr') :
                startContainer.closest('tr');
            const endRow = endContainer.nodeType === 3 ?
                endContainer.parentNode.closest('tr') :
                endContainer.closest('tr');

            if (!startRow && !endRow) return;

            const table = startRow.closest('table');
            const pre = table.closest('pre');
            const rows = Array.from(table.rows);
            const startIndex = rows.indexOf(startRow);
            const endIndex = rows.indexOf(endRow);

            this.#saveToHistory(pre, true, true); // Force save for multiline tab operations

            for (let i = Math.min(startIndex, endIndex); i <= Math.max(startIndex, endIndex); i++) {
                const cell = rows[i].cells[1];
                if (!cell) continue;

                const text = cell.textContent;
                if (event.shiftKey) {
                    const dedentedText = text.replace(new RegExp(`^ {1,${this.tabSize}}`), '');
                    cell.textContent = dedentedText;
                } else {
                    cell.textContent = ' '.repeat(this.tabSize) + text;
                }
            }

            event.preventDefault();
            return;
        }

        if (event.key === 'Backspace' || event.key === 'Delete') {
            const selection = window.getSelection();
            if (!selection.rangeCount) return;

            const range = selection.getRangeAt(0);
            if (range.collapsed) return;

            event.preventDefault();

            const { startContainer, endContainer, startOffset, endOffset } = range;

            const startRow = startContainer.nodeType === 3 ?
                startContainer.parentNode.closest('tr') :
                startContainer.closest('tr');
            const endRow = endContainer.nodeType === 3 ?
                endContainer.parentNode.closest('tr') :
                endContainer.closest('tr');

            if (!startRow || !endRow) return;

            const table = startRow.closest('table');
            const pre = table.closest('pre');
            const rows = Array.from(table.rows);
            const startIndex = rows.indexOf(startRow);
            const endIndex = rows.indexOf(endRow);

            this.#saveToHistory(pre, true, true); // Force save for multiline delete operations

            const startCell = startRow.cells[1];
            const endCell = endRow.cells[1];

            let startCellTextBefore = '';
            const startTextNodes = this.#getTextNodes(startCell);
            let startNodeIdx = 0;

            while (startNodeIdx < startTextNodes.length) {
                const node = startTextNodes[startNodeIdx];
                if (node === startContainer) {
                    startCellTextBefore += node.textContent.substring(0, startOffset);
                    break;
                } else {
                    startCellTextBefore += node.textContent;
                }
                startNodeIdx += 1;
            }

            let endCellTextAfter = '';
            const endTextNodes = this.#getTextNodes(endCell);
            let endNodeIdx = 0;

            while (endNodeIdx < endTextNodes.length) {
                const node = endTextNodes[endNodeIdx];
                if (node === endContainer) {
                    endCellTextAfter += node.textContent.substring(endOffset);
                    endNodeIdx += 1;
                    break;
                }
                endNodeIdx += 1;
            }

            while (endNodeIdx < endTextNodes.length) {
                endCellTextAfter += endTextNodes[endNodeIdx].textContent;
                endNodeIdx += 1;
            }

            if (startIndex === endIndex) {
                startCell.textContent = startCellTextBefore + endCellTextAfter;
            } else {
                startCell.textContent = startCellTextBefore + endCellTextAfter;
                for (let i = endIndex; i > startIndex; i--) {
                    rows[i].remove();
                }
                this.#updateLineNumbers(table);
            }

            this.#removeMalformedRows(table);

            if (table.rows.length === 0) {
                const newRow = document.createElement('tr');
                const lineNumCell = document.createElement('td');
                lineNumCell.textContent = '1';
                const contentCell = document.createElement('td');
                contentCell.contentEditable = true;

                // Create an empty text node and place cursor in it
                const textNode = document.createTextNode('');
                contentCell.appendChild(textNode);

                newRow.appendChild(lineNumCell);
                newRow.appendChild(contentCell);
                table.appendChild(newRow);

                // Programmatically click to establish proper focus (fixes HighlightJS span issue)
                contentCell.click();

                // Also manually set the cursor as backup
                const range = document.createRange();
                const sel = window.getSelection();
                range.setStart(textNode, 0);
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);
            } else {
                startCell.contentEditable = true;
                startCell.focus();
                this.#setCursorPosition(startCell, startCellTextBefore.length);
            }

            this.#setState(this.EditorState.IDLE);

            // Don't highlight empty editors - HighlightJS creates empty spans that break typing
            const hasContent = table.rows.length > 0 &&
                              Array.from(table.rows).some((row) => row.cells[1]?.textContent.trim());
            if (hasContent && window.hljsl) {
                window.hljsl.highlight(pre);
            }

            this.#forceContentEditable(table);

            return;
        }

        if (event.key === 'Enter') {
            const selection = window.getSelection();
            if (!selection.rangeCount) return;

            const range = selection.getRangeAt(0);
            if (range.collapsed) return;

            event.preventDefault();

            const { startContainer, endContainer } = range;

            const startRow = startContainer.nodeType === 3 ?
                startContainer.parentNode.closest('tr') :
                startContainer.closest('tr');
            const endRow = endContainer.nodeType === 3 ?
                endContainer.parentNode.closest('tr') :
                endContainer.closest('tr');
            const table = startRow.closest('table');
            const pre = table.closest('pre');

            if (!startRow || !endRow || !table) return;

            this.#saveToHistory(pre, true, true); // Force save for multiline enter operations

            const newRow = document.createElement('tr');
            newRow.innerHTML = '<td></td><td contenteditable="true"></td>';

            const referenceRow = event.shiftKey ? endRow : startRow;
            const indentMatch = referenceRow.cells[1].textContent.match(/^\s*/);
            const indent = indentMatch ? indentMatch[0] : '';
            newRow.cells[1].textContent = indent;

            if (event.shiftKey) {
                endRow.insertAdjacentElement('afterend', newRow);
            } else {
                startRow.insertAdjacentElement('beforebegin', newRow);
            }

            this.lastInsertedRow = newRow;
            this.#updateLineNumbers(table);

            return;
        }

        if (event.key === 'Escape' && this.lastInsertedRow) {
            event.preventDefault();

            const cell = this.lastInsertedRow.cells[1];
            cell.focus();

            const { textContent } = cell;
            const indentLength = textContent.match(/^\s*/)[0].length;

            const textNode = cell.firstChild;
            if (textNode && textNode.nodeType === 3) {
                const newRange = document.createRange();
                newRange.setStart(textNode, indentLength);
                newRange.collapse(true);

                const selection = window.getSelection();
                selection.removeAllRanges();
                selection.addRange(newRange);
            } else {
                const newTextNode = document.createTextNode(textContent || '');
                cell.innerHTML = '';
                cell.appendChild(newTextNode);

                const newRange = document.createRange();
                newRange.setStart(newTextNode, indentLength);
                newRange.collapse(true);

                const selection = window.getSelection();
                selection.removeAllRanges();
                selection.addRange(newRange);
            }

            this.lastInsertedRow = null;
            return;
        }

        // Handle regular typing - delete selection and insert typed character
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
            event.preventDefault();

            const selection = window.getSelection();
            if (!selection.rangeCount) return;

            const range = selection.getRangeAt(0);
            if (range.collapsed) return;

            const { startContainer, endContainer, startOffset, endOffset } = range;

            const startRow = startContainer.nodeType === 3 ?
                startContainer.parentNode.closest('tr') :
                startContainer.closest('tr');
            const endRow = endContainer.nodeType === 3 ?
                endContainer.parentNode.closest('tr') :
                endContainer.closest('tr');

            if (!startRow || !endRow) return;

            const table = startRow.closest('table');
            const pre = table.closest('pre');
            const rows = Array.from(table.rows);
            const startIndex = rows.indexOf(startRow);
            const endIndex = rows.indexOf(endRow);

            this.#saveToHistory(pre, true, true); // Force save for multiline typing operations

            const startCell = startRow.cells[1];
            const endCell = endRow.cells[1];

            let startCellTextBefore = '';
            const startTextNodes = this.#getTextNodes(startCell);
            let startNodeIdx = 0;

            while (startNodeIdx < startTextNodes.length) {
                const node = startTextNodes[startNodeIdx];
                if (node === startContainer) {
                    startCellTextBefore += node.textContent.substring(0, startOffset);
                    break;
                } else {
                    startCellTextBefore += node.textContent;
                }
                startNodeIdx += 1;
            }

            let endCellTextAfter = '';
            const endTextNodes = this.#getTextNodes(endCell);
            let endNodeIdx = 0;

            while (endNodeIdx < endTextNodes.length) {
                const node = endTextNodes[endNodeIdx];
                if (node === endContainer) {
                    endCellTextAfter += node.textContent.substring(endOffset);
                    endNodeIdx += 1;
                    break;
                }
                endNodeIdx += 1;
            }

            while (endNodeIdx < endTextNodes.length) {
                endCellTextAfter += endTextNodes[endNodeIdx].textContent;
                endNodeIdx += 1;
            }

            // Delete selection and insert typed character
            if (startIndex === endIndex) {
                startCell.textContent = startCellTextBefore + event.key + endCellTextAfter;
            } else {
                startCell.textContent = startCellTextBefore + event.key + endCellTextAfter;
                for (let i = endIndex; i > startIndex; i--) {
                    rows[i].remove();
                }
                this.#updateLineNumbers(table);
            }

            this.#removeMalformedRows(table);

            if (table.rows.length === 0) {
                const newRow = document.createElement('tr');
                const lineNumCell = document.createElement('td');
                lineNumCell.textContent = '1';
                const contentCell = document.createElement('td');
                contentCell.contentEditable = true;

                // Create a text node with the typed character
                const textNode = document.createTextNode(event.key);
                contentCell.appendChild(textNode);

                newRow.appendChild(lineNumCell);
                newRow.appendChild(contentCell);
                table.appendChild(newRow);

                // Programmatically click to establish proper focus (fixes HighlightJS span issue)
                contentCell.click();

                // Also manually set the cursor after the typed character
                const range = document.createRange();
                const sel = window.getSelection();
                range.setStart(textNode, 1);
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);
            } else {
                startCell.contentEditable = true;
                startCell.focus();
                this.#setCursorPosition(startCell, startCellTextBefore.length + 1);
            }

            // Enter typing after selection mode
            this.#setState(this.EditorState.TYPING_AFTER_SELECTION, 100);

            // Don't highlight empty editors - HighlightJS creates empty spans that break typing
            // But DO highlight if there's actual content (user typed a character)
            const hasContent = table.rows.length > 0 &&
                              Array.from(table.rows).some((row) => row.cells[1]?.textContent.trim());
            if (hasContent && window.hljsl) {
                window.hljsl.highlight(pre);
            }

            return;
        }
    }

    /**
     * Set cursor offset in a node
     * @param {Node} node - The text node
     * @param {number} offset - The offset position
     */
    #setCursorOffset(node, offset) {
        const range = document.createRange();
        range.setStart(node, Math.min(offset, node.length));
        range.setEnd(node, Math.min(offset, node.length));
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    }

    /**
     * Get the last text node in an element
     * @param {HTMLElement} element - The element to search
     * @returns {Node|null} The last text node
     */
    #getLastTextNode(element) {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        let last = null;
        let node;
        while (node = walker.nextNode()) {
            last = node;
        }
        return last;
    }

    /**
     * Get all text nodes in an element
     * @param {HTMLElement} element - The element to search
     * @returns {Node[]} Array of text nodes
     */
    #getTextNodes(element) {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        const nodes = [];
        let node;
        while (node = walker.nextNode()) {
            nodes.push(node);
        }
        return nodes;
    }

    /**
     * Focus a cell at a specific position
     * @param {HTMLElement} cell - The cell to focus
     * @param {number} pos - The position to focus at
     */
    #focusCell(cell, pos) {
        cell.focus();
        const range = document.createRange();
        const sel = window.getSelection();
        const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
        const textNode = walker.nextNode() || cell;
        range.setStart(textNode, Math.min(pos, textNode.length));
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
    }

    /**
     * Update line numbers in a table
     * @param {HTMLElement} table - The table element
     */
    #updateLineNumbers(table) {
        Array.from(table.rows).forEach((row, idx) => {
            const lineNumCell = row.cells[0];
            if (lineNumCell) lineNumCell.textContent = idx + 1;
        });
    }

    /**
     * Remove malformed rows from table
     * @param {HTMLElement} table - The table element
     */
    #removeMalformedRows(table) {
        if (!table) return;
        const malformedRows = Array.from(table.rows).filter((row) => row.cells.length !== 2);
        for (const row of malformedRows) {
            row.remove();
        }
    }

    /**
     * Handle mouse down events
     * @param {MouseEvent} event - The mouse event
     */
    #handleMouseDown(event) {
        // Clear typing state if clicking
        if (this.currentState === this.EditorState.TYPING_AFTER_SELECTION) {
            this.#setState(this.EditorState.IDLE);
        }

        this.activeEditor = event.currentTarget.closest('pre');
        this.#setState(this.EditorState.IDLE);

        const selection = window.getSelection();
        if (selection) {
            selection.removeAllRanges();
        }

        const table = event.currentTarget;
        this.#removeMalformedRows(table);
        for (const row of table.rows) {
            row.cells[1].contentEditable = false;
        }
    }

    /**
     * Handle mouse up events
     * @param {MouseEvent} event - The mouse event
     */
    #handleMouseUp(event) {
        const table = event.currentTarget || event.target;
        const selection = window.getSelection();
        const selectedText = selection.toString();

        if (selectedText.includes('\n')) {
            const pre = table.closest('pre');
            this.activeEditor = pre;
            this.#setState(this.EditorState.MULTILINE);

            const operationId = `multiline-selection-${Date.now()}`;
            this.addPendingOperation(operationId);
            setTimeout(() => {
                this.removePendingOperation(operationId);
            }, 500);

            return;
        }

        if (selectedText && !selectedText.includes('\n')) {
            this.#setState(this.EditorState.IDLE);

            const operationId = `single-selection-${Date.now()}`;
            this.addPendingOperation(operationId);

            const handleSelectionKeydown = (e) => {
                if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' ||
                    e.key === 'ArrowUp' || e.key === 'ArrowDown' ||
                    e.key === 'Home' || e.key === 'End') {
                    e.preventDefault();

                    const td = event.target.closest('td');
                    if (!td) {
                        document.removeEventListener('keydown', handleSelectionKeydown, true);
                        this.removePendingOperation(operationId);
                        return;
                    }

                    td.contentEditable = true;
                    td.focus();

                    if (e.key === 'Home' || e.key === 'End') {
                        const textNodes = this.#getTextNodes(td);

                        if (textNodes.length > 0) {
                            try {
                                const range = document.createRange();

                                if (e.key === 'Home') {
                                    range.setStart(textNodes[0], 0);
                                } else {
                                    const lastNode = textNodes[textNodes.length - 1];
                                    range.setStart(lastNode, lastNode.textContent.length);
                                }

                                range.collapse(true);

                                const selection = window.getSelection();
                                selection.removeAllRanges();
                                selection.addRange(range);
                            } catch (err) {
                                console.error('Error positioning cursor:', err);
                            }
                        }

                        document.removeEventListener('keydown', handleSelectionKeydown, true);
                        this.removePendingOperation(operationId);
                        return;
                    }

                    setTimeout(() => {
                        const fullText = td.textContent;
                        const pos = fullText.indexOf(selectedText);

                        if (pos !== -1) {
                            const textNodes = Array.from(td.childNodes).filter(
                                (node) => node.nodeType === 3 || node.nodeName === 'SPAN'
                            );

                            let currentPos = 0;
                            let targetNode = null;
                            let targetOffset = 0;

                            for (const node of textNodes) {
                                const nodeLength = node.textContent.length;

                                if (e.key === 'ArrowLeft' && currentPos <= pos && pos < currentPos + nodeLength) {
                                    targetNode = node.nodeType === 3 ? node : node.firstChild;
                                    targetOffset = pos - currentPos;
                                    break;
                                } else if (e.key !== 'ArrowLeft' &&
                                          currentPos <= (pos + selectedText.length) &&
                                          (pos + selectedText.length) <= currentPos + nodeLength) {
                                    targetNode = node.nodeType === 3 ? node : node.firstChild;
                                    targetOffset = (pos + selectedText.length) - currentPos;
                                    break;
                                }

                                currentPos += nodeLength;
                            }

                            if (targetNode) {
                                try {
                                    const range = document.createRange();
                                    range.setStart(targetNode, targetOffset);
                                    range.collapse(true);

                                    const selection = window.getSelection();
                                    selection.removeAllRanges();
                                    selection.addRange(range);
                                } catch (e) {
                                    console.error('Error positioning cursor:', e);
                                }
                            }
                        }

                        document.removeEventListener('keydown', handleSelectionKeydown, true);
                        this.removePendingOperation(operationId);
                    }, 10);
                } else if (e.key === 'Backspace' || e.key === 'Delete') {
                    e.preventDefault();

                    const td = event.target.closest('td');
                    if (!td) {
                        document.removeEventListener('keydown', handleSelectionKeydown, true);
                        this.removePendingOperation(operationId);
                        return;
                    }

                    td.contentEditable = true;
                    td.focus();

                    const fullText = td.textContent;
                    const pos = fullText.indexOf(selectedText);

                    if (pos !== -1) {
                        const newText = fullText.substring(0, pos) +
                                       fullText.substring(pos + selectedText.length);

                        td.textContent = newText;

                        const textNode = td.firstChild;
                        if (textNode && textNode.nodeType === 3) {
                            const range = document.createRange();
                            range.setStart(textNode, pos);
                            range.collapse(true);
                            const selection = window.getSelection();
                            selection.removeAllRanges();
                            selection.addRange(range);
                        } else {
                            const emptyNode = document.createTextNode('');
                            td.appendChild(emptyNode);

                            const range = document.createRange();
                            range.setStart(emptyNode, 0);
                            range.collapse(true);
                            const selection = window.getSelection();
                            selection.removeAllRanges();
                            selection.addRange(range);
                        }

                    } else {
                        td.focus();
                        const textNode = this.#getTextNodes(td)[0];
                        if (textNode) {
                            const range = document.createRange();
                            range.setStart(textNode, 0);
                            range.collapse(true);
                            const selection = window.getSelection();
                            selection.removeAllRanges();
                            selection.addRange(range);
                        }
                    }

                    document.removeEventListener('keydown', handleSelectionKeydown, true);
                    this.removePendingOperation(operationId);
                } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                    // Handle typing to replace selection
                    e.preventDefault();

                    const td = event.target.closest('td');
                    if (!td) {
                        document.removeEventListener('keydown', handleSelectionKeydown, true);
                        this.removePendingOperation(operationId);
                        return;
                    }

                    td.contentEditable = true;
                    td.focus();

                    const fullText = td.textContent;
                    const pos = fullText.indexOf(selectedText);

                    if (pos !== -1) {
                        const newText = fullText.substring(0, pos) + e.key +
                                       fullText.substring(pos + selectedText.length);

                        td.textContent = newText;

                        const textNode = td.firstChild;
                        if (textNode && textNode.nodeType === 3) {
                            const range = document.createRange();
                            range.setStart(textNode, pos + 1);
                            range.collapse(true);
                            const selection = window.getSelection();
                            selection.removeAllRanges();
                            selection.addRange(range);
                        }
                    }

                    document.removeEventListener('keydown', handleSelectionKeydown, true);
                    this.removePendingOperation(operationId);
                } else if (e.key !== 'Shift' && e.key !== 'Alt' &&
                         e.key !== 'Control' && e.key !== 'Meta') {
                    document.removeEventListener('keydown', handleSelectionKeydown, true);
                    this.removePendingOperation(operationId);
                }
            };

            document.addEventListener('keydown', handleSelectionKeydown, true);

            setTimeout(() => {
                this.removePendingOperation(operationId);
            }, 5000);

            return;
        }

        if (!selection || selection.isCollapsed) {
            this.#setState(this.EditorState.IDLE);

            const row = event.target.closest('tr');
            if (row && row.cells[1]) {
                const cell = row.cells[1];
                cell.contentEditable = true;
                cell.focus();
            }
        }

        for (const row of table.rows) {
            const cell = row.cells[1];
            if (cell) cell.contentEditable = true;
        }
    }

    /**
     * Deactivate an editor instance
     * @param {HTMLElement} pre - The pre element
     */
    deactivateEditor(pre) {
        const table = pre.querySelector('table');
        if (!table) {
            return;
        }

        const editorId = pre.dataset.editorHistory;

        const controls = pre.previousElementSibling;
        if (controls && controls.classList.contains('editor-controls')) {
            pre.classList.add('disabled');
        }

        // Properly remove event listeners using stored bound handlers
        const handlers = this.boundHandlers.get(table);
        if (handlers) {
            table.removeEventListener('keyup', handlers.keyUp);
            table.removeEventListener('keydown', handlers.keyDown);
            table.removeEventListener('mousedown', handlers.mouseDown);
            table.removeEventListener('paste', handlers.paste);
            table.removeEventListener('mouseup', handlers.mouseUp);
            this.boundHandlers.delete(table);
        }

        // Clean up debounce timer
        const timerId = this.debounceTimers.get(pre);
        if (timerId) {
            clearTimeout(timerId);
            this.debounceTimers.delete(pre);
        }

        // Clean up history timer
        if (editorId) {
            const historyTimer = this.historyTimers.get(editorId);
            if (historyTimer) {
                clearTimeout(historyTimer);
                this.historyTimers.delete(editorId);
            }

            // Clean up history data for this editor
            // this.history.delete(editorId);
        }

        // Clear activeEditor reference if it's this editor
        if (this.activeEditor === pre) {
            this.#setState(this.EditorState.IDLE);
        }

        // Make cells non-editable
        for (const row of table.rows) {
            const codeCell = row.cells[1];
            if (codeCell) codeCell.contentEditable = false;
        }

        // Remove from editors set
        this.editors.delete(pre);

        // Clean up reference
        delete pre._debounceHandler;
    }

    /**
     * Destroy all editors and clean up resources
     */
    destroy() {
        // Clear state timeout
        if (this.stateTimeout) {
            clearTimeout(this.stateTimeout);
            this.stateTimeout = null;
        }

        // Deactivate all editors
        for (const pre of this.editors) {
            this.deactivateEditor(pre);
            pre.removeAttribute('data-editor-history');
        }

        // Remove global event listeners
        document.removeEventListener('keydown', this.boundGlobalHandlers.multilineKeyDown);
        document.removeEventListener('keydown', this.boundGlobalHandlers.historyKeyDown);

        // Clear all remaining timers
        for (const timerId of this.debounceTimers.values()) {
            clearTimeout(timerId);
        }
        this.debounceTimers.clear();

        for (const timerId of this.historyTimers.values()) {
            clearTimeout(timerId);
        }
        this.historyTimers.clear();

        // Clear all data structures
        this.editors.clear();
        this.history.clear();
        this.pendingOperations.clear();

        // Clear pending operation timeouts
        for (const timeoutId of this.pendingOperationTimeouts.values()) {
            clearTimeout(timeoutId);
        }
        this.pendingOperationTimeouts.clear();

        this.boundHandlers = new WeakMap();

        // Reset state
        this.#setState(this.EditorState.IDLE);
        this.activeEditor = null;
    }

    /**
     * Create unique identifier
     * @returns {string} Unique ID
     */
    createId() {
        return `${Date.now().toString(36)}${Math.random().toString(36).substring(2)}`.toUpperCase();
    }

    /**
     * Update editor with highlighting
     * @param {HTMLElement} pre - The pre element to update
     */
    updateEditor(pre) {
        if (!window.hljsl) {
            return;
        }

        if (this.suppressHighlighting || this.pendingOperations.size > 0) {
            return;
        }

        const { activeElement } = document;
        const isInPre = pre.contains(activeElement);

        if (isInPre && activeElement.tagName === 'TD') {
            const selection = window.getSelection();
            const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

            if (range) {
                const cell = activeElement;
                const row = cell.closest('tr');
                const table = row.closest('table');
                const rowIndex = Array.from(table.rows).indexOf(row);
                const colIndex = Array.from(row.cells).indexOf(cell);
                const cursorPosition = this.#getCursorPosition(cell, range);

                const observer = new MutationObserver((mutations, obs) => {
                    obs.disconnect();

                    const updatedTable = pre.querySelector('table');
                    if (updatedTable && rowIndex >= 0 && rowIndex < updatedTable.rows.length) {
                        const updatedRow = updatedTable.rows[rowIndex];
                        if (updatedRow && colIndex >= 0 && colIndex < updatedRow.cells.length) {
                            const updatedCell = updatedRow.cells[colIndex];

                            updatedCell.contentEditable = true;
                            updatedCell.focus();

                            this.#setCursorPosition(updatedCell, cursorPosition);
                        }
                    }
                });

                observer.observe(pre, {
                    childList: true,
                    subtree: true,
                    characterData: true,
                    attributes: true
                });

                window.hljsl.highlight(pre);
            } else {
                window.hljsl.highlight(pre);
            }
        } else {
            window.hljsl.highlight(pre);
        }
    }

    #forceContentEditable(table) {
        const rows = Array.from(table.rows).length;

        // Any tables with more than 2 rows are safe
        if (rows > 2) {
            return;
        }

        // Remove empty second row if exists
        if (rows === 2 && table.rows[1].textContent === '') {
            table.rows[1].remove();
        }

        // Ensure first row second cell is editable if empty
        if (table.rows[0].cells[1].textContent === '') {
            table.rows[0].cells[1].innerHTML = '';
            // Delay to ensure proper focus otherwise typing deletes the cell
            setTimeout(() => {
                table.rows[0].cells[1].contentEditable = true;
                table.rows[0].cells[1].focus();

                // Move caret to end of content
                const range = document.createRange();
                range.selectNodeContents(table.rows[0].cells[1]);
                range.collapse(false);

                // Set selection
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
            }, 100);
        }
    }

}

export default EditableHighlightJS;
