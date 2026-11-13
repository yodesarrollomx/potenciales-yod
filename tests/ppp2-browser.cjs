'use strict';
/* Recorridos reales del DOM de ppp2.html con el servidor de PPP 2 corriendo en dobles
   (tests/ppp2-mundo.cjs) y un plan INVENTADO. No sale a la red: el marco de YOD OS,
   el Portero y las fuentes se sustituyen por vacíos. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { mundo, ADMIN, EDITOR, LECTOR, PLAN, filaDe, jugueteConCiclo } = require('./ppp2-mundo.cjs');

const RAIZ = path.join(__dirname, '..');
const FOTOS = process.env.PPP_SCREENSHOTS || '';
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
const ENDPOINT = 'https://script.google.com/macros/s/PRUEBA/exec';

function servidor() {
  return new Promise((ok) => {
    const s = http.createServer((req, res) => {
      const ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      const archivo = path.join(RAIZ, ruta === '/' ? 'ppp2.html' : ruta);
      if (!archivo.startsWith(RAIZ) || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) { res.writeHead(404); res.end('no'); return; }
      res.writeHead(200, { 'content-type': TIPOS[path.extname(archivo)] || 'application/octet-stream' });
      res.end(fs.readFileSync(archivo));
    }).listen(0, '127.0.0.1', () => ok(s));
  });
}

async function pagina(navegador, base, w, llave, opciones) {
  const op = opciones || {};
  const ctx = await navegador.newContext({ viewport: op.movil ? { width: 390, height: 844 } : { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  const posts = [];
  await ctx.route('**/*', async (route) => {
    const req = route.request(), url = req.url();
    if (url.startsWith(base)) {
      if (/\/portero\.js/.test(url)) return route.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
      return route.continue();
    }
    if (url.startsWith(ENDPOINT)) {
      let cuerpo;
      if (req.method() === 'POST') {
        const b = JSON.parse(req.postData() || '{}');
        posts.push(b);
        cuerpo = w.ctx.doPost({ postData: { contents: JSON.stringify(b) } }).contenido;
      } else {
        const p = Object.fromEntries(new URL(url).searchParams);
        cuerpo = w.ctx.doGet({ parameter: p }).contenido;
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: cuerpo });
    }
    const vacio = /\.css(\?|$)/.test(url) ? 'text/css' : 'text/javascript';
    return route.fulfill({ status: 200, contentType: vacio, body: '' });
  });
  await ctx.addInitScript(([llaveSesion, ep]) => {
    if (llaveSesion !== null) localStorage.setItem('pyod_clave_v1', llaveSesion);
    window.PPP2_ENDPOINT = ep;
  }, [llave === undefined ? null : llave, op.sinServidor ? 'https://script.google.com/macros/s/PENDIENTE/exec' : ENDPOINT]);
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push(e.message));
  await page.goto(base + '/ppp2.html' + (op.hash || ''));
  return { ctx, page, posts, errores };
}

/* El mundo en el momento que más importa: el consejo ya regresó la V2 del ejemplo (con sus pruebas y sus siete
   votos sobre esos mismos números). La V2 es la propuesta de una persona y la V3 («Temprana») una alterna de una persona. */
function regresada(opciones) {
  const w = mundo(Object.assign({ alFlush: (i, libro) => jugueteConCiclo(libro) }, opciones || {}));
  jugueteConCiclo(w.libro);
  const res = w.libro.getSheetByName('Resumen'), lee = (c) => res.v[filaDe(res, c) - 1][1], h2 = lee('v2.huella');
  w.libro.getSheetByName('Pruebas').getRange(14, 1, 1, 11).setValues([['Base de la versión 2', '(sin cambios)', 1, 0, 1, 1, 37, 'V2', '2026-01-15 10:00', 'Pruebas', h2]]);
  for (let j = 0; j < 7; j++) w.libro.getSheetByName('Consejo').appendRow(['2026-01-15', 'CP-1', 'V2', 'Juez ' + (j + 1), 'regresa', 'Razón de prueba', 'Conseguir la escritura ' + (j + 1), h2, lee('plan.evidencia')]);
  jugueteConCiclo(w.libro);
  assert.equal(lee('plan.paso'), 'explorar');
  return w;
}

async function sinDesborde(page, donde) {
  const d = await page.evaluate(() => ({ ancho: document.documentElement.scrollWidth, vista: window.innerWidth }));
  assert.ok(d.ancho <= d.vista + 1, donde + ': la página se desborda a lo ancho (' + d.ancho + ' > ' + d.vista + ')');
}
async function foto(page, nombre) {
  if (!FOTOS) return;
  fs.mkdirSync(FOTOS, { recursive: true });
  await page.screenshot({ path: path.join(FOTOS, nombre + '.png'), fullPage: true });
}

