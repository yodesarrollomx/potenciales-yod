'use strict';
/* Misma estructura que visor.html (html.vz-pagina > .vz-marco > .vz).
   Corrección P-10 (dictamen T-11): en un teléfono de 430 px el pie de fecha de la tarjeta «Reparto» y de su detalle se ve COMPLETO.
   Monta visor.js y visor.css reales con el paquete de tests/fixtures/visor-reparto-n01.json (lo genera el motor; motor-real.cjs vigila que
   no se desfase) y mide en Chrome: que el pie esté a la vista, que su texto no se desborde ni se recorte, que quepa dentro de la tarjeta y del
   detalle, que su tinta llegue entera a la pantalla (píxel por píxel), que tocarlo abra el detalle, y que diga corte, estado, mes y motivo. No sale a la red. */
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

/* mide un pie dentro de su contenedor, como lo ve una persona:
   · el texto es el que Chrome MUESTRA (innerText): un trozo oculto dentro del párrafo no cuenta;
   · cada renglón (Range.getClientRects) cabe en el contenedor, en la pantalla y en la zona visible de TODO ancestro que recorte
     (overflow distinto de visible), hasta el contenedor; así un envoltorio intermedio que corte la última línea se detecta;
   · que la tinta del pie llegue de verdad a la pantalla lo comprueba TINTA (abajo), con los píxeles que Chrome pinta; aquí no se
     pregunta quién recibe el puntero (document.elementFromPoint): una capa del color del papel que deja pasar los toques tapa el texto
     sin cambiar esa respuesta, y una capa transparente que sí los recibe la cambia sin tapar nada. */
const MIDE = ([sel, contSel]) => {
  const p = document.querySelector(sel), cont = document.querySelector(contSel);
  if (!p || !cont) return { falta: true };
  p.scrollIntoView({ block: 'center', inline: 'nearest' });
  const r = p.getBoundingClientRect(), rc = cont.getBoundingClientRect();
  const rango = document.createRange(); rango.selectNodeContents(p);
  const cajas = Array.from(rango.getClientRects()).filter((x) => x.width > 0.5 && x.height > 0.5), bandas = [];
  for (const x of cajas) { if (!bandas.some((y) => Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top) > 0.5 * Math.min(x.height, y.height))) bandas.push(x); }   // un <span> que envuelve texto da dos cajas del mismo renglón
  const lineas = cajas;
  let oculto = false; for (let e = p; e; e = e.parentElement) { const c = getComputedStyle(e); if (c.display === 'none' || c.visibility === 'hidden' || Number(c.opacity) === 0) oculto = true; }
  const recortes = [];   // zonas visibles de los ancestores que recortan, del pie hasta el contenedor (incluido)
  for (let e = p.parentElement; e; e = e.parentElement) {
    const c = getComputedStyle(e);
    if (c.overflowX !== 'visible' || c.overflowY !== 'visible' || c.clipPath !== 'none') { const z = e.getBoundingClientRect(); recortes.push({ l: z.left + e.clientLeft, t: z.top + e.clientTop, r: z.left + e.clientLeft + e.clientWidth, b: z.top + e.clientTop + e.clientHeight }); }
    if (e === cont) break;
  }
  const cabe = (x, z) => x.left >= z.l - 0.5 && x.right <= z.r + 0.5 && x.top >= z.t - 0.5 && x.bottom <= z.b + 0.5;
  const malas = [];
  lineas.forEach((x, i) => {
    if (!cabe(x, { l: rc.left, t: rc.top, r: rc.right, b: rc.bottom })) malas.push(i + ': fuera del contenedor');
    if (!cabe(x, { l: 0, t: 0, r: window.innerWidth, b: window.innerHeight })) malas.push(i + ': fuera de la pantalla');
    if (recortes.some((z) => !cabe(x, z))) malas.push(i + ': recortado por un contenedor intermedio');
  });
  return { texto: p.innerText, textoHtml: p.textContent, ancho: r.width, alto: r.height, lineas: bandas.length, oculto, malas,
    toque: lineas.length ? { x: lineas[0].left + Math.min(12, lineas[0].width / 2), y: lineas[0].top + lineas[0].height / 2 } : null,
    desborda: p.scrollWidth > p.clientWidth + 1 || p.scrollHeight > p.clientHeight + 1 };
};

