"""Genera todas las láminas del grafo de YOD OS en el visor de Graphify y la portada que las hojea.
   Uso: python3 grafo-motor/laminas.py [carpeta de salida]. Lee grafo-motor/datos/base.json (o GRAFO_BASE)."""
import os, sys, json, shutil, collections, html as H_
if os.environ.get('PYTHONHASHSEED') != '0':   # mismo orden en cada corrida: sin esto los conjuntos cambian qué pieza queda a la vista
    os.environ['PYTHONHASHSEED'] = '0'; os.execv(sys.executable, [sys.executable] + sys.argv)
sys.path.insert(0, os.path.dirname(__file__))
from lam_base import *
import lam_def as D
import lam_html as W

SAL_DIR = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'grafo')
os.makedirs(SAL_DIR, exist_ok=True)
LAMS = D.todas()
ids = [l.id for l in LAMS]
assert len(ids) == len(set(ids)), [i for i, n in collections.Counter(ids).items() if n > 1]
titulos = {l.id: l.titulo for l in LAMS}
ARM = {l.id: W.armar(l) for l in LAMS}
LAMS = [l for l in LAMS if len(ARM[l.id]['nodos']) >= 2]
vivas = {l.id for l in LAMS}
EN = collections.defaultdict(list)
for l in LAMS:
    for i in ARM[l.id]['nodos']: EN[i].append(l.id)

def destino(i, lam):
    if i in lam.dentro: return lam.dentro[i]
    if i not in N: return None
    c = capa(i)
    if c == 'sistema':
        a = area_de(i); return D.lam_tablero(a) if a and a != 'drive' else None
    if c == 'pantalla': return D.lam_pantalla(i)
    if c == 'repo':
        if N[i].get('estado') in ('cascarón', 'archivado', 'bifurcación'): return 'casa-vieja'
        tag = N[i].get('repo'); return D.lam_codigo(tag) if tag in REPOS else None
    if c == 'hoja': return D.lam_libro(i) if i in D.TABS_DE else None
    return {'N-FOLIO': 'folio', 'N-PUERTAS': 'personas', 'N-REPARTO': 'pantalla-cartera-ppp'}.get(i)

resumen = []
for l in LAMS:
    A = ARM[l.id]
    for i, d in A['nodos'].items():
        t = destino(i, l)
        if t and t in vivas and t != l.id: d['dentro'] = [t + '.html', titulos[t]]
        otras = [x for x in EN.get(i, ()) if x != l.id and not (d.get('dentro') and d['dentro'][0] == x + '.html')]
        if otras: d['tb'] = [[x + '.html', titulos[x]] for x in otras[:8]] + ([['', f'y {len(otras) - 8} más']] if len(otras) > 8 else [])
    if l.padre and l.padre not in vivas: l.padre = 'mapa'
    n, m, tam = W.html_lamina(l, A, titulos, SAL_DIR)
    resumen.append((l.seccion, l.id, l.titulo, n, m, tam, l.padre))

extra = []

