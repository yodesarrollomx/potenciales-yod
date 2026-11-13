"""Refresca la base del grafo con lo que hoy hay en los repositorios públicos y en el atlas.

Sólo LEE (clones de GitHub y archivos locales); no toca ningún /exec ni ninguna hoja. Para cada repositorio
que cambió desde la última vez:
  · agrega los archivos nuevos y quita los borrados;
  · actualiza líneas, funciones y símbolos (extractor AST de Graphify, sin IA) de los archivos que cambiaron;
  · vuelve a leer qué importa cada archivo, qué scripts carga una página, a qué Apps Script llama, qué hoja
    nombra, qué llaves del navegador usa y, en los flujos de GitHub, su horario, sus secretos (sólo el nombre)
    y los programas que corre;
  · comprueba que cada liga «vista en código» de un archivo cambiado siga escrita en él, y si no la quita.
Además sincroniza componentes, conexiones, contratos, procesos y propuestas con el atlas vigente y saca el
contrato del Plan de Potencial (entradas y resultados guardados de cada tipo), que es lo que leen las presentaciones.
Al final quita lo excluido por Dirección (reglas.json → "excluir") y todo lo que no es de un repositorio de la lista de
públicos (reglas.json → "publicos"), también su nombre en los textos.

La capa curada (pantallas propuestas, plan, hallazgos, pestañas y columnas de las hojas) no se toca aquí.

Uso: python3 grafo-motor/refrescar.py --repos <carpeta de clones> [--base base.json] [--salida base.json]
     [--cambios cambios.json] [--todo]   (--todo trata cada repositorio como cambiado por completo)
     [--tapar dueño/nombre ...]         (repositorios de la lista que hoy no contestaron: se tapan en los textos)
"""
import argparse, collections, functools, hashlib, json, os, re, shutil, subprocess, sys, tempfile, urllib.parse

AQUI = os.path.dirname(os.path.abspath(__file__))
ATL = 'yod-portal/docs/arquitectura/modelo.json'
ARCH = ('codigo', 'pagina', 'apps_script', 'prueba', 'workflow', 'documento', 'datos', 'otro')
TEXT = {'.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.py', '.sh', '.yml', '.yaml', '.gs', '.html', '.htm', '.md', '.json', '.txt', '.css', '.toml', '.example', '.cfg', '.ini', '.env'}
CODE = {'.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.py', '.sh', '.gs', '.html', '.htm'}
CODE_G = {'.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.py', '.sh', '.yml', '.yaml'}
MEDIO = ('.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif', '.mp4', '.mp3', '.wav', '.glb', '.gltf', '.pdf', '.woff', '.woff2', '.ttf', '.ico')
SKIP_DIR = re.compile(r'(^|/)(node_modules|vendor|dist|build|\.venv|__pycache__|fonts|third_party)(/|$)', re.I)
SKIP_DIR_G = re.compile(r'(^|/)(node_modules|vendor|dist|build|\.venv|__pycache__|fonts|img|assets/vendor|libs?|third_party)(/|$)', re.I)
SKIP_NAME = re.compile(r'(\.min\.(js|mjs|css)$|\.bundle\.|package-lock\.json$|\.map$)', re.I)
SCRIPT = re.compile(r'<script\b([^>]*)>(.*?)</script\s*>', re.S | re.I)
RX = dict(
    sheet_url=re.compile(r'docs\.google\.com/spreadsheets/d/([A-Za-z0-9_-]{30,60})'),
    sheet_open=re.compile(r'openById\(\s*[\'"]([A-Za-z0-9_-]{30,60})[\'"]'),
    sheet_const=re.compile(r'(?i)\b([A-Za-z_$][\w$]*(?:sheet|spreadsheet|libro|hoja|ss_?id|book)[\w$]*)\s*[:=]\s*[\'"]([A-Za-z0-9_-]{40,50})[\'"]'),
    exec=re.compile(r'script\.google\.com/macros/s/(AKfy[A-Za-z0-9_-]{20,})/(exec|dev)'),
    script_src=re.compile(r'<script\b[^>]*\bsrc\s*=\s*["\']([^"\']+)["\']', re.I),
    iframe=re.compile(r'<iframe\b[^>]*\bsrc\s*=\s*["\']([^"\']+)["\']', re.I),
    storage=re.compile(r'(localStorage|sessionStorage)\.(?:getItem|setItem|removeItem)\(\s*[\'"]([^\'"\n]{2,60})[\'"]'),
    idb=re.compile(r'indexedDB\.open\(\s*[\'"]([^\'"\n]{2,60})[\'"]'),
    cron=re.compile(r'cron:\s*[\'"]([^\'"\n]+)[\'"]'),
    wf_name=re.compile(r'^name:\s*(.+)$', re.M),
    wf_run=re.compile(r'(?:node|python3?|bash|sh)\s+([A-Za-z0-9_./-]+\.(?:cjs|mjs|js|py|sh))'),
)
HOJAS_RX = re.compile(r'(?<![A-Za-z0-9_-])(1[A-Za-z0-9_-]{43})(?![A-Za-z0-9_-])')
GHIO = re.compile(r'https?://([a-z0-9-]+)\.github\.io/([A-Za-z0-9._-]+)/?([^?#\s"\']*)')
IGNORAR = {'potenciales-yod': ('grafo/', 'grafo-motor/datos/')}     # el grafo no se dibuja a sí mismo
# Lo que el grafo escribe en su repositorio al rehacerse: lo anterior y el registro de impacto, que cada borrador reescribe
# para poder fusionarse (rehacer.py, impacto()). Ese archivo sí se dibuja, pero su cambio solo no es «el sistema cambió»:
# sin esto, después de cada aprobación el grafo se veía atrasado y rehacerlo daba otro borrador sin nada nuevo.
PROPIO = {'potenciales-yod': IGNORAR['potenciales-yod'] + ('architecture-impact.json',)}
REL_IMPORTA = ('imports_from', 'imports', 'dynamic_import')
REL_ESCANEO = ('carga el script', 'incrusta', 'llama al Apps Script', 'documenta el Apps Script', 'referencia la hoja', 'documenta la hoja',
               'usa la llave del navegador', 'usa el secreto', 'ejecuta', 'corre en')


def sh(*a, cwd=None, ok=False):
    r = subprocess.run(a, cwd=cwd, capture_output=True, text=True)
    if r.returncode and not ok: raise RuntimeError(' '.join(a) + ' → ' + r.stderr.strip()[:300])
    return r.stdout


