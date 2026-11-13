"""Textos y avisos del flujo «Grafo · rehacer»: el cuerpo del PR, el comentario del pedido, el aviso de borrador
en la rama de datos y el cierre (aprobado o descartado). Todo sale del informe que deja rehacer.py.

  python3 grafo-motor/aviso.py pr <informe.json>
  python3 grafo-motor/aviso.py comentario <informe.json> <liga> [número de PR]
  python3 grafo-motor/aviso.py puntero <informe.json> <número de PR o 0> <liga> <carpeta de la rama de datos> [sin-registro]
  python3 grafo-motor/aviso.py cierre <carpeta de la rama de datos> <si|no fusionado> <quién> <número de PR>
  python3 grafo-motor/aviso.py abrir <informe.json> <dueño/repositorio>      liga para abrir el PR con un toque
  python3 grafo-motor/aviso.py informe <versiones.json del borrador>         informe reconstruido del registro de versiones
  python3 grafo-motor/aviso.py ensayo <informe.json>                         avisos del ensayo de un PR (::warning:: y resumen de la corrida)

Dos caminos, según lo que el repositorio le permita a un flujo: (1) el flujo abre el PR del borrador; (2) si no
puede, deja la rama y una liga: al tocar «Create pull request» el PR queda abierto y este mismo flujo lo completa.
"""
import datetime, json, os, sys, urllib.parse

HMO = datetime.timezone(datetime.timedelta(hours=-7))
PAGINA = 'https://yodesarrollomx.github.io/potenciales-yod/accesos.html#grafo-sistema'


def _ahora(): return datetime.datetime.now(HMO).replace(microsecond=0).isoformat()
def _lee(p):
    with open(p, encoding='utf-8') as f: return json.load(f)


def _escribe(p, o):
    with open(p, 'w', encoding='utf-8') as f: json.dump(o, f, ensure_ascii=False, indent=1); f.write('\n')
def _plural(n, uno, varios): return f'{n} {uno if n == 1 else varios}'


def que_cambio(inf):
    """Lista llana de lo que cambió, sin IA: repositorios, atlas y campos del Plan de Potencial."""
    r = inf.get('resumen') or {}; out = []
    for x in r.get('repos') or []:
        partes = [_plural(x['nuevos'], 'archivo nuevo', 'archivos nuevos')] * bool(x['nuevos']) + [_plural(x['quitados'], 'quitado', 'quitados')] * bool(x['quitados']) + [_plural(x['cambiados'], 'cambiado', 'cambiados')] * bool(x['cambiados'])
        out.append(f"`{x['repo'].split('/')[-1]}` ({x['de']} → {x['a']}): " + (', '.join(partes) or 'sin cambios en lo que dibuja el grafo'))
    a = r.get('atlas') or {}
    if a.get('componentes_nuevos'): out.append('Atlas: piezas nuevas ' + ', '.join(f'`{c}`' for c in a['componentes_nuevos'][:12]))
    if a.get('componentes_fuera'): out.append('Atlas: piezas que salieron ' + ', '.join(f'`{c}`' for c in a['componentes_fuera'][:12]))
    if a.get('conexiones_mas') or a.get('conexiones_menos'): out.append(f"Atlas: {a.get('conexiones_mas', 0)} conexiones nuevas o cambiadas y {a.get('conexiones_menos', 0)} retiradas")
    for e in (a.get('estados') or [])[:8]: out.append('Atlas, cambio de estado: ' + e)
    for e in (a.get('propuestas') or [])[:8]: out.append('Atlas, propuesta ' + e)
    for tipo, d in (r.get('ppp') or {}).items():
        if r.get('primer_ppp'): break
        mas = d['resultados_mas'] + d['entradas_mas']; menos = d['resultados_menos'] + d['entradas_menos']
        if mas or menos: out.append(f"Plan de Potencial {tipo}: " + ' · '.join(x for x in [mas and 'campos nuevos ' + ', '.join(f'`{c}`' for c in mas[:10]), menos and 'campos que ya no están ' + ', '.join(f'`{c}`' for c in menos[:10])] if x))
    if r.get('primer_ppp'): out.append('Se registró por primera vez el contrato del Plan de Potencial (entradas y resultados guardados de cada tipo).')
    if r.get('sin_clon'): out.append('No se pudo clonar: ' + ', '.join(f'`{c}`' for c in r['sin_clon']) + '. Esos repositorios quedaron como estaban.')
    if r.get('sin_respuesta'): out.append(f"{_plural(r['sin_respuesta'], 'repositorio', 'repositorios')} de la lista de públicos que el grafo no rastrea no contestaron sin credencial: "
                                          'su nombre completo quedó tapado en los textos («un repositorio privado»). El pedido dice cuáles.')
    for n in (r.get('notas') or [])[:6]: out.append('Nota: ' + n)
    return out