/* ── TINTA: el testigo de los píxeles ───────────────────────────────────────────────────────────────────────────────────────────
   Qué se ve se decide con lo que Chrome pinta, no con el árbol de la página. Cuatro fotos del mismo rectángulo, en el mismo navegador,
   con la misma fuente y con el pie en el mismo sitio:
     A  el pie tal cual                       B  igual, con su texto transparente   → tinta REAL   = píxeles que cambian entre A y B
     C  el pie DESPEJADO (ver T_DESPEJA)      D  igual, con su texto transparente   → tinta DEBIDA = píxeles que cambian entre C y D
   Despejar no mueve nada de sitio (sólo propiedades que no tocan la maquetación): esconde todo lo que no es del linaje del pie
   —elementos y seudoelementos, estén donde estén— y le quita al linaje recortes, máscaras, filtros, contornos y opacidades. Cada píxel de tinta
   debida que no esté, con casi toda su fuerza, en la tinta real es texto que una persona no ve: lo tape lo que lo tape (una capa opaca
   aunque deje pasar los toques, la sombra de un vecino, un velo, un clip-path, una máscara), falla. Una capa transparente no quita
   tinta: pasa. Además se mira letra por letra: cada carácter del pie tiene que ocupar sitio, tener tamaño de lectura y, despejado,
   dejar tinta (una fecha con letra de tamaño cero o del color del papel sigue en el texto de la página y nadie la ve), y avanzar
   respecto de la anterior (una cifra montada sobre otra o en orden inverso se lee como otro mes). */
