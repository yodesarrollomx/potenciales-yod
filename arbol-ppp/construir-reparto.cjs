/* SPPP · T-10 (copia de prueba del módulo de repartos). Arma definicion-reparto.js: la extensión del reparto (definicion/reparto_nodos.csv y
   reparto_factores.csv, solo lectura) en matrices con encabezado, igual que definicion-tablas.js, para la página reparto-prueba.html.
   Uso: node construir-reparto.cjs   (la suite comprueba que el archivo armado coincide con los CSV) */
const fs = require('fs'), path = require('path');
const leer = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
function leeCsv(txt) {
  const filas = []; let fila = [], campo = '', q = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (q) { if (c === '"') { if (txt[i + 1] === '"') { campo += '"'; i++; } else q = false; } else campo += c; }
    else if (c === '"') q = true; else if (c === ',') { fila.push(campo); campo = ''; }
    else if (c === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = ''; } else if (c !== '\r') campo += c;
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
  const ancho = filas[0].length;
  return filas.filter((f) => f.length > 1 || f[0] !== '').map((f) => { while (f.length < ancho) f.push(''); return f; });
}
const ext = { ARBOL_NODOS: leeCsv(leer('definicion/reparto_nodos.csv')), ARBOL_FACTORES: leeCsv(leer('definicion/reparto_factores.csv')) };
const js = '/* Generado por construir-reparto.cjs desde definicion/reparto_nodos.csv y reparto_factores.csv (SPPP · T-10, copia de prueba). No editar a mano. */\n' +
  'window.ARBOL_REPARTO_EXT=' + JSON.stringify(ext).replace(/<\/script/gi, '<\\/script') + ';\n';
if (require.main === module) { fs.writeFileSync(path.join(__dirname, 'definicion-reparto.js'), js); console.log('definicion-reparto.js: ' + js.length + ' caracteres · ' + (ext.ARBOL_NODOS.length - 1) + ' nodos y ' + (ext.ARBOL_FACTORES.length - 1) + ' factores'); }
module.exports = { js, ext };
