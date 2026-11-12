"""Base de las láminas: carga el grafo de arquitectura que armó Graphify, reparte cada pieza en su tablero,
   define el estilo por tipo de pieza y el acomodo en cuadrante (columnas × filas)."""
import json, re, math, collections, unicodedata

import os
AQUI = os.path.dirname(os.path.abspath(__file__))
BASE_JSON = os.environ.get('GRAFO_BASE') or os.path.join(AQUI, 'datos', 'base.json')
B = json.load(open(BASE_JSON, encoding='utf-8'))
R = json.load(open(os.path.join(AQUI, 'datos', 'reglas.json'), encoding='utf-8'))
N, F, SIM, ENTRE, REPOS, CUENTA = B['nodos'], B['flechas'], B['simbolos'], B['entre'], B['repos'], B['cuenta']
ARMADO = B.get('armado') or ''
SAL = collections.defaultdict(list); ENT = collections.defaultdict(list)
for _k, _f in enumerate(F): SAL[_f['s']].append(_k); ENT[_f['t']].append(_k)
def capa(i): return N[i].get('capa') or 'otro'
def vecinos(i, rel=None, capas=None, sentido=0):
    out = []
    for k in (SAL[i] if sentido >= 0 else []):
        f = F[k]
        if (rel is None or f['r'] in rel) and (capas is None or capa(f['t']) in capas): out.append(f['t'])
    for k in (ENT[i] if sentido <= 0 else []):
        f = F[k]
        if (rel is None or f['r'] in rel) and (capas is None or capa(f['s']) in capas): out.append(f['s'])
    return list(dict.fromkeys(out))
GRADO = collections.Counter()
for _f in F: GRADO[_f['s']] += 1; GRADO[_f['t']] += 1

def slug(s):
    s = unicodedata.normalize('NFD', str(s)); s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')

# ── tableros (filas del mapa) ─────────────────────────────────────────────────────────────────────
AREAS = [('despacho', 'El Despacho'), ('ppp', 'PPP'), ('mercado', 'Mercado Hermosillo'), ('codes', 'Codesarrollos y Miramar'), ('moac', 'MOAC'), ('flujo', 'Flujo'),
         ('aurum', 'AURUM'), ('brokers', 'Masterbrokers'), ('embudo', 'Embudo y Sala'), ('obra', 'Obra en vivo'), ('control', 'Control, cabina y Portero'),
         ('asistentes', 'Asistentes y rutinas'), ('fuera', 'Fuera del menú'), ('drive', 'Sólo en Drive')]
ANOM = dict(AREAS)
SIS_AREA = R['sis_area']
REPO_AREA = R['repo_area']
RUTA_AREA = {k: [tuple(x) for x in v] for k, v in R['ruta_area'].items()}
HOJA_AREA = R['hoja_area']
TAB_AREA = {k: [(tuple(a), b) for a, b in v] for k, v in R['tab_area'].items()}
CLASE_AREA = R['clase_area']
_area = {}

def area_de(i):
    if i in _area: return _area[i]
    a = _area_calc(i); _area[i] = a; return a

def _mayoria(ids):
    c = collections.Counter(x for x in (area_de(j) for j in ids) if x)
    return c.most_common(1)[0][0] if c else None