# ── portada: una barra para hojear y el visor de Graphify debajo ──────────────────────────────────
ORDEN = ['Mapa', 'Tableros', 'Pantallas propuestas', 'Negocio', 'Datos', 'Atlas del portal', 'Código', 'Graphify tal cual', 'Para leer']
lista = [[i, t, s, p] for s, i, t, n, m, tam, p in resumen] + [[i, t, s, p] for s, i, t, p in extra]
lista.sort(key=lambda x: ORDEN.index(x[2]))
PORT = """<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
__NO_INDEXAR__
<title>YOD OS en Graphify</title>
<style>
  :root { color-scheme: light dark; --bg: #ffffff; --fg: #1c1c1e; --bd: #d9dee5; --m: #6b7280; }
  @media (prefers-color-scheme: dark) { :root { --bg: #0f0f1a; --fg: #e8e8ea; --bd: #2a2a4e; --m: #a0a3ad; } }
  html, body { height: 100%; margin: 0; }
  body { display: flex; flex-direction: column; height: 100vh; height: 100dvh; background: var(--bg); color: var(--fg); font: 14px system-ui, -apple-system, sans-serif; }
  header { display: flex; gap: 6px; align-items: center; padding: 6px 8px; border-bottom: 1px solid var(--bd); }
  select, button { font: inherit; color: var(--fg); background: var(--bg); border: 1px solid var(--bd); border-radius: 8px; padding: 8px 9px; min-height: 38px; }
  select { flex: 1; min-width: 0; text-overflow: ellipsis; }
  button { cursor: pointer; min-width: 40px; }
  button:disabled { opacity: .35; }
  #cuenta { color: var(--m); font-size: 12px; white-space: nowrap; }
  #borr { font: 600 11px system-ui, sans-serif; letter-spacing: .08em; color: #8a5a00; background: #fff3cd; border: 1px solid #e6c766; border-radius: 999px; padding: 4px 9px; white-space: nowrap; }
  @media (max-width: 560px) { #cuenta { display: none; } }
  iframe { flex: 1; min-height: 0; width: 100%; border: 0; background: var(--bg); }
</style></head><body>
<header>
  <button id="casa" type="button" title="Mapa general" aria-label="Mapa general">⌂</button>
  <button id="sube" type="button" title="Subir un nivel" aria-label="Subir un nivel">↑</button>
  <select id="sel" aria-label="Lámina"></select>
  <span id="borr" hidden>BORRADOR</span>
  <span id="cuenta">__CUENTA__</span>
</header>
<iframe id="marco" title="Grafo de YOD OS en el visor de Graphify"></iframe>
<script>
let L = __LISTA__;
// Con ?rama=<rama> la portada enseña el grafo de esa rama (el borrador) sin que esté publicado: trae cada lámina como texto.
const RAMA = (new URLSearchParams(location.search).get('rama') || '').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 60);
const CRUDO = RAMA ? 'https://raw.githubusercontent.com/yodesarrollomx/potenciales-yod/' + RAMA + '/grafo/' : '';
const sel = document.getElementById('sel'), marco = document.getElementById('marco'), sube = document.getElementById('sube');
let actual = null, turno = 0;
function lista() { let grupo = null, og = null; sel.textContent = '';
  L.forEach(l => { if (l[2] !== grupo) { grupo = l[2]; og = document.createElement('optgroup'); og.label = grupo; sel.appendChild(og); }
    const o = document.createElement('option'); o.value = l[0]; o.textContent = l[1]; og.appendChild(o); }); }
function marca(l) { actual = l; sel.value = l[0]; sube.disabled = !l[3]; if (location.hash.slice(1) !== l[0]) { try { history.replaceState(null, '', location.pathname + location.search + '#' + l[0]); } catch (e) {} } }
function ir(id, nodo) { const l = L.find(x => x[0] === id) || L[0]; if (!l) return; marca(l);
  if (!CRUDO) { const src = l[0] + '.html' + (nodo ? '#' + encodeURIComponent(nodo) : ''); if (marco.getAttribute('src') !== src) marco.setAttribute('src', src); return; }
  const mio = ++turno;
  fetch(CRUDO + l[0] + '.html', { cache: 'no-store' }).then(r => r.ok ? r.text() : Promise.reject()).then(t => { if (mio !== turno) return;
    marco.removeAttribute('src'); marco.srcdoc = t.replace('<head>', '<head><script>window.YOD_FOCO=' + JSON.stringify(nodo || '').replace(/</g, '\\\\u003c') + ';<\\/script>'); })
    .catch(() => { if (mio === turno) marco.srcdoc = '<p style="font:15px system-ui;padding:24px">No se pudo traer esta lámina del borrador. Puede que el borrador ya se haya aprobado o descartado.</p>'; }); }
sel.addEventListener('change', () => ir(sel.value));
document.getElementById('casa').addEventListener('click', () => ir(L[0][0]));
sube.addEventListener('click', () => { if (actual && actual[3]) ir(actual[3]); });
window.addEventListener('message', e => { const d = e.data; if (!d) return;
  if (d.yod === 1) { const l = L.find(x => x[0] === d.id); if (l) marca(l); }
  if (d.yod === 2 && typeof d.ir === 'string') ir(d.ir, typeof d.nodo === 'string' ? d.nodo : ''); });
window.addEventListener('hashchange', () => { const id = location.hash.slice(1); if (id && (!actual || actual[0] !== id)) ir(id); });
function arranca() { lista(); ir(location.hash.slice(1)); }
if (CRUDO) { document.getElementById('borr').hidden = false;
  fetch(CRUDO + 'laminas.json', { cache: 'no-store' }).then(r => r.ok ? r.json() : Promise.reject()).then(j => { if (Array.isArray(j.laminas) && j.laminas.length) L = j.laminas;
    const c = document.getElementById('cuenta'); if (c && j.piezas) c.textContent = j.piezas.toLocaleString('es-MX') + ' piezas · ' + L.length + ' láminas'; }).catch(() => {}).then(arranca);
} else arranca();
</script>
</body></html>
"""
if True:
    ids_repo = {}
    for tag, r in REPOS.items():
        rn = D.REPO_NODO.get(tag)
        if not rn: continue
        # Dónde se marca un error de este repositorio: en el propio repositorio y en los tableros que VIVEN en él (la liga
        # «vive en» del atlas). Si en el repositorio viven tableros de varias filas del mapa (la cabina aloja varios), sólo los
        # de su propia fila. Nunca «los primeros tableros de la fila»: eso pintaba el error en tableros que no tienen que ver.
        viven = sorted({F[k]['s'] for k in ENT[rn] if F[k]['r'] == 'vive en' and capa(F[k]['s']) == 'sistema'}, key=lambda i: (not N[i].get('menu'), N[i].get('label') or '', i))
        sis = [x for x in viven if area_de(x) == area_de(rn)] or viven
        ids_repo[f"{r['owner']}/{r['repo']}"] = dict(nodos=[rn] + sis, commit=r['commit'], flujos={N[w]['ruta']: w for w in D.ARCH_DE.get(tag, []) if capa(w) == 'workflow'})
    json.dump(dict(repos=ids_repo, armado=ARMADO), open(f'{SAL_DIR}/mapa-ids.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
cuenta = f"{len(N):,} piezas públicas · {len(lista)} láminas"
open(f'{SAL_DIR}/index.html', 'w', encoding='utf-8').write(PORT.replace('__NO_INDEXAR__', W.NO_INDEXAR).replace('__LISTA__', W.js_seguro(lista)).replace('__CUENTA__', cuenta))
json.dump(dict(armado=ARMADO, laminas=[[i, t, s, p] for i, t, s, p in lista], piezas=len(N), flechas=len(F)), open(f'{SAL_DIR}/laminas.json', 'w', encoding='utf-8'), ensure_ascii=False)
tot = sum(os.path.getsize(f'{SAL_DIR}/{f}') for f in os.listdir(SAL_DIR))
print(f'{len(resumen)} láminas + {len(extra)} vistas · {len(os.listdir(SAL_DIR))} archivos · {tot / 1e6:.1f} MB')
for sec in ORDEN:
    xs = [r for r in resumen if r[0] == sec]
    if xs: print(f'  {sec}: {len(xs)} láminas · nodos {min(r[3] for r in xs)}–{max(r[3] for r in xs)} · flechas hasta {max(r[4] for r in xs)} · mayor {max(r[5] for r in xs) // 1024} KB')
print('  más cargadas:', [(r[1], r[3], r[4]) for r in sorted(resumen, key=lambda r: -r[3])[:8]])
print('  más ligeras:', [(r[1], r[3], r[4]) for r in sorted(resumen, key=lambda r: r[3])[:8]])