def aviso_mudos(inf):
    """Repositorios de la lista de públicos que el grafo no rastrea (sólo salen en textos) y que no contestaron sin credencial
    ni al segundo intento. No frenan el borrador, pero su nombre completo se tapó y hay que revisarlos (dictamen del PR 90, H3)."""
    m = inf.get('sin_respuesta') or []
    if not m: return ''
    return (f"**Ojo:** {_plural(len(m), 'repositorio', 'repositorios')} de la lista de públicos que el grafo no rastrea (sólo salen en textos) "
            f"no {'contestó' if len(m) == 1 else 'contestaron'} sin credencial, ni al segundo intento: {', '.join(f'`{x}`' for x in m[:12])}{'…' if len(m) > 12 else ''}. "
            'Se siguió sin ellos y su nombre completo se tapó en los textos del grafo («un repositorio privado»). '
            'Si ya no existen o dejaron de ser públicos, pídele a Claude que los quite de `grafo-motor/datos/reglas.json` («publicos»). '
            + ('Si fue la red, descarta este borrador y vuelve a pedirlo: lo tapado no se destapa solo.' if inf.get('cambio') else 'Si fue la red, no hay nada que hacer.'))


def _comando(s): return str(s).replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A')


def anotar_ensayo(inf):
    """Lo que el trabajo «ensayo» de cada PR debe enseñar en el resumen de la corrida (dictamen del PR 90, H4): un ensayo
    bloqueado no probó el motor, porque rehacer.py regresa antes de refrescar, y un repositorio de la lista sin respuesta se
    taparía en un rehecho real. Regresa los avisos para GitHub Actions (::warning::) y el texto del resumen."""
    avisos = []
    if inf.get('bloqueado'): avisos.append(('Ensayo bloqueado, no probó el motor', inf.get('mensaje') or inf['bloqueado']))
    m = inf.get('sin_respuesta') or []
    if m: avisos.append(('Repositorios de la lista sin respuesta', f"No contestaron sin credencial: {', '.join(m)}. En un rehecho real su nombre se taparía en los textos."))
    comandos = [f"::warning title={_comando(t).replace(':', '%3A').replace(',', '%2C')}::{_comando(x)}" for t, x in avisos]
    return comandos, ''.join(f'### ⚠️ {t}\n\n{x}\n\n' for t, x in avisos)


