export class YodError extends Error {
  constructor(code, details = {}) { super(code); this.code = code; this.details = details; }
}
const SAFE_ERRORS = new Set(['liga','plan','sin_sesion','board','permiso','pausa','revision','recuperado','trabajando','ocupado','valor','estado','vigente','clave','calculado','version','evidencia','fuente','campo','fila','tipo','interno','portero']);

export class PppTransport {
  constructor(endpoint, { fetchImpl = fetch, timeout = 45000, maxBytes = 2 * 1024 * 1024 } = {}) {
    this.endpoint = endpoint; this.fetchImpl = fetchImpl; this.timeout = timeout; this.maxBytes = maxBytes;
  }
  async request(method, fields) {
    const url = new URL(this.endpoint);
    const opts = { method, redirect: 'manual', signal: AbortSignal.timeout(this.timeout), headers: { Accept: 'application/json' } };
    if (method === 'GET') {
      for (const [k, v] of Object.entries(fields)) if (v !== undefined) url.searchParams.set(k, String(v));
    }
    if (method === 'POST') { opts.headers['Content-Type'] = 'text/plain;charset=UTF-8'; opts.body = JSON.stringify(fields); }
    let response;
    try {
      response = await this.fetchImpl(url, opts);
      // Apps Script ContentService redirects a completed operation to Google-hosted JSON.
      // Only follow its 302/303 as GET; never replay a POST or forward credentials to an arbitrary URL.
      if ([302, 303].includes(response.status)) {
        const dest = new URL(response.headers.get('location') || '');
        if (dest.protocol !== 'https:' || dest.hostname !== 'script.googleusercontent.com' || dest.username || dest.password || dest.port) throw Error('redirect');
        response = await this.fetchImpl(dest, { method: 'GET', redirect: 'error', signal: opts.signal, headers: { Accept: 'application/json' } });
      }
      if (!response.ok) throw Error('http');
      let size = 0, chunks = [];
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > this.maxBytes) throw Error('size');
        chunks.push(chunk);
      }
      const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!data || data.ok !== true) {
        const code = SAFE_ERRORS.has(data?.error) ? data.error : 'upstream';
        throw new YodError(code, Number.isInteger(data?.rev) ? { rev: data.rev } : {});
      }
      return data;
    } catch (error) {
      if (error instanceof YodError) throw error;
      // Never include raw upstream errors, URLs, tokens or response bodies.
      throw new YodError(method === 'POST' ? 'resultado_incierto' : 'fuente_no_disponible');
    }
  }
  get(fields) { return this.request('GET', fields); }
  post(fields) { return this.request('POST', fields); }
}
