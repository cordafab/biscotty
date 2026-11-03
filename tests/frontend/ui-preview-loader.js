// Browser-only fixture. Fetching source is restricted to this test page.
const view = new URLSearchParams(location.search).get('view') === 'options' ? 'options' : 'popup';
const response = await fetch(`/src/frontend/${view}.html`);
const source = await response.text();
const frame = document.getElementById('preview');
frame.style.width = view === 'popup' ? '368px' : '1100px';
frame.srcdoc = source.replace('<head>', '<head><base href="/src/frontend/"><script src="/tests/frontend/ui-errors.js"></script>').replace(`src="${view}.js"`, `src="/tests/frontend/ui-preview.js?view=${view}"`);
