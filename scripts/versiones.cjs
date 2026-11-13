#!/usr/bin/env node
'use strict';
/*
 * versiones.cjs · UNA sola etiqueta de caché (?v=) por familia de archivos.
 *
 * Por qué existe: el ?v= de cada <script src> / <link rel="stylesheet"> se tecleaba a mano y
 * divergía entre páginas (el mismo archivo pedido con versiones distintas), así que dos personas
 * podían correr marcos distintos sobre el mismo tablero. Ahora la versión vive en versiones.json
 * y este script es lo único que escribe o verifica los ?v= de los HTML.
 *
 * Uso (desde la raíz del repo):
 *   node scripts/versiones.cjs --aplicar   reescribe el ?v= de todas las etiquetas que le tocan
 *   node scripts/versiones.cjs --check     no escribe; sale con 1 y lista «archivo:línea: etiqueta»
 *                                          por cada una que no lleve exactamente la versión esperada
 *   Opcional: --raiz <carpeta>  (por defecto, la raíz de este repo)
 *
 * Códigos de salida: 0 todo cuadra · 1 --check halló etiquetas distintas · 2 uso o configuración inválidos.
 *
 * Familias (claves de versiones.json):
 *   propia → destino LOCAL .js/.css/.mjs (ruta relativa o de la misma carpeta; incluye portero.js
 *            y modelos.js)                                         → ?v=<propia>
 *   marco  → destino que empiece por https://yodesarrollomx.github.io/yod-portal/ (os/shell.js,
 *            os/shell.css, os/yod-acceso.js…)                       → ?v=<marco>
 * Lo demás (fonts.googleapis, gstatic, jsdelivr, unpkg, accounts.google.com, data:…) no se toca.
 *
 * Alcance: etiquetas REALES del marcado de cada *.html (raíz del repo, también en subcarpetas),
 * salvo tests/, docs/ y gas/ en la raíz, node_modules/ y carpetas que empiezan con punto. Lo que
 * haya dentro de comentarios, <script> en línea, <style>, <textarea> o <title> NO se interpreta
 * como etiqueta ni se toca. Sólo se reescribe el texto de la URL: el resto de la etiqueta queda
 * byte a byte igual (los archivos se leen y escriben como latin1 para que ningún byte se altere).
 */
const fs = require('node:fs');
const path = require('node:path');

const PREFIJO_MARCO = 'https://yodesarrollomx.github.io/yod-portal/';
const EXTENSION_LOCAL = /\.(?:js|css|mjs)$/i;
const VERSION_VALIDA = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const RAIZ_REPO = path.resolve(__dirname, '..');
const EXCLUIDAS_EN_RAIZ = new Set(['tests', 'docs', 'gas']);
const EXCLUIDAS_EN_TODA_PARTE = new Set(['node_modules']);
// Elementos cuyo contenido es texto, no marcado: lo que parezca una etiqueta ahí dentro no lo es.
const CONTENIDO_OPACO = new Set(['script', 'style', 'textarea', 'title']);

const USO = [
  'Uso: node scripts/versiones.cjs --aplicar | --check [--raiz <carpeta>]',
  '  --aplicar  reescribe ?v= en los *.html según versiones.json',
  '  --check    no escribe; sale con código 1 y lista archivo:línea: etiqueta por cada una que no coincida',
].join('\n');

/* ───────────────────────────── versiones.json ───────────────────────────── */

function cargarVersiones(raiz) {
  const ruta = path.join(raiz, 'versiones.json');
  let datos;
  try {
    datos = JSON.parse(fs.readFileSync(ruta, 'utf8'));
  } catch (error) {
    throw new Error('no se pudo leer ' + ruta + ': ' + error.message);
  }
  for (const clave of ['propia', 'marco']) {
    const valor = datos && datos[clave];
    if (typeof valor !== 'string' || !VERSION_VALIDA.test(valor)) {
      throw new Error('versiones.json: "' + clave + '" debe ser un texto de letras, números, punto, guion o guion bajo (recibido: ' + JSON.stringify(valor) + ')');
    }
  }
  return { propia: datos.propia, marco: datos.marco };
}

/* ─────────────────────────────── URLs y ?v= ─────────────────────────────── */

/**
 * Deja la URL con exactamente un parámetro v=<version>. Conserva el resto de parámetros, su
 * orden, el estilo de separador (& o &amp;) y el #fragmento. Idempotente.
 */