def clase(f):
    ext = os.path.splitext(f)[1].lower()
    return ('workflow' if f.startswith('.github/workflows/') else 'apps_script' if ext == '.gs' else 'pagina' if ext in ('.html', '.htm') else
            'prueba' if re.search(r'(^|/)(tests?|__tests__|spec)/|\.test\.|\.spec\.|^verify-', f) else 'codigo' if ext in CODE else 'documento' if ext in ('.md', '.txt') else
            'datos' if ext in ('.json', '.enc', '.csv') else 'estilo' if ext == '.css' else 'medio' if ext in MEDIO else 'otro')


def leer(p, tope=1_500_000):
    try:
        if os.path.getsize(p) > tope: return ''
        return open(p, encoding='utf-8', errors='ignore').read()
    except OSError:
        return ''


def inventario(d, tag=''):
    """Todos los archivos del repositorio con su clase y sus líneas; marca lo que es de terceros."""
    out = {}
    for f in sh('git', '-C', d, 'ls-files').splitlines():
        p = os.path.join(d, f)
        if not os.path.isfile(p) or os.path.islink(p) or f.startswith(IGNORAR.get(tag, ('\0',))): continue
        ext = os.path.splitext(f)[1].lower(); tercero = bool(SKIP_DIR.search(f) or SKIP_NAME.search(f)); lineas = 0
        if ext in TEXT and not tercero and os.path.getsize(p) <= 1_500_000: lineas = leer(p).count('\n') + 1
        out[f] = dict(clase=clase(f), lineas=lineas, tercero=tercero, bytes=os.path.getsize(p))
    return out


def con_nodo(inv, d):
    """Qué archivos son pieza del grafo: código, páginas, Apps Script, flujos, pruebas y documentos; de los datos,
       sólo los cercanos a la raíz que el código nombra."""
    sí = {f for f, a in inv.items() if not a['tercero'] and a['clase'] in ('codigo', 'apps_script', 'pagina', 'workflow', 'prueba', 'documento')}
    blob = '\n'.join(leer(os.path.join(d, f)) for f in sorted(sí) if inv[f]['clase'] != 'documento')
    for f, a in inv.items():
        b = f.split('/')[-1]
        if a['clase'] == 'datos' and not a['tercero'] and f.count('/') <= 2 and len(b) > 6 and b in blob: sí.add(f)
    return sí


def preparar(d, inv, dest):
    """Copia de sólo código para el extractor: .gs como .gs.js y los <script> en línea de cada página aparte,
       conservando el número de línea. Regresa {ruta preparada: ruta original}."""
    mapa = {}
    for f, a in inv.items():
        ext = os.path.splitext(f)[1].lower(); src = os.path.join(d, f)
        if SKIP_DIR_G.search(f) or SKIP_NAME.search(f): continue
        dst = None
        if ext in CODE_G or f.endswith('package.json'):
            if a['bytes'] > 600_000: continue
            if ext in ('.js', '.mjs', '.cjs'):
                head = open(src, 'rb').read(200_000).decode('utf-8', 'ignore')
                if head and max((len(l) for l in head.split('\n')), default=0) > 4000: continue
            dst = f; os.makedirs(os.path.dirname(os.path.join(dest, dst)) or dest, exist_ok=True); shutil.copyfile(src, os.path.join(dest, dst))
        elif ext == '.gs':
            dst = f + '.js'; os.makedirs(os.path.dirname(os.path.join(dest, dst)) or dest, exist_ok=True); shutil.copyfile(src, os.path.join(dest, dst))
        elif ext in ('.html', '.htm'):
            if a['bytes'] > 3_000_000: continue
            s = leer(src, 3_000_000); lines = [''] * (s.count('\n') + 1); jsx = hay = False
            for m in SCRIPT.finditer(s):
                attrs, body = m.group(1), m.group(2)
                if re.search(r'\bsrc\s*=', attrs, re.I) or not body.strip(): continue
                t = re.search(r'type\s*=\s*["\']?([^"\'\s>]+)', attrs, re.I); t = t.group(1).lower() if t else ''
                if t and t not in ('text/javascript', 'module', 'text/babel', 'application/javascript', 'text/jsx'): continue
                bl = body.split('\n')
                if max(len(l) for l in bl) > 4000: continue
                jsx = jsx or t in ('text/babel', 'text/jsx'); start = s.count('\n', 0, m.start(2))
                for i, l in enumerate(bl): lines[start + i] = (lines[start + i] + ' ' + l) if lines[start + i] else l
                hay = True
            if hay:
                dst = f + ('.inline.jsx' if jsx else '.inline.js'); os.makedirs(os.path.dirname(os.path.join(dest, dst)) or dest, exist_ok=True)
                open(os.path.join(dest, dst), 'w', encoding='utf-8').write('\n'.join(lines))
        if dst: mapa[dst] = f
    return mapa


def extraer(d, inv):
    """Corre el extractor AST de Graphify (sin IA) y regresa símbolos por archivo, importaciones entre archivos
       y cuántas relaciones cruzan de un archivo a otro."""
    tmp = tempfile.mkdtemp(prefix='grafo-')
    try:
        mapa = preparar(d, inv, tmp)
        if not mapa: return {}, [], collections.Counter()
        env = dict(os.environ, GRAPHIFY_QUERY_LOG_DISABLE='1', OPENAI_API_KEY='', ANTHROPIC_API_KEY='', GEMINI_API_KEY='', GOOGLE_API_KEY='', DEEPSEEK_API_KEY='')
        r = subprocess.run(['graphify', 'extract', '.', '--code-only'], cwd=tmp, capture_output=True, text=True, env=env)
        gj = os.path.join(tmp, 'graphify-out', 'graph.json')
        if r.returncode or not os.path.exists(gj): raise RuntimeError('graphify extract falló: ' + (r.stderr or r.stdout)[-400:])
        G = json.load(open(gj, encoding='utf-8'))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    de, es_arch, propio = {}, set(), set()
    for n in G['nodes']:
        sf = n.get('source_file') or ''; orig = mapa.get(sf)
        if orig is None: continue
        de[n['id']] = orig
        if n.get('source_location') == 'L1' and n.get('label', '') == sf.split('/')[-1]: es_arch.add(n['id'])
        elif not n.get('external') and n.get('file_type') not in ('concept', 'rationale'): propio.add(n['id'])
    sim = collections.defaultdict(list)
    for n in G['nodes']:
        if n['id'] not in propio: continue
        loc = str(n.get('source_location') or '')
        sim[de[n['id']]].append([n.get('label') or '', int(loc[1:]) if loc[1:].isdigit() else 0, 1 if n.get('_callable') else 0])
    imp, entre = [], collections.Counter()
    for l in G.get('links') or []:
        u, v = l['source'], l['target']
        if u not in de or v not in de or de[u] == de[v]: continue
        if u in es_arch and v in es_arch:
            if l.get('relation') in ('imports_from', 'imports', 'dynamic_import'): imp.append((de[u], de[v], l['relation'], str(l.get('source_location') or '')))
        elif (u in propio or u in es_arch) and (v in propio or v in es_arch):
            a, b = sorted((de[u], de[v])); entre[(a, b)] += 1
    return {k: sorted(v, key=lambda x: (x[1], x[0])) for k, v in sim.items()}, imp, entre


