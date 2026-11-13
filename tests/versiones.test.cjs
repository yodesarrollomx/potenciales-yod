'use strict';
// Pruebas de scripts/versiones.cjs: el reescritor de ?v= (unitarias, sobre strings) y la CLI
// (sobre repos sintéticos en una carpeta temporal). La última prueba corre --check sobre ESTE repo:
// si alguien teclea una etiqueta ?v= a mano en un HTML, falla aquí y en el workflow.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const RAIZ = path.resolve(__dirname, '..');
const SCRIPT = path.join(RAIZ, 'scripts', 'versiones.cjs');
const { cargarVersiones, ponerVersion, clasificar, buscarEtiquetas, procesarHtml, listarHtml, ejecutar } = require(SCRIPT);

const V = { propia: 'P1', marco: 'M1' };
const MARCO = 'https://yodesarrollomx.github.io/yod-portal/';

/* ───────────────────────────── ponerVersion ───────────────────────────── */

test('ponerVersion agrega, reemplaza y conserva el resto de la URL', () => {
  const casos = [
    ['ppp-ui.js', 'ppp-ui.js?v=P1'], // sin ?v=
    ['ppp-ui.js?v=viejo', 'ppp-ui.js?v=P1'], // con ?v=
    ['ppp-ui.js?v=', 'ppp-ui.js?v=P1'], // ?v= vacío
    ['ppp-ui.js?', 'ppp-ui.js?v=P1'], // ? sin parámetros
    ['x.js?a=1', 'x.js?a=1&v=P1'], // otro parámetro, sin v
    ['x.js?v=1&a=2', 'x.js?v=P1&a=2'], // & extra después
    ['x.js?a=1&v=2&b=3', 'x.js?a=1&v=P1&b=3'], // & extra a ambos lados
    ['x.js?a=1&amp;v=2', 'x.js?a=1&amp;v=P1'], // & escrito como entidad HTML
    ['x.js?a=1&amp;b=2', 'x.js?a=1&amp;b=2&amp;v=P1'], // agrega con el mismo estilo de separador
    ['x.js?rev=3', 'x.js?rev=3&v=P1'], // «rev» no es «v»
    ['x.js?v=1&v=2', 'x.js?v=P1'], // v repetida: queda una sola
    ['x.js#ancla', 'x.js?v=P1#ancla'], // fragmento
    ['x.js?v=1#ancla', 'x.js?v=P1#ancla'],
    ['../../ppp-ui.js?v=1', '../../ppp-ui.js?v=P1'],
    [MARCO + 'os/shell.css', MARCO + 'os/shell.css?v=P1'],
  ];
  for (const [entrada, esperado] of casos) {
    const salida = ponerVersion(entrada, 'P1');
    assert.equal(salida, esperado, entrada);
    assert.equal(ponerVersion(salida, 'P1'), salida, 'idempotente: ' + entrada);
  }
});

/* ────────────────────────────── clasificar ────────────────────────────── */

test('clasificar: local .js/.css/.mjs es propia, yod-portal es marco, lo demás no se toca', () => {
  const casos = [
    ['portero.js', 'propia'],
    ['portero.js?v=relevo9', 'propia'],
    ['./ppp-ui.css?v=1', 'propia'],
    ['../../ppp-ui.js', 'propia'],
    ['sub/carpeta/modelos.js#a', 'propia'],
    ['modulo.mjs', 'propia'],
    [MARCO + 'os/shell.js?v=audit-20260930', 'marco'],
    [MARCO + 'os/shell.css', 'marco'],
    [MARCO + 'os/yod-acceso.js?v=1', 'marco'],
    // CDN y terceros: intactos
    ['https://fonts.googleapis.com/css2?family=Manrope:wght@400', null],
    ['https://fonts.gstatic.com/', null],
    ['https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.24.0/dist/tabler-icons.min.css', null],
    ['https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', null],
    ['https://accounts.google.com/gsi/client', null],
    ['//cdn.ejemplo.com/x.js', null],
    ['data:text/javascript,1', null],
    // el prefijo del marco exige la carpeta completa de yod-portal
    ['https://yodesarrollomx.github.io/yod-portal-otro/x.js', null],
    ['https://yodesarrollomx.github.io/otro-tablero/portero.js', null],
    // locales que no son .js/.css/.mjs
    ['datos.json', null],
    ['pagina.html', null],
    ['img/logo.png', null],
    ['', null],
  ];
  for (const [destino, familia] of casos) assert.equal(clasificar(destino), familia, destino);
});

