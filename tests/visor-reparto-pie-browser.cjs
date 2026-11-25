'use strict';
/* Misma estructura que visor.html (html.vz-pagina > .vz-marco > .vz).
   Corrección P-10 (dictamen T-11): en un teléfono de 430 px el pie de fecha de la tarjeta «Reparto» y de su detalle se ve COMPLETO.
   Monta visor.js y visor.css reales con el paquete de tests/fixtures/visor-reparto-n01.json (lo genera el motor; motor-real.cjs vigila que
   no se desfase) y mide en Chrome: que el pie esté a la vista, que su texto no se desborde ni se recorte, que quepa dentro de la tarjeta y del
   detalle, y que diga corte, estado, mes y motivo. No sale a la red. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const RAIZ = path.join(__dirname, '..');
const FIX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'visor-reparto-n01.json'), 'utf8'));
const TIPOS = { '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const ANCHOS = [320, 390, 430, 1280];

function servidor() {
  return new Promise((ok) => {
    const s = http.createServer((req, res) => {
      const nombre = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '');
      if (nombre === '') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end('<!doctype html><html lang="es" class="vz-pagina"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover"><link rel="stylesheet" href="visor.css"></head><body><div class="vz-marco"><div id="caja" class="vz"></div></div><script src="visor.js"></script></body></html>'); return; }
      if (!['visor.js', 'visor.css'].includes(nombre)) { res.writeHead(404); res.end('no'); return; }
      res.writeHead(200, { 'content-type': TIPOS[path.extname(nombre)] });
      res.end(fs.readFileSync(path.join(RAIZ, nombre)));
    }).listen(0, '127.0.0.1', () => ok(s));
  });
}

/* mide un pie dentro de su contenedor: visible, sin desborde, dentro del contenedor y de la pantalla */
const MIDE = ([sel, contSel]) => {
  const p = document.querySelector(sel), cont = document.querySelector(contSel);
  if (!p || !cont) return { falta: true };
  const cs = getComputedStyle(p), r = p.getBoundingClientRect(), rc = cont.getBoundingClientRect();
  const rango = document.createRange(); rango.selectNodeContents(p);
  const lineas = Array.from(rango.getClientRects());
  const derecha = lineas.reduce((m, x) => Math.max(m, x.right), r.left), izquierda = lineas.reduce((m, x) => Math.min(m, x.left), r.right);
  let oculto = false; for (let e = p; e; e = e.parentElement) { const c = getComputedStyle(e); if (c.display === 'none' || c.visibility === 'hidden' || Number(c.opacity) === 0) oculto = true; }
  return { texto: p.textContent, ancho: r.width, alto: r.height, lineas: lineas.length, oculto,
    desborda: p.scrollWidth > p.clientWidth + 1 || p.scrollHeight > p.clientHeight + 1,
    dentro: izquierda >= rc.left - 0.5 && derecha <= rc.right + 0.5 && r.bottom <= rc.bottom + 0.5,
    enPantalla: izquierda >= -0.5 && derecha <= window.innerWidth + 0.5, recorte: cs.textOverflow, espacio: cs.whiteSpace };
};

const partes = (t, caso) => caso === 'n01'
  ? /corte autorizado:\s*mes 60\b/i.test(t) && /sin pago registrado/i.test(t) && /\bmes 38\b/.test(t) && /sin importe/i.test(t) && /inconsistente/i.test(t)
  : /corte autorizado:\s*mes 60\b/i.test(t) && /pago registrado al due(ñ|n)o:\s*mes 58\b/i.test(t);

function revisa(m, donde) {
  assert(!m.falta, donde + ': no hay pie');
  assert(!m.oculto && m.ancho > 0 && m.alto > 0, donde + ': el pie no se ve (' + m.ancho + ' × ' + m.alto + ')');
  assert(!m.desborda, donde + ': el texto del pie se desborda o se recorta');
  assert(m.dentro, donde + ': el pie se sale de su contenedor');
  assert(m.enPantalla, donde + ': el pie se sale de la pantalla');
}

(async () => {
  const srv = await servidor(), base = 'http://127.0.0.1:' + srv.address().port + '/';
  const nav = await chromium.launch(process.env.PPP_CHROMIUM ? { executablePath: process.env.PPP_CHROMIUM } : {});   // PPP_CHROMIUM: un Chrome ya instalado (fuera de CI)
  let n = 0;
  try {
    for (const ancho of ANCHOS) {
      for (const caso of ['n01', 'pago58']) {
        const ctx = await nav.newContext({ viewport: { width: ancho, height: 932 }, deviceScaleFactor: 1, hasTouch: ancho < 800 });
        await ctx.route('**/*', (r) => (r.request().url().startsWith(base) ? r.continue() : r.abort()));
        const page = await ctx.newPage(), errores = [];
        page.on('pageerror', (e) => errores.push(e.message));
        await page.goto(base);
        await page.evaluate((pq) => { window.VisorPPP.monta(document.getElementById('caja'), { sinElige: true }).muestra(pq, [], false); }, FIX[caso]);
        const donde = caso + ' a ' + ancho + ' px';
        const t = await page.evaluate(MIDE, ['[data-card="reparto"] .vz-fecha-reparto', '[data-card="reparto"]']);
        revisa(t, donde + ' · tarjeta'); assert(partes(t.texto, caso), donde + ' · tarjeta dice: ' + t.texto);
        await page.click('[data-card="reparto"]');
        await page.waitForSelector('#vzModal:not([hidden]) .vz-fecha-reparto');
        /* el detalle entra con una animación: se mide cuando ya terminó de aparecer (todo su linaje visible y opaco) */
        await page.waitForFunction(() => { const p = document.querySelector('#vzModal .vz-fecha-reparto'); if (!p) return false; for (let e = p; e; e = e.parentElement) { const c = getComputedStyle(e); if (c.display === 'none' || c.visibility === 'hidden' || Number(c.opacity) < 1) return false; } return !p.getAnimations({ subtree: false }).length && !document.getElementById('vzModal').getAnimations({ subtree: true }).some((a) => a.playState === 'running'); }, null, { timeout: 5000 }).catch(() => {});
        const d = await page.evaluate(MIDE, ['#vzModal .vz-fecha-reparto', '#vzModal .vz-m-caja']);
        revisa(d, donde + ' · detalle'); assert(partes(d.texto, caso), donde + ' · detalle dice: ' + d.texto);
        assert.deepStrictEqual(errores, [], donde + ': errores en la página');
        if (ancho === 430 && caso === 'n01') assert(t.lineas >= 2 && d.lineas >= 2, 'a 430 px el pie largo se parte en renglones (tarjeta ' + t.lineas + ', detalle ' + d.lineas + ')');
        await ctx.close();
        n += 2;
      }
    }
  } finally { await nav.close(); srv.close(); }
  console.log('visor-reparto-pie-browser: ' + n + ' de ' + n + ' pies completos (' + ANCHOS.join(', ') + ' px; tarjeta y detalle; fecha sin importe y pago real)');
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