class Base:
    """La base en memoria. Igual que el grafo de Graphify, guarda una sola liga por par de piezas."""
    def __init__(self, B):
        self.B = B; self.N = B['nodos']; self.F = B['flechas']; self.SIM = B['simbolos']; self.REPOS = B['repos']
        self.fid = {(n.get('repo'), n.get('ruta')): i for i, n in self.N.items() if n.get('capa') in ARCH and n.get('ruta') is not None}
        self.pares = {frozenset((f['s'], f['t'])) for f in self.F}
        self.nota = []; self.deseo = []

    def flecha(self, s, t, r, sf='', loc='', c='viva'):
        par = frozenset((s, t))
        if s == t or s not in self.N or t not in self.N or par in self.pares: return False
        self.pares.add(par); self.F.append(dict(s=s, t=t, r=r, c=c, sf=sf, loc=loc, nota='', col='')); return True

    def pide(self, s, t, r, sf='', loc=''):
        if s != t and s in self.N and t in self.N: self.deseo.append((s, t, r, sf, loc))

    def quita_flechas(self, ks):
        if not ks: return
        self.B['flechas'] = self.F = [f for k, f in enumerate(self.F) if k not in ks]
        self.pares = {frozenset((f['s'], f['t'])) for f in self.F}

    def quita_nodo(self, i):
        self.N.pop(i, None); self.SIM.pop(i, None)

    def limpia(self):
        self.B['flechas'] = self.F = [f for f in self.F if f['s'] in self.N and f['t'] in self.N]
        self.pares = {frozenset((f['s'], f['t'])) for f in self.F}
        self.B['entre'] = [e for e in self.B['entre'] if e[0] in self.N and e[1] in self.N]
        self.B['simbolos'] = self.SIM = {k: v for k, v in self.SIM.items() if k in self.N}


def url_archivo(r, commit, ruta):
    return f"https://github.com/{r['owner']}/{r['repo']}/blob/{commit[:10]}/{urllib.parse.quote(ruta)}"


def cambiados(d, viejo, nuevo, todo):
    """Rutas que cambiaron entre el commit de la base y el de hoy. Sin historial suficiente, regresa None (= todo)."""
    if todo or not viejo: return None
    r = subprocess.run(['git', '-C', d, 'diff', '--name-status', '--no-renames', viejo, nuevo], capture_output=True, text=True)
    if r.returncode: return None
    return {l.split('\t', 1)[1] for l in r.stdout.splitlines() if '\t' in l}


def solo_propio(tag, cam):
    """True si entre un commit y otro no cambió nada, o sólo lo que el propio grafo escribe en su repositorio.
    Es el mismo criterio del vigilante (scripts/grafo-estado.cjs): eso no cuenta como «el sistema cambió»."""
    return cam is not None and all(p.startswith(PROPIO.get(tag, ('\0',))) for p in cam)


