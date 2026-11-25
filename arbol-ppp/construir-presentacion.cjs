/* Datos de presentación del Árbol PPP (24-nov-2026, copia de prueba). Arma definicion-presentacion.js: la extensión «presentación» en matrices con
   encabezado, igual que definicion-tablas.js y definicion-reparto.js, para la página presentacion-prueba.html.
     · definicion/presentacion_nodos.csv     los datos que la presentación pide y el árbol no traía, cada uno con su supuesto estándar editable
     · definicion/presentacion_factores.csv  sus filas de ARBOL_FACTORES (sin equivalente en el Maestro mientras Dirección no los apruebe)
     · definicion/presentacion_reglas.csv    sus alertas
     · definicion/presentacion_mapa.csv      ARBOL_PRESENTACION: qué nodos alimentan cada dato de las fichas (de aquí salen las estrellas)
   Uso: node construir-presentacion.cjs   (la suite comprueba que el archivo armado coincide con los CSV) */
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
const ext = {
  ARBOL_NODOS: leeCsv(leer('definicion/presentacion_nodos.csv')), ARBOL_FACTORES: leeCsv(leer('definicion/presentacion_factores.csv')),
  ARBOL_REGLAS: leeCsv(leer('definicion/presentacion_reglas.csv')), ARBOL_PRESENTACION: leeCsv(leer('definicion/presentacion_mapa.csv'))
};
const js = '/* Generado por construir-presentacion.cjs desde definicion/presentacion_*.csv (datos de presentación, copia de prueba). No editar a mano. */\n' +
  'window.ARBOL_PRESENTACION_EXT=' + JSON.stringify(ext).replace(/<\/script/gi, '<\\/script') + ';\n';
if (require.main === module) {
  fs.writeFileSync(path.join(__dirname, 'definicion-presentacion.js'), js);
  console.log('definicion-presentacion.js: ' + js.length + ' caracteres · ' + (ext.ARBOL_NODOS.length - 1) + ' nodos, ' + (ext.ARBOL_FACTORES.length - 1) + ' factores, ' + (ext.ARBOL_REGLAS.length - 1) + ' alertas y ' + (ext.ARBOL_PRESENTACION.length - 1) + ' filas del mapa');
}
module.exports = { js, ext };