def linea_ia(inf):
    i = inf.get('ia_informe') or {}
    if i.get('omitida'): return 'Explicación de IA: se pidió no usarla en esta corrida.'
    if not i.get('pedidos'): return ('Explicación de IA: no hay clave en este repositorio. Para activarla, agrega `OPENAI_API_KEY` o `ANTHROPIC_API_KEY` '
                                     '(o las dos) en Settings → Secrets and variables → Actions. Con las dos, se pregunta a ambas y se usa la primera que conteste bien.')
    pedidos = ' y '.join({'openai': 'OpenAI', 'claude': 'Claude'}.get(p, p) for p in i['pedidos'])
    if i.get('gano'):
        otra = ' Su primera respuesta llegó mal formada y se le pidió otra vez.' if str(i['gano']).split(':')[0] in (i.get('reintentos') or []) else ''
        return f"Explicación de IA: se preguntó a {pedidos}; contestó primero `{i['gano']}` en {i.get('segundos')} s." + otra + (f" Falló: {json.dumps(i['fallos'], ensure_ascii=False)}." if i.get('fallos') else '')
    return f"Explicación de IA: se preguntó a {pedidos} y ninguna respuesta sirvió ({json.dumps(i.get('fallos') or {}, ensure_ascii=False)}). El grafo se rehízo igual, sin explicación."


# Cuando el flujo abre el PR con su propia credencial, GitHub deja sus pruebas «en espera de aprobación» y no deja
# fusionar hasta que una persona con permiso de escritura las deja correr (comprobado en vivo el 12-nov-2026, PR 66).
# Abierto a mano, o por el flujo con la App del grafo, no lo pide. El texto vale para los dos casos: el cuerpo del PR
# debe salir igual lo abra quien lo abra (lo comprueba prueba_motor).
PASOS = ('**Para aprobar:** si GitHub muestra «Approve workflows to run», tócalo primero: sólo deja correr las pruebas (lo pide cuando el flujo '
         'abrió el PR con su propia credencial; con la App del grafo, o si lo abrió una persona, las pruebas corren solas). '
         'Cuando queden en verde, toca «Merge pull request» y luego «Confirm merge».')


def cuerpo_pr(inf):
    r = inf.get('resumen') or {}; ia = inf.get('ia'); p = []
    p += [f"## Grafo {inf['id']} · borrador", '',
          f"**Fusionar este PR es aprobar el grafo.** Mientras siga abierto, es un borrador: las presentaciones siguen leyendo el grafo aprobado `{inf.get('antes')}` y sus ligas no cambian.",
          'Cerrarlo sin fusionar lo descarta.', '',
          PASOS, '',
          f"Vista previa del borrador y botones: {PAGINA}", '']
    if ia:
        p += ['### Qué cambió, explicado', f"**{ia['titulo']}**", '', ia['resumen'], '']
        p += [f"- **{c['que']}**" + (f" ({c['donde']})" if c.get('donde') else '') + (f": {c['importa']}" if c.get('importa') else '') for c in ia.get('cambios') or []]
        if ia.get('riesgos'): p += ['', '**A cuidar**'] + [f'- {x}' for x in ia['riesgos']]
        p += ['', f"Recomendación de la IA: **{ia['recomendacion']}**. La decisión es de Dirección.", '']
    p += ['### Qué cambió, contado'] + [f'- {x}' for x in que_cambio(inf)]
    p += [f"- En total: {inf.get('piezas'):,} piezas y {inf.get('ligas'):,} ligas "
          f"(+{sum((r.get('piezas_mas') or {}).values())} −{sum((r.get('piezas_menos') or {}).values())} piezas, {r.get('piezas_cambiadas', 0)} cambiadas; +{r.get('ligas_mas', 0)} −{r.get('ligas_menos', 0)} ligas).", '']
    p += ['### Presentaciones que leen el grafo',
          'Versiones por audiencia: ' + ' · '.join(inf.get('audiencias') or []) + '.',
          'Al aprobar, se arman solas con este grafo. En borrador, siguen como están.']
    if ia and ia.get('presentaciones'): p += ['', ia['presentaciones']]
    if r.get('sin_campo'): p += ['', '**Ojo:** estos datos de las presentaciones ya no existen en el plan y dejarían de mostrarse: ' + ', '.join(f'`{c}`' for c in r['sin_campo'][:20]) + '.']
    p += ['', '### Cómo se hizo', '- ' + linea_ia(inf),
          '- Rehecho por el flujo «Grafo · rehacer»: sólo lee repositorios públicos y el atlas; no toca ningún `/exec` ni ninguna hoja.']
    ped = inf.get('pedido') or {}
    if ped.get('por') or ped.get('numero'): p.append(f"- Pedido por `{ped.get('por') or 'sin dato'}`" + (f" en #{ped['numero']}" if ped.get('numero') else '') + '.')
    return '\n'.join(p) + '\n'


