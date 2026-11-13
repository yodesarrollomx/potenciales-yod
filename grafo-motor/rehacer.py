"""Rehace el grafo de YOD OS y lleva sus versiones.

Cómo se aprueba: la rama principal está protegida, así que un grafo rehecho nunca se escribe ahí directo. El
flujo «Grafo · rehacer» corre este programa, deja el resultado en la rama `grafo-borrador` y abre un PR. Mientras
el PR está abierto, el grafo es BORRADOR y las presentaciones siguen leyendo el aprobado. Fusionar el PR es
aprobar; cerrarlo sin fusionar es descartar. Por eso aquí todo se escribe «como quedaría ya aprobado».

  rehacer   clona los repositorios públicos del grafo, refresca la base, pide la explicación a la IA (si hay
            clave) y deja la base, las láminas, el registro de versiones y los datos para presentaciones.
  inicial   primera vez: registro de versiones, datos de la versión vigente y láminas, sin refrescar.
  estado    imprime el registro de versiones.

No hay servidor ni claves aquí: las claves de IA sólo llegan por el entorno del flujo.
Uso: python3 grafo-motor/rehacer.py <acción> [--por quien] [--pedido N] [--motivo texto] [--sin-ia] [--ensayo]
     [--clones carpeta] [--aqui carpeta de este repositorio] [--salida carpeta de grafo] [--informe archivo]
"""
import argparse, datetime, hashlib, json, os, shutil, subprocess, sys, tempfile, time

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
BASE = os.path.join(AQUI, 'datos', 'base.json')
sys.path.insert(0, AQUI)
HMO = datetime.timezone(datetime.timedelta(hours=-7))          # Hermosillo no cambia de horario
MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']


def ahora(): return datetime.datetime.now(HMO).replace(microsecond=0)


def lee(p, d=None):
    try:
        with open(p, encoding='utf-8') as f: return json.load(f)
    except (OSError, ValueError): return d


def escribe(p, o, compacto=False):
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w', encoding='utf-8') as f:
        if compacto: json.dump(o, f, ensure_ascii=False, separators=(',', ':'))
        else: json.dump(o, f, ensure_ascii=False, indent=1); f.write('\n')


def huella(B): return hashlib.sha256(json.dumps([B['nodos'], B['flechas'], B.get('ppp') or {}], ensure_ascii=False, sort_keys=True).encode('utf-8')).hexdigest()[:12]
def fecha_corta(t): return f"{t.day}-{MES[t.month - 1]} {t:%H:%M}"


def cuando(B):
    a = B.get('armado') or ''
    try: return datetime.datetime.fromisoformat(a).replace(tzinfo=HMO) if len(a) == 10 else datetime.datetime.fromisoformat(a)
    except ValueError: return ahora()


def ficha(B, vid, t, **extra):
    return dict(id=vid, armado=t.isoformat(), fecha=fecha_corta(t), estado='aprobado', huella=huella(B), piezas=len(B['nodos']), ligas=len(B['flechas']),
                repos={f"{r['owner']}/{r['repo']}": r['commit'][:7] for r in B['repos'].values()}, **extra)


def versiones(G):
    V = lee(os.path.join(G, 'versiones.json'))
    if V: return V
    B = lee(BASE); t = cuando(B); vid = f'G-{t:%Y%m%d-%H%M}'
    return dict(esquema=1, aprobado=vid, actualizado=t.isoformat(), versiones=[ficha(B, vid, t, nota='Primera versión del grafo dentro del repositorio.')])


def recetas_validas(B):
    """Las recetas de presentación, con cada dato comprobado contra el contrato del Plan de Potencial de este grafo."""
    R = lee(os.path.join(AQUI, 'recetas.json')); ppp = B.get('ppp') or {}; faltan = []
    for clave, d in R['datos'].items():
        for tipo, (origen, campo, fmt) in list(d['por_tipo'].items()):
            c = ppp.get(tipo) or {}
            if campo not in ((c.get('resultados') if origen == 'resultado' else c.get('entradas')) or []):
                faltan.append(f'{clave}/{tipo}: {campo}'); del d['por_tipo'][tipo]
    return R, faltan