/* ───────────────────────────── procesarHtml ───────────────────────────── */

const EJEMPLO = [
  '<!doctype html>',
  '<html><head>',
  '<script src="' + MARCO + 'os/yod-acceso.js?v=1"></script>',
  '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
  '<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600&display=swap" rel="stylesheet">',
  '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.24.0/dist/tabler-icons.min.css">',
  '<link rel="stylesheet" href="' + MARCO + 'os/shell.css">',
  '<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4Nx" crossorigin="">',
  '<link rel="stylesheet" href="ppp-ui.css?v=20261001-5">',
  '</head><body>',
  '<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQ" crossorigin=""></script>',
  '<script src="https://accounts.google.com/gsi/client" async defer></script>',
  '<script src="ppp-catalog.js?v=20261019-2"></script>',
  '<script src="portero.js?v=relevo9" data-gate="suave"></script>',
  '<script src="' + MARCO + 'os/shell.js?v=audit-20260930"></script>',
  '</body></html>',
].join('\n');

test('procesarHtml corrige propias y marco, deja el CDN intacto y es idempotente', () => {
  // Sólo cambian estos seis fragmentos; todo lo demás debe quedar byte a byte igual.
  const esperado = EJEMPLO
    .replace(MARCO + 'os/yod-acceso.js?v=1', MARCO + 'os/yod-acceso.js?v=M1')
    .replace(MARCO + 'os/shell.css"', MARCO + 'os/shell.css?v=M1"')
    .replace('ppp-ui.css?v=20261001-5', 'ppp-ui.css?v=P1')
    .replace('ppp-catalog.js?v=20261019-2', 'ppp-catalog.js?v=P1')
    .replace('portero.js?v=relevo9', 'portero.js?v=P1')
    .replace(MARCO + 'os/shell.js?v=audit-20260930', MARCO + 'os/shell.js?v=M1');
  const primera = procesarHtml(EJEMPLO, V);
  assert.equal(primera.salida, esperado);
  assert.deepEqual(
    primera.hallazgos.filter(h => !h.ok).map(h => h.linea + ' ' + h.familia),
    ['3 marco', '7 marco', '9 propia', '13 propia', '14 propia', '15 marco'],
  );
  assert.equal(primera.hallazgos.length, 6, 'ninguna etiqueta de CDN debe contarse');

  const segunda = procesarHtml(esperado, V);
  assert.equal(segunda.salida, esperado);
  assert.ok(segunda.hallazgos.every(h => h.ok));
});

test('procesarHtml conserva comillas, mayúsculas, espacios, saltos y atributos', () => {
  const html = [
    "<script   src='ppp-ui.js?v=1'   defer  data-x=\"1\"></script>",
    '<SCRIPT SRC=ppp-stages.js?v=2 type=module></SCRIPT>',
    '<link\n  rel="stylesheet"\n  href="ppp-intake.css">',
    '<link rel="alternate stylesheet" title="x" href="tema.css?v=3" media="print">',
    '<link rel="stylesheet" href="  ppp-home.css  ">',
    '<script src="modelos.js?v=1&amp;x=2#a"></script>',
  ].join('\n');
  const esperado = [
    "<script   src='ppp-ui.js?v=P1'   defer  data-x=\"1\"></script>",
    '<SCRIPT SRC=ppp-stages.js?v=P1 type=module></SCRIPT>',
    '<link\n  rel="stylesheet"\n  href="ppp-intake.css?v=P1">',
    '<link rel="alternate stylesheet" title="x" href="tema.css?v=P1" media="print">',
    '<link rel="stylesheet" href="  ppp-home.css?v=P1  ">',
    '<script src="modelos.js?v=P1&amp;x=2#a"></script>',
  ].join('\n');
  const { salida, hallazgos } = procesarHtml(html, V);
  assert.equal(salida, esperado);
  assert.equal(hallazgos[2].linea, 3, 'la línea es la donde empieza la etiqueta');
  assert.equal(hallazgos[2].etiqueta, '<link rel="stylesheet" href="ppp-intake.css">', 'la etiqueta multilínea se muestra en una línea');
  assert.equal(procesarHtml(esperado, V).salida, esperado);
});