def titulo_pr(inf): return f"🕸️ Grafo {inf['id']} · borrador (fusionar = aprobar)"


def liga_abrir(inf, repo):
    """Página de GitHub con el PR del borrador listo para crearse: un toque en «Create pull request»."""
    return f'https://github.com/{repo}/compare/main...grafo-borrador?' + urllib.parse.urlencode(dict(expand=1, title=titulo_pr(inf)), quote_via=urllib.parse.quote)


def informe_de(versiones, recetas=None):
    """El informe de un grafo rehecho, reconstruido de su registro de versiones (sirve cuando el PR se abre a mano)."""
    V = versiones; f = next(v for v in V['versiones'] if v['id'] == V['aprobado']); k = V['versiones'].index(f)
    return dict(accion='rehacer', cambio=True, id=f['id'], fecha=f.get('fecha'), antes=V['versiones'][k - 1]['id'] if k else '', piezas=f.get('piezas'), ligas=f.get('ligas'),
                resumen=f.get('cambios') or {}, ia=f.get('ia'), ia_informe=f.get('ia_informe') or dict(omitida=True), pedido=f.get('pedido') or {},
                audiencias=[a['nombre'] for a in (recetas or {}).get('audiencias') or []])


def comentario(inf, liga, numero=0):
    mudos = aviso_mudos(inf)
    if not inf.get('cambio'): return (inf.get('mensaje') or 'El grafo ya está al día.') + ' No se abrió ningún borrador.\n\n' + (mudos + '\n\n' if mudos else '') + linea_ia(dict(ia_informe=dict(omitida=True))).replace('se pidió no usarla en esta corrida', 'no hizo falta: no había nada que explicar') + '\n'
    ia = inf.get('ia'); hay_pr = str(numero or '').isdigit() and int(numero) > 0
    donde = f'en {liga}' if hay_pr else 'en la rama `grafo-borrador`'
    aprobar = ('- **Aprobar ya:** abre ese PR. Si GitHub muestra «Approve workflows to run», tócalo primero (sólo deja correr las pruebas; con la App del grafo no sale); cuando queden en verde, '
               'toca «Merge pull request». Las presentaciones cambian solas al grafo nuevo.' if hay_pr else
               f'- **Aprobar ya:** abre [esta página]({liga}), toca «Create pull request» y luego «Merge pull request». Las presentaciones cambian solas al grafo nuevo.')
    return '\n'.join([f"Listo: el grafo **{inf['id']}** quedó como **borrador** {donde}.", '',
                      (ia['resumen'] if ia else 'Cambios: ' + '; '.join(que_cambio(inf)[:4]) + '.'), ''] + ([mudos, ''] if mudos else []) + [aprobar,
                      '- **Dejarlo en borrador:** no hagas nada. Todo sigue igual y las ligas de las presentaciones no cambian.',
                      '- **Descartar:** ' + ('cierra el PR sin fusionar.' if hay_pr else 'borra la rama `grafo-borrador` o vuelve a rehacer el grafo más adelante.'), '', linea_ia(inf), ''])