def datos_version(G, B, vid, t):
    """Lo que leen las presentaciones de una versión del grafo: contrato del plan y recetas por audiencia."""
    R, faltan = recetas_validas(B)
    escribe(os.path.join(G, 'datos', vid + '.json'), dict(esquema=1, id=vid, armado=t.isoformat(), huella=huella(B), ppp=B.get('ppp') or {}, recetas=R, sin_campo=faltan), compacto=True)
    return faltan


def poda(G, V):
    """Quedan los datos de la versión vigente y de la anterior; el registro guarda las últimas catorce."""
    V['versiones'] = V['versiones'][-14:]
    vivos = {V['aprobado']} | {v['id'] for v in V['versiones'][-2:]}
    d = os.path.join(G, 'datos')
    for f in os.listdir(d) if os.path.isdir(d) else []:
        if f.endswith('.json') and f[:-5] not in vivos: os.remove(os.path.join(d, f))


PROPUESTA = 'CHG-GRAFO-ACCESOS-20261111'            # la propuesta del atlas bajo la que se rehace el grafo


def impacto(raiz, vid, antes):
    """La rama principal exige que cada cambio lleve su registro de impacto contra el atlas. Un grafo rehecho cambia
    datos y láminas, así que su PR de borrador lo necesita para poder aprobarse. Conserva la revisión del modelo que
    ya está fijada en el repositorio y declara sólo este tablero. Si el archivo no existe, no hay nada que registrar."""
    p = os.path.join(raiz, 'architecture-impact.json'); d = lee(p)
    if not isinstance(d, dict) or not d.get('model_revision'): return False
    d.update(proposal_id=PROPUESTA, components=['SYS-POTENCIALES'],
             summary=(f'Grafo del sistema rehecho a pedido: versión {vid} (la aprobada era {antes}). Cambian sólo los datos del grafo '
                      '(grafo-motor/datos/base.json) y lo que se genera de ellos en grafo/: láminas, registro de versiones y datos para presentaciones. '
                      'Sin código, backend, hojas ni permisos. Fusionar este cambio es aprobar el grafo; cerrarlo lo descarta.'),
             tests=['Láminas generadas por grafo-motor/laminas.py desde la base de este mismo cambio (determinista).',
                    'Recetas de presentación comprobadas contra el contrato del Plan de Potencial al rehacer.',
                    'verificar-impacto contra el atlas fijado.'],
             rollback='Cerrar el PR del borrador, o revertir su merge: el grafo aprobado anterior sigue publicado.')
    with open(p, 'w', encoding='utf-8') as f: json.dump(d, f, ensure_ascii=False, indent=2); f.write('\n')
    return True


def dibuja(G, base):
    """Vuelve a escribir las láminas con el visor de Graphify. No toca versiones ni datos."""
    tmp = tempfile.mkdtemp(prefix='laminas-')
    try:
        r = subprocess.run([sys.executable, os.path.join(AQUI, 'laminas.py'), tmp], env=dict(os.environ, GRAFO_BASE=base, PYTHONHASHSEED='0'), capture_output=True, text=True)
        if r.returncode: raise RuntimeError('laminas.py falló: ' + (r.stderr or r.stdout)[-600:])
        os.makedirs(G, exist_ok=True)
        nuevos = set(os.listdir(tmp))
        for f in os.listdir(G):
            if f.endswith('.html') and f not in nuevos: os.remove(os.path.join(G, f))
        for f in nuevos: shutil.copyfile(os.path.join(tmp, f), os.path.join(G, f))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


# Lectura SIN credencial: sólo un repositorio público se deja clonar así. Es la comprobación real de visibilidad del grafo
# (el campo «vis» de la base lo declara el propio grafo). Sin ayudante de credenciales ni cabeceras extra.
GIT_ANONIMO = ['git', '-c', 'credential.helper=', '-c', 'http.extraHeader=', '-c', 'http.https://github.com/.extraHeader=', '-c', 'core.askPass=']


def pausa_reintento():
    """Segundos entre el primer intento y el segundo (GRAFO_PAUSA_REINTENTO; las pruebas, que no salen a la red, usan 0)."""
    try: return max(0.0, float(os.environ.get('GRAFO_PAUSA_REINTENTO', '5')))
    except ValueError: return 5.0


def git_anonimo(args, env, antes_de_reintentar=None):
    """Una lectura de git sin credencial con un reintento: un tropiezo de red no debe frenar el borrador (dictamen del PR 90,
    H2). True si contestó en alguno de los dos intentos."""
    for intento in (1, 2):
        if intento > 1:
            time.sleep(pausa_reintento())
            if antes_de_reintentar: antes_de_reintentar()
        if not subprocess.run(GIT_ANONIMO + args, capture_output=True, text=True, env=env).returncode: return True
    return False