test('procesarHtml no interpreta como etiqueta lo que está en comentarios, scripts en línea, style, textarea o title', () => {
  const html = [
    '<!-- <script src="viejo.js?v=1"></script> -->',
    '<!-- ojo: usa -> <link rel="stylesheet" href="comentada.css"> -->', // un «>» antes de la etiqueta comentada
    '<title><script src="titulo.js"></script></title>',
    '<style>/* <link rel="stylesheet" href="estilo.css"> */</style>',
    '<textarea><script src="area.js"></script></textarea>',
    '<script>',
    "  document.write('<script src=\"dinamico.js?v=9\"><\\/script>');",
    "  const t = '<link rel=\"stylesheet\" href=\"dinamico.css\">';",
    '</script>',
    '<script src="real.js"></script>',
    '<noscript><link rel="stylesheet" href="sin-js.css"></noscript>',
  ].join('\n');
  const { salida, hallazgos } = procesarHtml(html, V);
  assert.deepEqual(hallazgos.map(h => h.etiqueta), ['<script src="real.js">', '<link rel="stylesheet" href="sin-js.css">']);
  assert.equal(salida, html.replace('real.js', 'real.js?v=P1').replace('sin-js.css', 'sin-js.css?v=P1'));
});

test('procesarHtml no toca recursos locales que no son .js/.css/.mjs ni <link> que no son hojas de estilo', () => {
  const html = [
    '<script src="datos.json"></script>',
    '<script type="application/json">{"a":1}</script>',
    '<script type="importmap">{"imports":{}}</script>',
    '<link rel="icon" href="img/icono.png">',
    '<link rel="preload" href="portero.js" as="script">',
    '<link rel="stylesheet" href="tema.php">',
    '<a href="portero.js">no es una etiqueta de carga</a>',
    '<img src="img/logo.js.png">',
    '<script src>',
  ].join('\n');
  const resultado = procesarHtml(html, V);
  assert.equal(resultado.salida, html);
  assert.equal(resultado.hallazgos.length, 0);
});

test('buscarEtiquetas no se cuelga ni inventa etiquetas con marcado roto o texto con «<»', () => {
  assert.deepEqual(buscarEtiquetas('<p>hola</p><script src="x.js'), [], 'comilla sin cerrar al final del archivo');
  assert.deepEqual(buscarEtiquetas('<script src="x.js"'), [], 'etiqueta sin «>»');
  assert.deepEqual(buscarEtiquetas('<!-- sin cerrar <script src="x.js"></script>'), [], 'comentario sin cerrar');
  const sueltas = buscarEtiquetas('si 1 < 2 y 3 <= 4 <script src="a.js"></script> <</script>');
  assert.deepEqual(sueltas.map(e => e.valor), ['a.js']);
});

/* ───────────────────────── CLI sobre repos sintéticos ──────────────────────── */

function crearRepo(t, archivos) {
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'versiones-'));
  t.after(() => fs.rmSync(carpeta, { recursive: true, force: true }));
  for (const [ruta, contenido] of Object.entries(archivos)) {
    const completa = path.join(carpeta, ruta);
    fs.mkdirSync(path.dirname(completa), { recursive: true });
    fs.writeFileSync(completa, contenido);
  }
  return carpeta;
}