const SIN_TEXTO = 'color:transparent !important;-webkit-text-fill-color:transparent !important;text-shadow:none !important;-webkit-text-stroke-color:transparent !important;text-decoration-color:transparent !important;text-emphasis-color:transparent !important;';
const T_PREPARA = (sel) => {
  const p = document.querySelector(sel);
  p.scrollIntoView({ block: 'center', inline: 'nearest' });
  const r = p.getBoundingClientRect();
  /* letra por letra: cada carácter que no es espacio tiene que ocupar sitio en la pantalla (un trozo con letra de tamaño cero sigue
     en el texto de la página y no se ve) */
  const letras = [], sinSitio = [], desorden = []; let previa = null, pegada = false; const anda = document.createTreeWalker(p, NodeFilter.SHOW_TEXT), rango = document.createRange();
  for (let n = anda.nextNode(); n; n = anda.nextNode()) {
    let quitado = false; for (let e = n.parentElement; e && e !== p.parentElement; e = e.parentElement) if (getComputedStyle(e).display === 'none') quitado = true;
    if (quitado) continue;   // lo que no se dibuja tampoco sale en innerText: de eso se encarga la lectura del texto
    const t = n.data;
    for (let i = 0; i < t.length; i++) {
      if (/\s/.test(t[i])) { pegada = false; continue; }
      rango.setStart(n, i); rango.setEnd(n, i + 1);
      const x = Array.from(rango.getClientRects()).find((y) => y.width > 0.5 && y.height > 0.5);
      if (!x) { sinSitio.push(t[i]); pegada = true; continue; }
      const q = { c: t[i], l: x.left, t: x.top, r: x.right, b: x.bottom };
      /* cada letra avanza respecto de la anterior de su palabra: si se le monta encima o queda antes, se lee otra cosa («38» que se
         ve «8» o «83») aunque el texto de la página siga diciendo lo mismo. Entre cifras se pide además un paso mínimo. */
      if (pegada && previa && Math.min(q.b, previa.b) - Math.max(q.t, previa.t) > 0.5 * Math.min(q.b - q.t, previa.b - previa.t)) {
        const paso = ((q.l + q.r) / 2 - (previa.l + previa.r) / 2) / Math.min(q.b - q.t, previa.b - previa.t);
        if (paso <= 0 || (/\d/.test(q.c) && /\d/.test(previa.c) && paso < 0.2)) desorden.push(previa.c + q.c + ' (paso ' + paso.toFixed(3) + ')');
      }
      letras.push(q); previa = q; pegada = true;
    }
  }
  const lineas = [];   // renglones: letras que comparten franja
  for (const x of letras) {
    const y = lineas.find((z) => Math.min(x.b, z.b) - Math.max(x.t, z.t) > 0.5 * Math.min(x.b - x.t, z.b - z.t));
    if (y) { y.l = Math.min(y.l, x.l); y.r = Math.max(y.r, x.r); y.t = Math.min(y.t, x.t); y.b = Math.max(y.b, x.b); } else lineas.push({ l: x.l, t: x.t, r: x.r, b: x.b });
  }
  const caja = { x: Math.max(0, Math.floor(r.left) - 2), y: Math.max(0, Math.floor(r.top) - 2) };
  caja.width = Math.min(window.innerWidth, Math.ceil(r.right) + 2) - caja.x; caja.height = Math.min(window.innerHeight, Math.ceil(r.bottom) + 2) - caja.y;
  return { caja, lineas, letras, sinSitio, desorden };
};
const T_TEXTO = ([sel, css]) => {   // quita (o devuelve) la tinta del texto del pie y de lo que lleve dentro
  let e = document.getElementById('tintaSinTexto');
  if (!css) { if (e) e.remove(); return; }
  if (!e) { e = document.createElement('style'); e.id = 'tintaSinTexto'; document.head.appendChild(e); }
  e.textContent = sel + ',' + sel + ' *{' + css + '}';
};
const T_DESPEJA = ([sel, pon]) => {
  document.querySelectorAll('[data-tinta]').forEach((e) => e.removeAttribute('data-tinta'));
  const viejo = document.getElementById('tintaDespeja'); if (viejo) viejo.remove();
  if (!pon) return;
  const p = document.querySelector(sel);
  for (let e = p; e; e = e.parentElement) e.setAttribute('data-tinta', 'linaje');
  p.querySelectorAll('*').forEach((e) => e.setAttribute('data-tinta', 'linaje'));
  /* se esconde TODO lo que no es del linaje del pie, esté donde esté (una sombra, un contorno o un filtro pintan fuera de la caja de
     su elemento), y todos los seudoelementos; visibility no mueve nada de sitio */
  const st = document.createElement('style'); st.id = 'tintaDespeja';
  st.textContent = 'body *:not([data-tinta]),*::before,*::after{visibility:hidden !important}'
    + '[data-tinta="linaje"]{opacity:1 !important;visibility:visible !important;clip-path:none !important;-webkit-mask:none !important;mask:none !important;filter:none !important;mix-blend-mode:normal !important;outline:none !important;transition:none !important}';
  document.head.appendChild(st);
};
/* en una página en blanco: decodifica las fotos y compara. Tinta debida = cambio fuerte (el cuerpo de la letra);
   está en la pantalla si el cambio real conserva al menos el 60 % de esa fuerza (un velo a medias también quita tinta). */
