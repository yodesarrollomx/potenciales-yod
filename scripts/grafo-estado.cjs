#!/usr/bin/env node
/* Grafo · estado. Lo corre cada hora el flujo .github/workflows/grafo-estado.yml.
   Sólo LEE (API pública de GitHub y GET a páginas estáticas): nunca toca un /exec ni una hoja.
   Escribe estado.json (lo que el grafo pinta en rojo o ámbar) y agrega a registro.jsonl cada error que aparece
   o se resuelve. La rama principal está protegida, así que los dos viven en la rama de datos `grafo-datos`:
   --salida <carpeta> es la copia de trabajo de esa rama. Con --chinches abre una chinche por cada error nuevo.
   También pone al día el aviso de borrador (borrador.json) con lo que de verdad hay en GitHub: si el borrador ya se
   aprobó o se descartó lo quita, si alguien abrió su PR a mano lo liga, y si quedó atrás de otros cambios lo dice. */
'use strict';
const fs = require('fs'), path = require('path');
const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : ''; };
const GRAFO = path.join(__dirname, '..', 'grafo');
const SALIDA = arg('--salida') || GRAFO;
const TOKEN = process.env.GITHUB_TOKEN || '', AQUI = process.env.GITHUB_REPOSITORY || 'yodesarrollomx/potenciales-yod';
const ABRIR = process.argv.includes('--chinches');
// Lo que el propio grafo escribe en este repositorio no cuenta como «el sistema cambió».
const PROPIO = { 'yodesarrollomx/potenciales-yod': ['grafo/', 'grafo-motor/datos/'] };