def _area_calc(i):
    n = N.get(i)
    if n is None: return None
    if i in SIS_AREA: return SIS_AREA[i]
    c = n.get('capa')
    if c in ('codigo', 'pagina', 'apps_script', 'prueba', 'workflow', 'documento', 'datos', 'otro') or (c == 'rutina' and i.startswith('trg:')):
        tag = n.get('repo') or (i.split(':')[1] if i.startswith('trg:') else None); ruta = n.get('ruta') or ''
        for pre, a in RUTA_AREA.get(tag, []):
            if ruta.startswith(pre): return a
        return REPO_AREA.get(tag)
    if c == 'repo': return REPO_AREA.get(n.get('repo') or i.split('/')[-1], 'control' if n.get('estado') in ('cascarón', 'archivado', 'bifurcación') else None)
    if c == 'hoja':
        h = i.split(':', 1)[1]
        if h in HOJA_AREA: return HOJA_AREA[h]
        if n.get('clase') in CLASE_AREA: return CLASE_AREA[n['clase']]
        _area[i] = 'drive'
        return _mayoria(vecinos(i, capas=('almacen', 'proyecto_gas', 'apps_script', 'pagina', 'codigo', 'hoja'))) or 'drive'
    if c == 'pestana':
        h = (n.get('hoja') or '').split(':', 1)[-1]
        for pres, a in TAB_AREA.get(h, []):
            if n.get('label', '').startswith(pres): return a
        return area_de(n.get('hoja')) if n.get('hoja') in N else 'drive'
    if c == 'almacen':
        g = 'GAS-' + i.split('-', 1)[1] if i.startswith('SHEET-') else None
        return SIS_AREA.get(g) or _mayoria(vecinos(i, capas=('motor', 'sistema')))
    if c == 'motor': return _mayoria(vecinos(i, capas=('sistema',)))
    if c == 'endpoint': return SIS_AREA.get(n.get('comp')) or _mayoria(vecinos(i, capas=('pagina', 'apps_script', 'codigo')))
    if c == 'proyecto_gas': return _mayoria(vecinos(i, capas=('motor',))) or 'drive'
    if c in ('pantalla',): return SIS_AREA.get(n.get('sistema'))
    if c in ('zona', 'sale'): return area_de(n.get('pantalla'))
    if c == 'plan': return _mayoria(vecinos(i, rel=('tiene plan',))) or 'fuera'
    if c == 'mejora': return area_de(n.get('plan'))
    if c in ('proceso', 'propuesta', 'contrato', 'cambio'):
        _area[i] = None
        return _mayoria(vecinos(i, capas=('sistema', 'motor', 'almacen', 'paso')))
    if c == 'paso':
        _area[i] = None
        return _mayoria(vecinos(i, rel=('ocurre en',)))
    return None

# ── cómo se ve cada tipo de pieza ─────────────────────────────────────────────────────────────────
TIPO = {'sistema': 'Tablero de hoy', 'motor': 'Motor (Apps Script o servicio)', 'almacen': 'Almacén según el atlas', 'hoja': 'Libro de Google Sheets', 'pestana': 'Pestaña',
        'endpoint': 'Despliegue de Apps Script', 'proyecto_gas': 'Proyecto de Apps Script', 'repo': 'Repositorio', 'pagina': 'Página', 'codigo': 'Archivo de código',
        'apps_script': 'Archivo de Apps Script', 'workflow': 'Flujo de GitHub', 'prueba': 'Prueba automática', 'documento': 'Documento', 'datos': 'Archivo de datos', 'otro': 'Archivo',
        'llave': 'Llave o secreto (sólo el nombre)', 'servicio': 'Servicio o biblioteca', 'externo': 'Servicio externo', 'persona': 'Quién', 'organizacion': 'Organización',
        'proyecto': 'Proyecto o expediente', 'etapa': 'Etapa del folio', 'rutina': 'Rutina o disparador', 'proceso': 'Proceso del atlas', 'paso': 'Paso de un proceso',
        'contrato': 'Contrato de datos', 'propuesta': 'Propuesta del atlas', 'cambio': 'Cambio registrado', 'pantalla': 'Pantalla propuesta', 'zona': 'Zona de la pantalla',
        'sale': 'Sale de la pantalla', 'menu': 'Menú por pregunta', 'puerta': 'Puerta por rol', 'plan': 'Plan del tablero', 'mejora': 'Mejora propuesta', 'hallazgo': 'Hallazgo',
        'clave': 'Clave de proyecto', 'alerta': 'Alerta', 'bolsa': 'Grupo'}