def refresca_repo(X, tag, d, model_own, todo=False):
    r = X.REPOS[tag]; N = X.N
    nuevo = sh('git', '-C', d, 'rev-parse', 'HEAD').strip()
    if nuevo.startswith(r['commit']) and not todo: return None
    cam = cambiados(d, r['commit'], nuevo, todo)
    if solo_propio(tag, cam): return None            # p. ej. el commit que aprueba un grafo: no hay nada nuevo que dibujar
    inv = inventario(d, tag); deben = con_nodo(inv, d)
    tenia = {ruta: i for (t, ruta), i in X.fid.items() if t == tag}
    res = dict(repo=f"{r['owner']}/{r['repo']}", de=r['commit'][:7], a=nuevo[:7], nuevos=[], quitados=[], cambiados=[], ligas_mas=0, ligas_menos=0)
    rn = f"repo:{r['owner']}/{r['repo']}"
    # 1 · archivos que ya no existen en el repositorio
    for ruta, i in tenia.items():
        if ruta not in inv: X.quita_nodo(i); X.fid.pop((tag, ruta), None); res['quitados'].append(ruta)
    X.limpia()
    # 2 · archivos nuevos
    own = sorted(model_own.get(f"{r['owner']}/{r['repo']}".lower(), []), key=lambda x: -len(x[0]))
    for ruta in sorted(deben - set(tenia)):
        a = inv[ruta]; capa = {'estilo': 'otro', 'medio': 'otro'}.get(a['clase'], a['clase']); i = f'f:{tag}:{ruta}'
        N[i] = dict(source_file=f'{tag}/{ruta}', source_location='L1', repo=tag, ruta=ruta, lineas=a['lineas'], url=url_archivo(r, nuevo, ruta), sens='publico',
                    label=ruta.split('/')[-1], capa=capa, ft='code' if capa in ('codigo', 'apps_script', 'pagina', 'workflow', 'prueba') else 'document')
        X.fid[(tag, ruta)] = i; res['nuevos'].append(ruta)
        X.flecha(rn, i, 'contiene', f'{tag}/{ruta}')
        mejor = next((x for x in own if ruta == x[0] or ruta.startswith(x[0].rstrip('/') + '/') or (x[0].endswith('/') and ruta.startswith(x[0])) or x[0] in ('', '.')), None)
        for k in (mejor[1] if mejor else []): X.flecha(k, i, 'se implementa en', ATL)
    # 3 · archivos a releer: los nuevos y los que cambiaron
    aqui = {ruta for (t, ruta) in X.fid if t == tag and ruta in inv}
    releer = {ruta for ruta in aqui if not inv[ruta]['tercero'] and (cam is None or ruta in cam or ruta in res['nuevos'])}
    sim, imp, entre = extraer(d, inv)
    ids = {X.fid[(tag, x)] for x in releer}
    for ruta in sorted(releer):
        i = X.fid[(tag, ruta)]; n = N[i]; a = inv[ruta]
        viejo = X.SIM.get(i) or []; hoy = sim.get(ruta) or []
        if ruta not in res['nuevos']:
            con_lineas = n.get('lineas') is not None
            if (con_lineas and int(a['lineas'] or 0) != int(n.get('lineas') or 0)) or sorted(viejo) != sorted(hoy):
                res['cambiados'].append(ruta)
                if con_lineas: n['url'] = url_archivo(r, nuevo, ruta)
            if con_lineas and a['lineas']: n['lineas'] = a['lineas']
        if sorted(viejo) != sorted(hoy):
            if hoy: X.SIM[i] = hoy
            else: X.SIM.pop(i, None)
    # 4 · ligas: se pide lo que hoy dice el código y se concilia con lo que había
    X.deseo = []
    for ruta in sorted(releer): escanea(X, tag, r, d, ruta, inv)
    for a_, b_, rel, loc in imp:
        if (a_ in releer or b_ in releer) and (tag, a_) in X.fid and (tag, b_) in X.fid: X.pide(X.fid[(tag, a_)], X.fid[(tag, b_)], rel, a_, loc)
    quiere = {frozenset((s_, t_)) for s_, t_, _, _, _ in X.deseo}
    fuera = set()
    textos = {}
    def texto(i):
        if i not in textos: textos[i] = leer(os.path.join(d, N[i]['ruta']))
        return textos[i]
    for k, f in enumerate(X.F):
        a_, b_ = f['s'], f['t']
        if a_ not in ids and b_ not in ids: continue
        t = N.get(b_) or {}
        if f['r'] in REL_IMPORTA:
            if frozenset((a_, b_)) not in quiere: fuera.add(k)
        elif a_ in ids and f['r'] in REL_ESCANEO and t.get('capa') != 'servicio':
            if frozenset((a_, b_)) not in quiere: fuera.add(k)
        elif a_ in ids and t.get('capa') == 'pestana' and f['r'] in ('abre la pestaña', 'menciona la pestaña') and (t.get('label') or '') not in texto(a_): fuera.add(k)
        elif a_ in ids and b_.startswith('prop:') and b_[5:] not in texto(a_): fuera.add(k)
        elif a_ in ids and b_.startswith('trg:') and b_.rsplit(':', 1)[-1] not in texto(a_): fuera.add(k)
    X.quita_flechas(fuera)
    mas = sum(1 for s_, t_, rel, sf, loc in X.deseo if X.flecha(s_, t_, rel, sf, loc))
    # 5 · «se llaman» entre archivos: lo viejo de los archivos releídos sale, lo nuevo entra
    viejas = {(e[0], e[1]): e[2] for e in X.B['entre']}
    E = {k: v for k, v in viejas.items() if k[0] not in ids and k[1] not in ids}
    for (a_, b_), n_ in sorted(entre.items()):
        if (a_ in releer or b_ in releer) and (tag, a_) in X.fid and (tag, b_) in X.fid:
            x, y = sorted((X.fid[(tag, a_)], X.fid[(tag, b_)])); E[(x, y)] = n_
    X.B['entre'] = [[a_, b_, n_] for (a_, b_), n_ in E.items()]
    # 6 · el repositorio
    c = collections.Counter(a['clase'] for a in inv.values())
    if rn in N:
        N[rn]['nota'] = (f"{r['papel']} · {r['vis']} · commit {nuevo[:7]} · {sum(c.values())} archivos: {c['codigo']} de código, {c['apps_script']} de Apps Script, {c['pagina']} páginas, "
                         f"{c['prueba']} pruebas, {c['workflow']} flujos, {c['documento']} documentos, {c['datos']} de datos, {c['medio']} medios")
    r['commit'] = nuevo[:10]
    X.limpia()
    res['ligas_mas'] = mas; res['ligas_menos'] = len(fuera)
    return res


def escanea(X, tag, r, d, ruta, inv):
    """Relee las ligas de un archivo con lo que hoy dice su texto."""
    N = X.N; i = X.fid[(tag, ruta)]; a = inv[ruta]; ext = os.path.splitext(ruta)[1].lower(); sf = f'{tag}/{ruta}'
    s = leer(os.path.join(d, ruta))
    if not s or ext not in TEXT: return
    if max((len(l) for l in s.split('\n')[:400]), default=0) > 20000 and ext != '.json': return
    doc = a['clase'] == 'documento'
    por_repo = {(v['owner'].lower(), v['repo'].lower()): t for t, v in X.REPOS.items()}

    def resolver(src):
        q = src.split('?')[0].split('#')[0]; m = GHIO.match(src)
        if m:
            tg = por_repo.get((m.group(1).lower(), m.group(2).lower()))
            if not tg: return None
            cand = m.group(3) or 'index.html'
            if cand.endswith('/'): cand += 'index.html'
            return X.fid.get((tg, cand)) or X.fid.get((tg, cand + '/index.html')) or f"repo:{X.REPOS[tg]['owner']}/{X.REPOS[tg]['repo']}"
        if src.startswith(('http:', 'https:', '//')) or q.startswith(('data:', 'blob:', 'javascript:')) or not q: return None
        p = os.path.normpath(os.path.join(os.path.dirname(ruta), q)).replace('\\', '/') if not q.startswith('/') else q.lstrip('/')
        return X.fid.get((tag, p))

    for k, l in enumerate(s.split('\n'), 1):
        if len(l) > 6000: continue
        loc = f'L{k}'
        for m in RX['exec'].finditer(l):
            t = f'gas:{m.group(1)[:12]}'
            if t in N: X.pide(i, t, 'documenta el Apps Script' if doc else 'llama al Apps Script', sf, loc)
            else: X.nota.append(f'{sf} {loc}: llama a un Apps Script que el grafo no conoce ({m.group(1)[:12]}…)')
        hojas = [m.group(1) for m in RX['sheet_url'].finditer(l)] + [m.group(1) for m in RX['sheet_open'].finditer(l)] + [m.group(2) for m in RX['sheet_const'].finditer(l) if not m.group(2).startswith('AKfy')]
        if doc and '1' in l: hojas += [h for h in HOJAS_RX.findall(l) if f'hoja:{h}' in N and h not in hojas]
        for h in hojas:
            if f'hoja:{h}' in N: X.pide(i, f'hoja:{h}', 'documenta la hoja' if doc else 'referencia la hoja', sf, loc)
        if ext in CODE or ext in ('.yml', '.yaml'):
            if a['clase'] != 'prueba':
                for donde, llave in [(m.group(1), m.group(2)) for m in RX['storage'].finditer(l)] + [('indexedDB', m.group(1)) for m in RX['idb'].finditer(l)]:
                    if 'synthetic' in llave: continue
                    t = f'ls:{llave}'
                    if t not in N: N[t] = dict(label=llave, source_file='navegador/almacen', capa='llave', estado='codigo', clase=donde, nota=f'Llave de {donde} en el navegador.', ft='concept')
                    X.pide(i, t, 'usa la llave del navegador', sf, loc)
        if ext in ('.html', '.htm'):
            for kind, rel in (('script_src', 'carga el script'), ('iframe', 'incrusta')):
                for m in RX[kind].finditer(l):
                    t = resolver(m.group(1))
                    if t: X.pide(i, t, rel, sf, loc)
    if a['clase'] == 'workflow':
        nm = RX['wf_name'].search(s); crons = RX['cron'].findall(s)
        secretos = sorted(set(re.findall(r'secrets\.([A-Z0-9_]+)', s)))
        cu = 'cron ' + ' | '.join(crons) if crons else ''
        N[i].update(capa='workflow', label=(nm.group(1).strip().strip('"\'') if nm else os.path.basename(ruta))[:70], cron=crons, secretos=secretos,
                    nota=' · '.join(z for z in [cu, 'a mano' if 'workflow_dispatch' in s else '', 'al hacer push' if re.search(r'^\s*push:', s, re.M) else '',
                                                 'en cada PR' if re.search(r'^\s*pull_request', s, re.M) else ''] if z))
        if 'EXT-ACTIONS' in N: X.pide(i, 'EXT-ACTIONS', 'corre en', sf)
        for x in sorted(set(RX['wf_run'].findall(s)))[:25]:
            t = X.fid.get((tag, x.lstrip('./')))
            if t: X.pide(i, t, 'ejecuta', sf)
        for x in secretos:
            t = f'sec:{x}'
            if t not in N: N[t] = dict(label=x, source_file='github/secretos', capa='llave', estado='codigo', clase='secreto de GitHub (sólo el nombre)',
                                       nota='Nombre de un secreto de GitHub Actions. El valor no está en el repo.', ft='concept')
            X.pide(i, t, 'usa el secreto', sf)


