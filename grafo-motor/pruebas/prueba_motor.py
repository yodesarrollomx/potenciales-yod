"""Pruebas del motor del grafo. No usan red ni claves: los modelos de IA son servidores locales de mentira y los
repositorios son carpetas de git hechas aquí mismo.   python -m unittest discover -s grafo-motor/pruebas -p 'prueba_*.py'"""
import http.server, json, os, re, shutil, subprocess, sys, tempfile, threading, time, unittest

MOTOR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, MOTOR)


def copia_motor():
    d = tempfile.mkdtemp(prefix='motor-'); m = os.path.join(d, 'grafo-motor')
    shutil.copytree(MOTOR, m, ignore=shutil.ignore_patterns('__pycache__', 'pruebas'))
    return d, m


def corre(m, *a, env=None):
    r = subprocess.run([sys.executable, os.path.join(m, a[0])] + list(a[1:]), capture_output=True, text=True, env=dict(os.environ, **(env or {})))
    if r.returncode: raise AssertionError(r.stderr[-1500:] or r.stdout[-1500:])
    return r.stdout


# Las pruebas no salen a la red: los repositorios que no están en la carpeta de clones «no contestan», y se permite
# rehacer así (en el flujo real eso no abre borrador; lo comprueba test_sin_leer_un_repositorio_publico_no_hay_borrador).
SIN_RED = {'GRAFO_CLONA_DE': 'file:///grafo-sin-red/', 'GRAFO_PERMITE_SIN_CLON': '1'}


def jl(p):
    with open(p, encoding='utf-8') as f: return json.load(f)


def repo_de_mentira(carpeta, archivos):
    os.makedirs(carpeta)
    for ruta, texto in archivos.items():
        p = os.path.join(carpeta, ruta); os.makedirs(os.path.dirname(p) or carpeta, exist_ok=True)
        with open(p, 'w', encoding='utf-8') as f: f.write(texto)
    g = lambda *x: subprocess.run(['git', '-C', carpeta, '-c', 'user.name=prueba', '-c', 'user.email=prueba@example.invalid'] + list(x), check=True, capture_output=True)
    g('init', '-q'); g('add', '-A'); g('commit', '-q', '-m', 'prueba')
    return carpeta