const T_COMPARA = async ({ a, b, c, d, caja, lineas, letras }) => {
  const px = async (b64) => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); const bmp = await createImageBitmap(new Blob([u], { type: 'image/png' })); const cv = new OffscreenCanvas(bmp.width, bmp.height), g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(bmp, 0, 0); return { w: bmp.width, h: bmp.height, d: g.getImageData(0, 0, bmp.width, bmp.height).data }; };
  const [A, B, C, D] = await Promise.all([px(a), px(b), px(c), px(d)]);
  if ([B, C, D].some((x) => x.w !== A.w || x.h !== A.h)) return { error: 'las fotos no miden lo mismo' };
  const cambio = (X, Y, k) => Math.max(Math.abs(X.d[k] - Y.d[k]), Math.abs(X.d[k + 1] - Y.d[k + 1]), Math.abs(X.d[k + 2] - Y.d[k + 2]));
  const porLinea = lineas.map(() => ({ debida: 0, falta: 0 })); let debida = 0, falta = 0;
  /* cada letra, despejada, tiene que dejar tinta dentro de su sitio (umbral más bajo: un punto o una coma pesan poco) */
  const enBlanco = letras.filter((q) => { for (let y = Math.max(0, Math.floor(q.t - caja.y)); y < Math.min(A.h, Math.ceil(q.b - caja.y)); y++) for (let x = Math.max(0, Math.floor(q.l - caja.x)); x < Math.min(A.w, Math.ceil(q.r - caja.x)); x++) if (cambio(C, D, (y * A.w + x) * 4) >= 48) return false; return true; }).map((q) => q.c);
  for (let y = 0; y < A.h; y++) for (let x = 0; x < A.w; x++) {
    const k = (y * A.w + x) * 4, ref = cambio(C, D, k);
    if (ref < 96) continue;
    const hay = cambio(A, B, k) >= 0.6 * ref;
    debida++; if (!hay) falta++;
    const cx = caja.x + x + 0.5, cy = caja.y + y + 0.5, i = lineas.findIndex((l) => cx >= l.l - 1 && cx <= l.r + 1 && cy >= l.t - 1 && cy <= l.b + 1);
    if (i >= 0) { porLinea[i].debida++; if (!hay) porLinea[i].falta++; }
  }
  return { debida, falta, porLinea, enBlanco };
};
async function tinta(page, lienzo, sel, donde) {
  const m = await page.evaluate(T_PREPARA, sel);
  assert(m.caja.width > 4 && m.caja.height > 4, donde + ': el pie no tiene zona que fotografiar');
  const foto = async () => (await page.screenshot({ clip: m.caja, caret: 'hide', scale: 'css' })).toString('base64');
  let a, b, c, d;
  try {
    a = await foto();
    await page.evaluate(T_TEXTO, [sel, SIN_TEXTO]); b = await foto(); await page.evaluate(T_TEXTO, [sel, '']);
    await page.evaluate(T_DESPEJA, [sel, true]); c = await foto();
    await page.evaluate(T_TEXTO, [sel, SIN_TEXTO]); d = await foto();
  } finally { await page.evaluate(T_TEXTO, [sel, '']); await page.evaluate(T_DESPEJA, [sel, false]); }
  const fijo = await page.evaluate(T_PREPARA, sel);   // despejar no debe haber movido nada
  assert.deepStrictEqual(fijo, m, donde + ': el pie cambió de sitio mientras se fotografiaba');
  assert.deepStrictEqual(m.sinSitio, [], donde + ': hay texto del pie que está en la página y no ocupa sitio en la pantalla: «' + m.sinSitio.join('') + '»');
  assert.deepStrictEqual(m.desorden, [], donde + ': letras del pie montadas una sobre otra o en otro orden que el del texto (se leería otra cosa): ' + m.desorden.join(', '));
  const altos = m.letras.map((x) => x.b - x.t).sort((x, y) => x - y), tipico = altos[altos.length >> 1] || 0, chicas = m.letras.filter((x) => x.b - x.t < 8 || x.b - x.t < 0.8 * tipico).map((x) => x.c);
  assert.deepStrictEqual(chicas, [], donde + ': letras del pie demasiado pequeñas para leerse (menos de 8 px o del 80 % del resto): «' + chicas.join('') + '»');
  const r = await lienzo.evaluate(T_COMPARA, { a, b, c, d, caja: m.caja, lineas: m.lineas, letras: m.letras });
  assert(!r.error, donde + ': ' + r.error);
  assert(r.falta === 0, donde + ': al pie le faltan ' + r.falta + ' de ' + r.debida + ' píxeles de tinta en la pantalla (por renglón: ' + r.porLinea.map((l, i) => i + ': ' + l.falta + '/' + l.debida).join(', ') + '); algo lo tapa, lo vela o lo recorta');
  assert.deepStrictEqual(r.enBlanco, [], donde + ': letras del pie que ni despejadas dejan tinta (no contrastan con el fondo): «' + r.enBlanco.join('') + '»');
  assert(r.debida >= 150, donde + ': ni despejado tiene tinta el pie (' + r.debida + ' px)');
  return r;
}

