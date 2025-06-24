(function() {
    // Only apply in environments where window + DOM APIs are present
    if (typeof window === 'undefined' ||
      typeof document === 'undefined' ||
      typeof window.getSelection !== 'function' ||
      typeof document.createRange !== 'function') {
        console.warn('[Hook] DOM selection/range APIs not available — skipping instrumentation.');
        return;
    }

    const selectionInstance = window.getSelection();
    const rangeInstance = document.createRange();

    if (!selectionInstance || !rangeInstance) {
        console.warn('[Hook] Unable to create selection or range instances — skipping.');
        return;
    }

    const selectionProto = Object.getPrototypeOf(selectionInstance);
    const rangeProto = Object.getPrototypeOf(rangeInstance);

    const originalAddRange = selectionProto.addRange;
    const originalSetStart = rangeProto.setStart;
    const originalSetEnd = rangeProto.setEnd;

    function getStackTrace() {
        try {
            throw new Error();
        } catch (e) {
            return (e.stack || '').split('\n').slice(2).join('\n');
        }
    }

    // Hook addRange
    selectionProto.addRange = function(range) {
        console.log('%c[addRange]', 'color: red; font-weight: bold;');
        try {
            console.log('Range start:', range.startContainer, range.startOffset);
            console.log('Range end:', range.endContainer, range.endOffset);
        } catch (e) {
            console.warn('Error accessing range details:', e);
        }
        console.log('Stack trace:\n', getStackTrace());
        return originalAddRange.call(this, range);
    };

    // Hook setStart
    rangeProto.setStart = function(node, offset) {
        console.log('%c[setStart]', 'color: orange; font-weight: bold;');
        console.log('Node:', node, 'Offset:', offset);
        console.log('Stack trace:\n', getStackTrace());
        return originalSetStart.call(this, node, offset);
    };

    // Hook setEnd
    rangeProto.setEnd = function(node, offset) {
        console.log('%c[setEnd]', 'color: orange; font-weight: bold;');
        console.log('Node:', node, 'Offset:', offset);
        console.log('Stack trace:\n', getStackTrace());
        return originalSetEnd.call(this, node, offset);
    };

    console.log('%c[Selection/Range hook installed]', 'color: green; font-weight: bold;');
})();