ESTILO = {'persona': ('dot', '#B07AA1', 15), 'organizacion': ('dot', '#C3A0CC', 12), 'sistema': ('square', '#59A14F', 15), 'pagina': ('square', '#8CD17D', 9),
          'pantalla': ('box', '#F1CE63', 0), 'zona': ('box', '#F8E7A8', 0), 'sale': ('box', '#DAD5CE', 0), 'menu': ('star', '#EDC948', 13), 'puerta': ('star', '#EDC948', 12),
          'plan': ('box', '#F1CE63', 0), 'mejora': ('box', '#F8E7A8', 0), 'etapa': ('star', '#EDC948', 13), 'motor': ('diamond', '#F28E2B', 14), 'endpoint': ('diamond', '#FFBE7D', 10),
          'apps_script': ('diamond', '#FFBE7D', 8), 'proyecto_gas': ('diamond', '#E3A869', 9), 'repo': ('hexagon', '#79706E', 13), 'codigo': ('hexagon', '#9AA4AE', 8),
          'prueba': ('hexagon', '#C5CBD2', 7), 'workflow': ('hexagon', '#86BCB6', 9), 'hoja': ('triangle', '#4E79A7', 14), 'pestana': ('triangleDown', '#A0CBE8', 9),
          'almacen': ('triangle', '#86A9CF', 11), 'clave': ('star', '#E15759', 16), 'documento': ('dot', '#BAB0AC', 6), 'datos': ('dot', '#BAB0AC', 6), 'otro': ('dot', '#BAB0AC', 6),
          'llave': ('dot', '#9C755F', 7), 'servicio': ('dot', '#D4A6C8', 8), 'externo': ('dot', '#FF9DA7', 10), 'proyecto': ('dot', '#499894', 10), 'rutina': ('triangle', '#86BCB6', 10),
          'proceso': ('dot', '#499894', 12), 'paso': ('dot', '#86BCB6', 8), 'contrato': ('dot', '#B6992D', 7), 'propuesta': ('star', '#F1CE63', 11), 'cambio': ('dot', '#D7B5A6', 6),
          'hallazgo': ('star', '#E15759', 13), 'alerta': ('star', '#E15759', 12), 'bolsa': ('dot', '#8A8F98', 9)}
SIMBOLOS = [('square', '#59A14F', 'Tablero o página'), ('box', '#F1CE63', 'Pantalla propuesta'), ('diamond', '#F28E2B', 'Motor'), ('hexagon', '#79706E', 'Repositorio o código'),
            ('triangle', '#4E79A7', 'Libro'), ('triangleDown', '#A0CBE8', 'Pestaña'), ('dot', '#B07AA1', 'Quién'), ('star', '#EDC948', 'Propuesta'), ('star', '#E15759', 'Hallazgo o clave')]
FAMILIAS = {'viva': dict(corto='Visto', nombre='Visto en código u hoja', color='#5B6470', ancho=1.3, opacidad=0.75, punteada=False),
            'inferida': dict(corto='Atlas', nombre='Del atlas o deducido', color='#9AA1AB', ancho=1.0, opacidad=0.6, punteada=False),
            'propuesta': dict(corto='Propuesta', nombre='Propuesta', color='#C99A12', ancho=1.6, opacidad=0.9, punteada=[7, 5]),
            'hueco': dict(corto='Falta', nombre='Falta o hallazgo', color='#C8102E', ancho=1.7, opacidad=0.9, punteada=[3, 5])}
ESTADO = {'vivo': 'Vivo · leído el 11-nov', 'codigo': 'Visto en el código', 'declarado': 'Declarado en el atlas', 'propuesto': 'Propuesto en el atlas', 'propuesta': 'Propuesta de este análisis',
          'hallazgo': 'Hallazgo de este análisis', 'cascarón': 'Cascarón que reenvía', 'archivado': 'Archivado', 'bifurcación': 'Bifurcación', 'suelto': 'Suelto en Drive'}