def puntero(inf, numero, liga, carpeta, registrar=True):
    ia = inf.get('ia') or {}
    d = dict(id=inf['id'], fecha=inf.get('fecha'), creado=_ahora(), pr=int(numero) if str(numero or '').isdigit() else 0, liga=liga, rama='grafo-borrador', antes=inf.get('antes'), piezas=inf.get('piezas'), ligas=inf.get('ligas'),
             titulo=ia.get('titulo') or '', resumen=ia.get('resumen') or '; '.join(que_cambio(inf)[:3]).replace('`', ''), recomendacion=ia.get('recomendacion') or '', ia=(inf.get('ia_informe') or {}).get('gano'),
             audiencias=inf.get('audiencias') or [], sin_campo=(inf.get('resumen') or {}).get('sin_campo') or [])
    _escribe(os.path.join(carpeta, 'borrador.json'), d)
    if registrar:
        with open(os.path.join(carpeta, 'registro.jsonl'), 'a', encoding='utf-8') as f:
            f.write(json.dumps(dict(cuando=d['creado'], que='grafo rehecho (borrador)', id=d['id'], pr=d['pr'], ia=d['ia'], por=(inf.get('pedido') or {}).get('por') or ''), ensure_ascii=False) + '\n')
    return d


CIERRES = ('grafo aprobado', 'borrador descartado')


def ya_cerrado(registro, vid='', numero=None):
    """¿El registro ya trae el cierre de ese borrador? Se busca por su id; sin id, por el número de su PR."""
    try:
        with open(registro, encoding='utf-8') as f: lineas = f.readlines()[-400:]
    except OSError: return False
    for l in lineas:
        try: d = json.loads(l)
        except ValueError: continue
        if isinstance(d, dict) and d.get('que') in CIERRES and ((vid and d.get('id') == vid) or (not vid and numero and d.get('pr') == numero)): return True
    return False


def cierre(carpeta, fusionado, por, numero):
    """Quita el aviso de borrador y anota el cierre una sola vez: el vigilante también sabe cerrarlo (por si este flujo
    no corre), y repetir esta corrida no debe dejar dos renglones del mismo cierre."""
    p = os.path.join(carpeta, 'borrador.json'); reg = os.path.join(carpeta, 'registro.jsonl')
    try: antes = _lee(p)
    except (OSError, ValueError): antes = {}
    if not isinstance(antes, dict): antes = {}
    _escribe(p, {})
    n = int(numero) if str(numero).isdigit() else None
    if ya_cerrado(reg, str(antes.get('id') or ''), n): return False
    with open(reg, 'a', encoding='utf-8') as f:
        f.write(json.dumps(dict(cuando=_ahora(), que=CIERRES[0] if fusionado else CIERRES[1], id=antes.get('id') or '', pr=n, por=por or ''), ensure_ascii=False) + '\n')
    return True


if __name__ == '__main__':
    a = sys.argv[1:]
    if a[0] == 'pr': sys.stdout.write(cuerpo_pr(_lee(a[1])))
    elif a[0] == 'comentario': sys.stdout.write(comentario(_lee(a[1]), a[2], a[3] if len(a) > 3 else 0))
    elif a[0] == 'puntero': puntero(_lee(a[1]), a[2], a[3], a[4], registrar=not (len(a) > 5 and a[5] == 'sin-registro'))
    elif a[0] == 'cierre': cierre(a[1], a[2] == 'si', a[3], a[4])
    elif a[0] == 'abrir': sys.stdout.write(liga_abrir(_lee(a[1]), a[2]) + '\n')
    elif a[0] == 'titulo': sys.stdout.write(titulo_pr(_lee(a[1])) + '\n')
    elif a[0] == 'ensayo':
        comandos, md = anotar_ensayo(_lee(a[1]))
        for c in comandos: print(c)
        if md and os.environ.get('GITHUB_STEP_SUMMARY'):
            with open(os.environ['GITHUB_STEP_SUMMARY'], 'a', encoding='utf-8') as f: f.write(md)
    elif a[0] == 'informe':
        try: recetas = _lee(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'recetas.json'))
        except (OSError, ValueError): recetas = {}
        json.dump(informe_de(_lee(a[1]), recetas), sys.stdout, ensure_ascii=False, indent=1); sys.stdout.write('\n')
    else: sys.exit('acción desconocida')