function crear({ fetchImpl = fetch, ahora = () => new Date().toISOString(), mapa } = {}) {
  async function gh(ruta, opc = {}) {
    const r = await fetchImpl('https://api.github.com' + ruta, { ...opc, headers: { accept: 'application/vnd.github+json', 'user-agent': 'yod-grafo-estado', ...(TOKEN ? { authorization: 'Bearer ' + TOKEN } : {}), ...(opc.headers || {}) } });
    if (!r.ok) throw Object.assign(new Error(ruta + ' → ' + r.status), { status: r.status });
    return r.json();
  }
  const suave = async (f, d) => { try { return await f(); } catch (e) { console.log('  aviso:', e.message); return d; } };

  /* ¿Hubo cambios de verdad desde el commit con que se armó el grafo? Compara y descarta lo que el grafo mismo escribe. */
  async function cambio(repo, base, cabeza) {
    if (!base || cabeza.startsWith(base)) return false;
    let j;
    try { j = await gh(`/repos/${repo}/compare/${base}...${cabeza}`); } catch (e) { return true; }   // commit desconocido: mejor avisar
    const propios = PROPIO[repo] || [], archivos = j.files || [];
    if (archivos.length >= 300) return true;
    return archivos.some(f => !propios.some(p => String(f.filename || '').startsWith(p)));
  }

  /* Una chinche puede estar abierta en un repositorio y hablar de otro: la que se clava desde la pantalla lleva en el título
     «📌 <repositorio>/<vista> · …» y el puente de la Sala las junta todas en el suyo. Si ese repositorio es del grafo, el error
     se pinta ahí, que es donde pasó; si el título no nombra uno conocido, donde está abierta. */
  function destinoChinche(titulo, repo) {
    const m = /^\s*📌\s*([A-Za-z0-9._-]+)(?:\/[^\s·]*)?\s+·/u.exec(String(titulo || ''));
    if (!m) return repo;
    const nombre = m[1].toLowerCase(), dueno = repo.split('/')[0];
    const iguales = Object.keys(mapa.repos).filter(k => k.split('/')[1].toLowerCase() === nombre);
    return iguales.find(k => k.split('/')[0] === dueno) || iguales[0] || repo;
  }

  async function leer() {
    const errores = [];
    for (const [repo, m] of Object.entries(mapa.repos)) {
      // 1 · flujos de GitHub cuyo último intento falló, con el paso donde tronó
      const runs = await suave(() => gh(`/repos/${repo}/actions/runs?per_page=40&branch=main`), { workflow_runs: [] });
      const ultimo = {};
      for (const r of runs.workflow_runs || []) if (r.status === 'completed' && !ultimo[r.path]) ultimo[r.path] = r;
      for (const [ruta, r] of Object.entries(ultimo)) {
        if (r.conclusion !== 'failure' && r.conclusion !== 'timed_out') continue;
        const jobs = await suave(() => gh(`/repos/${repo}/actions/runs/${r.id}/jobs?per_page=30`), { jobs: [] });
        const j = (jobs.jobs || []).find(x => x.conclusion === 'failure') || {}, paso = (j.steps || []).find(x => x.conclusion === 'failure') || {};
        errores.push({ clave: `flujo:${repo}:${ruta}`, tipo: 'flujo', nodos: [m.flujos[ruta], ...m.nodos].filter(Boolean), desde: r.run_started_at, url: r.html_url,
          msg: `Falló el flujo «${r.name}» de ${repo.split('/')[1]}` + (j.name ? `, trabajo «${j.name}»` : '') + (paso.name ? `, paso ${paso.number} «${paso.name}»` : '') });
      }
      // 2 · chinches abiertas
      const iss = await suave(() => gh(`/repos/${repo}/issues?state=open&per_page=50`), []);
      for (const i of iss) {
        if (i.pull_request) continue;
        const etq = (i.labels || []).map(l => (l.name || '').toLowerCase());
        if (!etq.some(e => e.startsWith('chinche')) && !/^\s*(📌|chinche)/i.test(i.title || '')) continue;
        if (/^📌 Grafo:/.test(i.title)) continue;
        const de = destinoChinche(i.title, repo);
        errores.push({ clave: `chinche:${repo}#${i.number}`, tipo: 'chinche', nodos: mapa.repos[de].nodos, desde: i.created_at, url: i.html_url,
          msg: `Chinche #${i.number} en ${repo.split('/')[1]}${de === repo ? '' : ` (sobre ${de.split('/')[1]})`}: ${String(i.title).slice(0, 110)}` });
      }
      // 3 · el repositorio cambió desde que se armó el grafo
      const c = await suave(() => gh(`/repos/${repo}/commits?per_page=1`), []);
      if (c[0] && m.commit && await cambio(repo, m.commit, c[0].sha)) errores.push({ clave: `cambio:${repo}`, tipo: 'cambio', nodos: m.nodos.slice(0, 1), desde: c[0].commit.committer.date, url: c[0].html_url,
        msg: `${repo.split('/')[1]} cambió después de armar el grafo (${String(mapa.armado || '').slice(0, 10)}); se refleja al rehacerlo` });
      // 4 · la página pública del repositorio responde
      const [dueno, nombre] = repo.split('/');
      if (dueno === 'yodesarrollomx' && !nombre.endsWith('.github.io')) {
        const url = `https://${dueno}.github.io/${nombre}/`;
        const st = await suave(async () => (await fetchImpl(url, { redirect: 'follow' })).status, 0);
        if (st && st !== 200 && st !== 404) errores.push({ clave: `pagina:${repo}`, tipo: 'pagina', nodos: m.nodos, desde: ahora(), url, msg: `La página de ${nombre} respondió ${st}` });
      }
    }
    return errores;
  }

  /* Compara con el estado anterior: qué apareció y qué se resolvió. Regresa lo que hay que escribir. */
  function conciliar(antes, errores) {
    const kA = new Map(antes.map(x => [x.clave, x])), kN = new Map(errores.map(x => [x.clave, x])), t = ahora();
    for (const x of errores) if (kA.has(x.clave)) x.desde = kA.get(x.clave).desde || x.desde;
    const nuevos = errores.filter(x => !kA.has(x.clave)), resueltos = antes.filter(x => !kN.has(x.clave));
    const lineas = [...nuevos.map(x => ({ cuando: t, que: 'aparece', ...x })), ...resueltos.map(x => ({ cuando: t, que: 'se resuelve', clave: x.clave, tipo: x.tipo, msg: x.msg, desde: x.desde }))];
    const igual = JSON.stringify(antes.map(x => x.clave).sort()) === JSON.stringify(errores.map(x => x.clave).sort());
    return { nuevos, resueltos, lineas, igual, estado: { generado: t, errores } };
  }

  async function chinches(nuevos) {
    for (const x of nuevos.filter(x => x.tipo === 'flujo' || x.tipo === 'pagina')) {
      await suave(() => gh(`/repos/${AQUI}/issues`, { method: 'POST', body: JSON.stringify({ title: '📌 Grafo: ' + x.msg.slice(0, 120), labels: ['chinche'],
        body: `El grafo del sistema detectó este error.\n\n- Qué: ${x.msg}\n- Desde: ${x.desde}\n- Evidencia: ${x.url}\n- Piezas del grafo: ${x.nodos.join(', ')}\n\nEn el registro del grafo queda anotado cuando el flujo vuelva a pasar.` }) }), null);
    }
  }
  /* Qué hay de verdad del borrador en GitHub. null o undefined = no se pudo saber (no se toca nada). */
  async function borradorEnGitHub() {
    const [dueno] = AQUI.split('/'); let rama = null, pr, deRama = null;
    try { await gh(`/repos/${AQUI}/branches/${RAMA_BORRADOR}`); rama = true; } catch (e) { rama = e.status === 404 ? false : null; }
    if (rama) {
      try {
        const l = await gh(`/repos/${AQUI}/pulls?state=open&head=${dueno}:${RAMA_BORRADOR}&per_page=1`);
        pr = l[0] ? await suave(() => gh(`/repos/${AQUI}/pulls/${l[0].number}`), l[0]) : null;
      } catch (e) { pr = undefined; }
      deRama = await suave(async () => { const c = await gh(`/repos/${AQUI}/contents/grafo/versiones.json?ref=${RAMA_BORRADOR}`); return JSON.parse(Buffer.from(String(c.content || ''), 'base64').toString('utf8')); }, null);
    }
    return { rama, pr, deRama };
  }
  return { leer, conciliar, chinches, cambio, borradorEnGitHub };
}