def envolver(t, ancho=18, lineas=3):
    out, cur = [], ''
    for w in str(t).split():
        while len(w) > ancho + 2:
            if cur: out.append(cur); cur = ''
            out.append(w[:ancho]); w = w[ancho:]
        if len(cur) + len(w) + (1 if cur else 0) <= ancho: cur = (cur + ' ' + w).strip()
        else: out.append(cur); cur = w
    if cur: out.append(cur)
    if len(out) > lineas: out = out[:lineas]; out[-1] = out[-1][:ancho - 1].rstrip() + '…'
    return '\n'.join(out)

MENU_NOM = R['menu_nom']
LIBRO_CORTO = R['libro_corto']
def visible(i, nombre, varios_libros=False):
    """Nombre con el que la pieza se ve en la lámina: el del menú para los tableros, «Motor ·» para los motores y la pestaña con su libro cuando hay varios."""
    c = capa(i)
    if i in MENU_NOM: return MENU_NOM[i]
    if c == 'motor' and i.startswith('GAS-') and not nombre.lower().startswith('motor'): return 'Motor · ' + nombre
    if c == 'pestana' and varios_libros:
        h = (N[i].get('hoja') or '').split(':', 1)[-1]
        return f"{nombre} · {LIBRO_CORTO.get(h) or (N.get(N[i].get('hoja') or '', {}).get('label') or '')[:16]}"
    return nombre

HAL = collections.defaultdict(list)          # pieza → hallazgos que la señalan
for _f in F:
    if _f['r'] == 'señala': HAL[_f['t']].append(_f['s'])

def evidencia(i):
    n = N[i]; c = n.get('capa'); sf = n.get('source_file') or ''; loc = str(n.get('source_location') or '')
    if c in ('codigo', 'pagina', 'apps_script', 'prueba', 'workflow', 'documento', 'datos', 'otro'):
        return f"{n.get('repo')}/{n.get('ruta')}" + (f" · {n['lineas']} líneas" if n.get('lineas') else '')
    if c == 'pestana':
        h = N.get(n.get('hoja') or '', {}); return f"Libro «{h.get('label', '')}»" + (f" · visto en {sf}" + (f" {loc}" if loc.startswith('L') else '') if not sf.startswith('google-sheets') else '')
    if c == 'hoja': return 'Google Sheets' + (f" · modificado {n['mod']}" if n.get('mod') else '')
    return sf + (f' {loc}' if loc and loc != 'L1' else '')

def nota_de(i):
    n = N[i]; c = n.get('capa'); p = [n.get('nota') or '']
    if c == 'sistema' and n.get('hoy_se_ve'): p.append('Hoy se ve: ' + n['hoy_se_ve'])
    if c == 'zona': p.append('De dónde sale: ' + (n.get('fuente') or '—') + '.')
    if c == 'plan': p += ['Hoy: ' + (n.get('hoy') or ''), 'Depende de: ' + (n.get('depende') or '')]
    if c == 'hallazgo' and n.get('hacer'): p.append('Qué hacer: ' + n['hacer'])
    if c == 'clave' and n.get('ejemplo'): p.append('Ejemplo: ' + n['ejemplo'] + '.')
    if c == 'pestana' and n.get('puente'): p.append('Puente: ' + n['puente'] + '.')
    if c == 'hoja' and n.get('en_codigo'): p.append('La lee el código de: ' + ', '.join(n['en_codigo']) + '.')
    if c == 'hoja' and not n.get('en_codigo') and n.get('leida'): p.append('Ningún repositorio la nombra.')
    if c == 'endpoint': p = ['Despliegue /exec de Apps Script. Aquí sólo va su prefijo; el identificador completo está en el archivo y línea de cada referencia.']
    if c == 'workflow' and n.get('secretos'): p.append('Secretos que usa (sólo nombres): ' + ', '.join(n['secretos']) + '.')
    if c in ('propuesta',) and n.get('decision'): p.append('Decisión: ' + n['decision'] + (' · esfuerzo ' + str(n['esfuerzo']) if n.get('esfuerzo') else '') + '.')
    if c == 'cambio': p += [n.get('aprobacion') or '', n.get('despliegue') or '']
    if c == 'motor' and n.get('prod'): p.append('En producción: ' + n['prod'])
    return ' '.join(x.strip() for x in p if x and x.strip())