# ── atlas ───────────────────────────────────────────────────────────────────────────────────────────
def _col(cid):
    for pat, c in [('OBRA-CLIENTE', 'cobrar'), ('FLUJO', 'cobrar'), ('CODES', 'acordar'), ('MARKETING', 'captar'), ('PLAN-POTENCIAL', 'captar'), ('CROKISS', 'captar'), ('SALA', 'captar'), ('META', 'captar'),
                   ('MEDIA', 'captar'), ('AURUM', 'captar'), ('METRICAS', 'captar'), ('POTENCIALES', 'evaluar'), ('PPP', 'evaluar'), ('MERCADO', 'evaluar'), ('CRM', 'evaluar'), ('INVERSION', 'evaluar'),
                   ('TRACK', 'ejecutar'), ('MIRAMAR', 'ejecutar'), ('INTERIORES', 'ejecutar'), ('ALQUIMIA', 'ejecutar'), ('OBRA', 'ejecutar'), ('AMALAYA', 'ejecutar'), ('TAREAS', 'ejecutar'),
                   ('OPERACION', 'ejecutar'), ('MOAC', 'ejecutar')]:
        if pat in cid: return c
    return 'dirigir'


def _row(tp):
    if tp in ('apps_script', 'worker', 'automatizacion'): return 'motores'
    if tp.startswith('google_sheets') or tp.startswith('almacen'): return 'datos'
    if tp in ('servicio_externo', 'infraestructura', 'sitio_externo', 'aplicacion_local'): return 'externos'
    return 'pantallas'


CAPA_R = dict(pantallas='sistema', motores='motor', datos='almacen', externos='externo')
EST = dict(ejecucion='vivo', codigo='codigo', declarado='declarado', propuesto='propuesto', pendiente='propuesto')


def reglas():
    with open(os.path.join(AQUI, 'datos', 'reglas.json'), encoding='utf-8') as f: return json.load(f)


def reglas_excluir(): return reglas().get('excluir') or {}
def reglas_publicos(): return reglas().get('publicos') or []


OTRO_SISTEMA = 'otro sistema'                 # lo que queda en un texto del atlas donde se nombraba algo excluido
IDS_ATLAS = ('id', 'from', 'to', 'components', 'boards', 'repo')    # en el atlas, llaves que son ids y no texto


def _textos(o, f, salta=()):
    """Aplica f a cada texto dentro de o (dicts y listas), sin tocar las llaves de `salta`."""
    if isinstance(o, str): return f(o)
    if isinstance(o, list): return [_textos(x, f, salta) for x in o]
    if isinstance(o, dict): return {k: (v if k in salta else _textos(v, f, salta)) for k, v in o.items()}
    return o


def filtra_atlas(M, R=None):
    """El modelo del atlas sin lo que Dirección decidió no publicar (reglas.json → "excluir"), ANTES de sincronizarlo.
    Si entrara y excluye() lo quitara después, cada rehecho lo contaría como «piezas nuevas» en su resumen y esos nombres
    quedarían publicados en grafo/versiones.json y en la explicación de la IA (pasó el 12-nov-2026 con el borrador
    G-20261112-1147). Quita componentes, procesos, contratos y propuestas cuyo id cumple la regla, las conexiones que los
    tocan y sus menciones dentro de procesos, contratos y propuestas que sí se quedan (una propuesta que sólo mejoraba algo
    excluido también sale). En los textos de lo que se queda, lo que cumple "textos" se cambia por «otro sistema»."""
    R = R if R is not None else reglas_excluir()
    pats = [re.compile(x) for x in (R.get('ids') or []) + (R.get('comp') or [])]
    txt = [re.compile(x) for x in R.get('textos') or []]
    fuera = lambda i: any(p.search(str(i or '')) for p in pats)
    if not (pats or txt) or not M: return M
    M = json.loads(json.dumps(M))
    M['components'] = [c for c in M.get('components') or [] if not fuera(c.get('id'))]
    M['connections'] = [c for c in M.get('connections') or [] if not (fuera(c.get('from')) or fuera(c.get('to')))]
    M['data_contracts'] = [dict(c, components=[k for k in c.get('components') or [] if not fuera(k)]) for c in M.get('data_contracts') or [] if not fuera(c.get('id'))]
    M['processes'] = [dict(p, steps=[dict(s, components=[k for k in s.get('components') or [] if not fuera(k)]) for s in p.get('steps') or []])
                      for p in M.get('processes') or [] if not fuera(p.get('id'))]
    props = []
    for p in M.get('proposals') or []:
        if fuera(p.get('id')) or fuera(f"PROP-{p.get('id')}"): continue
        tableros = p.get('boards') or []; quedan = [k for k in tableros if not fuera(k)]
        if tableros and not quedan: continue
        props.append(dict(p, boards=quedan) if tableros else p)
    M['proposals'] = props
    if txt:
        tapa = lambda s: functools.reduce(lambda a, p: p.sub(OTRO_SISTEMA, a), txt, s)
        for k in ('components', 'connections', 'data_contracts', 'processes', 'proposals'):
            M[k] = _textos(M.get(k) or [], tapa, IDS_ATLAS)
    return M