(async () => {
  const s = await servidor();
  const base = 'http://127.0.0.1:' + s.address().port;
  const navegador = await chromium.launch();
  let fallos = 0;
  const caso = async (nombre, fn) => {
    try { await fn(); console.log('ok · ' + nombre); } catch (e) { fallos++; console.error('FALLA · ' + nombre + '\n  ' + (e && e.stack || e)); }
  };
  try {
    await caso('sin servidor instalado la página lo dice y no pide nada', async () => {
      const w = mundo();
      const { page, ctx, errores } = await pagina(navegador, base, w, EDITOR, { sinServidor: true });
      await page.getByText('El servidor de PPP 2 aún no está instalado').waitFor();
      assert.deepEqual(errores, []);
      await ctx.close();
    });

    await caso('sin sesión pide entrar y no llama al servidor', async () => {
      const w = mundo();
      const { page, ctx } = await pagina(navegador, base, w, undefined);
      await page.getByText('Entra para ver el vivero').waitFor();
      assert.equal(w.llamadas.length, 0);
      await ctx.close();
    });

    await caso('una sesión rechazada avisa y no borra la credencial', async () => {
      const w = mundo();
      const { page, ctx } = await pagina(navegador, base, w, 'syinvalida000000000000000');
      await page.getByText('Tu sesión ya no sirve aquí').waitFor();
      assert.equal(await page.evaluate(() => localStorage.getItem('pyod_clave_v1')), 'syinvalida000000000000000');
      await ctx.close();
    });

    await caso('el vivero muestra lo que recibe el dueño y lleva al plan', async () => {
      const w = mundo();
      const { page, ctx, errores } = await pagina(navegador, base, w, EDITOR);
      await page.getByRole('heading', { name: 'El vivero' }).waitFor();
      const tarjeta = page.locator('a.p2-tarjeta', { hasText: 'Proyecto Ejemplo' });
      await tarjeta.waitFor();
      const viv = JSON.parse(w.ctx.doGet({ parameter: { recurso: 'ppp2-vivero', k: EDITOR } }).contenido).planes[0];
      const esperado = viv.dueno_recibe.toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
      assert.match(await tarjeta.innerText(), new RegExp(esperado.replace('.', '\\.') + ' MDP'));
      await page.getByRole('button', { name: /Sembrar un plan/ }).waitFor();
      await foto(page, 'ppp2-vivero');
      await tarjeta.click();
      await page.locator('.p2-recibe .p2-cifra').waitFor();
      assert.equal((await page.locator('.p2-recibe .p2-cifra').innerText()).replace(/\s+/g, ''), esperado + 'MDP');
      assert.equal(await page.locator('.p2-vbtn').count(), 3);
      assert.ok(await page.locator('.p2-grafica svg path').count() >= 2, 'dibuja la gráfica del dinero');
      await foto(page, 'ppp2-plan');
      await page.locator('.p2-vbtn[data-v="1"]').click();
      const v1 = JSON.parse(w.ctx.doGet({ parameter: { recurso: 'ppp2-plan', plan: PLAN, k: EDITOR } }).contenido).versiones[0];
      const esperadoV1 = v1.dueno_recibe.toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
      assert.equal((await page.locator('.p2-recibe .p2-cifra').innerText()).replace(/\s+/g, ''), esperadoV1 + 'MDP');
      assert.deepEqual(errores, []);
      await ctx.close();
    });

    await caso('«No se sabe» y una palanca se guardan en el libro con la revisión vigente', async () => {
      const w = mundo();
      const { page, ctx, posts } = await pagina(navegador, base, w, EDITOR, { hash: '#/plan/' + PLAN + '/preguntas' });
      await page.locator('.p2-pregunta').waitFor();
      const id = await page.locator('.p2-pregunta [data-accion="nose"]').getAttribute('data-q');
      await page.locator('.p2-pregunta [data-accion="nose"]').click();
      await page.getByText('Anotado: no se sabe todavía.').waitFor();
      const pq = w.libro.getSheetByName('Preguntas');
      assert.equal(pq.v[filaDe(pq, id) - 1][6], 'no se sabe');
      assert.equal(posts[0].tipo, 'ppp2-responder');
      assert.equal(posts[0].rev, 1);
      await page.locator('.p2-pestanas a', { hasText: 'Versiones y reparto' }).click();
      const campo = page.locator('input[data-palanca="obra_inicio"][data-v="3"]');
      await campo.waitFor();
      await campo.fill('10');
      await campo.press('Tab');
      await page.waitForFunction(() => document.querySelector('.p2-toast') && /recalcul/.test(document.querySelector('.p2-toast').textContent));
      const mod = w.libro.getSheetByName('Modelo');
      assert.equal(mod.v[filaDe(mod, 'obra_inicio') - 1][6], 10);
      assert.equal(posts[1].rev, 2, 'la segunda escritura lleva la revisión nueva');
      await ctx.close();
    });

    await caso('sólo Dirección ve «Aprobar» y al aprobar queda vigente con su nombre', async () => {
      const w = mundo();
      let r = await pagina(navegador, base, w, EDITOR, { hash: '#/plan/' + PLAN });
      await r.page.locator('.p2-recibe').waitFor();
      assert.equal(await r.page.locator('[data-accion="aprobar"]').count(), 0);
      await r.ctx.close();
      r = await pagina(navegador, base, w, ADMIN, { hash: '#/plan/' + PLAN });
      await r.page.getByRole('button', { name: /Aprobar esta versión/ }).click();
      await r.page.getByRole('button', { name: 'Sí, aprobar' }).click();
      await r.page.getByText('Versión vigente aprobada.').waitFor();
      const ver = w.libro.getSheetByName('Versiones');
      assert.equal(ver.v[filaDe(ver, 'estado') - 1][3], 'vigente');
      assert.equal(ver.v[filaDe(ver, 'aprobada_por') - 1][3], 'Admin Prueba');
      await r.ctx.close();
    });

    await caso('quien sólo lee no ve controles de edición', async () => {
      const w = mundo();
      const { page, ctx } = await pagina(navegador, base, w, LECTOR);
      await page.locator('a.p2-tarjeta').waitFor();
      assert.equal(await page.getByRole('button', { name: /Sembrar/ }).count(), 0);
      await page.locator('a.p2-tarjeta').click();
      await page.locator('.p2-recibe').waitFor();
      assert.equal(await page.locator('input[data-palanca]').count(), 0);
      await page.locator('.p2-pestanas a', { hasText: 'Preguntas' }).click();
      await page.locator('.p2-pregunta').waitFor();
      assert.equal(await page.locator('[data-accion="responder"], [data-accion="editar-dato"]').count(), 0);
      await ctx.close();
    });

    await caso('el consejo regresó la propuesta y el plan no tiene dónde escribir: lo dice, pide una versión prestada y, con un clic, propone, se prueba y espera al consejo', async () => {
      const w = regresada();
      const { page, ctx, posts, errores } = await pagina(navegador, base, w, EDITOR, { hash: '#/plan/' + PLAN });
      await page.locator('.p2-voz').waitFor();
      const dice = await page.locator('.p2-voz .p2-dice').innerText();
      assert.match(dice, /El consejo regresó mi V2 \(0 de 7 aprueban\)\. Me toca mover capital y arranque de obra y volver con otra propuesta\./);
      assert.match(dice, /no tengo una versión donde escribir: la base y la vigente no las toco, y no escribo encima del trabajo de una persona si nadie me lo presta/);
      assert.equal(await page.locator('.p2-ciclo li.ahora').innerText(), 'Muevo capital y arranque');
      assert.match(await page.locator('.p2-crecer').innerText(), /Para crecer falta:/, 'lo que pide la edad se ve siempre, junto con el paso');
      assert.equal(await page.getByRole('button', { name: /Correr mi ronda/ }).count(), 0);
      await page.getByRole('button', { name: /Afinar la V2 en su lugar \(«Con banco»\)/ }).waitFor();
      await page.getByRole('button', { name: /Prestarme la V3 \(«Temprana»\)/ }).click();
      await page.getByText('Propuesta lista y probada: ahora le toca al consejo.').waitFor({ timeout: 15000 });
      assert.deepEqual(posts.map((b) => [b.tipo, b.usar]), [['ppp2-ronda', 3], ['ppp2-estres', undefined]]);
      assert.equal(posts[1].version, 3, 'prueba la versión donde quedó la propuesta');
      assert.ok(posts.every((b) => b.request_id && b.plan === PLAN));
      await page.getByText('Ya corrí las pruebas de estrés de mi V3 con los números que tiene hoy. Me toca defenderla ante el consejo de planes.').waitFor({ timeout: 15000 });
      assert.match(await page.locator('.p2-voz').innerText(), /todavía no tengo una revisión programada/, 'sin revisión programada en Config, no la promete');
      assert.equal(await page.locator('.p2-vbtn[aria-pressed="true"] b').innerText().then((t) => t.slice(0, 2)), 'V3', 'queda viendo la propuesta nueva');
      assert.match(await page.locator('.p2-vbtn[aria-pressed="true"]').innerText(), /la que defiendo/);
      await page.evaluate((h) => { location.hash = h; }, '#/plan/' + PLAN + '/auton');     // el nombre viejo de la pestaña sigue llevando aquí
      await page.locator('.p2-pestanas a[aria-current="page"]').waitFor();
      assert.equal(await page.locator('.p2-pestanas a[aria-current="page"]').innerText(), 'Mis rondas');
      await page.getByRole('heading', { name: /Ronda 1 · propuse la V3/ }).waitFor();
      const ronda = page.locator('.p2-panel', { hasText: 'Ronda 1 ·' }).first();
      assert.match(await ronda.innerText(), /Escribí en la V3; lo que tenía \(«Temprana», alterna\) quedó anotado en esta ronda/);
      await ronda.locator('summary', { hasText: 'Lo que tenía la V3 antes de esta ronda: «Temprana» (alterna)' }).click();
      assert.match(await ronda.innerText(), /La propuso: Pruebas\./);
      assert.match(await ronda.innerText(), /Obra: mes de inicio: 9/, 'enseña las palancas que tenía la versión prestada');
      await ronda.locator('summary', { hasText: 'Lo que probé: 15 combinaciones' }).click();
      assert.equal(await ronda.locator('tr.elegida').count(), 1, 'marca la combinación que propone');
      assert.match(await ronda.innerText(), /con el peor golpe leve faltaría/i);
      assert.match(await ronda.innerText(), /10\.0 · ventas 25% más lentas/, 'dice cuál fue el peor golpe; no suma los tres');
      assert.match(await ronda.innerText(), /Sólo propongo lo que pasa la revisión para fondos\./);
      assert.match(await ronda.innerText(), /va primero la que aguanta los golpes leves, cada uno por separado .*: que con ninguno le falte dinero\./);
      assert.match(await ronda.innerText(), /al menos un paso entero de capital \(10\.0 MDP\) de faltante; quitarle menos no cuenta, y una a la que le falta más nunca le gana\./);
      const texto = await page.locator('#p2Pestana').innerText();
      assert.match(texto, /Esta propuesta todavía no pasa por el consejo/);
      assert.match(texto, /Cómo aguanto los golpes/);
      assert.doesNotMatch(await page.locator('body').innerText(), /aut[oó]n/i, 'el plan habla por sí mismo: no hay un «autón» aparte');
      assert.deepEqual(errores, []);
      await foto(page, 'ppp2-rondas');
      await ctx.close();
    });

    await caso('con una versión libre el plan corre su ronda sin pedir nada, y dice que si nadie se lo pide la corre solo', async () => {
      const w = regresada({ config: [['revision', 'lunes a viernes, tres veces al día']] });
      const ver = w.libro.getSheetByName('Versiones');
      ver.v[filaDe(ver, 'estado') - 1][4] = 'descartada';
      jugueteConCiclo(w.libro);
      const { page, ctx, posts } = await pagina(navegador, base, w, EDITOR, { hash: '#/plan/' + PLAN });
      await page.locator('.p2-voz').waitFor();
      assert.doesNotMatch(await page.locator('.p2-voz').innerText(), /no tengo una versión donde escribir/);
      // nadie ha instalado el latido: la página no promete nada «solo»
      assert.match(await page.locator('.p2-voz').innerText(), /Todavía no tengo latido \(nadie lo ha instalado, o lleva horas sin correr\): sólo lo hago cuando alguien me lo pide\./);
      assert.doesNotMatch(await page.locator('.p2-voz').innerText(), /lo hago solo en mi siguiente latido/);
      // con el latido corriendo (el servidor anota cada vez que late), sí
      w.propiedades.set('latido_t', String(Date.now()));
      await page.reload();
      await page.locator('.p2-voz').waitFor();
      assert.match(await page.locator('.p2-voz').innerText(), /Si nadie me lo pide, lo hago solo en mi siguiente latido\./);
      await page.getByRole('button', { name: /Correr mi ronda/ }).click();
      await page.getByText('Propuesta lista y probada: ahora le toca al consejo.').waitFor({ timeout: 15000 });
      assert.deepEqual(posts.map((b) => [b.tipo, b.usar]), [['ppp2-ronda', undefined], ['ppp2-estres', undefined]]);
      await page.getByText(/El consejo se reúne en mi revisión programada \(lunes a viernes, tres veces al día\) o cuando hablas conmigo en un chat con Claude\./).waitFor({ timeout: 15000 });
      await ctx.close();
    });

    await caso('cuando mover capital y arranque ya no mejora, el plan lo dice y pide lo que falta; quien sólo lee no ve botones', async () => {
      const w = regresada();
      const res = w.libro.getSheetByName('Resumen'), h2 = res.v[filaDe(res, 'v2.huella') - 1][1];
      w.libro.getSheetByName('Rondas').appendRow([1, '2026-01-15 11:00', 'El plan (servidor)', 2, h2, 'El consejo (CP-1) regresó la V2: aprueban 0 de 7', 'sin mejora', '', '', 'Ronda 1 del plan. Probé 15 combinaciones y ninguna es mejor que la que ya defiendo.', 15, '{"candidatos":[]}', '']);
      jugueteConCiclo(w.libro);
      const { page, ctx, posts } = await pagina(navegador, base, w, LECTOR, { hash: '#/plan/' + PLAN + '/rondas' });
      await page.locator('.p2-voz').waitFor();
      assert.match(await page.locator('.p2-voz .p2-dice').innerText(), /El consejo regresó mi V2 \(0 de 7 aprueban\) y, moviendo capital y arranque de obra, ya no encontré mejora\..*Cuando cambie la evidencia .* vuelvo a presentarme\./);
      const texto = await page.locator('#p2Pestana').innerText();
      assert.match(texto, /Lo que pido/);
      assert.match(texto, /Lo que pidió el consejo \(CP-1\)/);
      assert.match(texto, /Conseguir la escritura 1/);
      assert.match(texto, /Candados abiertos/);
      assert.match(texto, /sin mejora/);
      assert.equal(await page.getByRole('button', { name: /Correr mi ronda|Prestarme|Afinar|Probar mi V|Correr pruebas/ }).count(), 0);
      assert.equal(posts.length, 0);
      await sinDesborde(page, 'rondas · lector');
      await ctx.close();
    });

    await caso('una versión que no pasa la revisión nunca va al consejo: el plan busca una que pase y, si no la encuentra cerca, pide que alguien la arme', async () => {
      const w = regresada();
      const mod = w.libro.getSheetByName('Modelo');
      mod.v[filaDe(mod, 'capital') - 1][5] = 40;                 // con las reglas de juguete, con 40 de capital no pasa
      jugueteConCiclo(w.libro);
      let r = await pagina(navegador, base, w, EDITOR, { hash: '#/plan/' + PLAN });
      await r.page.locator('.p2-voz').waitFor();
      assert.match(await r.page.locator('.p2-voz .p2-dice').innerText(), /Mi V2 no pasa la revisión para fondos \(1 de 9 pruebas\)\. Me toca mover capital y arranque de obra para buscar una que sí pase\./);
      await r.ctx.close();
      const res = w.libro.getSheetByName('Resumen'), h2 = res.v[filaDe(res, 'v2.huella') - 1][1];
      w.libro.getSheetByName('Rondas').appendRow([1, '2026-01-15 11:00', 'El plan (servidor)', 2, h2, 'La V2 no pasa la revisión para fondos', 'sin mejora', '', '', 'Ronda 1 del plan. Probé 15 combinaciones y ninguna pasa la revisión para fondos.', 15, '{"candidatos":[]}', '']);
      jugueteConCiclo(w.libro);
      r = await pagina(navegador, base, w, EDITOR, { hash: '#/plan/' + PLAN });
      await r.page.locator('.p2-voz').waitFor();
      assert.match(await r.page.locator('.p2-voz .p2-dice').innerText(), /no encontré una que pase\. Necesito que alguien arme conmigo una propuesta que pase/);
      assert.equal(await r.page.getByRole('button', { name: /Correr mi ronda|Prestarme|Probar mi V/ }).count(), 0, 'ya no hay nada que el plan pueda hacer solo');
      await r.page.getByRole('link', { name: 'Ver lo que probé' }).waitFor();
      await r.ctx.close();
    });

    await caso('mientras una ronda trabaja en una versión, sus cifras están a medias: la página lo dice y no deja aprobarla; si la ronda murió, el siguiente cambio la restaura y avisa', async () => {
      const w = regresada();
      const mod = w.libro.getSheetByName('Modelo');
      w.ctx.diarioGuardar_({ plan_id: PLAN }, w.libro, 3, w.ctx.palancasFilas_(mod), 2, 'r-en-curso');
      mod.v[filaDe(mod, 'capital') - 1][6] = 999;
      let r = await pagina(navegador, base, w, ADMIN, { hash: '#/plan/' + PLAN });
      await r.page.locator('.p2-voz').waitFor();
      assert.match(await r.page.locator('.p2-voz').innerText(), /Estoy corriendo una ronda en este momento: las cifras de mi V3 están a medias unos minutos\./);
      await r.page.locator('.p2-vbtn[data-v="3"]').click();
      await r.page.getByText('En trabajo').first().waitFor();
      assert.equal(await r.page.locator('.p2-recibe [data-accion="aprobar"]').count(), 0, 'la versión en trabajo no se puede aprobar');
      assert.equal(await r.page.locator('.p2-tabla [data-accion="aprobar"][data-v="3"]').count(), 0);
      assert.equal(await r.page.locator('.p2-tabla [data-accion="aprobar"][data-v="2"]').count(), 1, 'las otras sí');
      await r.ctx.close();
      // la ronda murió hace una hora: Dirección quiere aprobar la V2; primero se restaura la V3 y se le avisa
      const j = JSON.parse(w.propiedades.get('j_' + PLAN)); j.t = Date.now() - 3600000; w.propiedades.set('j_' + PLAN, JSON.stringify(j));
      r = await pagina(navegador, base, w, ADMIN, { hash: '#/plan/' + PLAN });
      await r.page.locator('.p2-voz').waitFor();
      assert.match(await r.page.locator('.p2-voz').innerText(), /Una ronda mía se interrumpió y las cifras de mi V3 quedaron a medias/);
      await r.page.getByRole('button', { name: /Aprobar esta versión/ }).click();
      await r.page.getByRole('button', { name: 'Sí, aprobar' }).click();
      await r.page.getByText(/Una ronda mía había quedado a medias: ya dejé la versión como estaba y no hice tu cambio\./).waitFor();
      const ver = w.libro.getSheetByName('Versiones');
      assert.equal(ver.v[filaDe(ver, 'estado') - 1][3], 'propuesta', 'no aprobó sobre cifras a medias');
      assert.notEqual(mod.v[filaDe(mod, 'capital') - 1][6], 999, 'la V3 volvió a como estaba');
      await r.page.waitForFunction(() => !/se interrumpió/.test(document.querySelector('.p2-voz').textContent));
      await r.ctx.close();
    });

    await caso('en teléfono nada se desborda a lo ancho, tampoco con rondas, votos y la tabla de lo que probé abierta', async () => {
      const w = regresada();
      assert.equal(w.post({ k: EDITOR, tipo: 'ppp2-ronda', plan: PLAN, usar: 3 }).ok, true);
      assert.equal(w.post({ k: EDITOR, tipo: 'ppp2-estres', plan: PLAN, version: 3 }).ok, true);
      const { page, ctx, errores } = await pagina(navegador, base, w, EDITOR, { movil: true });
      await page.locator('a.p2-tarjeta').waitFor();
      await sinDesborde(page, 'vivero');
      await foto(page, 'ppp2-vivero-movil');
      for (const pest of ['versiones', 'preguntas', 'rondas', 'bitacora']) {
        await page.evaluate((h) => { location.hash = h; }, '#/plan/' + PLAN + '/' + pest);
        await page.locator('.p2-pestanas a[aria-current="page"]').waitFor();
        await page.waitForTimeout(150);
        await sinDesborde(page, 'plan · ' + pest);
        await foto(page, 'ppp2-movil-' + pest);
      }
      await page.evaluate((h) => { location.hash = h; }, '#/plan/' + PLAN + '/rondas');
      await page.getByRole('heading', { name: /Ronda 1 · propuse la V3/ }).waitFor();
      assert.ok(await page.locator('.p2-panel', { hasText: 'Sesión' }).count() >= 1, 'hay votos del consejo en pantalla');
      for (const s of await page.locator('#p2Pestana details summary').all()) await s.click();
      await page.waitForTimeout(150);
      assert.ok(await page.locator('#p2Pestana table.tarjetas tbody tr').count() >= 15, 'la tabla de lo que probé está abierta');
      await sinDesborde(page, 'plan · rondas con todo abierto');
      // en teléfono cada renglón de la tabla se lee como tarjeta: etiqueta y valor
      const etiqueta = await page.locator('#p2Pestana table.tarjetas tbody tr td').first().evaluate((td) => getComputedStyle(td, '::before').content);
      assert.match(etiqueta, /Capital/);
      await foto(page, 'ppp2-movil-rondas-abierto');
      assert.deepEqual(errores, []);
      await ctx.close();
    });

    /* ───────── segunda auditoría (12-nov-2026) ───────── */

    await caso('libro lento: el aviso se queda a la vista y el botón de la ronda vuelve a servir (antes se quedaba «corriendo» hasta recargar)', async () => {
      const w = regresada();
      const ver = w.libro.getSheetByName('Versiones');
      ver.v[filaDe(ver, 'estado') - 1][4] = 'descartada';
      jugueteConCiclo(w.libro);
      w.ctx.RONDA.MAX_MS = -1;                      // cada intento alcanza para una sola lectura
      const { page, ctx, posts } = await pagina(navegador, base, w, EDITOR, { hash: '#/plan/' + PLAN });
      await page.getByRole('button', { name: /Correr mi ronda/ }).click();
      const aviso = page.locator('#p2Toast');
      await page.getByText(/Mi libro va lento y no alcancé a probar todas las combinaciones\. No cambié nada y guardé lo que llevo/).waitFor({ timeout: 15000 });
      await page.waitForTimeout(5000);
      assert.equal(await aviso.isVisible(), true, 'el aviso de «tiempo» no se quita solo');
      const boton = page.getByRole('button', { name: /^\s*Correr mi ronda\s*$/ });
      await boton.waitFor();
      assert.equal(await boton.isEnabled(), true, 'el botón volvió a su estado');
      assert.equal(await page.getByText(/Corriendo mi ronda/).count(), 0);
      await boton.click();
      await page.waitForFunction(() => window.PPP2 && !window.PPP2.estado.ocupado);
      assert.equal(posts.filter((b) => b.tipo === 'ppp2-ronda').length, 2, 'se pudo volver a pedir');
      await aviso.click();
      assert.equal(await aviso.isVisible(), false, 'un toque cierra el aviso');
      // lo mismo con «Probar mi V…» cuando el servidor está ocupado con otra ronda
      const w2 = regresada({ ocupado: true });
      w2.libro.getSheetByName('Pruebas').getRange(14, 1, 1, 11).setValues([['', '', '', '', '', '', '', '', '', '', '']]);
      jugueteConCiclo(w2.libro);
      w2.cache.set('trabajando', PLAN);
      const r2 = await pagina(navegador, base, w2, EDITOR, { hash: '#/plan/' + PLAN });
      await r2.page.getByRole('button', { name: /Probar mi V2/ }).click();
      await r2.page.getByText(/Hay un plan corriendo una ronda o unas pruebas/).waitFor({ timeout: 40000 });
      await r2.page.getByRole('button', { name: /^\s*Probar mi V2\s*$/ }).waitFor();
      assert.equal(await r2.page.getByRole('button', { name: /^\s*Probar mi V2\s*$/ }).isEnabled(), true);
      await ctx.close(); await r2.ctx.close();
    });

    await caso('el vivero no enseña como «lo que recibe el dueño» las cifras de una versión que una ronda tiene a medias', async () => {
      const w = regresada();
      const mod = w.libro.getSheetByName('Modelo');
      w.ctx.diarioGuardar_({ plan_id: PLAN }, w.libro, 2, w.ctx.palancasFilas_(mod), 2, 'r-en-su-lugar', 1);
      mod.v[filaDe(mod, 'capital') - 1][5] = 999; jugueteConCiclo(w.libro);
      const { page, ctx } = await pagina(navegador, base, w, LECTOR);
      await page.locator('a.p2-tarjeta').waitFor();
      const tarjeta = await page.locator('a.p2-tarjeta').innerText();
      assert.match(tarjeta, /Estoy corriendo una ronda en esta versión: sus cifras están a medias\./);
      assert.match(tarjeta, /en trabajo/i);
      assert.doesNotMatch(tarjeta, /\d+\.\d MDP\s+en \d+ meses/, 'no enseña una cifra de prueba como lo que recibe el dueño');
      await ctx.close();
    });

    await caso('la voz no afirma lo que no es cierto en los bordes: sesión sin evidencia, base aprobada sin explorar, árbol sin candados, pausa', async () => {
      // (a) la sesión regresó la versión, ya no hay mejora y los votos no anotaron la evidencia: se vuelve a presentar, y lo dice
      let w = regresada();
      const res = (x) => x.libro.getSheetByName('Resumen'), lee = (x, c) => res(x).v[filaDe(res(x), c) - 1][1];
      w.libro.getSheetByName('Rondas').appendRow([1, '2026-01-15 11:00', 'El plan (servidor)', 2, lee(w, 'v2.huella'), 'm', 'sin mejora', '', '', 'Ronda 1 del plan.', 15, '{"candidatos":[]}', '']);
      const con = w.libro.getSheetByName('Consejo');
      for (let i = 4; i < con.v.length; i++) if (con.v[i][1]) con.v[i][8] = '';
      jugueteConCiclo(w.libro);
      assert.equal(lee(w, 'plan.paso'), 'consejo');
      let r = await pagina(navegador, base, w, LECTOR, { hash: '#/plan/' + PLAN });
      await r.page.locator('.p2-voz').waitFor();
      assert.match(await r.page.locator('.p2-voz .p2-dice').innerText(), /La sesión CP-1 del consejo no anotó la evidencia que había ese día, así que no sé contra qué juzgó mi V2\. Me toca presentarla otra vez\./);
      await r.ctx.close();
      // (b) la base pasa y el consejo la aprobó 7 de 7 sin que el plan hubiera explorado: sigue en explorar, pero no «la regresó»
      w = mundo({ alFlush: (i, libro) => jugueteConCiclo(libro) });
      const ver = w.libro.getSheetByName('Versiones'), mod = w.libro.getSheetByName('Modelo');
      ver.v[filaDe(ver, 'estado') - 1][3] = 'alterna';
      mod.v[filaDe(mod, 'obra_inicio') - 1][4] = 12; delete mod.f[filaDe(mod, 'obra_inicio') + ',5'];
      jugueteConCiclo(w.libro);
      const h1 = lee(w, 'v1.huella');
      w.libro.getSheetByName('Pruebas').getRange(14, 1, 1, 11).setValues([['Base de la versión 1', '(sin cambios)', 1, 0, 1, 1, 37, 'V1', '2026-01-15 10:00', 'Pruebas', h1]]);
      for (let j = 0; j < 7; j++) w.libro.getSheetByName('Consejo').appendRow(['2026-01-15', 'CP-1', 'V1', 'Juez ' + (j + 1), 'aprueba', 'Razón', '', h1, lee(w, 'plan.evidencia')]);
      jugueteConCiclo(w.libro);
      assert.deepEqual([lee(w, 'plan.paso'), lee(w, 'plan.defiende'), lee(w, 'plan.consejo_aprobada')], ['explorar', 1, true]);
      r = await pagina(navegador, base, w, LECTOR, { hash: '#/plan/' + PLAN });
      await r.page.locator('.p2-voz').waitFor();
      const dice = await r.page.locator('.p2-voz .p2-dice').innerText();
      assert.match(dice, /Mi V1 es la base\. Antes de probarla y defenderla me toca mover capital y arranque de obra/);
      assert.doesNotMatch(dice, /regresó/);
      await r.ctx.close();
      // (c) un árbol sin candados anotados no se queda en «me falta cerrar 0 candados»
      w = regresada();
      const c2 = w.libro.getSheetByName('Consejo');
      for (let i = 4; i < c2.v.length; i++) if (c2.v[i][1]) c2.v[i][4] = 'aprueba';
      const v2 = w.libro.getSheetByName('Versiones');
      v2.v[filaDe(v2, 'estado') - 1][3] = 'vigente';
      const cand = w.libro.getSheetByName('Candados');
      for (let i = 4; i < cand.v.length; i++) cand.v[i] = cand.v[i].map(() => '');
      jugueteConCiclo(w.libro);
      assert.equal(lee(w, 'plan.paso'), 'candados');
      r = await pagina(navegador, base, w, LECTOR, { hash: '#/plan/' + PLAN });
      await r.page.locator('.p2-voz').waitFor();
      assert.match(await r.page.locator('.p2-voz .p2-dice').innerText(), /Para florecer necesito mis candados .* y todavía no tengo ninguno anotado/);
      assert.doesNotMatch(await r.page.locator('.p2-voz .p2-dice').innerText(), /cerrar 0 candados/);
      await r.ctx.close();
      // (d) con la pausa puesta no promete restaurar «en el siguiente cambio»
      w = regresada({ pausa: 'sí' });
      const m3 = w.libro.getSheetByName('Modelo');
      w.ctx.diarioGuardar_({ plan_id: PLAN }, w.libro, 3, w.ctx.palancasFilas_(m3), 2, 'r-muerta', 1);
      const j = JSON.parse(w.propiedades.get('j_' + PLAN)); j.t = Date.now() - 3600000; w.propiedades.set('j_' + PLAN, JSON.stringify(j));
      r = await pagina(navegador, base, w, EDITOR, { hash: '#/plan/' + PLAN });
      await r.page.locator('.p2-voz').waitFor();
      const voz = await r.page.locator('.p2-voz').innerText();
      assert.match(voz, /Con la pausa puesta no puedo dejarla como estaba: lo hago en el primer cambio después de que se quite la pausa\./);
      assert.doesNotMatch(voz, /en mi siguiente latido/);
      await r.ctx.close();
    });

    await caso('los votos se leen en la página como los lee el libro, y un juez repetido se avisa', async () => {
      const w = mundo({ alFlush: (i, libro) => jugueteConCiclo(libro) });
      jugueteConCiclo(w.libro);
      const res = w.libro.getSheetByName('Resumen'), lee = (c) => res.v[filaDe(res, c) - 1][1], h2 = lee('v2.huella');
      w.libro.getSheetByName('Pruebas').getRange(14, 1, 1, 11).setValues([['Base de la versión 2', '(sin cambios)', 1, 0, 1, 1, 37, 'V2', '2026-01-15 10:00', 'Pruebas', h2]]);
      const votos = ['Aprueba', 'aprueba ', ' APRUEBA', 'aprueba', 'Aprueba', 'regresa', 'Regresa'];
      votos.forEach((v, j) => w.libro.getSheetByName('Consejo').appendRow(['2026-01-15', j % 2 ? 'CP-1 ' : 'cp-1', 'V2', 'Juez ' + (j + 1), v, 'Razón', '', h2, lee('plan.evidencia')]));
      jugueteConCiclo(w.libro);
      assert.deepEqual([lee('plan.paso'), lee('plan.consejo_aprueban'), lee('plan.consejo_votaron')], ['direccion', 5, 7], 'el libro lee 5 de 7');
      let r = await pagina(navegador, base, w, LECTOR, { hash: '#/plan/' + PLAN + '/rondas' });
      await r.page.locator('.p2-voz').waitFor();
      assert.match(await r.page.locator('.p2-voz .p2-dice').innerText(), /El consejo aprobó mi V2 \(5 de 7 aprueban\)/);
      const panel = r.page.locator('.p2-panel', { hasText: 'Sesión' }).first();
      assert.match(await panel.locator('h3').innerText(), /5 de 7 aprueban/, 'el panel cuenta lo mismo que el libro (antes decía 0 de 7)');
      assert.equal(await r.page.locator('.p2-panel h3', { hasText: 'Sesión' }).count(), 1, 'es una sola sesión aunque el nombre venga con mayúsculas o espacios distintos');
      assert.doesNotMatch(await panel.innerText(), /Un juez aparece más de una vez/);
      await r.ctx.close();
      // siete renglones pero un juez repetido: el libro cuenta renglones; la página lo avisa
      const con = w.libro.getSheetByName('Consejo');
      con.v[con.getLastRow() - 1][3] = 'Juez 1';
      r = await pagina(navegador, base, w, LECTOR, { hash: '#/plan/' + PLAN + '/rondas' });
      await r.page.locator('.p2-voz').waitFor();
      assert.match(await r.page.locator('.p2-panel', { hasText: 'Sesión' }).first().innerText(), /Un juez aparece más de una vez\. Mi libro cuenta renglones, no jueces: esta sesión hay que rehacerla con los siete, uno por juez\./);
      await r.ctx.close();
    });

    await caso('quien sólo lee no ve los botones del plan, y nada de lo que viene del libro se interpreta como HTML', async () => {
      // un lector frente a un plan sin lugar (con versiones que se podrían prestar) y frente a uno que toca probar
      let w = regresada();
      let r = await pagina(navegador, base, w, LECTOR, { hash: '#/plan/' + PLAN });
      await r.page.locator('.p2-voz').waitFor();
      assert.match(await r.page.locator('.p2-voz .p2-dice').innerText(), /no tengo una versión donde escribir/);
      assert.equal(await r.page.locator('[data-accion="ronda"], [data-accion="probar"], [data-accion="estres"], [data-accion="aprobar"], [data-accion="estado-version"]').count(), 0);
      await r.ctx.close();
      w = mundo({ alFlush: (i, libro) => jugueteConCiclo(libro) });
      jugueteConCiclo(w.libro);
      r = await pagina(navegador, base, w, LECTOR, { hash: '#/plan/' + PLAN });
      await r.page.locator('.p2-voz').waitFor();
      assert.match(await r.page.locator('.p2-voz .p2-dice').innerText(), /Me toca probarla contra los golpes/);
      assert.equal(await r.page.locator('[data-accion="probar"], [data-accion="ronda"]').count(), 0);
      await r.ctx.close();
      // y frente a uno que tiene dónde escribir y le toca explorar: tampoco ve «Correr mi ronda»
      w = regresada();
      const libre = w.libro.getSheetByName('Versiones');
      libre.v[filaDe(libre, 'estado') - 1][4] = 'descartada';
      jugueteConCiclo(w.libro);
      r = await pagina(navegador, base, w, LECTOR, { hash: '#/plan/' + PLAN });
      await r.page.locator('.p2-voz').waitFor();
      assert.doesNotMatch(await r.page.locator('.p2-voz .p2-dice').innerText(), /no tengo una versión donde escribir/);
      assert.equal(await r.page.locator('[data-accion="ronda"]').count(), 0);
      await r.ctx.close();
      r = await pagina(navegador, base, w, EDITOR, { hash: '#/plan/' + PLAN });
      await r.page.locator('.p2-voz').waitFor();
      assert.equal(await r.page.locator('[data-accion="ronda"]').count(), 1, 'quien edita sí lo ve');
      await r.ctx.close();
      // texto hostil en todo lo que el libro le da a la voz, a las rondas y a la tabla de versiones
      const MALO = '<img src=x onerror="window.__xss=1"><b>negrita</b>';
      w = regresada();
      const ver = w.libro.getSheetByName('Versiones'), resumen = w.libro.getSheetByName('Resumen');
      for (const campo of ['nombre', 'que_cambia', 'propuesta_por']) for (const k of [1, 2, 3]) ver.v[filaDe(ver, campo) - 1][1 + k] = MALO + campo + k;
      for (const clave of ['plan.nombre', 'plan.para_crecer', 'v2.obra_inicio', 'v2.fin_obra', 'v2.mes_saldos', 'v3.obra_inicio', 'v2.rv_resultado']) { const f = filaDe(resumen, clave); if (f) resumen.v[f - 1][1] = clave === 'v2.rv_resultado' ? 'Pasa ' + MALO : MALO; }
      const con = w.libro.getSheetByName('Consejo');
      for (let i = 4; i < con.v.length; i++) if (con.v[i][1]) { con.v[i][3] = MALO; con.v[i][5] = MALO; con.v[i][6] = MALO; }
      const h2 = resumen.v[filaDe(resumen, 'v2.huella') - 1][1];
      w.libro.getSheetByName('Rondas').appendRow([1, MALO, MALO, 2, h2, MALO, 'propuesta', 3, 'hx', MALO, 15, JSON.stringify({ paso_capital: 10, candidatos: [{ p: { capital: 60, obra_inicio: MALO }, rv: MALO, f: 0, d: 58, m: 37, base: true, golpes: { lentas: { r: 3, f: 0, g: 1 } } }], antes: { version: 3, nombre: MALO, estado: MALO, propuesta_por: MALO, celdas: [['capital', '', MALO]] } }), '']);
      // el juguete vuelve a copiar la ficha al Resumen: la voz y los botones de préstamo reciben el texto hostil
      for (const hash of ['', '/rondas', '/versiones', '/bitacora']) {
        r = await pagina(navegador, base, w, EDITOR, { hash: '#/plan/' + PLAN + hash });
        await r.page.locator('.p2-voz').waitFor();
        for (const sum of await r.page.locator('#p2Pestana details summary').all()) await sum.click();
        await r.page.waitForTimeout(100);
        assert.equal(await r.page.evaluate(() => window.__xss), undefined, 'no se ejecutó nada (' + hash + ')');
        assert.equal(await r.page.locator('#ppp2 img[src="x"]').count(), 0, 'no hay etiquetas inyectadas (' + hash + ')');
        assert.equal(await r.page.locator('#ppp2 b', { hasText: /^negrita$/ }).count(), 0, 'ni negritas del libro (' + hash + ')');
        assert.deepEqual(r.errores, []);
        await r.ctx.close();
      }
      // la voz misma: el nombre de una sesión incompleta y el resultado de una revisión que no pasa llegan a lo que dice el plan
      const hostil = async (prepara, patron) => {
        const x = regresada();
        prepara(x);
        jugueteConCiclo(x.libro);
        const y = await pagina(navegador, base, x, LECTOR, { hash: '#/plan/' + PLAN });
        await y.page.locator('.p2-voz').waitFor();
        assert.match(await y.page.locator('.p2-voz .p2-dice').innerText(), patron);
        assert.equal(await y.page.evaluate(() => window.__xss), undefined);
        assert.equal(await y.page.locator('#ppp2 img[src="x"]').count(), 0, 'la voz no interpreta HTML');
        assert.equal(await y.page.locator('.p2-voz b', { hasText: /^negrita$/ }).count(), 0);
        await y.ctx.close();
      };
      await hostil((x) => {                      // sesión incompleta con nombre hostil: «La sesión <…> del consejo…»
        const c = x.libro.getSheetByName('Consejo');
        for (let i = 4; i < c.v.length; i++) if (c.v[i][1]) { if (i > 7) c.v[i] = c.v[i].map(() => ''); else c.v[i][1] = MALO; }
      }, /La sesión <img src=x onerror="window\.__xss=1"><b>negrita<\/b> del consejo sobre mi V2 quedó incompleta/);
    });

    await caso('la página publicada no lleva datos de planes reales', async () => {
      for (const f of ['ppp2.html', 'ppp2.js', 'ppp2.css']) {
        const t = fs.readFileSync(path.join(RAIZ, f), 'utf8');
        assert.doesNotMatch(t, /Mor[eé]o|Avermont|Morelos|@aurumarquitectos/i, f);
      }
    });
  } finally {
    await navegador.close();
    s.close();
  }
  if (fallos) { console.error(fallos + ' recorrido(s) fallaron'); process.exit(1); }
  console.log('PPP 2 · recorridos del navegador en verde');
})();