def lista_de(i):
    n = N[i]; c = n.get('capa')
    if c == 'pestana' and isinstance(n.get('cols'), list): return 'Columnas (fila 1, leída el 11-nov)', list(n['cols'])
    if c == 'pantalla' and n.get('roles'): return 'Quién ve qué', list(n['roles'])
    if i in SIM:
        fs = SIM[i]; return f'Funciones y símbolos ({len(fs)})', [f"{a}  · L{b}" if b else a for a, b, _ in fs[:70]] + ([f'… y {len(fs) - 70} más'] if len(fs) > 70 else [])
    return None, None

class Lam:
    """Una lámina: columnas × filas, nodos colocados en celdas y flechas entre los nodos colocados."""
    def __init__(s, id, titulo, sub, cols, filas, eje_x, eje_y, padre=None, seccion='', kmax=5, objetivo=7, dx=172, dy=88, ancho=None, k=None, sin=(), solo=None, tope=1100):
        s.id, s.titulo, s.sub, s.cols, s.filas, s.eje_x, s.eje_y, s.padre, s.seccion = id, titulo, sub, list(cols), list(filas), eje_x, eje_y, padre, seccion
        s.kmax, s.objetivo, s.dx, s.dy, s.ancho, s.k, s.sin, s.solo, s.tope = kmax, objetivo, dx, dy, ancho or {}, k or {}, set(sin), solo, tope
        s.pos, s.items, s.sint, s.fx, s.dentro, s.etq = {}, [], {}, [], {}, {}
        s.corta = True
    def pon(s, i, col, fila, orden=None, etq=None):
        if i in s.pos or (i not in N and i not in s.sint): return False
        s.pos[i] = (col, fila); s.items.append((i, col, fila, len(s.items) if orden is None else orden))
        if etq: s.etq[i] = etq
        return True
    def pon_varios(s, ids, col, fila, tope=None, bolsa=None, dentro=None, clave=None):
        ids = [i for i in dict.fromkeys(ids) if i in N and i not in s.pos]
        ids.sort(key=clave or (lambda i: (-GRADO[i], N[i].get('label') or '')))
        if tope is not None and len(ids) > tope + 1:
            resto = ids[tope:]; ids = ids[:tope]
        else: resto = []
        for i in ids: s.pon(i, col, fila)
        if resto:
            s.bolsa(f'mas:{s.id}:{col}:{fila}', f'+{len(resto)} {bolsa or "más"}', col, fila, [N[i].get('label') or i for i in resto][:160], dentro=dentro)
        return ids
    def bolsa(s, bid, label, col, fila, lista, nota='', dentro=None, lt='Incluye'):
        s.sint[bid] = dict(label=label, capa='bolsa', nota=nota, lista=lista, lt=lt)
        if dentro: s.dentro[bid] = dentro
        s.pon(bid, col, fila, 10 ** 6)
    def sintetico(s, sid, label, capa_, col, fila, nota='', lista=None, lt='Incluye', dentro=None, ev='', orden=None, estado=''):
        s.sint[sid] = dict(label=label, capa=capa_, nota=nota, lista=lista, lt=lt, ev=ev, estado=estado)
        if dentro: s.dentro[sid] = dentro
        s.pon(sid, col, fila, orden)
    def flecha(s, a, b, rel, clase='viva', ev=''): s.fx.append((a, b, rel, clase, ev))