# ── sólo repositorios públicos ──────────────────────────────────────────────────────────────────────
# reglas.json → "publicos" es la lista de los repositorios que el grafo puede nombrar, revisada a mano y vigilada por
# LoPublicado. Lo que no está ahí no se publica: ni sus piezas ni su nombre en los textos. Los nombres de los repositorios
# NO públicos no se escriben en este repositorio (es público), y tampoco se guardan sus huellas: una huella sin clave deja
# confirmar el nombre a quien lo adivine (dictamen del PR 90, H1). En cada refresco se sacan del atlas, sólo en memoria, y
# con ellas se reconoce y se tapa el nombre en cualquier texto. Si el atlas deja de nombrar un repositorio no público, su
# nombre corto ya no se reconoce; el «dueño/nombre» completo se sigue tapando porque no está en la lista. La visibilidad
# real la comprueba rehacer.py: lee sin credencial cada repositorio de la lista; si uno que el grafo rastrea no contesta,
# no abre borrador; si no contesta uno que sólo sale en textos, se tapa su nombre completo (--tapar) y sigue.
REPO_PRIVADO = 'un repositorio privado'
TROZO = re.compile(r'[A-Za-z0-9._/-]+')


def huella_nombre(n): return hashlib.sha256(('grafo:' + str(n).strip().lower()).encode('utf-8')).hexdigest()[:16]


def _segmentos(trozo): return [s.strip('.-_') for s in trozo.split('/')]


def nombra_privado(trozo, H):
    """¿El trozo (una palabra o una ruta) nombra un repositorio cuya huella está en H? Mira cada tramo y cada par dueño/nombre."""
    s = _segmentos(trozo)
    return any(huella_nombre(x) in H for x in s if x) or any(huella_nombre(a + '/' + b) in H for a, b in zip(s, s[1:]) if a and b)


def huellas_no_publicos(M, publicos):
    """Huellas de los repositorios que el atlas nombra y que no son públicos: los que él marca así y los que no están en la
    lista. Del nombre completo y, si no choca con el de un repositorio público, también del corto. Se usan y se tiran: no
    se guardan en la base."""
    pub = {p.lower() for p in publicos}; cortos = {p.split('/', 1)[-1] for p in pub}; otros = set()
    for r in (M or {}).get('repositories') or []:
        n = str(r.get('repo') or '')
        if '/' in n and (n.lower() not in pub or str(r.get('visibility') or '').lower() != 'public'): otros.add(n.lower())
    for k in ('components', 'path_ownership'):
        for c in (M or {}).get(k) or []:
            n = str(c.get('repo') or '')
            if '/' in n and n.lower() not in pub: otros.add(n.lower())
    marcados = sorted(n for n in otros if n in pub)          # en la lista, pero el atlas dice que no son públicos
    H = {huella_nombre(n) for n in otros} | {huella_nombre(n.split('/', 1)[1]) for n in otros if n.split('/', 1)[1] not in cortos}
    return H, marcados


def solo_publicos(X, publicos, H=()):
    """Quita del grafo lo que no es de un repositorio público: repositorios fuera de la lista con sus piezas, piezas de
    repositorio que no están en la lista, y en los textos cualquier «dueño/nombre» fuera de la lista o cualquier nombre con
    huella en H (se cambia por «un repositorio privado»; una liga a ese repositorio se quita). Regresa cuántas piezas quitó
    y cuántos textos tapó; nunca los nombres."""
    pub = {p.lower() for p in publicos}; H = set(H)
    for tag in [t for t, r in X.REPOS.items() if f"{r['owner']}/{r['repo']}".lower() not in pub]: del X.REPOS[tag]
    tags = set(X.REPOS)
    fuera = [i for i, n in X.N.items() if (n.get('capa') == 'repo' and i.startswith('repo:') and i[5:].lower() not in pub)
             or (n.get('capa') != 'repo' and n.get('repo') and n['repo'] not in tags)]
    for i in fuera: X.quita_nodo(i)
    duenos = sorted({p.split('/', 1)[0] for p in pub})
    citado = re.compile(r'(?<![A-Za-z0-9._-])(' + '|'.join(map(re.escape, duenos)) + r')/([A-Za-z0-9._-]*[A-Za-z0-9_-])', re.I) if duenos else None
    def privado(t):
        return nombra_privado(t, H) or bool(citado and any(f'{o}/{r}'.lower() not in pub for o, r in citado.findall(t)))
    def tapa(s):
        def uno(m):
            t = m.group(0); nucleo = t.rstrip('./-_')
            return REPO_PRIVADO + t[len(nucleo):] if privado(nucleo) else t
        return TROZO.sub(uno, s)
    tapados = 0
    for i, n in X.N.items():
        for k, v in list(n.items()):
            if k in ('capa', 'ft', 'repo', 'ruta', 'source_file', 'source_location', 'local_id'): continue
            if k == 'url':
                if isinstance(v, str) and privado(v): del n[k]; tapados += 1
            elif k == 'en_codigo' and isinstance(v, list):
                w = [x for x in v if x in tags]
                if w != v: n[k] = w; tapados += 1
            else:
                w = _textos(v, tapa)
                if w != v: n[k] = w; tapados += 1
    for f in X.F:
        for k in ('r', 'nota', 'sf'):
            if isinstance(f.get(k), str):
                w = tapa(f[k])
                if w != f[k]: f[k] = w; tapados += 1
    X.limpia(); X.fid = {(n.get('repo'), n.get('ruta')): i for i, n in X.N.items() if n.get('capa') in ARCH and n.get('ruta') is not None}
    return dict(piezas=len(fuera), textos=tapados)