def clona(B, carpeta, aqui=None, publicos=None):
    """Clones sin blobs (traen la historia para saber qué cambió) de los repositorios públicos del grafo, leídos sin
    credencial. Los demás repositorios de la lista de públicos (las casas viejas) sólo se tocan, también sin credencial.
    Cada uno tiene dos intentos. Regresa dos listas de los que no contestaron (puede que ya no sean públicos, o que GitHub
    no respondió): los que el grafo rastrea, que frenan el borrador, y los que sólo salen en textos, que se tapan."""
    faltan, mudos = [], []; de = os.environ.get('GRAFO_CLONA_DE') or 'https://github.com/'
    env = dict(os.environ, GIT_TERMINAL_PROMPT='0', GCM_INTERACTIVE='never')
    for tag, r in sorted(B['repos'].items()):
        d = os.path.join(carpeta, tag)
        if os.path.isdir(os.path.join(d, '.git')) or os.path.islink(d): continue
        nombre = f"{r['owner']}/{r['repo']}"
        if aqui and nombre.lower() == (os.environ.get('GITHUB_REPOSITORY') or 'yodesarrollomx/potenciales-yod').lower():
            os.symlink(os.path.abspath(aqui), d); continue
        if not git_anonimo(['clone', '--quiet', '--filter=blob:none', f'{de}{nombre}.git', d], env, lambda: shutil.rmtree(d, ignore_errors=True)):
            faltan.append(nombre)
    rastreados = {f"{r['owner']}/{r['repo']}".lower() for r in B['repos'].values()}
    for nombre in sorted(publicos or [], key=str.lower):
        if nombre.lower() in rastreados: continue
        if not git_anonimo(['ls-remote', '--quiet', '--heads', f'{de}{nombre}.git'], env): mudos.append(nombre)
    return faltan, mudos