const correr = (raiz, ...argumentos) => spawnSync(process.execPath, [SCRIPT, '--raiz', raiz, ...argumentos], { encoding: 'utf8' });
const leer = (raiz, ruta) => fs.readFileSync(path.join(raiz, ruta), 'utf8');

test('--check sale con 1 y lista archivo:línea: etiqueta; --aplicar corrige y es idempotente', t => {
  const raiz = crearRepo(t, {
    'versiones.json': JSON.stringify(V),
    'index.html': '<!doctype html>\n<script src="portero.js?v=relevo9"></script>\n<link rel="stylesheet" href="' + MARCO + 'os/shell.css">\n<script src="portero.js?v=P1"></script>\n',
    'sub/pagina.html': '<script src="../modelos.js?v=1"></script>\n',
  });
  const fallo = correr(raiz, '--check');
  assert.equal(fallo.status, 1, fallo.stdout + fallo.stderr);
  assert.deepEqual(fallo.stdout.split('\n').filter(linea => /^\S+:\d+: </.test(linea)), [
    'index.html:2: <script src="portero.js?v=relevo9">',
    'index.html:3: <link rel="stylesheet" href="' + MARCO + 'os/shell.css">',
    'sub/pagina.html:1: <script src="../modelos.js?v=1">',
  ]);
  assert.match(leer(raiz, 'index.html'), /relevo9/, '--check no debe escribir');

  const aplicado = correr(raiz, '--aplicar');
  assert.equal(aplicado.status, 0, aplicado.stdout + aplicado.stderr);
  assert.equal(
    leer(raiz, 'index.html'),
    '<!doctype html>\n<script src="portero.js?v=P1"></script>\n<link rel="stylesheet" href="' + MARCO + 'os/shell.css?v=M1">\n<script src="portero.js?v=P1"></script>\n',
  );
  assert.equal(leer(raiz, 'sub/pagina.html'), '<script src="../modelos.js?v=P1"></script>\n');
  assert.equal(correr(raiz, '--check').status, 0);

  const antes = fs.statSync(path.join(raiz, 'index.html')).mtimeMs;
  const segunda = correr(raiz, '--aplicar');
  assert.equal(segunda.status, 0);
  assert.match(segunda.stdout, /Sin cambios/);
  assert.equal(fs.statSync(path.join(raiz, 'index.html')).mtimeMs, antes, 'si no hay nada que cambiar no se reescribe el archivo');
});

test('no recorre tests/, docs/ ni gas/ de la raíz, node_modules, carpetas con punto ni archivos que no son .html', t => {
  const viejo = '<script src="portero.js?v=viejo"></script>\n';
  const raiz = crearRepo(t, {
    'versiones.json': JSON.stringify(V),
    'index.html': '<script src="portero.js?v=P1"></script>\n',
    'tests/fixtures/a.html': viejo,
    'docs/a.html': viejo,
    'gas/a.html': viejo,
    'node_modules/paquete/a.html': viejo,
    'otra/node_modules/a.html': viejo,
    '.github/a.html': viejo,
    '.git/a.html': viejo,
    'nota.txt': viejo,
    'LEEME.md': viejo,
  });
  assert.deepEqual(listarHtml(raiz), ['index.html']);
  assert.equal(correr(raiz, '--check').status, 0);
  assert.equal(correr(raiz, '--aplicar').status, 0);
  assert.equal(leer(raiz, 'tests/fixtures/a.html'), viejo, '--aplicar tampoco toca lo excluido');
});