def sincroniza_atlas(X, M):
    """Componentes, conexiones, contratos, procesos y propuestas del modelo vigente. A lo que ya existe sólo se le
       actualiza lo que el atlas declara (estado, producción, fuente, decisión); la descripción curada se respeta."""
    N = X.N; res = dict(componentes_nuevos=[], componentes_fuera=[], conexiones_mas=0, conexiones_menos=0, estados=[], propuestas=[], revision=M.get('revision'))
    es_atlas = lambda i: N[i].get('source_file') == ATL
    comp = {c['id']: c for c in M['components']}
    for cid, c in comp.items():
        est = EST.get(c.get('status'), 'declarado'); prod = (c.get('runtime_status') or '')[:260]
        if cid in N:
            if es_atlas(cid):
                if N[cid].get('estado') != est: res['estados'].append(f"{cid}: {N[cid].get('estado')} → {est}"); N[cid]['estado'] = est
                if prod: N[cid]['prod'] = prod
                if c.get('source_of_truth'): N[cid]['fuente'] = c['source_of_truth']
        else:
            r = _row(c['tipo'])
            N[cid] = dict(label=c['nombre'], source_file=ATL, capa=CAPA_R[r], col=_col(cid), row=r, estado=est, tipo=c['tipo'], nota=c.get('proposito') or '', menu='False',
                          fuente=c.get('source_of_truth') or '', entidades=', '.join(c.get('data_entities') or []), prod=prod, ft='concept')
            res['componentes_nuevos'].append(cid)
    for i in [i for i, n in N.items() if n.get('capa') in ('sistema', 'motor', 'almacen', 'externo') and es_atlas(i) and i not in comp and re.match(r'^(SYS|GAS|SHEET|SVC|STORE|EXT)-', i)]:
        X.quita_nodo(i); res['componentes_fuera'].append(i)
    X.limpia()
    # conexiones: las del atlas entre componentes se rehacen con el modelo de hoy
    quiere = {}
    for c in M['connections']:
        if c['from'] in N and c['to'] in N and c['from'] != c['to']:
            quiere.setdefault(frozenset((c['from'], c['to'])), []).append((c['from'], c['to'], c['label'][:90], 'propuesta' if c['status'] in ('propuesto', 'pendiente') else 'viva'))
    ids = set(comp)
    tiene = {frozenset((f['s'], f['t'])): k for k, f in enumerate(X.F) if f['sf'] == ATL and f['s'] in ids and f['t'] in ids and f['r'] not in ('vive en',)}
    sobran = set()
    for par, k in tiene.items():
        cand = quiere.get(par)
        if not cand: sobran.add(k); continue
        f = X.F[k]; igual = next((x for x in cand if x[2] == f['r']), None)
        if igual: f['c'] = igual[3]
        else: f['s'], f['t'], f['r'], f['c'] = cand[0]; res['conexiones_mas'] += 1; res['conexiones_menos'] += 1
    X.quita_flechas(sobran)
    for par, cand in sorted(quiere.items(), key=lambda x: sorted(x[0])):
        if par not in tiene and X.flecha(cand[0][0], cand[0][1], cand[0][2], ATL, c=cand[0][3]): res['conexiones_mas'] += 1
    res['conexiones_menos'] += len(sobran)
    for c in M.get('data_contracts') or []:
        if c['id'] not in N:
            N[c['id']] = dict(label=c['id'], source_file=ATL, capa='contrato', ft='concept', reglas=' · '.join(c.get('invariants') or [])[:400],
                              nota=f"{c.get('source', '')} · Entra: {', '.join(c.get('input') or [])[:160]} · Sale: {', '.join(c.get('output') or [])[:160]}")
            for k in c.get('components') or []: X.flecha(c['id'], k, 'rige a', ATL)
    for p in M.get('processes') or []:
        if p['id'] in N:
            est = EST.get(p.get('status'), 'declarado')
            if N[p['id']].get('estado') != est: res['estados'].append(f"{p['id']}: {N[p['id']].get('estado')} → {est}"); N[p['id']]['estado'] = est
            continue
        N[p['id']] = dict(label=p['nombre'], source_file=ATL, capa='proceso', estado=EST.get(p.get('status'), 'declarado'), ft='concept',
                          nota='Huecos manuales: ' + ' · '.join(str(g) for g in p.get('manual_gaps') or [])[:500])
        prev = p['id']
        for k, s in enumerate(p['steps'], 1):
            si = f"{p['id']}·{k}"; N[si] = dict(label=f"{k}. {s['label']}", source_file=ATL, capa='paso', nota=f"{s.get('role', '')} · {s.get('mode', '')}", ft='concept')
            X.flecha(prev, si, 'sigue' if k > 1 else 'empieza con', ATL); prev = si
            for c in s.get('components') or []: X.flecha(si, c, 'ocurre en', ATL)
        res['componentes_nuevos'].append(p['id'])
    for p in M.get('proposals') or []:
        i = f"PROP-{p['id']}"; dec = str(p.get('decision') or '')
        if i in N:
            if N[i].get('decision') != dec: res['propuestas'].append(f"{p['id']}: {N[i].get('decision')} → {dec}"); N[i]['decision'] = dec
        else:
            N[i] = dict(label=f"{p['id']} · {p['titulo']}", source_file=ATL, capa='propuesta', estado='propuesto', ft='concept', decision=dec, prioridad=str(p.get('priority') or ''),
                        esfuerzo=str(p.get('effort') or ''), nota=f"{p.get('problem') or ''} → {p.get('benefit') or ''}"[:400])
            for k in p.get('boards') or []: X.flecha(i, k, 'mejora', ATL, c='propuesta')
            res['propuestas'].append(f"{p['id']}: nueva")
    X.limpia()
    return res


# ── contrato del Plan de Potencial: lo que leen las presentaciones ──────────────────────────────────
MOTORES = dict(vertical='mixto.html', macrolotes='macrolotes.html', unifamiliar='unifamiliar.html', residencial='residencial.html', patrimonial='patrimonial.html')


def excluye(X, R=None):
    """Quita del grafo lo que Dirección decidió no publicar (reglas.json → "excluir"): piezas cuyo id o ruta cumplen los
    patrones, con sus flechas, pares y símbolos. Corre después del atlas y de los repositorios, así nada vuelve a entrar."""
    R = R if R is not None else reglas_excluir()
    ids = [re.compile(x) for x in R.get('ids') or []]; rutas = [re.compile(x) for x in R.get('rutas') or []]; comp = [re.compile(x) for x in R.get('comp') or []]
    fuera = [i for i, n in X.N.items() if any(p.search(i) for p in ids) or any(p.search(str(n.get('comp') or '')) for p in comp)
             or any(p.search(str(n.get(k) or '')) for k in ('ruta', 'source_file') for p in rutas)]
    for i in fuera: X.quita_nodo(i)
    X.limpia(); X.fid = {(n.get('repo'), n.get('ruta')): i for i, n in X.N.items() if n.get('capa') in ARCH and n.get('ruta') is not None}
    return sorted(fuera)


