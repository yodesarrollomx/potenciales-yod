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
        haya sido armada después de la decisión (la anterior es una foto previa y la limpia el siguiente rehecho)."""
        import refrescar
        with open(os.path.join(MOTOR, 'datos', 'reglas.json'), encoding='utf-8') as x: R = json.load(x).get('excluir') or {}
        self.assertTrue(R.get('ids') and R.get('rutas') and R.get('comp'), 'la regla de exclusión debe existir')
        N = {'SYS-EMD': dict(capa='sistema'), 'CTR-EMD-DRAFTS': dict(capa='contrato'), 'PROC-EMD-PROFILES·2': dict(capa='proceso'),
             'gas:AKfycbwvvLVi': dict(capa='endpoint', comp='GAS-EMD'), 'sec:EMD_BRIDGE_KEY': dict(capa='llave'),
             'yod-portal::emd_wrapper': dict(capa='codigo', repo='yod-portal', ruta='emd/wrapper.js'),
             'f:yod-portal:docs/arquitectura/emd-contratos-20261102.md': dict(capa='documento', repo='yod-portal', ruta='docs/arquitectura/emd-contratos-20261102.md'),
             'SYS-POTENCIALES': dict(capa='sistema'), 'SYS-EMDX': dict(capa='sistema'), 'yod-portal::despacho': dict(capa='codigo', repo='yod-portal', ruta='despacho/emd-no/x.js')}
        B = dict(nodos=N, flechas=[dict(s='SYS-EMD', t='SYS-POTENCIALES', r='usa'), dict(s='SYS-POTENCIALES', t='yod-portal::despacho', r='usa')], simbolos={k: 1 for k in N}, repos={}, entre=[['SYS-EMD', 'SYS-POTENCIALES', 1]])
        X = refrescar.Base(B); fuera = refrescar.excluye(X, R)
        self.assertEqual(sorted(X.N), ['SYS-EMDX', 'SYS-POTENCIALES', 'yod-portal::despacho']); self.assertEqual(len(fuera), 7)
        self.assertEqual(B['flechas'], [dict(s='SYS-POTENCIALES', t='yod-portal::despacho', r='usa')]); self.assertEqual(B['entre'], []); self.assertEqual(set(B['simbolos']), set(X.N))
        if str(self.B.get('armado') or '') >= '2026-11-12T18:00':
            Y = refrescar.Base(json.loads(json.dumps(self.B))); self.assertEqual(refrescar.excluye(Y, R), [], 'la base publicada aún trae piezas excluidas')

    def test_las_ligas_a_github_son_de_repositorios_del_grafo(self):
        ok = tuple(f"https://github.com/{r['owner']}/{r['repo']}" for r in self.B['repos'].values())
        fuera = [n['url'] for n in self.B['nodos'].values() if str(n.get('url') or '').startswith('https://github.com/') and not n['url'].startswith(ok)]
        self.assertEqual(fuera, [])


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

    def servidor(self, forma, espera=0.0, cuerpo=None, estado=200):
        buena = self.BUENA
        class H(http.server.BaseHTTPRequestHandler):
            def log_message(self, *a): pass
            def do_POST(self):
                self.rfile.read(int(self.headers.get('content-length') or 0)); time.sleep(espera)
                t = json.dumps(dict(buena, titulo=buena['titulo'] + ' · ' + forma)) if cuerpo is None else cuerpo
                d = dict(output_text=t) if forma == 'openai' else dict(content=[dict(type='text', text=t)])
                b = json.dumps(d).encode(); self.send_response(estado); self.send_header('content-type', 'application/json'); self.send_header('content-length', str(len(b))); self.end_headers(); self.wfile.write(b)
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
        corre(m, 'rehacer.py', 'rehacer', '--sin-ia', '--ensayo', '--clones', clones, '--salida', G, '--informe', inf)
        self.assertTrue(jl(inf)['cambio']); self.assertEqual(len(jl(os.path.join(G, 'versiones.json'))['versiones']), 1, 'el ensayo no guarda')
        self.assertEqual(jl(imp), antes_imp, 'el ensayo no toca el registro de impacto')
        corre(m, 'rehacer.py', 'rehacer', '--sin-ia', '--clones', clones, '--salida', G, '--informe', inf, '--por', 'prueba', '--pedido', '7', '--motivo', 'porque sí')
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
        corre(m, 'rehacer.py', 'rehacer', '--sin-ia', '--clones', clones, '--salida', G, '--informe', inf)
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
        # camino sin PR automático: queda la liga para abrirlo con un toque y el aviso vale igual
        liga = aviso.liga_abrir(I, 'yodesarrollomx/potenciales-yod')
        self.assertTrue(liga.startswith('https://github.com/yodesarrollomx/potenciales-yod/compare/main...grafo-borrador?expand=1&title=')); self.assertNotIn(' ', liga); self.assertIn(I['id'], liga)
        p0 = aviso.puntero(I, '', liga, datos, registrar=False); self.assertEqual(p0['pr'], 0); self.assertEqual(p0['liga'], liga); self.assertNotIn('`', p0['resumen'], 'el aviso se pinta como texto llano')
        with open(os.path.join(datos, 'registro.jsonl'), encoding='utf-8') as f: self.assertEqual(len(f.readlines()), 2, 'sin-registro no anota otra línea')
        sin_pr = aviso.comentario(I, liga, 0); self.assertIn('«Create pull request» y luego «Merge pull request»', sin_pr); self.assertIn('rama `grafo-borrador`', sin_pr); self.assertIn(f'[esta página]({liga})', sin_pr)
        con_pr = aviso.comentario(I, 'https://github.com/x/y/pull/12', 12); self.assertIn('fusiona ese PR', con_pr); self.assertNotIn('Create pull request', con_pr)
        for texto in (sin_pr, con_pr): self.assertIn('Dejarlo en borrador', texto); self.assertIn('no cambian', texto)
        # el informe se puede reconstruir del registro de versiones (cuando el PR lo abre una persona)
        R = aviso.informe_de(V, jl(os.path.join(m, 'recetas.json')))
        self.assertEqual((R['id'], R['antes'], R['piezas'], R['ligas']), (I['id'], I['antes'], I['piezas'], I['ligas'])); self.assertEqual(R['pedido'], I['pedido']); self.assertEqual(len(R['audiencias']), 3)
        self.assertEqual(aviso.cuerpo_pr(R), cuerpo, 'el PR abierto a mano dice lo mismo que el abierto por el flujo')
        self.assertEqual(aviso.titulo_pr(R), f"🕸️ Grafo {I['id']} · borrador (fusionar = aprobar)")

    def test_las_laminas_salen_iguales_cada_vez(self):
        a, b = tempfile.mkdtemp(), tempfile.mkdtemp(); self.addCleanup(shutil.rmtree, a, True); self.addCleanup(shutil.rmtree, b, True)
        corre(MOTOR, 'laminas.py', a); corre(MOTOR, 'laminas.py', b)
        for f in sorted(os.listdir(a)):
            with open(os.path.join(a, f), 'rb') as x, open(os.path.join(b, f), 'rb') as y: self.assertEqual(x.read(), y.read(), f)
        self.assertGreater(len(os.listdir(a)), 80)


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