test('conserva byte a byte lo que no es etiqueta, incluidos bytes que no son UTF-8 y CRLF', t => {
  const antes = Buffer.concat([
    Buffer.from('<!-- ', 'latin1'),
    Buffer.from([0xff, 0xfe, 0xc3]),
    Buffer.from(' ñ -->\r\n<script src="portero.js?v=1"></script>\r\n<p>acción</p>\r\n', 'utf8'),
  ]);
  const raiz = crearRepo(t, { 'versiones.json': JSON.stringify(V), 'index.html': antes });
  assert.equal(correr(raiz, '--aplicar').status, 0);
  const esperado = Buffer.from(antes.toString('latin1').replace('portero.js?v=1', 'portero.js?v=P1'), 'latin1');
  assert.ok(fs.readFileSync(path.join(raiz, 'index.html')).equals(esperado));
});

test('versiones.json ausente o inválido sale con 2 y no toca los HTML', t => {
  const html = '<script src="portero.js?v=viejo"></script>\n';
  const casos = [
    [undefined, /versiones\.json/],
    ['esto no es json', /versiones\.json/],
    ['{"propia":"P1"}', /marco/],
    ['{"marco":"M1"}', /propia/],
    ['{"propia":"a b","marco":"M1"}', /propia/],
    ['{"propia":"P1","marco":"x\\"y"}', /marco/],
    ['{"propia":"P1","marco":""}', /marco/],
    ['{"propia":7,"marco":"M1"}', /propia/],
  ];
  for (const [contenido, patron] of casos) {
    const archivos = { 'index.html': html };
    if (contenido !== undefined) archivos['versiones.json'] = contenido;
    const raiz = crearRepo(t, archivos);
    for (const modo of ['--check', '--aplicar']) {
      const resultado = correr(raiz, modo);
      assert.equal(resultado.status, 2, String(contenido) + ' ' + modo);
      assert.match(resultado.stderr, patron);
    }
    assert.equal(leer(raiz, 'index.html'), html);
  }
});

test('uso incorrecto y raíz sin etiquetas salen con 2', t => {
  const raiz = crearRepo(t, {
    'versiones.json': JSON.stringify(V),
    'index.html': '<link rel="preconnect" href="https://fonts.googleapis.com"><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>\n',
  });
  assert.equal(spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' }).status, 2, 'sin modo');
  assert.equal(spawnSync(process.execPath, [SCRIPT, '--check', '--aplicar'], { encoding: 'utf8' }).status, 2, 'ambos modos');
  assert.equal(spawnSync(process.execPath, [SCRIPT, '--raro'], { encoding: 'utf8' }).status, 2, 'argumento desconocido');
  assert.equal(spawnSync(process.execPath, [SCRIPT, '--check', '--raiz'], { encoding: 'utf8' }).status, 2, '--raiz sin carpeta');
  const vacio = correr(raiz, '--check');
  assert.equal(vacio.status, 2, 'una verificación que no halla ninguna etiqueta no puede pasar en silencio');
  assert.match(vacio.stderr, /ninguna etiqueta/);
  assert.equal(spawnSync(process.execPath, [SCRIPT, '--ayuda'], { encoding: 'utf8' }).status, 0);
});

/* ───────────────────────────────── este repo ──────────────────────────────── */

test('versiones.json de este repo es válido', () => {
  const versiones = cargarVersiones(RAIZ);
  assert.deepEqual(Object.keys(versiones).sort(), ['marco', 'propia']);
});

test('este repo: toda etiqueta propia o del marco lleva la versión de versiones.json (node scripts/versiones.cjs --check = 0)', () => {
  const resultado = spawnSync(process.execPath, [SCRIPT, '--check'], { cwd: RAIZ, encoding: 'utf8' });
  assert.equal(
    resultado.status,
    0,
    'Hay etiquetas ?v= que no coinciden con versiones.json. Edita versiones.json y corre: node scripts/versiones.cjs --aplicar\n' + resultado.stdout + resultado.stderr,
  );
  const informe = ejecutar({ modo: 'check', raiz: RAIZ });
  assert.ok(informe.etiquetas > 0, 'la verificación no puede ser vacía');
  assert.equal(informe.desajustes, 0);
});