class LoPublicado(unittest.TestCase):
    """La base vive en un repositorio público. Es la versión completa que Dirección eligió publicar (trae identificadores
    y pestañas de hojas y el plan propuesto), pero hay cosas que nunca deben ir: lo comprueba esta prueba."""
    def setUp(self):
        self.B = jl(os.path.join(MOTOR, 'datos', 'base.json'))
        self.texto = ''
        for f in (('datos', 'base.json'), ('datos', 'reglas.json'), ('recetas.json',)):
            with open(os.path.join(MOTOR, *f), encoding='utf-8') as x: self.texto += x.read()

    def test_sin_correos_ni_identificadores_completos_de_exec_ni_claves(self):
        self.assertEqual(re.findall(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}', self.texto), [])
        self.assertEqual(re.findall(r'AKfy[A-Za-z0-9_-]{20,}', self.texto), [], 'los /exec van abreviados')
        self.assertEqual(re.findall(r'sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{30,}', self.texto), [])
        self.assertEqual(re.findall(r'(?:token|clave|password|secret|k)=[A-Za-z0-9_-]{12,}', self.texto), [])

    def test_sin_folios_de_tratos_ni_repositorios_privados_ni_hallazgos_de_seguridad(self):
        self.assertEqual(re.findall(r'\b(?:OPP|LEAD|EXP)-[A-Z0-9][A-Z0-9-]{3,}', self.texto), [], 'los folios de tratos no se publican')
        self.assertTrue(self.B['repos'] and all(r.get('vis') == 'publico' and r.get('papel') != 'Cliente externo' for r in self.B['repos'].values()))
        repos = {r['repo'] for r in self.B['repos'].values()}
        self.assertEqual({n['repo'] for n in self.B['nodos'].values() if n.get('capa') in ('codigo', 'pagina', 'apps_script', 'prueba', 'workflow') and n.get('repo')} - repos, set())
        seg = re.compile(r'(?i)secreto|contraseñ|clave maestra|comprometid')
        self.assertEqual([i for i, n in self.B['nodos'].items() if n.get('capa') == 'hallazgo' and seg.search(' '.join(str(n.get(k) or '') for k in ('label', 'nota', 'hacer')))], [])

    def test_sin_sistemas_de_clientes_externos(self):
        """DEC-19 (12-nov-2026): lo que Dirección excluyó en reglas.json → "excluir" sale del grafo al refrescar, por id, por
        componente o por ruta, con sus flechas. Se comprueba sobre una base pequeña; y sobre la base publicada en cuanto
        haya sido armada después de la decisión (la anterior es una foto previa y la limpia el siguiente rehecho).
        Los datos de prueba se arman con el nombre que trae la propia regla: aquí no se escribe."""
        import refrescar
        with open(os.path.join(MOTOR, 'datos', 'reglas.json'), encoding='utf-8') as x: R = json.load(x).get('excluir') or {}
        self.assertTrue(R.get('ids') and R.get('rutas') and R.get('comp') and R.get('textos'), 'la regla de exclusión debe existir')
        Z_ = re.match(r'\^\(SYS\|GAS\|SHEET\|STORE\)-([A-Z0-9]+)\(', R['comp'][0]).group(1); z = Z_.lower()
        N = {f'SYS-{Z_}': dict(capa='sistema'), f'CTR-{Z_}-DRAFTS': dict(capa='contrato'), f'PROC-{Z_}-PROFILES·2': dict(capa='proceso'),
             'gas:AKfycbPRUEBA': dict(capa='endpoint', comp=f'GAS-{Z_}'), f'sec:{Z_}_LLAVE_DE_PRUEBA': dict(capa='llave'),
             f'yod-portal::{z}_wrapper': dict(capa='codigo', repo='yod-portal', ruta=f'{z}/wrapper.js'),
             f'f:yod-portal:docs/arquitectura/{z}-contratos-prueba.md': dict(capa='documento', repo='yod-portal', ruta=f'docs/arquitectura/{z}-contratos-prueba.md'),
             'SYS-POTENCIALES': dict(capa='sistema'), f'SYS-{Z_}X': dict(capa='sistema'), 'yod-portal::despacho': dict(capa='codigo', repo='yod-portal', ruta=f'despacho/{z}-no/x.js'),
             f'PROP-CHG-{Z_}-ALGO': dict(capa='propuesta')}
        B = dict(nodos=N, flechas=[dict(s=f'SYS-{Z_}', t='SYS-POTENCIALES', r='usa'), dict(s='SYS-POTENCIALES', t='yod-portal::despacho', r='usa')], simbolos={k: 1 for k in N}, repos={}, entre=[[f'SYS-{Z_}', 'SYS-POTENCIALES', 1]])
        X = refrescar.Base(B); fuera = refrescar.excluye(X, R)
        self.assertEqual(sorted(X.N), [f'SYS-{Z_}X', 'SYS-POTENCIALES', 'yod-portal::despacho']); self.assertEqual(len(fuera), 8)
        self.assertEqual(B['flechas'], [dict(s='SYS-POTENCIALES', t='yod-portal::despacho', r='usa')]); self.assertEqual(B['entre'], []); self.assertEqual(set(B['simbolos']), set(X.N))
        # el atlas se filtra ANTES de sincronizarlo: lo excluido no vuelve a contarse como «piezas nuevas» en cada rehecho
        # (12-nov-2026: el resumen del borrador G-20261112-1147 nombraba sus piezas y esos nombres iban a publicarse).
        # También sus propuestas, y en los textos de lo que se queda su nombre pasa a «otro sistema» (dictamen GRAFO-05, B4).
        M = dict(revision='r', components=[dict(id=f'SYS-{Z_}', nombre='E', tipo='tablero', status='ejecucion'), dict(id=f'GAS-{Z_}', nombre='G', tipo='backend', status='ejecucion'),
                                            dict(id='SYS-POTENCIALES', nombre='P', tipo='tablero', status='ejecucion', proposito=f'Lee lo que deja {Z_} cada noche'),
                                            dict(id='SYS-NUEVO', nombre='N', tipo='tablero', status='declarado')],
                 connections=[dict(**{'from': f'SYS-{Z_}', 'to': f'GAS-{Z_}'}, label='usa', status='ejecucion'), dict(**{'from': 'SYS-NUEVO', 'to': 'SYS-POTENCIALES'}, label=f'lee como {Z_}', status='ejecucion')],
                 data_contracts=[dict(id=f'CTR-{Z_}-DRAFTS', components=[f'SYS-{Z_}']), dict(id='CTR-PPP', components=['SYS-POTENCIALES', f'GAS-{Z_}'])],
                 processes=[dict(id=f'PROC-{Z_}-LOAD', nombre='L', steps=[dict(label='a', components=[f'SYS-{Z_}'])]), dict(id='PROC-PPP', nombre='P', steps=[dict(label='a', components=['SYS-POTENCIALES', f'SYS-{Z_}'])])],
                 proposals=[dict(id=f'CHG-{Z_}-ALGO', titulo='t', boards=['SYS-POTENCIALES']), dict(id='SOLO', titulo='s', boards=[f'SYS-{Z_}']),
                            dict(id='MIXTA', titulo=f'Para {Z_} y PPP', problem='p', benefit='b', boards=[f'SYS-{Z_}', 'SYS-POTENCIALES']), dict(id='SIN', titulo='n')])
        F = refrescar.filtra_atlas(M, R)
        self.assertEqual([c['id'] for c in F['components']], ['SYS-POTENCIALES', 'SYS-NUEVO']); self.assertEqual([(c['from'], c['to']) for c in F['connections']], [('SYS-NUEVO', 'SYS-POTENCIALES')])
        self.assertEqual(F['data_contracts'], [dict(id='CTR-PPP', components=['SYS-POTENCIALES'])]); self.assertEqual([p['id'] for p in F['processes']], ['PROC-PPP']); self.assertEqual(F['processes'][0]['steps'][0]['components'], ['SYS-POTENCIALES'])
        self.assertEqual([(p['id'], p.get('boards')) for p in F['proposals']], [('MIXTA', ['SYS-POTENCIALES']), ('SIN', None)])
        self.assertEqual(F['components'][0]['proposito'], 'Lee lo que deja otro sistema cada noche'); self.assertEqual(F['connections'][0]['label'], 'lee como otro sistema')
        self.assertEqual(F['proposals'][0]['titulo'], 'Para otro sistema y PPP')
        self.assertEqual(len(M['components']), 4, 'no toca el modelo original')
        Z = refrescar.Base(dict(nodos={'SYS-POTENCIALES': dict(capa='sistema', source_file=refrescar.ATL, label='P')}, flechas=[], simbolos={}, repos={}, entre=[]))
        res = refrescar.sincroniza_atlas(Z, F); refrescar.excluye(Z, R)
        self.assertEqual(res['componentes_nuevos'], ['SYS-NUEVO', 'PROC-PPP']); self.assertNotIn(Z_, json.dumps(res)); self.assertFalse([i for i in Z.N if Z_ in i])
        self.assertEqual(sorted(i for i in Z.N if i.startswith('PROP-')), ['PROP-MIXTA', 'PROP-SIN']); self.assertNotIn(Z_, json.dumps(Z.N))
        # el informe del rehecho tampoco nombra lo excluido: archivos por repositorio y notas
        # (12-nov-2026: el resumen del borrador G-20261112-1351 lo nombraba por archivos nuevos en su carpeta de yod-portal)
        C = dict(repos=[dict(repo='yodesarrollomx/yod-portal', de='a', a='b', nuevos=[f'{z}/endpoint.js', 'os/x.js'], quitados=[f'docs/arquitectura/{z}-escala-captura.md'],
                             cambiados=[f'{z}/index.html', 'docs/arquitectura/modelo.json', f'despacho/{z}-no/x.js'], ligas_mas=3, ligas_menos=0)],
                 notas=[f'yod-portal/{z}/endpoint.js L2: llama a un Apps Script que el grafo no conoce (AKfycbPRUEBA…)',
                        'potenciales-yod/server/ppp2/PPP2.gs L4: llama a un Apps Script que el grafo no conoce (AKfycbzzzzzz…)'])
        self.assertEqual(refrescar.filtra_cambios(C, R), 4)
        r = C['repos'][0]
        self.assertEqual((r['nuevos'], r['quitados'], r['cambiados']), (['os/x.js'], [], ['docs/arquitectura/modelo.json', f'despacho/{z}-no/x.js']))
        self.assertEqual(C['notas'], ['potenciales-yod/server/ppp2/PPP2.gs L4: llama a un Apps Script que el grafo no conoce (AKfycbzzzzzz…)'])
        self.assertNotIn(f'{z}/', json.dumps(C)); self.assertNotIn(f'{z}-', json.dumps(C).replace(f'{z}-no', ''))
        if str(self.B.get('armado') or '') >= '2026-11-12T18:00':
            Y = refrescar.Base(json.loads(json.dumps(self.B))); self.assertEqual(refrescar.excluye(Y, R), [], 'la base publicada aún trae piezas excluidas')

    # Notas curadas que nombran lo excluido y que Dirección aún decide si se quedan (dictamen GRAFO-05: «las 4 notas conocidas»).
    NOTAS_PENDIENTES = {'PLAN-lo-que-vive-fuera-del-menu', 'MEJ-lo-que-vive-fuera-del-menu-6', 'HAL-25', 'HAL-31'}

    def test_lo_excluido_no_se_nombra_en_los_textos(self):
        """Ni en las piezas ni en las ligas de la base, ni en el registro de versiones o los datos de presentaciones. Sólo
        quedan las notas pendientes de decisión."""
        with open(os.path.join(MOTOR, 'datos', 'reglas.json'), encoding='utf-8') as x: pats = [re.compile(p) for p in json.load(x)['excluir']['textos']]
        dice = lambda v: any(p.search(t) for t in (v if isinstance(v, list) else [v]) if isinstance(t, str) for p in pats)
        malos = [(i, k) for i, n in self.B['nodos'].items() if i not in self.NOTAS_PENDIENTES for k, v in n.items() if dice(v)]
        malos += [(f['s'], f['t'], k) for f in self.B['flechas'] for k in ('r', 'nota', 'sf') if dice(f.get(k))]
        G = os.path.join(MOTOR, '..', 'grafo')
        for f in sorted(os.listdir(G)) + ['datos/' + x for x in sorted(os.listdir(os.path.join(G, 'datos')))]:
            if f.endswith('.json'):
                with open(os.path.join(G, f), encoding='utf-8') as x: t = x.read()
                malos += [(f,)] * dice(t)
        self.assertEqual(malos, [])

    def texto_publicado(self):
        """Todo lo que se publica del grafo: la base, sus reglas y recetas, y lo generado en grafo/. De las láminas se omite
        el texto de las cajas («lbl»): es el nombre de la pieza partido en renglones, y el nombre entero ya está en la base."""
        t = [self.texto]; G = os.path.join(MOTOR, '..', 'grafo')
        for f in sorted(os.listdir(G)) + ['datos/' + x for x in sorted(os.listdir(os.path.join(G, 'datos')))]:
            if f.endswith(('.json', '.html')):
                with open(os.path.join(G, f), encoding='utf-8') as x: t.append(re.sub(r'"lbl":"(?:[^"\\]|\\.)*"', '', x.read()))
        return '\n'.join(t)

    def test_solo_repositorios_publicos(self):
        """El grafo sólo nombra repositorios de reglas.json → "publicos" (comprobados públicos). No se fía del campo «vis»
        que la base declara de sí misma. Los nombres de los NO públicos no se escriben en ninguna parte: la base guarda su
        huella (sacada del atlas) y con ella se busca el nombre en todo lo publicado (dictamen GRAFO-05, M1 y B5)."""
        import refrescar
        P = refrescar.reglas_publicos(); pub = {p.lower() for p in P}
        self.assertTrue(P and len(pub) == len(P) and all(re.fullmatch(r'[A-Za-z0-9-]+/[A-Za-z0-9._-]+', p) for p in P))
        self.assertEqual({f"{r['owner']}/{r['repo']}".lower() for r in self.B['repos'].values()} - pub, set(), 'repositorio rastreado fuera de la lista')
        self.assertEqual({i[5:].lower() for i, n in self.B['nodos'].items() if n.get('capa') == 'repo'} - pub, set(), 'pieza de repositorio fuera de la lista')
        tags = set(self.B['repos'])
        self.assertEqual({n['repo'] for n in self.B['nodos'].values() if n.get('capa') != 'repo' and n.get('repo')} - tags, set())
        self.assertEqual({x for n in self.B['nodos'].values() for x in n.get('en_codigo') or []} - tags, set(), 'en_codigo sólo nombra repositorios del grafo')
        T = self.texto_publicado()
        duenos = sorted({p.split('/')[0] for p in pub})
        citados = {f'{o}/{r}'.lower() for o, r in re.findall(r'(?<![A-Za-z0-9._-])(' + '|'.join(map(re.escape, duenos)) + r')/([A-Za-z0-9._-]*[A-Za-z0-9_-])', T, re.I)}
        self.assertEqual(citados - pub, set(), 'se cita un dueño/repositorio que no está en la lista de públicos')
        H = set(self.B.get('no_publicos') or [])
        self.assertTrue(H, 'la base guarda la huella de los repositorios no públicos que nombra el atlas')
        self.assertEqual(H & {refrescar.huella_nombre(p) for p in pub} | H & {refrescar.huella_nombre(p.split('/')[1]) for p in pub}, set())
        self.assertEqual(sorted(t for t in set(refrescar.TROZO.findall(T)) if refrescar.nombra_privado(t.rstrip('./-_'), H)), [], 'lo publicado nombra un repositorio no público')

    def test_las_laminas_no_se_indexan(self):
        G = os.path.join(MOTOR, '..', 'grafo'); html = [f for f in os.listdir(G) if f.endswith('.html')]
        self.assertGreater(len(html), 80)
        for f in html:
            with open(os.path.join(G, f), encoding='utf-8') as x: self.assertIn('<meta name="robots" content="noindex,nofollow,noarchive">', x.read(3000), f)

    def test_las_ligas_a_github_son_de_repositorios_del_grafo(self):
        ok = tuple(f"https://github.com/{r['owner']}/{r['repo']}" for r in self.B['repos'].values())
        fuera = [n['url'] for n in self.B['nodos'].values() if str(n.get('url') or '').startswith('https://github.com/') and not n['url'].startswith(ok)]
        self.assertEqual(fuera, [])


class SoloPublicos(unittest.TestCase):
    """refrescar.solo_publicos sobre una base pequeña y nombres de mentira: lo que no está en la lista de públicos sale del
    grafo, y su nombre sale de los textos, también cuando sólo se conoce su huella."""
    def test_quita_piezas_y_nombres_de_repositorios_no_publicos(self):
        import refrescar
        P = ['dueno/publico', 'dueno/casa-vieja']; H = {refrescar.huella_nombre('oculto-x')}
        N = {'repo:dueno/publico': dict(capa='repo', repo='publico', label='dueno/publico'), 'repo:dueno/se-fue': dict(capa='repo', repo='se-fue'),
             'publico::app': dict(capa='codigo', repo='publico', ruta='app.js'), 'extra::app': dict(capa='codigo', repo='extra', ruta='app.js'),
             'GAS-A': dict(capa='motor', nota='Código en Git: oculto-x/server/a.gs.', url='https://github.com/dueno/oculto-x/blob/1/a.gs'),
             'GAS-B': dict(capa='motor', nota='Vive en dueno/no-listado y en dueno/casa-vieja', cols=['oculto-x', 'ok']),
             'hoja:1': dict(capa='hoja', en_codigo=['publico', 'oculto-x', 'extra'])}
        B = dict(nodos=N, flechas=[dict(s='GAS-A', t='GAS-B', r='lee', sf='oculto-x/server/a.gs', loc='L1', nota=''), dict(s='extra::app', t='GAS-A', r='usa', sf='', loc='', nota='')],
                 simbolos={'extra::app': []}, repos={'publico': dict(owner='dueno', repo='publico', commit='1'), 'extra': dict(owner='dueno', repo='extra', commit='1')}, entre=[])
        X = refrescar.Base(B); r = refrescar.solo_publicos(X, P, H)
        self.assertEqual(sorted(B['repos']), ['publico']); self.assertEqual(sorted(X.N), ['GAS-A', 'GAS-B', 'hoja:1', 'publico::app', 'repo:dueno/publico'])
        self.assertEqual(N['GAS-A']['nota'], 'Código en Git: un repositorio privado.'); self.assertNotIn('url', N['GAS-A'])
        self.assertEqual(N['GAS-B']['nota'], 'Vive en un repositorio privado y en dueno/casa-vieja'); self.assertEqual(N['GAS-B']['cols'], ['un repositorio privado', 'ok'])
        self.assertEqual(N['hoja:1']['en_codigo'], ['publico']); self.assertEqual(B['flechas'], [dict(s='GAS-A', t='GAS-B', r='lee', sf='un repositorio privado', loc='L1', nota='')])
        self.assertEqual(r, dict(piezas=2, textos=6)); self.assertEqual(B['simbolos'], {})
        self.assertNotIn('oculto-x', json.dumps(B)); self.assertNotIn('no-listado', json.dumps(B))
        self.assertEqual(refrescar.solo_publicos(X, P, H), dict(piezas=0, textos=0), 'una segunda vuelta no cambia nada')

    def test_las_huellas_salen_del_atlas_sin_guardar_nombres(self):
        import refrescar
        M = dict(repositories=[dict(repo='dueno/publico', visibility='public'), dict(repo='dueno/oculto-x', visibility='private'),
                               dict(repo='dueno/casa-vieja', visibility='private'), dict(repo='otro/publico', visibility='private')],
                 components=[dict(id='SYS-A', repo='dueno/sin-registro')], path_ownership=[dict(repo='dueno/publico', prefix='')])
        H, marcados = refrescar.huellas_no_publicos(M, ['dueno/publico', 'dueno/casa-vieja'])
        self.assertEqual(marcados, ['dueno/casa-vieja'], 'en la lista, pero el atlas dice que no es público')
        h = refrescar.huella_nombre
        self.assertEqual(H, {h('dueno/oculto-x'), h('oculto-x'), h('dueno/casa-vieja'), h('otro/publico'), h('dueno/sin-registro'), h('sin-registro')},
                         'el nombre corto de un no público que coincide con uno público no se tapa: sólo el completo')
        self.assertTrue(refrescar.nombra_privado('dueno/oculto-x/server', H)); self.assertTrue(refrescar.nombra_privado('otro/publico', H))
        self.assertFalse(refrescar.nombra_privado('dueno/publico', H)); self.assertFalse(refrescar.nombra_privado('publico', H))


class Recetas(unittest.TestCase):
    def setUp(self):
        self.R = jl(os.path.join(MOTOR, 'recetas.json'))
        self.B = jl(os.path.join(MOTOR, 'datos', 'base.json'))

    def test_cada_dato_existe_en_el_plan_del_grafo(self):
        ppp = self.B['ppp']; self.assertEqual(set(ppp), {'vertical', 'macrolotes', 'unifamiliar', 'residencial', 'patrimonial'})
        for clave, d in self.R['datos'].items():
            for tipo, (origen, campo, fmt) in d['por_tipo'].items():
                self.assertIn(origen, ('resultado', 'entrada'))
                self.assertIn(campo, ppp[tipo]['resultados' if origen == 'resultado' else 'entradas'], f'{clave}/{tipo}')
                self.assertIn(fmt, self.R['formatos'])

    def test_escenas_bien_formadas_y_sin_cifras_en_el_texto(self):
        objetos = set(self.R['objetos']); roles = {'problem', 'solution', 'plan', 'risk', 'outcome', 'action', 'context'}
        diagramas = {'site', 'comparison', 'program', 'cashflow', 'phases', 'decision'}
        self.assertEqual([a['id'] for a in self.R['audiencias']], ['cliente', 'dueno', 'producto'])
        for a in self.R['audiencias']:
            self.assertTrue(1 <= len(a['escenas']) <= 24)
            for e in a['escenas']:
                self.assertIn(e['rol'], roles); self.assertIn(e['diagrama'], diagramas)
                self.assertLessEqual(len({o for m in e['momentos'] for o in m['ve']}), 6)
                for m in e['momentos']:
                    self.assertTrue(1 <= len(m['ve']) <= 6); self.assertTrue(set(m['ve']) <= objetos)
                    self.assertLessEqual(len(m['datos']), 4)
                    for obj, dato, *_ in m['datos']: self.assertIn(obj, m['ve']); self.assertIn(dato, self.R['datos'])
                    for de, a_, rot in m['relaciones']: self.assertIn(de, m['ve']); self.assertIn(a_, m['ve']); self.assertNotEqual(de, a_)
                    self.assertTrue(set(m['foco']) <= set(m['ve']))
                    for t in (e['titulo'], e['pregunta'], e['idea'], m['rotulo'], m['guion']): self.assertIsNone(re.search(r'\d', t), t)


class IA(unittest.TestCase):
    BUENA = dict(titulo='Entraron piezas nuevas', resumen='Se agregaron archivos.', cambios=[dict(que='Archivo nuevo', donde='tablero', importa='Se ve en el mapa')], riesgos=['Ninguno'], presentaciones='Siguen igual.', recomendacion='aprobar')

    def servidor(self, forma, espera=0.0, cuerpo=None, estado=200, guion=None, pedidos=None):
        """guion: lista de (estado, respuesta) que se van entregando en orden (la última se repite) · pedidos: aquí se anota lo que llega."""
        buena = self.BUENA
        class H(http.server.BaseHTTPRequestHandler):
            def log_message(self, *a): pass
            def do_POST(self):
                crudo = self.rfile.read(int(self.headers.get('content-length') or 0)); time.sleep(espera)
                if pedidos is not None: pedidos.append(json.loads(crudo))
                t = json.dumps(dict(buena, titulo=buena['titulo'] + ' · ' + forma)) if cuerpo is None else cuerpo
                d = dict(output_text=t) if forma == 'openai' else dict(content=[dict(type='text', text=t)]); st = estado
                if guion: st, d = guion.pop(0) if len(guion) > 1 else guion[0]
                b = json.dumps(d).encode(); self.send_response(st); self.send_header('content-type', 'application/json'); self.send_header('content-length', str(len(b))); self.end_headers(); self.wfile.write(b)
        s = http.server.ThreadingHTTPServer(('127.0.0.1', 0), H); threading.Thread(target=s.serve_forever, daemon=True).start(); self.addCleanup(s.server_close); self.addCleanup(s.shutdown)
        return f'http://127.0.0.1:{s.server_address[1]}/v1'

    def con(self, **e):
        viejo = {k: os.environ.get(k) for k in ('OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GRAFO_OPENAI_URL', 'GRAFO_CLAUDE_URL')}
        for k in viejo: os.environ.pop(k, None)
        os.environ.update(e)
        self.addCleanup(lambda: [os.environ.pop(k, None) if v is None else os.environ.__setitem__(k, v) for k, v in viejo.items()])

    def test_sin_claves_no_pregunta(self):
        import ia; self.con()
        exp, inf = ia.explicar({'a': 1}); self.assertIsNone(exp); self.assertEqual(inf['pedidos'], [])

    def test_gana_la_primera_respuesta_valida(self):
        import ia
        self.con(OPENAI_API_KEY='prueba', ANTHROPIC_API_KEY='prueba', GRAFO_OPENAI_URL=self.servidor('openai', 0.6), GRAFO_CLAUDE_URL=self.servidor('claude', 0.05))
        exp, inf = ia.explicar({'a': 1}, espera=10)
        self.assertTrue(inf['gano'].startswith('claude:')); self.assertIn('claude', exp['titulo']); self.assertEqual(sorted(inf['pedidos']), ['claude', 'openai'])
        self.assertLess(inf['segundos'], 0.6)

    def test_si_la_rapida_no_sirve_espera_a_la_otra(self):
        import ia
        self.con(OPENAI_API_KEY='prueba', ANTHROPIC_API_KEY='prueba', GRAFO_OPENAI_URL=self.servidor('openai', 0.3), GRAFO_CLAUDE_URL=self.servidor('claude', 0.0, cuerpo='no es json'))
        exp, inf = ia.explicar({'a': 1}, espera=10)
        self.assertTrue(inf['gano'].startswith('openai:')); self.assertIn('claude', inf['fallos'])

    def test_si_ninguna_sirve_no_hay_explicacion_y_no_truena(self):
        import ia
        self.con(OPENAI_API_KEY='prueba', ANTHROPIC_API_KEY='prueba', GRAFO_OPENAI_URL=self.servidor('openai', 0, estado=500), GRAFO_CLAUDE_URL=self.servidor('claude', 0, cuerpo='{"titulo":"x"}'))
        exp, inf = ia.explicar({'a': 1}, espera=10)
        self.assertIsNone(exp); self.assertEqual(set(inf['fallos']), {'openai', 'claude'}); self.assertIsNone(inf['gano'])

    def test_a_claude_se_le_pide_como_herramienta_y_llega_un_objeto(self):
        import ia
        pedidos = []; obj = dict(self.BUENA, titulo='Dijo "listo" y cerró', resumen='Con comillas "dentro" y un salto\nde línea.')
        self.con(ANTHROPIC_API_KEY='prueba', GRAFO_CLAUDE_URL=self.servidor('claude', pedidos=pedidos, guion=[(200, dict(content=[dict(type='tool_use', id='t1', name='explicacion_grafo', input=obj)], stop_reason='tool_use'))]))
        exp, inf = ia.explicar({'a': 1}, espera=10)
        self.assertEqual(exp['titulo'], 'Dijo "listo" y cerró'); self.assertTrue(inf['gano'].startswith('claude:')); self.assertEqual(inf['reintentos'], [])
        self.assertEqual(len(pedidos), 1); self.assertEqual(pedidos[0]['tool_choice'], {'type': 'tool', 'name': 'explicacion_grafo'})
        self.assertEqual(pedidos[0]['tools'][0]['input_schema']['required'], ia.ESQUEMA['required'])

    def test_una_respuesta_mal_formada_se_pide_otra_vez(self):
        import ia
        # así llegó el 12-nov-2026: un texto con comillas sin escapar dentro de una cadena («Expecting ',' delimiter»)
        mala = '{"titulo": "Grafo rehecho", "resumen": "la revisión se llama "grafo-accesos" y sigue", "cambios": [], "riesgos": [], "presentaciones": "", "recomendacion": "aprobar"}'
        with self.assertRaises(ValueError): ia._json_de(mala)
        pedidos = []
        self.con(ANTHROPIC_API_KEY='prueba', GRAFO_CLAUDE_URL=self.servidor('claude', pedidos=pedidos, guion=[(200, dict(content=[dict(type='text', text=mala)])), (200, dict(content=[dict(type='text', text=json.dumps(self.BUENA))]))]))
        exp, inf = ia.explicar({'a': 1}, espera=40)
        self.assertEqual(exp['titulo'], self.BUENA['titulo']); self.assertEqual(inf['reintentos'], ['claude']); self.assertEqual(len(pedidos), 2); self.assertEqual(inf['fallos'], {})
        import aviso
        self.assertIn('se le pidió otra vez', aviso.linea_ia(dict(ia_informe=inf)))
        # si la segunda tampoco sirve, no hay tercera: el grafo se rehace igual, sin explicación
        pedidos2 = []
        self.con(ANTHROPIC_API_KEY='prueba', GRAFO_CLAUDE_URL=self.servidor('claude', pedidos=pedidos2, cuerpo=mala))
        exp2, inf2 = ia.explicar({'a': 1}, espera=40)
        self.assertIsNone(exp2); self.assertEqual(len(pedidos2), 2); self.assertIn('JSONDecodeError', inf2['fallos']['claude'])

    def test_un_modelo_sin_herramienta_forzada_se_pide_como_texto(self):
        import ia
        pedidos = []
        self.con(ANTHROPIC_API_KEY='prueba', GRAFO_CLAUDE_URL=self.servidor('claude', pedidos=pedidos, guion=[(400, dict(error='tool_choice no admitido')), (200, dict(content=[dict(type='text', text=json.dumps(self.BUENA))]))]))
        exp, inf = ia.explicar({'a': 1}, espera=10)
        self.assertEqual(exp['titulo'], self.BUENA['titulo']); self.assertEqual(len(pedidos), 2); self.assertIn('tool_choice', pedidos[0]); self.assertNotIn('tool_choice', pedidos[1]); self.assertNotIn('tools', pedidos[1])
        self.assertEqual(inf['reintentos'], [], 'pedirlo como texto no cuenta como segundo intento')

    def test_validar_recorta_y_quita_ligas(self):
        import ia
        o = ia.validar(dict(self.BUENA, titulo='x' * 300, resumen='mira https://ejemplo.invalid/a ya', recomendacion='APROBAR', cambios=[{'que': 'a', 'donde': 'b', 'importa': 'c'}] * 20, riesgos=['r'] * 9))
        self.assertLessEqual(len(o['titulo']), 90); self.assertNotIn('http', o['resumen']); self.assertEqual(o['recomendacion'], 'aprobar'); self.assertEqual(len(o['cambios']), 8); self.assertEqual(len(o['riesgos']), 5)
        with self.assertRaises(ValueError): ia.validar({'titulo': 'x'})

    def test_las_claves_no_salen_en_el_informe(self):
        import ia
        self.con(OPENAI_API_KEY='clave-secreta-de-prueba', GRAFO_OPENAI_URL=self.servidor('openai', 0, estado=401))
        exp, inf = ia.explicar({'a': 1}, espera=10)
        self.assertNotIn('clave-secreta-de-prueba', json.dumps([exp, inf]))


class Refresco(unittest.TestCase):
    """Sobre la base real: un repositorio pequeño cambia por completo y el grafo lo refleja; lo demás no se toca."""
    @classmethod
    def setUpClass(cls):
        cls.dir, cls.m = copia_motor(); cls.clones = os.path.join(cls.dir, 'clones')
        B = jl(os.path.join(cls.m, 'datos', 'base.json'))
        cls.antes = B; cls.gas = next(i for i, n in B['nodos'].items() if n.get('capa') == 'endpoint' and i.startswith('gas:AKfy'))
        cls.hoja = next(i for i, n in B['nodos'].items() if n.get('capa') == 'hoja' and len(i) == 49)
        repo_de_mentira(os.path.join(cls.clones, 'pintarron'), {
            'index.html': '<html><script src="app.js"></script><script>function arranca(){ return guardar(1); }</script></html>\n',
            'app.js': ("const URL_GAS = 'https://script.google.com/macros/s/%s/exec';\nfunction guardar(x){ localStorage.setItem('prueba_llave_grafo', x); return x; }\n"
                       "const HOJA = 'https://docs.google.com/spreadsheets/d/%s/edit';\n") % (cls.gas[4:] + 'x' * 40, cls.hoja[5:]),
            '.github/workflows/revisar.yml': "name: Revisar pintarrón\non:\n  schedule:\n    - cron: '5 4 * * *'\n  workflow_dispatch:\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: node app.js\n        env:\n          X: ${{ secrets.LLAVE_DE_PRUEBA }}\n",
            'LEEME.md': 'Documento de prueba.\n'})
        cls.sal = os.path.join(cls.dir, 'nueva.json'); cls.cam = os.path.join(cls.dir, 'cambios.json')
        corre(cls.m, 'refrescar.py', '--repos', cls.clones, '--salida', cls.sal, '--cambios', cls.cam, '--hoy', '2026-11-12T09:00:00-07:00', env={'PYTHONHASHSEED': '0'})
        cls.B = jl(cls.sal); cls.C = jl(cls.cam)

    @classmethod
    def tearDownClass(cls): shutil.rmtree(cls.dir, ignore_errors=True)

    def nodo(self, ruta): return next((i for i, n in self.B['nodos'].items() if n.get('repo') == 'pintarron' and n.get('ruta') == ruta), None)
    def liga(self, s, t): return next((f for f in self.B['flechas'] if {f['s'], f['t']} == {s, t}), None)

    def test_archivos_nuevos_y_borrados(self):
        viejos = [n['ruta'] for n in self.antes['nodos'].values() if n.get('repo') == 'pintarron' and n.get('ruta') is not None]
        self.assertTrue(viejos)
        for ruta in ('app.js', '.github/workflows/revisar.yml', 'LEEME.md'): self.assertIsNotNone(self.nodo(ruta), ruta)
        for ruta in viejos:
            if ruta not in ('index.html', 'app.js', 'LEEME.md', '.github/workflows/revisar.yml'): self.assertIsNone(self.nodo(ruta), ruta)
        r = self.C['repos'][0]; self.assertEqual(r['repo'], 'yodesarrollomx/pintarron'); self.assertIn('app.js', r['nuevos'])

    def test_simbolos_y_ligas_leidas_del_codigo(self):
        app = self.nodo('app.js'); pag = self.nodo('index.html'); flujo = self.nodo('.github/workflows/revisar.yml')
        self.assertIn('guardar()', [s[0] for s in self.B['simbolos'][app]])
        self.assertEqual(self.liga(app, self.gas)['r'], 'llama al Apps Script'); self.assertEqual(self.liga(app, self.gas)['loc'], 'L1')
        self.assertEqual(self.liga(app, self.hoja)['r'], 'referencia la hoja')
        self.assertEqual(self.B['nodos']['ls:prueba_llave_grafo']['capa'], 'llave'); self.assertIsNotNone(self.liga(app, 'ls:prueba_llave_grafo'))
        self.assertEqual(self.liga(pag, app)['r'], 'carga el script')
        f = self.B['nodos'][flujo]; self.assertEqual(f['label'], 'Revisar pintarrón'); self.assertEqual(f['cron'], ['5 4 * * *']); self.assertIn('a mano', f['nota'])
        self.assertIsNotNone(self.liga(flujo, 'sec:LLAVE_DE_PRUEBA')); self.assertEqual(self.liga(flujo, app)['r'], 'ejecuta')
        self.assertIsNotNone(self.liga('repo:yodesarrollomx/pintarron', app))

    def test_lo_demas_no_se_toca_y_la_segunda_vuelta_no_cambia_nada(self):
        otros = lambda B: {i: n for i, n in B['nodos'].items() if n.get('repo') not in ('pintarron',) and not i.startswith(('ls:prueba', 'sec:LLAVE_DE'))}
        a, b = otros(self.antes), otros(self.B)
        self.assertEqual({i for i in a if a[i].get('ruta') is not None}, {i for i in b if b[i].get('ruta') is not None})
        dos = os.path.join(self.dir, 'dos.json')
        corre(self.m, 'refrescar.py', '--repos', self.clones, '--base', self.sal, '--salida', dos, env={'PYTHONHASHSEED': '0'})
        D = jl(dos)
        self.assertEqual(D['nodos'], self.B['nodos']); self.assertEqual(D['flechas'], self.B['flechas']); self.assertEqual(D['simbolos'], self.B['simbolos'])

    def test_lo_que_el_grafo_escribe_en_su_repositorio_no_cuenta_como_cambio(self):
        import refrescar
        self.assertTrue(refrescar.solo_propio('potenciales-yod', {'grafo/mapa.html', 'grafo/versiones.json', 'grafo-motor/datos/base.json'}))
        self.assertTrue(refrescar.solo_propio('pintarron', set()), 'un commit sin archivos tampoco mueve el grafo')
        # aprobar un grafo fusiona también el registro de impacto que el borrador reescribe (12-nov-2026: se veía «cambió» tras aprobar)
        self.assertTrue(refrescar.solo_propio('potenciales-yod', {'architecture-impact.json', 'grafo/versiones.json', 'grafo-motor/datos/base.json'}))
        self.assertFalse(refrescar.solo_propio('pintarron', {'architecture-impact.json'}), 'en los demás repositorios ese archivo sí es un cambio')
        self.assertNotIn('architecture-impact.json', refrescar.IGNORAR['potenciales-yod'], 'se sigue dibujando: sólo deja de contar como cambio')
        self.assertFalse(refrescar.solo_propio('potenciales-yod', {'grafo/mapa.html', 'mixto.html'}))
        self.assertFalse(refrescar.solo_propio('potenciales-yod', {'grafo-motor/laminas.py'}), 'el motor sí es código del sistema')
        self.assertFalse(refrescar.solo_propio('pintarron', {'grafo/mapa.html'}), 'sólo aplica al repositorio del grafo')
        self.assertFalse(refrescar.solo_propio('potenciales-yod', None), 'sin historial no se puede saber: se relee todo')

    def test_una_liga_que_ya_no_esta_en_el_codigo_se_quita(self):
        d2 = os.path.join(self.dir, 'clones2'); shutil.copytree(self.clones, d2, symlinks=True)
        p = os.path.join(d2, 'pintarron', 'app.js')
        with open(p, 'w', encoding='utf-8') as f: f.write("function guardar(x){ return x; }\n")
        subprocess.run(['git', '-C', os.path.dirname(p), '-c', 'user.name=p', '-c', 'user.email=p@example.invalid', 'commit', '-qam', 'sin ligas'], check=True)
        tres = os.path.join(self.dir, 'tres.json')
        corre(self.m, 'refrescar.py', '--repos', d2, '--base', self.sal, '--salida', tres, env={'PYTHONHASHSEED': '0'})
        T = jl(tres); app = self.nodo('app.js')
        par = lambda t: any({f['s'], f['t']} == {app, t} for f in T['flechas'])
        self.assertFalse(par(self.gas)); self.assertFalse(par(self.hoja)); self.assertFalse(par('ls:prueba_llave_grafo'))
        self.assertTrue(par(self.nodo('index.html')))


class Versiones(unittest.TestCase):
    def test_rehacer_deja_version_nueva_y_si_nada_cambia_no_hace_otra(self):
        d, m = copia_motor(); self.addCleanup(shutil.rmtree, d, True)
        G = os.path.join(d, 'grafo'); clones = os.path.join(d, 'clones'); inf = os.path.join(d, 'informe.json')
        repo_de_mentira(os.path.join(clones, 'pintarron'), {'index.html': '<html><script>function hola(){ return 1; }</script></html>\n', 'nuevo-modulo.js': 'export function saluda(){ return 2; }\n'})
        corre(m, 'rehacer.py', 'inicial', '--salida', G)
        V0 = jl(os.path.join(G, 'versiones.json')); self.assertEqual(len(V0['versiones']), 1)
        self.assertTrue(os.path.exists(os.path.join(G, 'datos', V0['aprobado'] + '.json'))); self.assertTrue(os.path.exists(os.path.join(G, 'mapa.html')))
        imp = os.path.join(d, 'architecture-impact.json'); antes_imp = dict(model_revision='2026-01-01.prueba.1', proposal_id='CHG-OTRA-COSA', summary='otro cambio', components=['SYS-POTENCIALES', 'SYS-CONTROL'], tests=['x'], rollback='y')
        with open(imp, 'w', encoding='utf-8') as f: json.dump(antes_imp, f)
        corre(m, 'rehacer.py', 'rehacer', '--sin-ia', '--ensayo', '--clones', clones, '--salida', G, '--informe', inf, env=SIN_RED)
        self.assertTrue(jl(inf)['cambio']); self.assertEqual(len(jl(os.path.join(G, 'versiones.json'))['versiones']), 1, 'el ensayo no guarda')
        self.assertEqual(jl(imp), antes_imp, 'el ensayo no toca el registro de impacto')
        corre(m, 'rehacer.py', 'rehacer', '--sin-ia', '--clones', clones, '--salida', G, '--informe', inf, '--por', 'prueba', '--pedido', '7', '--motivo', 'porque sí', env=SIN_RED)
        I = jl(inf); V = jl(os.path.join(G, 'versiones.json'))
        self.assertTrue(I['cambio']); self.assertEqual(V['aprobado'], I['id']); self.assertEqual([v['estado'] for v in V['versiones']], ['anterior', 'aprobado'])
        self.assertEqual(V['versiones'][-1]['pedido'], dict(por='prueba', numero=7, motivo='porque sí')); self.assertEqual(I['antes'], V0['aprobado'])
        # el borrador lleva su registro de impacto: sin él, la rama principal no deja aprobarlo
        J = jl(imp); self.assertTrue(I['impacto']); self.assertEqual(J['model_revision'], '2026-01-01.prueba.1', 'conserva la revisión del atlas ya fijada')
        self.assertEqual(J['proposal_id'], 'CHG-GRAFO-ACCESOS-20261111'); self.assertEqual(J['components'], ['SYS-POTENCIALES'])
        self.assertIn(I['id'], J['summary']); self.assertIn(V0['aprobado'], J['summary']); self.assertTrue(J['tests'] and J['rollback'])
        self.assertEqual(sorted(os.listdir(os.path.join(G, 'datos'))), sorted(v['id'] + '.json' for v in V['versiones']))
        D = jl(os.path.join(G, 'datos', I['id'] + '.json')); self.assertEqual(D['id'], I['id']); self.assertEqual(len(D['recetas']['audiencias']), 3); self.assertEqual(D['sin_campo'], [])
        with open(os.path.join(G, 'codigo-pintarron.html'), encoding='utf-8') as f: self.assertIn('nuevo-modulo.js', f.read())
        self.assertEqual(jl(os.path.join(G, 'mapa-ids.json'))['armado'], V['versiones'][-1]['armado'])
        corre(m, 'rehacer.py', 'rehacer', '--sin-ia', '--clones', clones, '--salida', G, '--informe', inf, env=SIN_RED)
        self.assertFalse(jl(inf)['cambio']); self.assertEqual(len(jl(os.path.join(G, 'versiones.json'))['versiones']), 2)
        # avisos del flujo
        import aviso
        cuerpo = aviso.cuerpo_pr(I); self.assertIn('Fusionar este PR es aprobar', cuerpo); self.assertIn(I['id'], cuerpo); self.assertIn('Dueño del terreno', cuerpo); self.assertIn('no hay clave', aviso.linea_ia(dict(ia_informe=dict(pedidos=[]))))
        self.assertNotIn('@', cuerpo.replace('@lydell', ''))
        datos = os.path.join(d, 'rama'); os.makedirs(datos)
        p = aviso.puntero(I, 12, 'https://github.com/x/y/pull/12', datos); self.assertEqual(p['pr'], 12); self.assertEqual(jl(os.path.join(datos, 'borrador.json'))['id'], I['id'])
        aviso.cierre(datos, True, 'alguien', '12'); self.assertEqual(jl(os.path.join(datos, 'borrador.json')), {})
        with open(os.path.join(datos, 'registro.jsonl'), encoding='utf-8') as f: reg = [json.loads(l) for l in f]
        self.assertEqual([l['que'] for l in reg], ['grafo rehecho (borrador)', 'grafo aprobado']); self.assertEqual(reg[1]['id'], I['id'])
        # repetir el cierre (otra corrida del flujo, o el vigilante que ya lo anotó) no deja dos renglones del mismo cierre
        self.assertFalse(aviso.cierre(datos, True, 'alguien', '12'))
        with open(os.path.join(datos, 'registro.jsonl'), encoding='utf-8') as f: self.assertEqual(len(f.readlines()), 2)
        otro = os.path.join(d, 'rama2'); os.makedirs(otro); aviso.puntero(I, 12, 'https://github.com/x/y/pull/12', otro)
        with open(os.path.join(otro, 'registro.jsonl'), 'a', encoding='utf-8') as f: f.write(json.dumps(dict(cuando='x', que='grafo aprobado', id=I['id'], pr=12, por='revisión de cada hora')) + '\n')
        self.assertFalse(aviso.cierre(otro, True, 'alguien', '12'), 'el vigilante ya lo había anotado'); self.assertEqual(jl(os.path.join(otro, 'borrador.json')), {})
        with open(os.path.join(otro, 'registro.jsonl'), encoding='utf-8') as f: self.assertEqual([json.loads(l)['que'] for l in f], ['grafo rehecho (borrador)', 'grafo aprobado'])
        self.assertTrue(aviso.ya_cerrado(os.path.join(otro, 'registro.jsonl'), numero=12)); self.assertFalse(aviso.ya_cerrado(os.path.join(otro, 'registro.jsonl'), numero=13)); self.assertFalse(aviso.ya_cerrado(os.path.join(otro, 'no-existe.jsonl'), 'G-x'))
        # camino sin PR automático: queda la liga para abrirlo con un toque y el aviso vale igual
        liga = aviso.liga_abrir(I, 'yodesarrollomx/potenciales-yod')
        self.assertTrue(liga.startswith('https://github.com/yodesarrollomx/potenciales-yod/compare/main...grafo-borrador?expand=1&title=')); self.assertNotIn(' ', liga); self.assertIn(I['id'], liga)
        p0 = aviso.puntero(I, '', liga, datos, registrar=False); self.assertEqual(p0['pr'], 0); self.assertEqual(p0['liga'], liga); self.assertNotIn('`', p0['resumen'], 'el aviso se pinta como texto llano')
        with open(os.path.join(datos, 'registro.jsonl'), encoding='utf-8') as f: self.assertEqual(len(f.readlines()), 2, 'sin-registro no anota otra línea')
        sin_pr = aviso.comentario(I, liga, 0); self.assertIn('«Create pull request» y luego «Merge pull request»', sin_pr); self.assertIn('rama `grafo-borrador`', sin_pr); self.assertIn(f'[esta página]({liga})', sin_pr)
        con_pr = aviso.comentario(I, 'https://github.com/x/y/pull/12', 12); self.assertNotIn('Create pull request', con_pr)
        # el PR que abre el flujo con su credencial llega con sus pruebas en espera de aprobación: se dice ese paso antes de «Merge»
        # (12-nov-2026, PR 66); con la App del grafo no sale, y el texto lo dice (DEC-21)
        for texto in (con_pr, cuerpo): self.assertRegex(texto, r'«Approve workflows to run», tócalo primero[^\n]*con la App del grafo[^\n]*«Merge pull request»')
        for texto in (sin_pr, con_pr): self.assertIn('Dejarlo en borrador', texto); self.assertIn('no cambian', texto)
        # el informe se puede reconstruir del registro de versiones (cuando el PR lo abre una persona)
        R = aviso.informe_de(V, jl(os.path.join(m, 'recetas.json')))
        self.assertEqual((R['id'], R['antes'], R['piezas'], R['ligas']), (I['id'], I['antes'], I['piezas'], I['ligas'])); self.assertEqual(R['pedido'], I['pedido']); self.assertEqual(len(R['audiencias']), 3)
        self.assertEqual(aviso.cuerpo_pr(R), cuerpo, 'el PR abierto a mano dice lo mismo que el abierto por el flujo')
        self.assertEqual(aviso.titulo_pr(R), f"🕸️ Grafo {I['id']} · borrador (fusionar = aprobar)")

    def test_sin_leer_un_repositorio_publico_no_hay_borrador(self):
        """Cada repositorio de la lista de públicos se lee sin credencial. Si alguno no contesta (dejó de ser público, o
        GitHub no respondió) no se abre borrador y el pedido dice por qué (dictamen GRAFO-05, B5)."""
        import aviso, refrescar
        d, m = copia_motor(); self.addCleanup(shutil.rmtree, d, True)
        G = os.path.join(d, 'grafo'); clones = os.path.join(d, 'clones'); inf = os.path.join(d, 'informe.json')
        repo_de_mentira(os.path.join(clones, 'pintarron'), {'index.html': '<html><script>function hola(){ return 1; }</script></html>\n'})
        corre(m, 'rehacer.py', 'inicial', '--salida', G)
        with open(os.path.join(m, 'datos', 'base.json'), 'rb') as f: base = f.read()
        corre(m, 'rehacer.py', 'rehacer', '--sin-ia', '--clones', clones, '--salida', G, '--informe', inf, env={'GRAFO_CLONA_DE': SIN_RED['GRAFO_CLONA_DE'], 'GRAFO_PERMITE_SIN_CLON': ''})
        I = jl(inf)
        self.assertFalse(I['cambio']); self.assertEqual(I['bloqueado'], 'sin_clon')
        self.assertEqual(len(I['sin_clon']), len(refrescar.reglas_publicos()) - 1, 'se tocan todos los de la lista, también las casas viejas')
        self.assertNotIn('yodesarrollomx/pintarron', I['sin_clon'])
        self.assertEqual(len(jl(os.path.join(G, 'versiones.json'))['versiones']), 1)
        with open(os.path.join(m, 'datos', 'base.json'), 'rb') as f: self.assertEqual(f.read(), base, 'la base no cambia')
        c = aviso.comentario(I, '', 0); self.assertIn('no se pudieron leer sin credencial', c.lower()); self.assertIn('No se abrió ningún borrador', c)

    def test_las_laminas_salen_iguales_cada_vez(self):
        a, b = tempfile.mkdtemp(), tempfile.mkdtemp(); self.addCleanup(shutil.rmtree, a, True); self.addCleanup(shutil.rmtree, b, True)
        corre(MOTOR, 'laminas.py', a); corre(MOTOR, 'laminas.py', b)
        for f in sorted(os.listdir(a)):
            with open(os.path.join(a, f), 'rb') as x, open(os.path.join(b, f), 'rb') as y: self.assertEqual(x.read(), y.read(), f)
        self.assertGreater(len(os.listdir(a)), 80)


class VistaPreviaDelBorrador(unittest.TestCase):
    """La portada (grafo/index.html) enseña el borrador sin publicarlo trayendo cada lámina como texto. Sólo de la rama
    grafo-borrador, y la lámina traída corre en un marco aislado: comparte dominio con todos los tableros y ahí vive la
    sesión del Portero. La prueba de navegador (tests/grafo-accesos-browser.cjs) lo comprueba además en vivo."""
    @classmethod
    def setUpClass(cls):
        cls.dir = tempfile.mkdtemp(); corre(MOTOR, 'laminas.py', cls.dir)
        with open(os.path.join(cls.dir, 'index.html'), encoding='utf-8') as f: cls.h = f.read()

    @classmethod
    def tearDownClass(cls): shutil.rmtree(cls.dir, ignore_errors=True)

    def test_solo_acepta_la_rama_del_borrador(self):
        self.assertEqual(re.findall(r"get\('rama'\)[^;\n]*", self.h), ["get('rama') === 'grafo-borrador'"])
        self.assertEqual(set(re.findall(r"https://raw\.githubusercontent\.com/[^'\"\s]*", self.h)), {'https://raw.githubusercontent.com/yodesarrollomx/potenciales-yod/grafo-borrador/grafo/'})
        self.assertIsNone(re.search(r"raw\.githubusercontent\.com/[^'\n]*'\s*\+", self.h), 'la dirección cruda no se arma con nada de la liga')
        self.assertIn('LAM_ID.test(', self.h, 'la lista de láminas del borrador sólo acepta nombres de lámina')

    def test_la_lamina_traida_corre_aislada(self):
        self.assertNotIn('allow-same-origin', self.h)
        aisla = "if (CRUDO) marco.setAttribute('sandbox', 'allow-scripts allow-popups');"
        self.assertEqual(self.h.count(aisla), 1)
        usos = [m.start() for m in re.finditer(r'\.srcdoc\s*=', self.h)]
        self.assertTrue(usos and all(u > self.h.index(aisla) for u in usos), 'el marco se aísla antes de recibir cualquier lámina traída')
        self.assertIn('e.source !== marco.contentWindow', self.h, 'la portada sólo escucha a su marco')


class DondeSeMarcaElError(unittest.TestCase):
    """El vigilante pinta cada error en el repositorio donde pasó y en los tableros que viven en él; nunca en sus vecinos de fila
    (antes tomaba los tres primeros tableros de la fila y un error de un repositorio aparecía en tableros ajenos)."""

    def test_cada_repositorio_apunta_solo_a_los_tableros_que_viven_en_el(self):
        a = tempfile.mkdtemp(); self.addCleanup(shutil.rmtree, a, True)
        corre(MOTOR, 'laminas.py', a)
        M = jl(os.path.join(a, 'mapa-ids.json'))['repos']; B = jl(os.path.join(MOTOR, 'datos', 'base.json')); R = jl(os.path.join(MOTOR, 'datos', 'reglas.json'))
        es_tablero = lambda i: B['nodos'].get(i, {}).get('capa') == 'sistema'
        vive = {(f['s'], f['t']) for f in B['flechas'] if f['r'] == 'vive en' and es_tablero(f['s'])}
        self.assertGreater(len(M), 20); self.assertGreater(len(vive), 15)
        con_tablero = 0
        for nombre, m in M.items():
            rn, sis = m['nodos'][0], m['nodos'][1:]
            self.assertEqual(rn, 'repo:' + nombre)
            for s in sis: self.assertIn((s, rn), vive, f'{s} no vive en {nombre}')
            todos = {s for s, t in vive if t == rn}
            fila = R['repo_area'].get(nombre.split('/')[1])
            propios = {s for s in todos if R['sis_area'].get(s) == fila}
            self.assertEqual(set(sis), propios or todos, nombre)
            self.assertEqual(len(sis), len(set(sis)), nombre)
            con_tablero += bool(sis)
        self.assertGreater(con_tablero, 12, 'casi todos los repositorios del grafo alojan un tablero')
        # ningún tablero queda señalado por un repositorio en el que no vive
        for s in {x for m in M.values() for x in m['nodos'][1:]}:
            self.assertEqual({n for n, m in M.items() if s in m['nodos'][1:]}, {t[5:] for x, t in vive if x == s} & set(M), s)


if __name__ == '__main__':
    unittest.main()