function ponerVersion(url, version) {
  const almohadilla = url.indexOf('#');
  const sinFragmento = almohadilla < 0 ? url : url.slice(0, almohadilla);
  const fragmento = almohadilla < 0 ? '' : url.slice(almohadilla);
  const interrogacion = sinFragmento.indexOf('?');
  const ruta = interrogacion < 0 ? sinFragmento : sinFragmento.slice(0, interrogacion);
  const consulta = interrogacion < 0 ? '' : sinFragmento.slice(interrogacion + 1);
  if (consulta === '') return ruta + '?v=' + version + fragmento;

  const trozos = consulta.split(/(&amp;|&)/); // [param, separador, param, separador, param…]
  const parametros = [];
  let hayVersion = false;
  for (let i = 0; i < trozos.length; i += 2) {
    const separador = i === 0 ? '' : trozos[i - 1];
    if (trozos[i].split('=', 1)[0] === 'v') {
      if (hayVersion) continue; // un segundo v= sobraría: se elimina
      hayVersion = true;
      parametros.push({ separador, texto: 'v=' + version });
    } else {
      parametros.push({ separador, texto: trozos[i] });
    }
  }
  if (!hayVersion) parametros.push({ separador: trozos[1] || '&', texto: 'v=' + version });
  return ruta + '?' + parametros.map((p, i) => (i === 0 ? '' : p.separador) + p.texto).join('') + fragmento;
}

