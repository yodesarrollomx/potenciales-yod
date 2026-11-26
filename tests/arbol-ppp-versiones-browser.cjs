'use strict';
/* Pantalla y servidor reales sobre un libro y una sesión de prueba. Todo el tráfico queda en Playwright. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const { entorno, RAIZ, Servidor } = require('./arbol-ppp-servidor-mundo.cjs');
const { EDITOR } = require('./ppp2-mundo.cjs');
const URL_LOCAL = 'http://arbol.test';
const MAESTRO = entorno({}, 30).w;
const PROYECTO = 'Predio de prueba';
const FICHA = 'https://example.com/comparativo#range=B3:B6';
const VERSION = 'Prueba de costo';

function copia(nombre, version, id) {
  const r = MAESTRO.post({ tipo: 'arbol-guarda', k: EDITOR, request_id: id, nombre, version,
    columna: [{ id: 'T-01', valor: 1500 }, { id: 'E-04', valor: 1000 }, { id: 'C-01', valor: 11000 }, { id: 'I-07', valor: 'Ficha de prueba · ' + FICHA }] });
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.columna;
}
const trae = (columna) => JSON.parse(JSON.stringify(MAESTRO.get({ recurso: 'arbol-columna', k: EDITOR, columna })));
const costo = (r) => r.valores.find((x) => x.id === 'C-01').valor;
const BASES = ['Alternativa A', 'Alternativa B', 'Alternativa C'].map((v, i) => copia(PROYECTO, v, 'base-' + i));
copia('Otro predio', 'Alternativa A', 'otro');
const ANTES = BASES.map(trae);

async function intercepta(route) {
  const u = new URL(route.request().url());
  if (u.origin === URL_LOCAL) {
    if (u.pathname === '/portero.js') return route.fulfill({ contentType: 'application/javascript', body: '' });
    if (!/^\/arbol-ppp\/(?:conexion\/)?[\w.-]+\.(?:html|js|css)$/.test(u.pathname)) return route.abort();
    const tipo = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' }[path.extname(u.pathname)];
    return route.fulfill({ contentType: tipo + '; charset=utf-8', body: await fs.readFile(path.join(RAIZ, u.pathname)) });
  }
  if (u.origin + u.pathname !== Servidor.ENDPOINT) return route.abort();
  const r = route.request().method() === 'POST' ? MAESTRO.post(route.request().postDataJSON()) : MAESTRO.get(Object.fromEntries(u.searchParams));
  return route.fulfill({ json: r, headers: { 'access-control-allow-origin': '*' } });
}
const boton = (p, nombre) => p.getByRole('button', { name: nombre, exact: true });
const fila = (p, col) => p.locator('[data-as="abre"][data-col="' + col + '"]');
const estado = (p, mensaje) => p.locator('.as-msg').filter({ hasText: mensaje }).waitFor();
async function opciones(p, columnas) {
  await fila(p, columnas.at(-1)).waitFor();
  assert.deepEqual(await p.locator('[data-as="abre"]').evaluateAll((bs) => bs.map((b) => b.dataset.col)), columnas);
}
async function abre(p, col) {
  await fila(p, col).click();
  await fila(p, col).click();
  await estado(p, 'columna ' + col);
}

async function pruebaInterfaz(p) {
  // El portal reserva espacio para su menú lateral en escritorio.
  const marco = await p.addStyleTag({content: '@media(min-width:901px){body{margin-left:clamp(240px,23.4vw,268px)}}'});
  const tarjetas = p.locator('[data-cards] button');
  const lista = boton(p, 'Ver en lista');
  for (const [width,height] of [[321,701],[430,933],[768,1024],[901,821],[1145,844],[1440,901]]) {
    await p.setViewportSize({width,height});
    await p.locator('[data-b3="abre"]').waitFor();
    assert.equal(await tarjetas.count(), 8);
    for (const item of [...await tarjetas.all(), ...await p.locator('[data-herr] button,.ppp-acc button').all()]) {
      await item.scrollIntoViewIfNeeded();
      const recibe = await item.evaluate(b => [0.12,0.5,0.88].every(f => {
        const r=b.getBoundingClientRect();
        return b.contains(document.elementFromPoint(r.left+r.width*f,r.top+r.height/2));
      }));
      assert.ok(recibe, width + ' px, control tapado: ' + await item.innerText());
    }
    assert.equal(await p.locator('[data-rotulo]').isVisible(), true);
    const terreno = tarjetas.first();
    await terreno.focus(); await terreno.press('Enter');
    const menu = p.getByRole('dialog');
    await menu.waitFor();
    assert.ok(await menu.evaluate(d => d.contains(document.activeElement)));
    if (width <= 760) assert.equal(await p.locator('[data-panel]').isVisible(), false);
    await p.keyboard.press('Escape');
    await menu.waitFor({state:'detached'});
    assert.ok(await terreno.evaluate(b => b === document.activeElement));
  }
  await p.locator('[data-b3="max"]').click();
  await p.locator('html[data-vp-max]').waitFor();
  for (const id of ['abre','cierra']) await p.locator('[data-b3="'+id+'"]').click({trial:true});
  await p.locator('[data-b3="max"]').click();
  await tarjetas.first().click();
  await p.getByRole('dialog').locator('[data-ir]').first().click();
  for (const tab of ['Cambiar','Conexiones','Fuente']) {
    await p.getByRole('tab',{name:tab,exact:true}).click();
    await lista.click();
    const panel = p.locator('[data-panel]');
    await panel.locator('.lista button').first().waitFor();
    const total = Number((await panel.locator('h2').textContent()).match(/(\d+) datos/i)[1]);
    assert.ok(total > 0);
    assert.equal(await panel.locator('.lista button:visible').count(), total);
    await p.getByRole('tablist').waitFor({state:'hidden'});
    await panel.locator('.lista button').first().click();
  }
  await p.locator('[data-cards] button.conf').click();
  const pendientes = p.getByRole('dialog');
  assert.equal(await pendientes.locator('[data-ir]').count(), Number(await p.locator('.tarj.conf strong').innerText()));
  await pendientes.getByRole('button',{name:'Cerrar',exact:true}).click();
  await p.keyboard.press('Escape');
  await p.locator('[data-panel]').waitFor({state:'hidden'});
  await marco.evaluate(s => s.remove());
}

async function prueba() {
  const browser = await chromium.launch(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {});
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 930 } });
    await ctx.addInitScript((k) => localStorage.setItem('pyod_clave_v1', k), EDITOR);
    await ctx.route('**/*', intercepta);
    const errores = [];
    const nuevaPagina = async (hash = '') => {
      const p = await ctx.newPage(); p.on('pageerror', (e) => errores.push(e.message));
      await p.goto(URL_LOCAL + '/arbol-ppp/arbol.html' + hash);
      return p;
    };
    let p = await nuevaPagina('#abrir=' + BASES[0]);
    await fila(p, BASES[0]).or(boton(p, 'Versiones del proyecto')).first().waitFor();
    if (await fila(p, BASES[0]).count()) await fila(p, BASES[0]).click();
    await estado(p, 'columna L');
    assert.equal(BASES[0], 'L');
    await pruebaInterfaz(p);
    const claves = Servidor.CLAVES;
    const tamLocal = () => p.evaluate((k) => JSON.parse(localStorage.getItem(k)).plan.valores['T-01'].valor, claves.plan);
    assert.equal(await tamLocal(), 1500);
    await p.evaluate(({ plan, origen }) => {
      if (JSON.parse(localStorage.getItem(origen)).columna !== 'L') throw new Error('Se esperaba origen L');
      const local = JSON.parse(localStorage.getItem(plan));
      local.plan.valores = { 'T-01': { estado: 'confirmado', valor: 7350, fuente: 'dato de muestra' } };
      localStorage.setItem(plan, JSON.stringify(local));
    }, claves);
    await p.close();
    p = await nuevaPagina('#abrir=L');
    await fila(p, 'L').or(p.locator('.as-msg').filter({ hasText: 'Abrí «' })).first().waitFor();
    assert.equal(await tamLocal(), 7350, 'La liga debe conservar la edición local hasta confirmar');
    assert.match(await fila(p, 'L').innerText(), /Toca otra vez para abrir/);
    await fila(p, 'L').click();
    await estado(p, 'columna L');
    assert.equal(await tamLocal(), 1500);
    await p.close();
    p = await nuevaPagina('#abrir=L');
    await estado(p, 'Abrí «');
    await boton(p, 'Versiones del proyecto').click();
    await opciones(p, BASES);
    await boton(p, 'Agregar versión').click();
    await p.getByLabel('Nombre de la nueva versión').fill(VERSION);
    await boton(p, 'Crear versión').click();
    await estado(p, 'Creé «' + VERSION);
    const nueva = MAESTRO.get({ recurso: 'arbol-columnas', k: EDITOR }).columnas.find((c) => c.version === VERSION).columna;
    const columnas = [...BASES, nueva];
    await opciones(p, columnas);
    assert.equal(await fila(p, nueva).getAttribute('aria-current'), 'true');
    assert.equal(costo(trae(nueva)), 11000);
    await boton(p, 'Cerrar').click();
    await p.locator('.tarj[data-t="Costo y ganancia"]').click();
    await p.locator('.vp-menu button[data-ir="C-01"]').click();
    const campo = p.locator('[data-edit="C-01"] input[data-k="campo"]');
    await campo.fill('11100');
    await campo.press('Enter');
    await boton(p, 'Guardar en el libro').click();
    await p.locator('[data-as="sobre"]').click();
    await p.locator('[data-as="sobre"]').click();
    await estado(p, 'Guardado como Borrador');
    assert.equal(costo(trae(nueva)), 11100);
    assert.deepEqual(BASES.map(trae), ANTES);
    await p.close();
    p = await nuevaPagina();
    await p.setViewportSize({ width: 390, height: 844 });
    await boton(p, 'Versiones del proyecto').click();
    await opciones(p, columnas);
    await abre(p, BASES[1]);
    assert.equal(await p.locator('[data-panel]').isVisible(), false);
    const acciones = await p.locator('.as-fila .as-btn').evaluateAll((bs) => bs.map(b => b.offsetTop));
    assert.equal(new Set(acciones).size, 1, 'Las acciones del proyecto caben en una fila');
    await boton(p, 'Ver en lista').click();
    assert.equal(await p.locator('[data-panel]').isVisible(), true);
    await boton(p, 'Cerrar el panel').click();
    assert.equal(await p.locator('[data-panel]').isVisible(), false);
    await boton(p, 'Versiones del proyecto').click();
    await abre(p, nueva);
    await boton(p, 'Versiones del proyecto').click();
    await opciones(p, columnas);
    const detalle = fila(p, nueva).locator('..').locator('.as-detalle');
    assert.equal(await detalle.locator('a').isVisible(), false);
    await detalle.locator('summary').click();
    const ficha = detalle.getByRole('link');
    assert.equal(await ficha.getAttribute('href'), FICHA);
    // Comprueba los controles que se pueden tocar después de desplazarse por la lista.
    for (const control of [...await p.locator('.as-panel [data-as="abre"]').all(), ficha]) {
      await control.scrollIntoViewIfNeeded();
      const caja = await control.boundingBox();
      assert.ok(caja && caja.width && caja.height, 'El control ocupa espacio visible');
      for (const fraccion of [0.1, 0.5, 0.9]) {
        await control.click({ trial: true, position: { x: caja.width * fraccion, y: caja.height / 2 } });
      }
    }
    assert.deepEqual(errores, []);
    console.log('Árbol PPP: cuatro versiones, edición aislada, reapertura y fuente accesible a 390 px.');
  } finally { await browser.close(); }
}
prueba().catch((e) => { console.error(e); process.exitCode = 1; });
