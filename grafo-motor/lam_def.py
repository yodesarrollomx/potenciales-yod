"""Definición de cada lámina: qué piezas entran y en qué celda (columna × fila) va cada una."""
from lam_base import *
class P:
    PANT = R['pantallas']; PUERTAS = [(x,) for x in R['puertas']]
LLAVES = [(k,) for k in R['llaves']]; HMB = R['hmb']

IDX = collections.defaultdict(lambda: collections.defaultdict(list))
for _i in N:
    IDX[area_de(_i)][capa(_i)].append(_i)
LAMS = []
def nueva(*a, **k):
    L = Lam(*a, **k); LAMS.append(L); return L
ARCH = ('codigo', 'pagina', 'apps_script', 'prueba', 'workflow', 'documento', 'datos', 'otro')
def activo(r): return not N[r].get('estado')
def peso(i): return -(GRADO[i] + len(SIM.get(i, ())) // 4), N[i].get('label') or ''
def lam_tablero(a): return 'tablero-' + a
def lam_codigo(tag): return 'codigo-' + slug(tag)
def lam_libro(h): return 'libro-' + slug(N[h].get('label') or h)[:38]
def lam_pantalla(pid): return 'pantalla-' + pid[4:]
TABS_DE = collections.defaultdict(list)
for _f in F:
    if _f['r'] == 'tiene pestaña': TABS_DE[_f['s']].append(_f['t'])
LIBROS_CON = [h for h in TABS_DE if capa(h) == 'hoja' and not h.startswith('hoja:ligada')]
REPO_NODO = {N[r].get('repo'): r for r in N if capa(r) == 'repo' and activo(r) and N[r].get('repo') in REPOS and r.split(':')[1].split('/')[0] == REPOS[N[r]['repo']]['owner']}

# ── 00 · mapa general ─────────────────────────────────────────────────────────────────────────────
def mapa():
    L = nueva('mapa', 'Mapa general', 'Todo YOD OS en una hoja. Cada fila es un tablero del menú; de izquierda a derecha va de quién lo usa al libro donde queda el dato. '
              'Toca un tablero, un repositorio o un libro y entra con «Entrar». No dibujo las flechas hacia el Portero y la cabina: todos los tableros pasan por ahí.',
              [('quien', 'Quién'), ('tablero', 'Tablero'), ('repo', 'Código'), ('motor', 'Motor'), ('libro', 'Libro')], AREAS,
              'Recorrido: de la persona al dato', 'Tablero del menú', seccion='Mapa', objetivo=3, kmax=4, dy=76,
              sin=('contiene', 'se mudó a', 'tiene un libro', 'Navega al sistema autorizado', 'Canje de sesión y permisos', 'Agrega indicadores en tablero cenital', 'señala', 'tiene plan'))
    for a, _ in AREAS:
        L.pon_varios(IDX[a]['persona'] + IDX[a]['organizacion'], 'quien', a)
        L.pon_varios(IDX[a]['sistema'], 'tablero', a, clave=lambda i: (not N[i].get('menu'), N[i].get('label') or ''))
        L.pon_varios([r for r in IDX[a]['repo'] if activo(r)], 'repo', a)
        L.pon_varios(IDX[a]['motor'], 'motor', a, tope=8, bolsa='motores más')
        hs = [h for h in IDX[a]['hoja'] if N[h].get('clase') == 'operativa' and not h.startswith('hoja:ligada')]
        L.pon_varios(hs, 'libro', a, tope=7, bolsa='libros más', dentro='libros')
        otros = [h for h in IDX[a]['hoja'] if h not in L.pos and not h.startswith('hoja:ligada')]
        if otros and f'mas:mapa:libro:{a}' not in L.sint:
            L.bolsa(f'copias:{a}', f'{len(otros)} libros de caso, copias y respaldos' if len(otros) > 1 else '1 libro de caso, copia o respaldo', 'libro', a, [N[h]['label'] for h in otros][:120], dentro='libros')
    viejos = [r for r in N if capa(r) == 'repo' and N[r].get('estado') in ('cascarón', 'archivado', 'bifurcación')]
    L.bolsa('casa-vieja', f'{len(viejos)} repos de la casa vieja', 'repo', 'control', [N[r]['label'] + ' · ' + (N[r].get('estado') or '') for r in viejos], dentro='casa-vieja',
            nota='Cascarones que reenvían, repos archivados y una bifurcación.')
    for s in N:
        if capa(s) == 'almacen':
            hs = vecinos(s, rel=('es el libro',), capas=('hoja',))
            for m in vecinos(s, capas=('motor',)):
                for h in hs:
                    if m in L.pos and h in L.pos: L.flecha(m, h, 'guarda en', 'viva', 'atlas y libro leído')
    return L

# ── 01 · un tablero por dentro ────────────────────────────────────────────────────────────────────
def tablero(a):
    nom = ANOM[a]
    L = nueva(lam_tablero(a), 'Tablero · ' + nom, f'{nom} por dentro. Arriba, la pantalla que propongo y sus zonas; en medio, lo que existe hoy; abajo, lo que corre solo. '
              'Las flechas punteadas son propuesta; las rojas, lo que falta.',
              [('quien', 'Quién'), ('pantalla', 'Pantalla'), ('codigo', 'Código'), ('motor', 'Motor'), ('libro', 'Libro'), ('pestana', 'Pestañas')],
              [('propuesta', 'Propuesta'), ('hoy', 'Hoy'), ('auto', 'Corre solo')], 'Recorrido: de la persona al dato', 'De la propuesta a lo que corre solo',
              padre='mapa', seccion='Tableros', objetivo=6, kmax=4, ancho={'pantalla': 190}, sin=('contiene', 'se mudó a', 'tiene un libro', 'cambia', 'rige a', 'ocurre en', 'mejora', 'muestra', 'deja fuera'))
    L.corta = True
    sis = sorted(IDX[a]['sistema'], key=lambda i: (not N[i].get('menu'), N[i].get('label') or ''))
    pans = sorted(IDX[a]['pantalla'], key=lambda i: N[i].get('orden') or 0)
    # propuesta
    for p in pans:
        L.pon(p, 'pantalla', 'propuesta')
        for z in sorted(vecinos(p, rel=('muestra',), sentido=1), key=lambda i: N[i].get('orden') or 0): L.pon(z, 'pantalla', 'propuesta')
    puertas = [q for p in pans for q in vecinos(p, rel=('ve',), sentido=-1)]
    L.pon_varios(puertas, 'quien', 'propuesta', clave=lambda i: N[i].get('label') or '')
    for p in pans:
        for m in vecinos(p, rel=('contiene',), capas=('menu',), sentido=-1): L.pon(m, 'pantalla', 'propuesta', orden=-1)
    # hoy
    pers = list(IDX[a]['persona']) + list(IDX[a]['organizacion'])
    for s in sis: pers += vecinos(s, capas=('persona', 'organizacion'))
    for p in pans: pers += vecinos(p, rel=('entra a',), capas=('persona',), sentido=-1)
    L.pon_varios(pers, 'quien', 'hoy', clave=lambda i: (capa(i) != 'persona', N[i].get('label') or ''))
    for s in sis: L.pon(s, 'pantalla', 'hoy')
    L.pon_varios(IDX[a]['pagina'], 'pantalla', 'hoy', tope=20, bolsa='páginas más', clave=peso)
    reps = [r for r in IDX[a]['repo'] if activo(r)]
    for r in reps: L.pon(r, 'codigo', 'hoy')
    L.pon_varios(IDX[a]['codigo'], 'codigo', 'hoy', tope=22, bolsa='archivos más', clave=peso, dentro=lam_codigo(N[reps[0]]['repo']) if reps else None)
    L.pon_varios(IDX[a]['motor'], 'motor', 'hoy')
    L.pon_varios(IDX[a]['endpoint'], 'motor', 'hoy')
    L.pon_varios(IDX[a]['proyecto_gas'], 'motor', 'hoy')
    L.pon_varios(IDX[a]['apps_script'], 'motor', 'hoy', tope=14, bolsa='archivos de Apps Script más', clave=peso)
    hojas = [h for h in IDX[a]['hoja'] if not h.startswith('hoja:ligada')]
    hojas.sort(key=lambda h: (N[h].get('clase') != 'operativa', -len(TABS_DE.get(h, ())), N[h].get('label') or ''))
    L.pon_varios(hojas, 'libro', 'hoy', tope=10, bolsa='libros más', dentro='libros', clave=lambda h: hojas.index(h))
    usadas = set()
    for p in pans:
        for z in vecinos(p, rel=('muestra',), sentido=1): usadas.update(vecinos(z, rel=('sale de',), sentido=1))
    tabs = [t for t in IDX[a]['pestana'] if N[t].get('hoja') in L.pos or t in usadas]
    tabs.sort(key=lambda t: (t not in usadas, not isinstance(N[t].get('cols'), list), -GRADO[t], N[t].get('label') or ''))
    L.pon_varios(tabs, 'pestana', 'hoy', tope=44, bolsa='pestañas más', clave=lambda t: tabs.index(t))
    # fuentes de las zonas que viven en otro tablero
    for u in usadas:
        if u in L.pos: continue
        c = capa(u)
        if c == 'pestana':
            L.pon(u, 'pestana', 'propuesta'); h = N[u].get('hoja')
            if h in N: L.pon(h, 'libro', 'propuesta')
        elif c == 'hoja': L.pon(u, 'libro', 'propuesta')
        elif c in ('motor', 'almacen'): L.pon(u, 'libro' if u.startswith(('N-', 'STORE-', 'SHEET-', 'X-')) else 'motor', 'propuesta')
        elif c in ('sistema',): L.pon(u, 'pantalla', 'hoy')
        elif c in ('clave', 'proceso', 'propuesta', 'externo'): L.pon(u, 'libro', 'propuesta')
        elif c == 'rutina': L.pon(u, 'quien', 'auto')
    # corre solo
    L.pon_varios(IDX[a]['rutina'], 'quien' if True else '', 'auto', clave=lambda i: (i.startswith('trg:'), N[i].get('label') or ''))
    mios = set(IDX[a]['pagina']) | set(IDX[a]['codigo']) | set(IDX[a]['apps_script']) | set(IDX[a]['workflow'])
    def usados(rel, pref):
        c = collections.Counter()
        for i in mios:
            for k in SAL[i]:
                f = F[k]
                if f['r'] in rel and f['t'].startswith(pref): c[f['t']] += 1
        return [i for i, _ in c.most_common()]
    L.pon_varios(usados(('usa la llave del navegador',), ('ls:',)), 'pantalla', 'auto', tope=10, bolsa='llaves del navegador más', clave=lambda i: 0)
    L.pon_varios(IDX[a]['workflow'], 'codigo', 'auto', tope=12, bolsa='flujos más', clave=lambda i: (not N[i].get('cron'), N[i].get('label') or ''))
    L.pon_varios(usados(('lee la propiedad',), ('prop:',)), 'motor', 'auto', tope=9, bolsa='propiedades del script más', clave=lambda i: 0)
    L.pon_varios(usados(('usa el secreto',), ('sec:',)), 'motor', 'auto', tope=6, bolsa='secretos más (sólo nombres)', clave=lambda i: 0)
    L.pon_varios(usados(('usa', 'usa el servicio', 'carga el script', 'corre en'), ('svc:', 'gss:', 'EXT-', 'lib:')), 'libro', 'auto', tope=10, bolsa='servicios más', clave=lambda i: 0)
    return L

# ── 02 · la pantalla propuesta, dibujada ──────────────────────────────────────────────────────────
def pantalla(p):
    pid = 'PAN-' + p['id']; a = area_de(pid); zonas = sorted(vecinos(pid, rel=('muestra',), sentido=1), key=lambda i: N[i].get('orden') or 0)
    filas = [('p', 'La pantalla')] + [(z, f"{N[z]['orden']}") for z in zonas] + [('fuera', 'Sale')]
    L = nueva(lam_pantalla(pid), 'Pantalla · ' + p['n'], f"«{p['q']}» Las cajas amarillas son las zonas, de arriba a abajo como se verían. Cada flecha dice de qué dato sale: "
              'gris si ya se lee, punteada si existe y falta conectarlo, roja si hoy no existe.',
              [('quien', 'Quién entra'), ('zona', 'La pantalla, de arriba a abajo'), ('dato', 'De qué pestaña o pieza sale'), ('libro', 'En qué libro vive'), ('hoy', 'Hoy lo muestra')],
              filas, 'De quien la abre al dato que la alimenta', 'Orden de las zonas en la pantalla', padre=lam_tablero(a) if a else 'mapa', seccion='Pantallas propuestas',
              k={'zona': 1, 'quien': 1}, ancho={'zona': 360, 'quien': 150}, dy=104, objetivo=1, kmax=3, sin=('contiene', 've', 'se trabaja en', 'tiene un libro', 'muestra', 'deja fuera'))
    L.pady = 16; L.corta = False
    L.pon(pid, 'zona', 'p')
    sis = N[pid].get('sistema')
    if sis in N: L.pon(sis, 'hoy', 'p')
    for m in vecinos(pid, rel=('contiene',), capas=('menu',), sentido=-1): L.pon(m, 'dato', 'p')
    pers = vecinos(pid, rel=('entra a',), sentido=-1)
    for k, z in enumerate(zonas):
        L.pon(z, 'zona', z)
        if k < len(pers): L.pon(pers[k], 'quien', z)
        for u in vecinos(z, rel=('sale de',), sentido=1):
            c = capa(u)
            if c == 'pestana':
                L.pon(u, 'dato', z); h = N[u].get('hoja')
                if h in N: L.pon(h, 'libro', z)
            elif c == 'hoja': L.pon(u, 'libro', z)
            elif c == 'sistema': L.pon(u, 'hoy', z)
            else: L.pon(u, 'dato', z)
    for q in pers[len(zonas):]: L.pon(q, 'quien', 'fuera')
    for o in vecinos(pid, rel=('deja fuera',), sentido=1): L.pon(o, 'zona', 'fuera')
    if sis in N:
        L.pon_varios([x for x in vecinos(sis, rel=('se implementa en',), capas=('pagina',), sentido=1)], 'hoy', 'p', tope=3, bolsa='páginas más', clave=peso, dentro=lam_tablero(a) if a else None)
    return L

# ── 03 · el código de un repositorio ──────────────────────────────────────────────────────────────
COLS_COD = [('toca', 'Lo que toca fuera'), ('pagina', 'Páginas'), ('codigo', 'Código'), ('gs', 'Apps Script'), ('flujo', 'Flujos y pruebas'), ('doc', 'Documentos y datos')]
COL_DE = {'pagina': 'pagina', 'codigo': 'codigo', 'apps_script': 'gs', 'workflow': 'flujo', 'prueba': 'flujo', 'documento': 'doc', 'datos': 'doc', 'otro': 'doc'}
ARCH_DE = collections.defaultdict(list)
for _i in N:
    if capa(_i) in ARCH and N[_i].get('repo') in REPOS: ARCH_DE[N[_i]['repo']].append(_i)
ENTRE_DE = collections.defaultdict(list)
for _a, _b, _n in ENTRE:
    if N[_a].get('repo') == N[_b].get('repo'): ENTRE_DE[N[_a].get('repo')].append((_a, _b, _n))

def _codigo(tag, lid, titulo, sub, archivos, nivel, padre, prefijo):
    def grupo(i):
        r = (N[i].get('ruta') or '')[len(prefijo):]; p = r.split('/')
        return p[0] + '/' if len(p) > 1 else AQUI
    AQUI = '(raíz)' if not prefijo else '(esta carpeta)'
    g = collections.defaultdict(list)
    for i in archivos: g[grupo(i)].append(i)
    orden = sorted(g, key=lambda k: (k != AQUI, -len(g[k])))
    if len(orden) > 11:
        for k in orden[10:]: g['otras carpetas'] += g.pop(k)
        orden = orden[:10] + ['otras carpetas']
    L = nueva(lid, titulo, sub, COLS_COD, [(k, k) for k in orden], 'Tipo de archivo', 'Carpeta', padre=padre, seccion='Código', objetivo=3, kmax=4, dx=166, dy=84,
              solo=('carga el script', 'enlaza a', 'incrusta', 'ejecuta', 'llama al Apps Script', 'abre la pestaña', 'menciona la pestaña', 'usa la llave del navegador', 'referencia la hoja',
                    'programa el disparador', 'lee la propiedad', 'usa el secreto', 'usa el servicio', 'usa', 'define el catálogo de', 'registra las obras por', 'enlaza a la casa vieja'))
    TOCA = ('endpoint', 'hoja', 'pestana', 'clave')
    for k in orden:
        ids = g[k]; porcol = collections.defaultdict(list)
        for i in ids: porcol[COL_DE[capa(i)]].append(i)
        sub_ok = k not in (AQUI, 'otras carpetas') and len(ids) > 34 and nivel < 2
        sub_id = f'{lid}-{slug(k)}'[:60] if sub_ok else None
        for c, lst in porcol.items():
            L.pon_varios(lst, c, k, tope=14 if not sub_ok else 8, bolsa='archivos más', clave=peso, dentro=sub_id)
        if sub_ok:
            _codigo(tag, sub_id, f'{titulo} · {k}', f'Carpeta {prefijo}{k} del repositorio {tag}.', ids, nivel + 1, lid, prefijo + k)
        vistos = collections.Counter()
        for i in ids:
            if i not in L.pos: continue
            for kk in SAL[i]:
                f = F[kk]
                if capa(f['t']) in TOCA and f['r'] in L.solo: vistos[f['t']] += 1
        L.pon_varios([i for i, _ in vistos.most_common()], 'toca', k, tope=8, bolsa='piezas más', clave=lambda i: 0)
    for a_, b_, n_ in ENTRE_DE.get(tag, ()):
        if a_ in L.pos and b_ in L.pos: L.flecha(a_, b_, f'se llaman ({n_})' if n_ > 1 else 'se llaman', 'viva', 'grafo de código de Graphify')
    return L

def codigo(tag):
    r = REPOS[tag]; arch = ARCH_DE.get(tag, [])
    if not arch: return None
    rn = REPO_NODO.get(tag)
    return _codigo(tag, lam_codigo(tag), 'Código · ' + tag, f"Repositorio {r['owner']}/{r['repo']} ({r['vis']}, {r['papel']}), versión {r['commit'][:7]}. Cada fila es una carpeta; cada nodo, un archivo. "
                   'Toca un archivo para ver sus funciones.', arch, 0, lam_tablero(area_de(rn)) if rn and area_de(rn) else 'mapa', '')

# ── 04 · libros ───────────────────────────────────────────────────────────────────────────────────
CLASES = [('operativa', 'Operativos'), ('caso', 'De caso y de autón'), ('copia', 'Copias y pruebas'), ('resp', 'Respaldos e inventarios')]
CL_DE = {'operativa': 'operativa', 'libro PPP': 'caso', 'libro del autón': 'caso', 'evaluación de terreno': 'caso', 'ubicaciones': 'caso', 'prueba o copia de trabajo': 'copia',
         'respaldo': 'resp', 'inventario': 'resp', 'carpeta': 'resp', 'ligada': 'caso'}
def libros():
    L = nueva('libros', 'Libros de Google Sheets', 'Todos los libros que encontré en el código y en Drive, por tablero. Los que tienen pestañas leídas se pueden abrir por dentro.',
              CLASES, AREAS, 'Qué clase de libro es', 'Tablero', padre='mapa', seccion='Datos', objetivo=5, kmax=5, sin=('contiene',))
    for a, _ in AREAS:
        g = collections.defaultdict(list)
        for h in IDX[a]['hoja']: g[CL_DE.get(N[h].get('clase'), 'resp')].append(h)
        for c, lst in g.items():
            L.pon_varios(lst, c, a, tope=20, bolsa='libros más', clave=lambda h: (-len(TABS_DE.get(h, ())), N[h].get('label') or ''))
    return L

def libro(h):
    tabs = TABS_DE[h]; nom = N[h].get('label') or h
    def gr(t):
        n = N[t]
        if isinstance(n.get('cols'), list): return 'cols'
        if GRADO[t] > 1: return 'usada'
        return 'oculta' if n.get('oculta') else 'sola'
    L = nueva(lam_libro(h), 'Libro · ' + nom[:44], f'«{nom}» por dentro: cada pestaña, quién la lee o la escribe, qué clave de proyecto lleva y qué zona de pantalla saldría de ella. '
              'Toca una pestaña para ver sus columnas.',
              [('lee', 'Quién la lee o escribe'), ('pestana', 'Pestaña'), ('clave', 'Clave de proyecto'), ('zona', 'Zona de pantalla que sale de aquí')],
              [('libro', 'El libro'), ('cols', 'Con columnas leídas'), ('usada', 'Nombradas en código o en una pantalla'), ('sola', 'Sólo están en el libro'), ('oculta', 'Ocultas')],
              'De quien la toca a la pantalla que alimenta', 'Qué tanto se conoce la pestaña', padre='libros', seccion='Datos', objetivo=6, kmax=5, sin=('contiene',))
    L.pon(h, 'pestana', 'libro')
    for m in vecinos(h, capas=('almacen', 'proyecto', 'externo', 'motor', 'hallazgo')): L.pon(m, 'lee', 'libro')
    for t in sorted(tabs, key=lambda t: (-GRADO[t], N[t].get('label') or '')):
        f = gr(t); L.pon(t, 'pestana', f)
        for x in vecinos(t, capas=('apps_script', 'pagina', 'codigo', 'rutina', 'persona', 'prueba')): L.pon(x, 'lee', f)
        for x in vecinos(t, capas=('clave',)): L.pon(x, 'clave', f)
        for x in vecinos(t, capas=('zona',)): L.pon(x, 'zona', f)
        for x in vecinos(t, capas=('almacen', 'hallazgo')): L.pon(x, 'clave' if x.startswith('N-') else 'zona', f)
    for x in vecinos(h, capas=('apps_script', 'pagina', 'codigo', 'zona')): L.pon(x, 'lee' if capa(x) != 'zona' else 'zona', 'libro')
    return L

# ── 05 · folio ────────────────────────────────────────────────────────────────────────────────────
def folio():
    claves = [k[0] for k in LLAVES]
    L = nueva('folio', 'Folio · una clave por proyecto', 'Hoy un proyecto se nombra con ocho claves distintas. Cada columna es una clave y debajo están las pestañas que la llevan. '
              'Las flechas punteadas marcan dónde habría que sembrar el folio; la estrella roja de la izquierda ya existe y es la candidata.',
              [('folio', 'Folio propuesto')] + [(k, {'KEY-PROJECT': 'project_id', 'KEY-CASO': 'caso_id · PPP', 'KEY-LEAD': 'Folio · captación', 'KEY-OPP': 'id · brokers', 'KEY-INV': 'proyectoId · inversión',
               'KEY-CARPETA': 'id · carpeta comercial', 'KEY-HMB': 'proyecto_id · historial', 'KEY-TEXTO': 'texto libre'}[k]) for k in claves],
              [('clave', 'La clave'), ('pestanas', 'Pestañas que la llevan'), ('proyectos', 'Proyectos')], 'Las ocho formas de nombrar un proyecto', 'De la clave a los proyectos',
              padre='mapa', seccion='Datos', objetivo=6, kmax=3, sin=('contiene', 'tiene un libro', 'se trabaja en', 'participa en', 'señala', 'sale de', 'lleva'))
    L.pon('N-FOLIO', 'folio', 'clave')
    for e in sorted(IDX[None]['etapa'], key=lambda i: N[i].get('label') or ''): L.pon(e, 'folio', 'pestanas')
    for k in claves:
        L.pon(k, k, 'clave')
        for t in vecinos(k, rel=('lleva la clave',), sentido=-1): L.pon(t, k, 'pestanas')
    for t in vecinos('N-FOLIO', rel=('habría que sembrarlo en',), sentido=1):
        if t not in L.pos: L.pon(t, 'KEY-TEXTO', 'pestanas')
    prj = sorted(i for i in N if i.startswith('PRJ-')); exp = sorted((i for i in N if i.startswith('EXP-')), key=lambda i: N[i]['label'])
    for i in prj: L.pon(i, 'KEY-PROJECT', 'proyectos')
    for i in exp: L.pon(i, 'folio', 'proyectos')
    return L

# ── 06 · personas y puertas ───────────────────────────────────────────────────────────────────────
def personas():
    pers = [i for i in N if capa(i) == 'persona']; orden = [p[0] for p in P.PUERTAS] + [i for i in pers if i not in [p[0] for p in P.PUERTAS]]
    L = nueva('personas', 'Personas y puertas', 'Quién participa, a qué entra hoy, por qué puerta entraría y qué pantallas vería. Rojo es lo que hoy no existe.',
              [('org', 'Organización'), ('persona', 'Quién'), ('hoy', 'Hoy entra a'), ('puerta', 'Su puerta'), ('vería', 'Vería'), ('etapa', 'Etapa del folio')],
              [(p, N[p]['label']) for p in orden], 'De quién es a qué vería', 'Cada persona', padre='mapa', seccion='Negocio', objetivo=3, kmax=3,
              sin=('lleva', 'señala', 'corre', 'aparece en la pestaña', 'recorre', 'se trabaja en'))
    for p in orden:
        L.pon(p, 'persona', p)
        for o in vecinos(p, capas=('organizacion',)): L.pon(o, 'org', p)
        for s in vecinos(p, capas=('sistema', 'motor', 'almacen'), sentido=1): L.pon(s, 'hoy', p)
        for q in vecinos(p, rel=('entra por',), sentido=1):
            L.pon(q, 'puerta', p)
            for x in vecinos(q, rel=('ve',), sentido=1): L.pon(x, 'vería', p)
        for e in vecinos(p, rel=('participa en',), sentido=1): L.pon(e, 'etapa', p)
    return L

# ── 07 · relojes ──────────────────────────────────────────────────────────────────────────────────
def relojes():
    L = nueva('relojes', 'Relojes · lo que corre solo', 'Todo lo que se dispara sin que nadie lo toque: flujos de GitHub con horario, tareas programadas de Claude y disparadores de Apps Script.',
              [('quien', 'Quién lo corre'), ('reloj', 'El reloj'), ('corre', 'Qué corre'), ('toca', 'Qué toca')],
              [('gh', 'Flujos de GitHub con horario'), ('claude', 'Tareas programadas de Claude'), ('gas', 'Disparadores de Apps Script')], 'Del reloj a lo que mueve', 'Dónde vive el reloj',
              padre='mapa', seccion='Negocio', objetivo=7, kmax=3, sin=('contiene', 'se implementa en', 'señala'))
    for w in sorted((i for i in N if capa(i) == 'workflow' and N[i].get('cron')), key=lambda i: N[i].get('repo') or ''):
        L.pon(w, 'reloj', 'gh')
        r = REPO_NODO.get(N[w].get('repo'))
        if r: L.pon(r, 'quien', 'gh')
        L.pon_varios(vecinos(w, rel=('ejecuta',), sentido=1), 'corre', 'gh', tope=3, clave=peso)
        L.pon_varios(vecinos(w, rel=('usa el secreto', 'corre en', 'usa el servicio'), sentido=1), 'toca', 'gh', tope=3, clave=lambda i: -GRADO[i])
    for r in sorted(i for i in N if i.startswith('R-')):
        L.pon(r, 'reloj', 'claude')
        for x in vecinos(r, capas=('persona',)): L.pon(x, 'quien', 'claude')
        for x in vecinos(r, capas=('workflow', 'rutina')): L.pon(x, 'corre', 'claude')
        for x in vecinos(r, capas=('pestana', 'sistema', 'repo', 'externo', 'almacen', 'hoja'), sentido=1): L.pon(x, 'toca', 'claude')
    for t in sorted(i for i in N if i.startswith('trg:')):
        L.pon(t, 'reloj', 'gas')
        for x in vecinos(t, rel=('programa el disparador',), sentido=-1):
            L.pon(x, 'corre', 'gas')
            for y in vecinos(x, capas=('pestana', 'hoja', 'endpoint'), sentido=1)[:4]: L.pon(y, 'toca', 'gas')
            rr = REPO_NODO.get(N[x].get('repo'))
            if rr: L.pon(rr, 'quien', 'gas')
    return L

# ── 08 · procesos y propuestas del atlas ──────────────────────────────────────────────────────────
def procesos():
    procs = sorted((i for i in N if capa(i) == 'proceso'), key=lambda i: (ANOM.get(area_de(i), 'zz'), N[i]['label']))
    L = nueva('procesos', 'Procesos paso a paso', 'Los 20 procesos que describe el atlas del portal, cada uno en su fila y con sus pasos en orden. Toca un paso para ver dónde ocurre.',
              [('proc', 'Proceso')] + [(f'p{k}', f'Paso {k}') for k in range(1, 11)], [(p, N[p]['label'][:30]) for p in procs], 'Orden de los pasos', 'Cada proceso',
              padre='mapa', seccion='Atlas del portal', objetivo=1, kmax=1, k={'proc': 1}, ancho={'proc': 200}, solo=('sigue', 'empieza con'))
    for p in procs:
        L.pon(p, 'proc', p)
        for s in N:
            if capa(s) == 'paso' and s.startswith(p + '·'):
                k = int(s.split('·')[1]); L.pon(s, f'p{min(k, 10)}', p)
    return L

def propuestas():
    DEC = [('pendiente', 'Esperan tu decisión'), ('aprobada', 'Aprobadas'), ('implementada', 'Implementadas')]
    L = nueva('propuestas', 'Propuestas del atlas', 'Las 24 propuestas registradas en el atlas del portal, por decisión. A la derecha, qué tablero o motor mejora cada una y cuántos cambios tiene registrados.',
              [('prop', 'Propuesta'), ('mejora', 'Qué mejora'), ('cambios', 'Cambios registrados')], DEC, 'De la propuesta a sus cambios', 'Decisión', padre='mapa', seccion='Atlas del portal',
              objetivo=6, kmax=4, solo=('mejora',))
    camb = collections.defaultdict(list)
    for c in N:
        if capa(c) == 'cambio':
            for x in vecinos(c, rel=('cambia',), sentido=1): camb[x].append(c)
    for p in sorted((i for i in N if capa(i) == 'propuesta'), key=lambda i: N[i]['label']):
        d = N[p].get('decision') or 'pendiente'; L.pon(p, 'prop', d)
        for x in vecinos(p, rel=('mejora',), sentido=1): L.pon(x, 'mejora', d)
    for d, _ in DEC:
        obj = [x for x, (c, r) in L.pos.items() if c == 'mejora' and r == d]
        cs = sorted({c for x in obj for c in camb.get(x, ())})
        if cs:
            L.sintetico(f'cambios:{d}', f'{len(cs)} cambios sobre estas piezas', 'cambio', 'cambios', d, nota='Cambios registrados en el atlas que tocan las piezas de esta fila. '
                        + f"{sum(1 for c in cs if N[c].get('estado') == 'declarado')} declarados y {sum(1 for c in cs if N[c].get('estado') == 'propuesto')} propuestos.",
                        lista=[N[c]['label'] for c in cs][:200], lt='Cambios')
            for x in obj[:40]: L.flecha(f'cambios:{d}', x, 'cambia', 'inferida', 'yod-portal/docs/arquitectura/modelo.json')
    return L

# ── 09 · hallazgos, plan y organización ───────────────────────────────────────────────────────────
def hallazgos():
    T = [('No se está viendo', 'No se está viendo'), ('Potencial oculto', 'Potencial oculto'), ('Lo que dice el grafo', 'Lo que dice el grafo')]
    L = nueva('hallazgos', 'Hallazgos', 'Lo que encontré al cruzar todo: lo que no se está viendo, el potencial que ya existe y lo que dice el grafo. Cada hallazgo apunta a las piezas que toca; '
              'tócalo para leerlo completo con lo que propongo hacer.',
              [('hal', 'Hallazgo'), ('pieza', 'Piezas que toca')], T, 'Del hallazgo a las piezas', 'Tipo de hallazgo', padre='mapa', seccion='Negocio', objetivo=7, kmax=5,
              k={'hal': 3}, ancho={'hal': 200}, solo=('señala',))
    for h in sorted((i for i in N if capa(i) == 'hallazgo'), key=lambda i: N[i].get('orden') or 0):
        t = N[h].get('tipo'); L.pon(h, 'hal', t)
        for x in vecinos(h, rel=('señala',), sentido=1): L.pon(x, 'pieza', t)
    return L

def plan():
    pl = sorted((i for i in N if capa(i) == 'plan'), key=lambda i: N[i].get('orden') or 0)
    L = nueva('plan', 'Plan por tablero', 'Las mejoras que propongo, tablero por tablero. Cada fila es un tablero: a la izquierda lo de hoy, en medio las mejoras y a la derecha la pantalla que resulta.',
              [('hoy', 'Tablero de hoy'), ('plan', 'La pregunta que debe responder'), ('mejora', 'Mejoras'), ('pantalla', 'Pantalla propuesta')], [(p, N[p]['label'][7:35]) for p in pl],
              'De lo que hay a lo que propongo', 'Tablero', padre='mapa', seccion='Negocio', objetivo=2, kmax=3, ancho={'mejora': 236, 'plan': 250}, k={'mejora': 2, 'plan': 1}, dy=96,
              solo=('tiene plan', 'propone', 'se convierte en', 'reubica a'))
    for p in pl:
        L.pon(p, 'plan', p, etq=N[p].get('nota') or N[p]['label'])
        for s in vecinos(p, rel=('tiene plan',), sentido=-1):
            L.pon(s, 'hoy', p)
            for x in vecinos(s, rel=('se convierte en',), sentido=1): L.pon(x, 'pantalla', p)
        for m in sorted(vecinos(p, rel=('propone',), sentido=1), key=lambda i: N[i].get('orden') or 0):
            L.pon(m, 'mejora', p)
            for s in vecinos(m, rel=('reubica a',), sentido=1): L.pon(s, 'hoy', p)
    return L

def organizacion():
    L = nueva('organizacion', 'Organización propuesta', 'Tres ideas: un menú por pregunta en lugar de por herramienta, un folio que recorre siete etapas y una puerta por rol. '
              'A la izquierda lo que hay hoy; a la derecha en qué se convierte.',
              [('hoy', 'Lo que hay hoy'), ('nuevo', 'Se organiza en'), ('pantalla', 'Pantallas'), ('quien', 'Quién')],
              [('menu', 'Menú por pregunta'), ('folio', 'El folio y sus siete etapas'), ('puertas', 'Una puerta por rol')], 'De hoy a la propuesta', 'Las tres ideas',
              padre='mapa', seccion='Negocio', objetivo=4, kmax=4, sin=('contiene_', 'señala', 'lleva', 'muestra', 'deja fuera', 'sale de', 'entra a'))
    for m in sorted((i for i in N if capa(i) == 'menu'), key=lambda i: N[i].get('orden') or 0):
        L.pon(m, 'nuevo', 'menu')
        for s in vecinos(m, rel=('se agrupa en',), sentido=-1): L.pon(s, 'hoy', 'menu')
        for p in vecinos(m, rel=('contiene',), sentido=1): L.pon(p, 'pantalla', 'menu')
    L.pon('N-FOLIO', 'nuevo', 'folio'); L.pon('KEY-PROJECT', 'hoy', 'folio')
    for e in sorted(IDX[None]['etapa'], key=lambda i: N[i].get('label') or ''): L.pon(e, 'nuevo', 'folio')
    L.pon('N-PUERTAS', 'nuevo', 'puertas')
    for q in sorted((i for i in N if capa(i) == 'puerta'), key=lambda i: N[i].get('label') or ''):
        L.pon(q, 'nuevo', 'puertas')
        for p in vecinos(q, rel=('entra por',), sentido=-1): L.pon(p, 'quien', 'puertas')
    for p in ('GAS-PORTERO',): L.pon(p, 'hoy', 'puertas')
    return L

def casa_vieja():
    L = nueva('casa-vieja', 'Casa vieja y copias', 'Los repositorios de la cuenta personal que ya tienen gemelo en la organización, los archivados y las ligas del código que todavía apuntan a la casa vieja.',
              [('liga', 'Archivo que aún apunta a la vieja'), ('vieja', 'Casa vieja'), ('nueva', 'Casa nueva')],
              [('cascarón', 'Cascarones que reenvían'), ('bifurcación', 'Bifurcación'), ('archivado', 'Archivados')], 'De la liga vieja a la casa nueva', 'Estado', padre='mapa', seccion='Código',
              objetivo=8, kmax=3, solo=('se mudó a', 'es bifurcación de', 'enlaza a la casa vieja'))
    for r in sorted(i for i in N if capa(i) == 'repo' and N[i].get('estado') in ('cascarón', 'archivado', 'bifurcación')):
        e = N[r]['estado']; L.pon(r, 'vieja', e)
        for x in vecinos(r, rel=('se mudó a', 'es bifurcación de'), sentido=1): L.pon(x, 'nueva', e)
        for x in vecinos(r, rel=('enlaza a la casa vieja',), sentido=-1): L.pon(x, 'liga', e)
    return L

def todas():
    mapa()
    for a, _ in AREAS:
        if a != 'drive' and (IDX[a]['sistema'] or IDX[a]['repo']): tablero(a)
    for p in P.PANT:
        if 'PAN-' + p['id'] in N: pantalla(p)
    libros()
    for h in sorted(LIBROS_CON, key=lambda h: (ANOM.get(area_de(h), 'zz'), N[h].get('label') or '')): libro(h)
    folio(); personas(); relojes(); hallazgos(); plan(); organizacion(); procesos(); propuestas()
    for tag in sorted(REPOS, key=lambda t: (list(ANOM).index(REPO_AREA.get(t, 'fuera')), t)): codigo(tag)
    casa_vieja()
    return LAMS
