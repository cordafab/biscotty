let sequence = 0;
export function createClient(transport) {
  const client = {
    async request(action, payload = {}, expectedRevision) {
      const requestId = crypto.randomUUID();
      const response = await transport.send({ protocolVersion: 1, requestId, action, payload, ...(expectedRevision !== undefined ? { expectedRevision } : {}) });
      if (response?.protocolVersion !== 1 || response.requestId !== requestId) throw Object.assign(new Error('Biscotty did not return a valid response. Refresh before making another change.'), { code: 'INVALID_REQUEST' });
      if (!response.ok) throw Object.assign(new Error(response.error.message), response.error);
      return response.data;
    },
    subscribe(listener) {
      return transport.subscribe(event => {
        if (event?.type !== 'stateChanged') return;
        const gap = sequence !== 0 && event.sequence !== sequence + 1;
        sequence = event.sequence;
        listener({ ...event, gap });
      });
    },
    requestHostAccess() { return transport.requestHostAccess(); },
    windowContext() { return transport.windowContext(); }
  };
  for (const action of ['getState','getCookies','getSiteContext','setSiteProtection','saveConfiguration','previewBurn','startBurn','cancelBurn','dismissOperation','prepareExport','inspectImport','planImport','resolveImport','commitImport','openOptions']) {
    client[action] = (payload = {}, revision) => client.request(action, payload, revision);
  }
  return client;
}