/** 'marco' | 'propia' | null según a qué familia pertenece el destino de la etiqueta. */
function clasificar(destino) {
  const url = destino.trim();
  if (url === '') return null;
  if (url.toLowerCase().startsWith(PREFIJO_MARCO)) return 'marco';
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(url) || url.startsWith('//')) return null; // CDN, accounts.google.com, data:…
  return EXTENSION_LOCAL.test(url.split(/[?#]/, 1)[0]) ? 'propia' : null;
}

/* ───────────────────────── lectura del marcado HTML ───────────────────────── */

const ES_ESPACIO = /[ \t\n\r\f]/;
const NOMBRE_ETIQUETA = /<([A-Za-z][A-Za-z0-9:-]*)/y;
const NOMBRE_ATRIBUTO = /[^ \t\n\r\f"'<>\/=]+/y;

/** Lee la etiqueta de apertura que empieza en `inicio` ('<'). null si no es una o no cierra. */
function leerEtiqueta(html, inicio) {
  NOMBRE_ETIQUETA.lastIndex = inicio;
  const encontrada = NOMBRE_ETIQUETA.exec(html);
  if (!encontrada) return null;
  const largo = html.length;
  const atributos = [];
  let i = inicio + encontrada[0].length;
  for (;;) {
    while (i < largo && (ES_ESPACIO.test(html[i]) || html[i] === '/')) i++;
    if (i >= largo) return null;
    if (html[i] === '>') return { nombre: encontrada[1].toLowerCase(), atributos, fin: i + 1 };
    NOMBRE_ATRIBUTO.lastIndex = i;
    const nombreAtributo = NOMBRE_ATRIBUTO.exec(html);
    if (!nombreAtributo) { i++; continue; } // carácter suelto e inválido: se salta
    i += nombreAtributo[0].length;
    const atributo = { nombre: nombreAtributo[0].toLowerCase(), valor: null, desde: -1, hasta: -1 };
    let j = i;
    while (j < largo && ES_ESPACIO.test(html[j])) j++;
    if (html[j] === '=') {
      j++;
      while (j < largo && ES_ESPACIO.test(html[j])) j++;
      const comilla = html[j];
      if (comilla === '"' || comilla === "'") {
        const cierre = html.indexOf(comilla, j + 1);
        if (cierre < 0) return null;
        atributo.desde = j + 1;
        atributo.hasta = cierre;
        i = cierre + 1;
      } else {
        let k = j;
        while (k < largo && !ES_ESPACIO.test(html[k]) && html[k] !== '>') k++;
        atributo.desde = j;
        atributo.hasta = k;
        i = k;
      }
      atributo.valor = html.slice(atributo.desde, atributo.hasta);
    }
    atributos.push(atributo);
  }
}

/**
 * Etiquetas versionables del marcado: <script src=…> y <link rel~=stylesheet href=…>, en orden.
 * Cada una: { tipo, inicio, fin, desde, hasta, valor } (desde/hasta delimitan el texto de la URL).
 */
function buscarEtiquetas(html) {
  const halladas = [];
  const largo = html.length;
  let i = 0;
  while (i < largo) {
    const menor = html.indexOf('<', i);
    if (menor < 0) break;
    if (html.startsWith('<!--', menor)) {
      const cierre = html.indexOf('-->', menor + 4);
      i = cierre < 0 ? largo : cierre + 3;
      continue;
    }
    if (html[menor + 1] === '!' || html[menor + 1] === '?') { // <!doctype>, <![CDATA[…]]>, <?…?>
      const cierre = html.indexOf('>', menor + 2);
      i = cierre < 0 ? largo : cierre + 1;
      continue;
    }
    const etiqueta = leerEtiqueta(html, menor);
    if (!etiqueta) { i = menor + 1; continue; }
    i = etiqueta.fin;

    const atributo = nombre => etiqueta.atributos.find(a => a.nombre === nombre); // el primero manda
    if (etiqueta.nombre === 'script') {
      const src = atributo('src');
      if (src && src.valor !== null) halladas.push({ tipo: 'script', inicio: menor, fin: etiqueta.fin, desde: src.desde, hasta: src.hasta, valor: src.valor });
    } else if (etiqueta.nombre === 'link') {
      const rel = atributo('rel');
      const href = atributo('href');
      if (rel && rel.valor !== null && href && href.valor !== null && rel.valor.toLowerCase().split(/\s+/).includes('stylesheet')) {
        halladas.push({ tipo: 'link', inicio: menor, fin: etiqueta.fin, desde: href.desde, hasta: href.hasta, valor: href.valor });
      }
    }
    if (CONTENIDO_OPACO.has(etiqueta.nombre)) {
      const cierre = new RegExp('</' + etiqueta.nombre + '(?=[\\s/>])', 'gi');
      cierre.lastIndex = etiqueta.fin;
      const fin = cierre.exec(html);
      i = fin ? fin.index : largo;
    }
  }
  return halladas;
}

function crearBuscadorDeLineas(texto) {
  const saltos = [];
  for (let i = texto.indexOf('\n'); i >= 0; i = texto.indexOf('\n', i + 1)) saltos.push(i);
  return posicion => {
    let bajo = 0;
    let alto = saltos.length;
    while (bajo < alto) {
      const medio = (bajo + alto) >> 1;
      if (saltos[medio] < posicion) bajo = medio + 1; else alto = medio;
    }
    return bajo + 1; // líneas desde 1
  };
}

/**
 * Procesa un HTML (texto latin1): devuelve el texto con las etiquetas corregidas y un hallazgo
 * por cada etiqueta propia/marco: { familia, linea, etiqueta, ok, esperado }.
 */
function procesarHtml(html, versiones) {
  const lineaDe = crearBuscadorDeLineas(html);
  const hallazgos = [];
  let salida = '';
  let cursor = 0;
  for (const etiqueta of buscarEtiquetas(html)) {
    const familia = clasificar(etiqueta.valor);
    if (!familia) continue;
    const [, antes, destino, despues] = /^(\s*)([\s\S]*?)(\s*)$/.exec(etiqueta.valor);
    const esperado = antes + ponerVersion(destino, versiones[familia]) + despues;
    const ok = esperado === etiqueta.valor;
    hallazgos.push({
      familia,
      linea: lineaDe(etiqueta.inicio),
      etiqueta: Buffer.from(html.slice(etiqueta.inicio, etiqueta.fin), 'latin1').toString('utf8').replace(/\s*\n\s*/g, ' '),
      ok,
      esperado,
    });
    if (!ok) {
      salida += html.slice(cursor, etiqueta.desde) + esperado;
      cursor = etiqueta.hasta;
    }
  }
  return { salida: salida + html.slice(cursor), hallazgos };
}

/* ─────────────────────────────── el repo en disco ─────────────────────────── */

/** *.html (rutas relativas con «/», ordenadas) bajo `raiz`, sin las carpetas excluidas. */
function listarHtml(raiz) {
  const archivos = [];
  const recorrer = (carpeta, relativa) => {
    for (const entrada of fs.readdirSync(carpeta, { withFileTypes: true })) {
      if (entrada.isSymbolicLink()) continue;
      const ruta = relativa ? relativa + '/' + entrada.name : entrada.name;
      if (entrada.isDirectory()) {
        const excluida = entrada.name.startsWith('.')
          || EXCLUIDAS_EN_TODA_PARTE.has(entrada.name)
          || (relativa === '' && EXCLUIDAS_EN_RAIZ.has(entrada.name));
        if (!excluida) recorrer(path.join(carpeta, entrada.name), ruta);
      } else if (entrada.isFile() && /\.html$/i.test(entrada.name)) {
        archivos.push(ruta);
      }
    }
  };
  recorrer(raiz, '');
  return archivos.sort();
}

/**
 * Recorre los HTML. modo 'aplicar' escribe sólo los archivos que cambian; 'check' nunca escribe.
 * Devuelve { versiones, archivos: [{ ruta, hallazgos, cambiado }], etiquetas, desajustes }.
 */
function ejecutar({ modo, raiz = RAIZ_REPO }) {
  const versiones = cargarVersiones(raiz);
  const archivos = [];
  let etiquetas = 0;
  let desajustes = 0;
  for (const ruta of listarHtml(raiz)) {
    const completa = path.join(raiz, ruta);
    const original = fs.readFileSync(completa, 'latin1'); // latin1: ida y vuelta sin alterar ningún byte
    const { salida, hallazgos } = procesarHtml(original, versiones);
    const cambiado = salida !== original;
    if (cambiado && modo === 'aplicar') fs.writeFileSync(completa, salida, 'latin1');
    etiquetas += hallazgos.length;
    desajustes += hallazgos.filter(h => !h.ok).length;
    archivos.push({ ruta, hallazgos, cambiado });
  }
  return { versiones, archivos, etiquetas, desajustes };
}

/* ──────────────────────────────────── CLI ─────────────────────────────────── */

function leerArgumentos(argv) {
  const opciones = { modo: null, raiz: RAIZ_REPO, ayuda: false };
  for (let i = 0; i < argv.length; i++) {
    const argumento = argv[i];
    if (argumento === '--aplicar' || argumento === '--check') {
      const modo = argumento === '--aplicar' ? 'aplicar' : 'check';
      if (opciones.modo && opciones.modo !== modo) throw new Error('usa --aplicar o --check, no ambos');
      opciones.modo = modo;
    } else if (argumento === '--raiz') {
      if (i + 1 >= argv.length) throw new Error('--raiz necesita una carpeta');
      opciones.raiz = path.resolve(argv[++i]);
    } else if (argumento === '--ayuda' || argumento === '--help' || argumento === '-h') {
      opciones.ayuda = true;
    } else {
      throw new Error('argumento desconocido: ' + argumento);
    }
  }
  return opciones;
}

function principal(argv, imprimir = texto => process.stdout.write(texto + '\n'), imprimirError = texto => process.stderr.write(texto + '\n')) {
  let opciones;
  try {
    opciones = leerArgumentos(argv);
  } catch (error) {
    imprimirError('versiones: ' + error.message + '\n' + USO);
    return 2;
  }
  if (opciones.ayuda) { imprimir(USO); return 0; }
  if (!opciones.modo) { imprimirError('versiones: falta --aplicar o --check\n' + USO); return 2; }

  let informe;
  try {
    informe = ejecutar(opciones);
  } catch (error) {
    imprimirError('versiones: ' + error.message);
    return 2;
  }
  if (informe.etiquetas === 0) {
    imprimirError('versiones: no se halló ninguna etiqueta propia ni del marco en ' + informe.archivos.length + ' archivos html de ' + opciones.raiz + '; ¿es la raíz correcta?');
    return 2;
  }

  const { propia, marco } = informe.versiones;
  const versiones = 'propia=' + propia + ', marco=' + marco;
  if (opciones.modo === 'aplicar') {
    for (const archivo of informe.archivos.filter(a => a.cambiado)) {
      imprimir(archivo.ruta + ': ' + archivo.hallazgos.filter(h => !h.ok).length + ' etiquetas actualizadas');
    }
    imprimir(informe.desajustes === 0
      ? 'Sin cambios: las ' + informe.etiquetas + ' etiquetas ya llevan la versión esperada (' + versiones + ').'
      : 'Listo: ' + informe.desajustes + ' de ' + informe.etiquetas + ' etiquetas actualizadas en ' + informe.archivos.filter(a => a.cambiado).length + ' archivos (' + versiones + ').');
    return 0;
  }

  if (informe.desajustes === 0) {
    imprimir('OK: las ' + informe.etiquetas + ' etiquetas propias y del marco en ' + informe.archivos.length + ' archivos llevan la versión esperada (' + versiones + ').');
    return 0;
  }
  for (const archivo of informe.archivos) {
    for (const hallazgo of archivo.hallazgos.filter(h => !h.ok)) imprimir(archivo.ruta + ':' + hallazgo.linea + ': ' + hallazgo.etiqueta);
  }
  imprimir(informe.desajustes + ' de ' + informe.etiquetas + ' etiquetas no llevan la versión esperada (' + versiones + ').');
  imprimir('Para corregirlas: editar versiones.json si hace falta y correr node scripts/versiones.cjs --aplicar');
  return 1;
}

if (require.main === module) process.exitCode = principal(process.argv.slice(2));

module.exports = { PREFIJO_MARCO, cargarVersiones, ponerVersion, clasificar, buscarEtiquetas, procesarHtml, listarHtml, ejecutar, leerArgumentos, principal };