const partes = (t, caso) => caso === 'n01'
  ? /corte autorizado:\s*mes 60\b/i.test(t) && /sin pago registrado/i.test(t) && /\bmes 38\b/.test(t) && /sin importe/i.test(t) && /inconsistente/i.test(t)
  : /corte autorizado:\s*mes 60\b/i.test(t) && /pago registrado al due(ñ|n)o:\s*mes 58\b/i.test(t);

function revisa(m, donde) {
  assert(!m.falta, donde + ': no hay pie');
  assert(!m.oculto && m.ancho > 0 && m.alto > 0 && m.lineas > 0, donde + ': el pie no se ve (' + m.ancho + ' × ' + m.alto + ')');
  assert(!m.desborda, donde + ': el texto del pie se desborda o se recorta');
  assert.deepStrictEqual(m.malas, [], donde + ': renglones que no se ven completos');
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
        const page = await ctx.newPage(), lienzo = await ctx.newPage(), errores = [];
        await page.bringToFront();
        page.on('pageerror', (e) => errores.push(e.message));
        await page.goto(base);
        await page.evaluate((pq) => { window.VisorPPP.monta(document.getElementById('caja'), { sinElige: true }).muestra(pq, [], false); }, FIX[caso]);
        const donde = caso + ' a ' + ancho + ' px';
        const t = await page.evaluate(MIDE, ['[data-card="reparto"] .vz-fecha-reparto', '[data-card="reparto"]']);
        revisa(t, donde + ' · tarjeta'); assert(partes(t.texto, caso), donde + ' · tarjeta dice: ' + t.texto);
        await tinta(page, lienzo, '[data-card="reparto"] .vz-fecha-reparto', donde + ' · tarjeta');
        /* el toque va sobre el propio texto del pie, por coordenadas: lo reciba quien lo reciba, tiene que abrir el detalle */
        const z = await page.evaluate(MIDE, ['[data-card="reparto"] .vz-fecha-reparto', '[data-card="reparto"]']);
        await page.mouse.click(z.toque.x, z.toque.y);
        await page.waitForSelector('#vzModal:not([hidden]) .vz-fecha-reparto', { timeout: 5000 }).catch(() => { throw new Error(donde + ': tocar el pie de la tarjeta no abre el detalle'); });
        /* el detalle entra con una animación: se mide cuando ya terminó de aparecer (todo su linaje visible y opaco) */
        await page.waitForFunction(() => { const p = document.querySelector('#vzModal .vz-fecha-reparto'); if (!p) return false; for (let e = p; e; e = e.parentElement) { const c = getComputedStyle(e); if (c.display === 'none' || c.visibility === 'hidden' || Number(c.opacity) < 1) return false; } return !p.getAnimations({ subtree: false }).length && !document.getElementById('vzModal').getAnimations({ subtree: true }).some((a) => a.playState === 'running'); }, null, { timeout: 5000 }).catch(() => {});
        const d = await page.evaluate(MIDE, ['#vzModal .vz-fecha-reparto', '#vzModal .vz-m-caja']);
        revisa(d, donde + ' · detalle'); assert(partes(d.texto, caso), donde + ' · detalle dice: ' + d.texto);
        await tinta(page, lienzo, '#vzModal .vz-fecha-reparto', donde + ' · detalle');
        assert.deepStrictEqual(errores, [], donde + ': errores en la página');
        if (ancho === 430 && caso === 'n01') assert(t.lineas >= 2 && d.lineas >= 2, 'a 430 px el pie largo se parte en renglones (tarjeta ' + t.lineas + ', detalle ' + d.lineas + ')');
        await ctx.close();
        n += 2;
      }
    }
  } finally { await nav.close(); srv.close(); }
  console.log('visor-reparto-pie-browser: ' + n + ' de ' + n + ' pies completos (' + ANCHOS.join(', ') + ' px; tarjeta y detalle; fecha sin importe y pago real)');
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
