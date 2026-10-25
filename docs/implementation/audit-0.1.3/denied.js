const results = [];
for (const action of ['getState', 'startBurn']) results.push(await browser.runtime.sendMessage({ protocolVersion: 1, requestId: crypto.randomUUID(), action, payload: {}, expectedRevision: 0 }));
document.documentElement.dataset.audit = JSON.stringify(results);