def rehacer(a, G):
    import refrescar, ia
    V = versiones(G); t = ahora(); A = lee(BASE)
    clones = a.clones or tempfile.mkdtemp(prefix='clones-'); os.makedirs(clones, exist_ok=True)
    faltan, mudos = clona(A, clones, a.aqui, refrescar.reglas_publicos())
    if faltan and not os.environ.get('GRAFO_PERMITE_SIN_CLON'):
        # Lo que el grafo rastrea y no se pudo leer sin credencial no se publica a ciegas: no hay borrador hasta que contesten.
        return dict(accion='rehacer', cambio=False, ensayo=bool(a.ensayo), antes=V['aprobado'], bloqueado='sin_clon', sin_clon=faltan, sin_respuesta=mudos,
                    mensaje=(f"No se pudieron leer sin credencial {len(faltan)} de los repositorios públicos del grafo ({', '.join(faltan[:12])}"
                             f"{'…' if len(faltan) > 12 else ''}), ni con un segundo intento: puede que ya no sean públicos o que GitHub no contestó. Si dejaron de ser "
                             'públicos, hay que quitarlos de grafo-motor/datos/reglas.json («publicos») y de la base; si fue la red, vuelve a pedirlo.'))
    # Los de la lista que el grafo no rastrea (sólo salen en textos) y no contestaron no frenan: se tapan sus nombres y sigue
    # (dictamen del PR 90, H3). El pedido lo avisa (aviso.py) para quitarlos de la lista si ya no son públicos.
    tmp = tempfile.mkdtemp(prefix='base-'); sal = os.path.join(tmp, 'base.json'); cam = os.path.join(tmp, 'cambios.json')
    argv = sys.argv; sys.argv = ['refrescar.py', '--repos', clones, '--base', BASE, '--salida', sal, '--cambios', cam, '--hoy', t.isoformat()] + [x for n in mudos for x in ('--tapar', n)]
    try: refrescar.main()
    finally: sys.argv = argv
    B = lee(sal); C = lee(cam)
    if C.get('marcados_no_publicos'):
        m = C['marcados_no_publicos']
        return dict(accion='rehacer', cambio=False, ensayo=bool(a.ensayo), antes=V['aprobado'], bloqueado='atlas_no_publico', sin_respuesta=mudos,
                    mensaje=(f"El atlas marca como no públicos {len(m)} repositorios de la lista de públicos del grafo ({', '.join(m[:12])}). "
                             'Hay que revisar su visibilidad: si dejaron de ser públicos, se quitan de grafo-motor/datos/reglas.json («publicos»); si es un error del atlas, se corrige allá.'))
    R, sin_campo = recetas_validas(B)
    resumen = dict(C['resumen'], repos=[dict(repo=r['repo'], de=r['de'], a=r['a'], nuevos=len(r['nuevos']), quitados=len(r['quitados']), cambiados=len(r['cambiados'])) for r in C['repos']],
                   atlas=C.get('atlas'), sin_clon=faltan, sin_respuesta=len(mudos), sin_campo=sin_campo, notas=(C.get('notas') or [])[:12])
    cambio = huella(B) != huella(A)                 # sólo cuenta lo que cambia el grafo; un commit que no mueve nada no hace versión
    pedido = dict(por=a.por or '', numero=int(a.pedido) if str(a.pedido or '').isdigit() and int(a.pedido) else None, motivo=(a.motivo or '')[:300])
    # Los nombres de los que no contestaron van sólo al informe (el comentario del pedido); el resumen, que se guarda en
    # grafo/versiones.json, lleva cuántos.
    out = dict(accion='rehacer', cambio=cambio, ensayo=bool(a.ensayo), antes=V['aprobado'], resumen=resumen, claves=ia.disponibles(),
               audiencias=[x['nombre'] for x in R['audiencias']], pedido=pedido, sin_respuesta=mudos)
    if not cambio:
        out['mensaje'] = 'El grafo ya está al día: nada de lo que dibuja cambió en los repositorios ni en el atlas.'
        return out
    exp, inf = (None, dict(pedidos=[], gano=None, fallos={}, segundos=None, omitida=True)) if a.sin_ia else ia.explicar(dict(
        resumen=C['resumen'], atlas=C.get('atlas'),
        repositorios=[dict(repo=r['repo'], nuevos=r['nuevos'][:40], quitados=r['quitados'][:40], cambiados=r['cambiados'][:60]) for r in C['repos']],
        presentaciones=dict(audiencias=out['audiencias'], campos_que_ya_no_existen=sin_campo), notas=(C.get('notas') or [])[:20]))
    vid = f'G-{t:%Y%m%d-%H%M}'
    out.update(id=vid, fecha=fecha_corta(t), piezas=len(B['nodos']), ligas=len(B['flechas']), ia=exp, ia_informe=inf)
    if a.ensayo: return out
    shutil.copyfile(sal, BASE)
    for v in V['versiones']:
        if v['estado'] == 'aprobado': v['estado'] = 'anterior'
    V['versiones'].append(ficha(B, vid, t, cambios=resumen, ia=exp, ia_informe=inf, pedido=pedido))
    V['aprobado'] = vid; V['actualizado'] = t.isoformat()
    datos_version(G, B, vid, t); dibuja(G, BASE); poda(G, V); escribe(os.path.join(G, 'versiones.json'), V)
    out['impacto'] = impacto(os.path.abspath(a.aqui) if a.aqui else RAIZ, vid, out['antes'])
    return out


def inicial(a, G):
    V = versiones(G); B = lee(BASE)
    datos_version(G, B, V['aprobado'], cuando(B)); dibuja(G, BASE); poda(G, V); escribe(os.path.join(G, 'versiones.json'), V)
    return dict(accion='inicial', cambio=True, id=V['aprobado'], piezas=len(B['nodos']), ligas=len(B['flechas']))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('accion', choices=['rehacer', 'inicial', 'estado'])
    for k in ('--por', '--pedido', '--motivo', '--clones', '--aqui', '--salida', '--informe'): ap.add_argument(k)
    ap.add_argument('--sin-ia', action='store_true'); ap.add_argument('--ensayo', action='store_true')
    a = ap.parse_args(); G = os.path.abspath(a.salida or os.path.join(RAIZ, 'grafo'))
    out = versiones(G) if a.accion == 'estado' else dict(rehacer=rehacer, inicial=inicial)[a.accion](a, G)
    if a.informe: escribe(a.informe, out)
    print(json.dumps(out, ensure_ascii=False, indent=1)[:5000])


if __name__ == '__main__':
    main()