def filtra_cambios(res, R=None):
    """Lo excluido tampoco se nombra en el informe del rehecho (archivos nuevos, quitados o cambiados por repositorio y notas),
    que es lo que leen la IA, el PR del borrador y grafo/versiones.json. excluye() limpia el grafo; esto limpia lo que se cuenta
    de él. 12-nov-2026: el resumen del borrador G-20261112-1351 nombraba el sistema excluido porque yod-portal agregó
    archivos en su carpeta."""
    R = R if R is not None else reglas_excluir()
    rutas = [re.compile(x) for x in R.get('rutas') or []]
    fuera = lambda p: any(x.search(p) for x in rutas)
    quitados = 0
    for r in res.get('repos') or []:
        for k in ('nuevos', 'quitados', 'cambiados'):
            antes = r.get(k) or []; r[k] = [p for p in antes if not fuera(p)]; quitados += len(antes) - len(r[k])

    def nota_fuera(n):
        sf = str(n).split(' ', 1)[0]
        return fuera(sf) or fuera(sf.split('/', 1)[-1])
    notas = res.get('notas') or []
    res['notas'] = [n for n in notas if not nota_fuera(n)]
    return quitados + len(notas) - len(res['notas'])


def contrato_ppp(d):
    out = {}
    for tipo, arch in MOTORES.items():
        s = leer(os.path.join(d, arch), 6_000_000)
        if not s: continue
        a = s.find('function resumenActual'); b = s.find('function refreshJson', a)
        cuerpo = s[a:b] if a >= 0 and b > a else ''
        cuerpo = cuerpo[cuerpo.find('return{'):] if 'return{' in cuerpo else cuerpo[cuerpo.find('return {'):]
        res = list(dict.fromkeys(re.findall(r'[{,]\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:', cuerpo)))
        ent = list(dict.fromkeys(re.findall(r'\bid\s*=\s*["\'](in[A-Z][A-Za-z0-9]*)["\']', s)))
        out[tipo] = dict(archivo=arch, resultados=res, entradas=ent)
    return out


# ── diferencias entre dos bases, en lenguaje llano ──────────────────────────────────────────────────
def diferencias(A, Bn):
    na, nb = A['nodos'], Bn['nodos']
    ka = {(f['s'], f['t'], f['r']) for f in A['flechas']}; kb = {(f['s'], f['t'], f['r']) for f in Bn['flechas']}
    capa = lambda n: n.get('capa') or 'otro'
    mas = collections.Counter(capa(nb[i]) for i in nb if i not in na); menos = collections.Counter(capa(na[i]) for i in na if i not in nb)
    cambia = [i for i in nb if i in na and na[i] != nb[i]]
    pa, pb = A.get('ppp') or {}, Bn.get('ppp') or {}
    ppp = {}
    for t in sorted(set(pa) | set(pb)):
        ra, rb = set((pa.get(t) or {}).get('resultados') or []), set((pb.get(t) or {}).get('resultados') or [])
        ea, eb = set((pa.get(t) or {}).get('entradas') or []), set((pb.get(t) or {}).get('entradas') or [])
        if ra != rb or ea != eb: ppp[t] = dict(resultados_mas=sorted(rb - ra), resultados_menos=sorted(ra - rb), entradas_mas=sorted(eb - ea), entradas_menos=sorted(ea - eb))
    return dict(piezas_mas=dict(mas), piezas_menos=dict(menos), piezas_cambiadas=len(cambia), ligas_mas=len(kb - ka), ligas_menos=len(ka - kb),
                piezas=len(nb), ligas=len(kb), ppp=ppp, primer_ppp=not pa and bool(pb))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--repos', required=True); ap.add_argument('--base', default=os.path.join(AQUI, 'datos', 'base.json'))
    ap.add_argument('--salida'); ap.add_argument('--cambios'); ap.add_argument('--todo', action='store_true'); ap.add_argument('--hoy', default='')
    ap.add_argument('--tapar', action='append', default=[], help='dueño/nombre de la lista de públicos que hoy no contestó: se tapa en los textos')
    a = ap.parse_args()
    B = json.load(open(a.base, encoding='utf-8')); A = json.loads(json.dumps(B)); X = Base(B)
    res = dict(repos=[], faltan=[], atlas=None, notas=X.nota)
    own = collections.defaultdict(list)
    mp = os.path.join(a.repos, 'yod-portal', 'docs', 'arquitectura', 'modelo.json')
    M = json.load(open(mp, encoding='utf-8')) if os.path.exists(mp) else None
    for po in (M or {}).get('path_ownership') or []: own[po['repo'].lower()].append((po['prefix'], po['components']))
    for tag in sorted(X.REPOS):
        d = os.path.join(a.repos, tag)
        if not os.path.isdir(os.path.join(d, '.git')): res['faltan'].append(tag); continue
        r = refresca_repo(X, tag, d, own, a.todo)
        if r: res['repos'].append(r)
    if M: res['atlas'] = sincroniza_atlas(X, filtra_atlas(M))
    res['excluidos'] = excluye(X)
    res['excluidos_en_informe'] = filtra_cambios(res)
    # --tapar: repositorios de la lista que hoy no contestaron sin credencial y que el grafo no rastrea (sólo salen en
    # textos). Por esta vez cuentan como no públicos: se tapa su «dueño/nombre» completo. El corto no, porque casi siempre es
    # también el de un repositorio público que sí contestó (las casas viejas) y podría ser una palabra común.
    tapar = {n.lower() for n in a.tapar}
    publicos = [p for p in reglas_publicos() if p.lower() not in tapar]; pub = {p.lower() for p in publicos}
    H, marcados = huellas_no_publicos(M, publicos) if M else (set(), [])
    H |= {huella_nombre(n) for n in tapar}
    H -= {huella_nombre(p) for p in pub} | {huella_nombre(p.split('/', 1)[-1]) for p in pub | tapar}
    res['no_publicos'] = solo_publicos(X, publicos, H)
    res['marcados_no_publicos'] = marcados             # en la lista de públicos, pero el atlas dice que no lo son: rehacer no abre borrador
    B.pop('no_publicos', None)                         # las huellas no se guardan (las bases anteriores al 13-nov-2026 las traían)
    pd = os.path.join(a.repos, 'potenciales-yod')
    if os.path.isdir(pd): B['ppp'] = contrato_ppp(pd)
    if a.hoy: B['armado'] = a.hoy
    res['resumen'] = diferencias(A, B)
    json.dump(B, open(a.salida or a.base, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    if a.cambios: json.dump(res, open(a.cambios, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    s = res['resumen']
    print(f"repos con cambios: {len(res['repos'])} · piezas {s['piezas']} (+{sum(s['piezas_mas'].values())} −{sum(s['piezas_menos'].values())}, {s['piezas_cambiadas']} cambiadas) · "
          f"ligas {s['ligas']} (+{s['ligas_mas']} −{s['ligas_menos']})" + (f" · faltan clones: {res['faltan']}" if res['faltan'] else ''))


if __name__ == '__main__':
    main()
