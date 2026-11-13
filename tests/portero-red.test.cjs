'use strict';
// Issue 22 (13-nov-2026): el Portero manda sus peticiones con un plazo que sí corta, no repite un POST
// contra el mismo servidor y verifica Google una sola vez a la vez. Red y relojes sintéticos: no toca
// ningún /exec real ni Google.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../portero.js'), 'utf8');
const start = source.indexOf("  let ENDPOINT = '';");
const end = source.indexOf("  const LSC = 'pyod_clave_v1';");
assert.ok(start >= 0 && end > start, 'Bloque de red del Portero presente');
const code = source.slice(start, end);
const ORIGINAL = 'https://sintetico.invalid/original/exec', RESPALDO = 'https://sintetico.invalid/respaldo/exec';

function harness(respuestas) {
  const llamadas = [], relojes = [];
  let siguiente = 0;
  const ctx = {
    console, AbortController, JSON, Object, Promise, Error,
    ACCESO_LISTO: Promise.resolve(),
    P_: () => ({ original: ORIGINAL, respaldo: RESPALDO }),
    setTimeout: (f, ms) => { relojes.push({ f, ms, vivo: true }); return relojes.length; },
    clearTimeout: id => { if (relojes[id - 1]) relojes[id - 1].vivo = false; },
    fetch: (url, opciones) => {
      const r = respuestas[Math.min(siguiente++, respuestas.length - 1)];
      llamadas.push({ url, metodo: (opciones && opciones.method) || 'GET', senal: opciones && opciones.signal });
      if (r === 'cuelga') return new Promise((_, rj) => opciones.signal.addEventListener('abort', () => rj(new Error('AbortError'))));
      if (r instanceof Error) return Promise.reject(r);
      return Promise.resolve({ text: () => Promise.resolve(typeof r === 'string' ? r : JSON.stringify(r)) });
    }
  };
  vm.createContext(ctx); vm.runInContext(code, ctx);
  const dispara = ms => { for (const r of relojes) if (r.vivo && r.ms === ms) { r.vivo = false; r.f(); } };
  return { ctx, llamadas, relojes, dispara };
}
const espera = () => new Promise(r => setImmediate(r));

test('Éxito frío: un solo POST y su respuesta tal cual', async () => {
  const h = harness([{ ok: true, autorizado: true, token: 'sy-sintetico' }]);
  const j = await h.ctx.pyodManda({ tipo: 'acceso-google' });
  assert.equal(j.token, 'sy-sintetico'); assert.equal(h.llamadas.length, 1);
  assert.equal(h.llamadas[0].url, ORIGINAL); assert.equal(h.llamadas[0].metodo, 'POST');
  assert.ok(h.relojes.every(r => !r.vivo), 'El reloj se apaga al contestar');
});

test('Si el original no contesta en 30 s, se corta la petición y NO se manda otro POST', async () => {
  const h = harness(['cuelga', { ok: true, autorizado: true, token: 'no-debe-llegar' }]);
  const p = h.ctx.pyodManda({ tipo: 'acceso-google' });
  await espera(); await espera();
  assert.equal(h.llamadas.length, 1);
  h.dispara(30000);
  const j = await p;
  assert.deepEqual({ ...j }, { ok: false, error: 'servidor' });
  assert.equal(h.llamadas[0].senal.aborted, true, 'La petición vieja se cancela en la red');
  await espera(); assert.equal(h.llamadas.length, 1, 'Nunca hay un segundo POST al mismo original');
});

test('Un 500 con HTML, un error de red o un rechazo no repiten el POST', async () => {
  for (const r of ['<html>Error 500</html>', new TypeError('Failed to fetch'), { ok: true, autorizado: false }, { ok: false, error: 'revocado' }]) {
    const h = harness([r, { ok: true, autorizado: true, token: 'no-debe-llegar' }]);
    const j = await h.ctx.pyodManda({ tipo: 'acceso-google' });
    assert.equal(h.llamadas.length, 1, 'Un solo POST con ' + String(r && r.message || JSON.stringify(r)));
    assert.notEqual(j.token, 'no-debe-llegar');
  }
});

test('El respaldo caído (404) nunca se usa mientras RESPALDO_VIVO sea falso', async () => {
  const h = harness([new TypeError('Failed to fetch'), '<html>Page Not Found</html>']);
  await h.ctx.pyodManda({ tipo: 'acceso-solicitar' });
  assert.ok(h.llamadas.every(l => l.url === ORIGINAL));
});

test('Lectura (GET) sí se reintenta una vez ante falla de red, siempre al original y con plazo que corta', async () => {
  const h = harness([new TypeError('Failed to fetch'), { ok: true, rol: 'vista' }]);
  const p = h.ctx.pyodPide('?recurso=canje&t=sy-sintetico');
  await espera(); await espera();
  h.dispara(1500);
  const j = await p;
  assert.equal(j.rol, 'vista'); assert.equal(h.llamadas.length, 2);
  assert.ok(h.llamadas.every(l => l.metodo === 'GET' && l.url.startsWith(ORIGINAL)));
  const g = harness([{ ok: false, error: 'revocado' }]);
  const r = await g.ctx.pyodPide('?recurso=canje&t=sy-revocada');
  assert.equal(r.error, 'revocado'); assert.equal(g.llamadas.length, 1, 'Una credencial revocada no se reintenta');
});

test('Dos avisos seguidos de Google: una sola verificación en vuelo; al terminar se puede volver a intentar', async () => {
  const h = harness([{}]);
  let corridas = 0, suelta;
  const verifica = h.ctx.pyodUnaALaVez(async () => { corridas++; await new Promise(r => { suelta = r; }); return corridas; });
  const a = verifica({ credential: 'uno' }), b = verifica({ credential: 'dos' });
  await espera();
  assert.equal(corridas, 1); assert.equal(a, b);
  suelta(); assert.equal(await a, 1);
  await espera();
  const c = verifica({ credential: 'tres' }); await espera(); assert.equal(corridas, 2); suelta(); await c;
  const falla = h.ctx.pyodUnaALaVez(async () => { corridas++; throw new Error('sin red'); });
  await assert.rejects(falla()); await espera(); await assert.rejects(falla()); assert.equal(corridas, 4, 'Tras un fallo se libera');
});