const RAMA_BORRADOR = 'grafo-borrador';
const ID = /^G-[0-9]{8}-[0-9]{4}$/;
const tituloPR = id => '🕸️ Grafo ' + id + ' · borrador (fusionar = aprobar)';
const ligaAbrir = (repo, id) => `https://github.com/${repo}/compare/main...${RAMA_BORRADOR}?expand=1&title=${encodeURIComponent(tituloPR(id))}`;

/* El aviso de borrador, puesto al día con lo que hay en GitHub. Función pura.
   puntero: lo guardado · aprobado: id aprobado en la rama principal · rama: ¿existe grafo-borrador? (null = sin dato)
   pr: su PR abierto, null si no hay, undefined si no se supo · deRama: versiones.json de esa rama. */
function reconciliarBorrador({ puntero, aprobado, rama, pr, deRama, repo, ahora }) {
  const p = puntero && ID.test(String(puntero.id || '')) ? puntero : null, igual = { puntero: p || {}, linea: null, cambio: !p && !!puntero && Object.keys(puntero).length > 0 };
  if (rama === null || rama === undefined) return igual;
  const idRama = deRama && ID.test(String(deRama.aprobado || '')) ? deRama.aprobado : '';
  const cerrar = () => p ? { puntero: {}, cambio: true, linea: { cuando: ahora, que: p.id === aprobado ? 'grafo aprobado' : 'borrador descartado', id: p.id, pr: p.pr || null, por: 'revisión de cada hora' } } : { puntero: {}, linea: null, cambio: igual.cambio };
  if (!rama || (idRama && idRama === aprobado)) return cerrar();              // ya no hay rama, o su grafo ya es el aprobado
  let n = p ? { ...p } : null;
  if (!n || (idRama && n.id !== idRama)) {                                      // falta el aviso, o es de un borrador anterior
    if (!idRama) return igual;
    const f = (Array.isArray(deRama.versiones) ? deRama.versiones : []).find(v => v && v.id === idRama) || {}, ia = f.ia || {};
    n = { id: idRama, fecha: f.fecha || '', creado: ahora, pr: 0, liga: ligaAbrir(repo, idRama), rama: RAMA_BORRADOR, antes: aprobado || '', piezas: f.piezas ?? null, ligas: f.ligas ?? null,
      titulo: String(ia.titulo || ''), resumen: String(ia.resumen || ''), recomendacion: String(ia.recomendacion || ''), ia: (f.ia_informe && f.ia_informe.gano) || null, audiencias: [], sin_campo: (f.cambios && f.cambios.sin_campo) || [] };
  }
  if (pr !== undefined) {
    if (pr && pr.number) { n.pr = pr.number; n.liga = String(pr.html_url || `https://github.com/${repo}/pull/${pr.number}`); }
    else { n.pr = 0; if (!String(n.liga || '').startsWith(`https://github.com/${repo}/compare/`)) n.liga = ligaAbrir(repo, n.id); }
    if (pr && ['dirty', 'behind'].includes(pr.mergeable_state)) n.atrasado = true; else delete n.atrasado;
  }
  return { puntero: n, linea: null, cambio: JSON.stringify(n) !== JSON.stringify(puntero || {}) };
}

async function main() {
  const mapa = JSON.parse(fs.readFileSync(path.join(GRAFO, 'mapa-ids.json'), 'utf8'));
  const E = crear({ mapa });
  const errores = await E.leer();
  fs.mkdirSync(SALIDA, { recursive: true });
  const fEstado = path.join(SALIDA, 'estado.json'), fReg = path.join(SALIDA, 'registro.jsonl');
  const antes = (() => { try { return JSON.parse(fs.readFileSync(fEstado, 'utf8')).errores || []; } catch (e) { return []; } })();
  const r = E.conciliar(antes, errores);
  if (r.lineas.length) fs.appendFileSync(fReg, r.lineas.map(l => JSON.stringify(l)).join('\n') + '\n');
  if (!r.igual || !fs.existsSync(fEstado)) fs.writeFileSync(fEstado, JSON.stringify(r.estado, null, 1) + '\n');
  console.log(`errores ${errores.length} · nuevos ${r.nuevos.length} · resueltos ${r.resueltos.length}`);
  if (ABRIR && TOKEN) await E.chinches(r.nuevos);
  // el aviso de borrador, al día con GitHub
  const fBorr = path.join(SALIDA, 'borrador.json'), lee = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
  const b = reconciliarBorrador({ puntero: lee(fBorr) || {}, aprobado: (lee(path.join(GRAFO, 'versiones.json')) || {}).aprobado || '', ...(await E.borradorEnGitHub()), repo: AQUI, ahora: new Date().toISOString() });
  if (b.cambio) { fs.writeFileSync(fBorr, JSON.stringify(b.puntero, null, 1) + '\n'); console.log('borrador: aviso puesto al día', b.puntero.id || '(sin borrador)'); }
  if (b.linea) fs.appendFileSync(fReg, JSON.stringify(b.linea) + '\n');
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { crear, PROPIO, reconciliarBorrador, ligaAbrir, tituloPR };
