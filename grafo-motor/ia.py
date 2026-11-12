"""Explicación del grafo rehecho, pedida a la vez a OpenAI y a Claude: se queda con la primera respuesta válida.

Las claves sólo se leen del entorno del flujo (secretos del repositorio): OPENAI_API_KEY y ANTHROPIC_API_KEY.
Nunca se escriben en archivos ni en la bitácora. Si no hay ninguna, o ninguna contesta bien, el grafo se
rehace igual y la nota dice que quedó sin explicación de IA.

A los modelos sólo se les manda el resumen público de lo que cambió (nombres de archivos de repositorios
públicos, piezas del atlas y campos del Plan de Potencial); ningún dato de casos, hojas ni personas.
"""
import http.client, json, os, queue, threading, time, urllib.parse

LIMITES = dict(titulo=90, resumen=700, presentaciones=320)
ESQUEMA = {'type': 'object', 'additionalProperties': False, 'required': ['titulo', 'resumen', 'cambios', 'riesgos', 'presentaciones', 'recomendacion'], 'properties': {
    'titulo': {'type': 'string'}, 'resumen': {'type': 'string'},
    'cambios': {'type': 'array', 'items': {'type': 'object', 'additionalProperties': False, 'required': ['que', 'donde', 'importa'],
                                           'properties': {'que': {'type': 'string'}, 'donde': {'type': 'string'}, 'importa': {'type': 'string'}}}},
    'riesgos': {'type': 'array', 'items': {'type': 'string'}}, 'presentaciones': {'type': 'string'},
    'recomendacion': {'type': 'string', 'enum': ['aprobar', 'revisar']}}}
# A Claude la respuesta se le pide como «herramienta» con este mismo esquema: el proveedor entrega el objeto ya armado.
HERRAMIENTA = {'name': 'explicacion_grafo', 'description': 'Entrega a Dirección la explicación de lo que cambió en el grafo.', 'input_schema': ESQUEMA}
SISTEMA = ('Eres el analista del grafo de YOD OS, el sistema de tableros de una desarrolladora inmobiliaria. Recibes, en JSON, lo que cambió '
           'entre el grafo aprobado y el grafo recién rehecho. Explica a Dirección, en español llano y sin tecnicismos, qué cambió, dónde y por '
           'qué importa. No inventes: usa sólo lo que viene en los datos. No incluyas ligas ni nombres de personas. Responde únicamente con un '
           'objeto JSON con estas claves: titulo (máx. 90 caracteres), resumen (máx. 700), cambios (hasta 8 objetos con que, donde, importa), '
           'riesgos (hasta 5 frases), presentaciones (qué implica para las presentaciones que leen el grafo, máx. 320) y recomendacion '
           '("aprobar" si el cambio es rutinario y coherente, "revisar" si hay algo que Dirección deba mirar antes).')


def _corta(v, n):
    v = ' '.join(str(v or '').replace('http://', '').replace('https://', '').split())
    return v if len(v) <= n else v[:n - 1].rstrip() + '…'


def validar(o):
    """Regresa la explicación limpia o lanza ValueError. Nada de lo que diga el modelo pasa sin recorte ni tipo."""
    if not isinstance(o, dict): raise ValueError('no es un objeto')
    for k in ESQUEMA['required']:
        if k not in o: raise ValueError('falta ' + k)
    if not isinstance(o['cambios'], list) or not isinstance(o['riesgos'], list): raise ValueError('listas mal formadas')
    out = dict(titulo=_corta(o['titulo'], LIMITES['titulo']), resumen=_corta(o['resumen'], LIMITES['resumen']), presentaciones=_corta(o['presentaciones'], LIMITES['presentaciones']),
               recomendacion='aprobar' if str(o['recomendacion']).strip().lower() == 'aprobar' else 'revisar', cambios=[], riesgos=[])
    for c in o['cambios'][:8]:
        if isinstance(c, dict) and str(c.get('que') or '').strip():
            out['cambios'].append(dict(que=_corta(c.get('que'), 140), donde=_corta(c.get('donde'), 80), importa=_corta(c.get('importa'), 160)))
    out['riesgos'] = [_corta(r, 160) for r in o['riesgos'][:5] if str(r or '').strip()]
    if not out['titulo'] or not out['resumen']: raise ValueError('sin título o sin resumen')
    return out


def _json_de(texto):
    t = str(texto or '').strip()
    a, b = t.find('{'), t.rfind('}')
    if a < 0 or b <= a: raise ValueError('sin JSON')
    return json.loads(t[a:b + 1])


def _post(url, cuerpo, cabeceras, conexiones, nombre, espera):
    u = urllib.parse.urlparse(url)
    C = http.client.HTTPSConnection if u.scheme == 'https' else http.client.HTTPConnection
    c = C(u.netloc, timeout=espera); conexiones[nombre] = c
    c.request('POST', u.path or '/', body=json.dumps(cuerpo).encode('utf-8'), headers={'Content-Type': 'application/json', **cabeceras})
    r = c.getresponse(); datos = r.read().decode('utf-8', 'replace')
    if r.status != 200: raise RuntimeError(f'HTTP {r.status}')
    return json.loads(datos)


def _openai(texto, conexiones, espera):
    modelo = os.environ.get('GRAFO_OPENAI_MODEL') or 'gpt-6.1-sol'
    r = _post(os.environ.get('GRAFO_OPENAI_URL') or 'https://api.openai.com/v1/responses',
              {'model': modelo, 'instructions': SISTEMA, 'max_output_tokens': 2500, 'store': False,
               'text': {'format': {'type': 'json_schema', 'name': 'explicacion_grafo', 'strict': True, 'schema': ESQUEMA}},
               'input': [{'role': 'user', 'content': [{'type': 'input_text', 'text': texto}]}]},
              {'Authorization': 'Bearer ' + os.environ['OPENAI_API_KEY'].strip()}, conexiones, 'openai', espera)
    salida = r.get('output_text') or ''.join(c.get('text', '') for o in (r.get('output') or []) if o.get('type') == 'message'
                                             for c in (o.get('content') or []) if c.get('type') == 'output_text')
    return 'openai:' + modelo, _json_de(salida)


def _claude(texto, conexiones, espera):
    modelo = os.environ.get('GRAFO_CLAUDE_MODEL') or 'claude-sonnet-5-5'
    url = os.environ.get('GRAFO_CLAUDE_URL') or 'https://api.anthropic.com/v1/messages'
    cab = {'x-api-key': os.environ['ANTHROPIC_API_KEY'].strip(), 'anthropic-version': '2023-06-01'}
    base = {'model': modelo, 'max_tokens': 2500, 'system': SISTEMA, 'messages': [{'role': 'user', 'content': [{'type': 'text', 'text': texto}]}]}
    # Como texto libre, el 12-nov-2026 llegó un JSON mal formado y el borrador salió sin explicación. Con la herramienta
    # forzada llega un objeto; si el modelo no la admite (HTTP 400), se pide como antes y se interpreta el texto.
    try: r = _post(url, {**base, 'tools': [HERRAMIENTA], 'tool_choice': {'type': 'tool', 'name': HERRAMIENTA['name']}}, cab, conexiones, 'claude', espera)
    except RuntimeError as e:
        if str(e) != 'HTTP 400': raise
        r = _post(url, base, cab, conexiones, 'claude', espera)
    for c in r.get('content') or []:
        if c.get('type') == 'tool_use' and isinstance(c.get('input'), dict): return 'claude:' + modelo, c['input']
    return 'claude:' + modelo, _json_de(''.join(c.get('text', '') for c in (r.get('content') or []) if c.get('type') == 'text'))


def disponibles():
    """Qué motores tienen clave en este entorno (sólo sí o no; nunca el valor)."""
    return [n for n, k in (('openai', 'OPENAI_API_KEY'), ('claude', 'ANTHROPIC_API_KEY')) if (os.environ.get(k) or '').strip()]


def explicar(datos, espera=90):
    """Lanza los motores con clave a la vez y regresa (explicación, informe). La explicación es None si ninguno sirvió."""
    motores = {'openai': _openai, 'claude': _claude}; activos = disponibles()
    informe = dict(pedidos=activos, gano=None, fallos={}, segundos=None, reintentos=[])
    if not activos: return None, informe
    texto = json.dumps(datos, ensure_ascii=False)[:60000]
    q = queue.Queue(); conexiones = {}; t0 = time.time(); listo = threading.Event()

    def corre(nombre):
        err = None
        for intento in (1, 2):                      # una respuesta mal formada se pide una vez más, si queda tiempo y nadie ganó
            falta = espera - (time.time() - t0)
            if intento == 2:
                if listo.is_set() or falta < 15: break
                informe['reintentos'].append(nombre)
            try:
                motor, crudo = motores[nombre](texto, conexiones, max(5, falta)); q.put((nombre, motor, validar(crudo), None)); return
            except ValueError as e: err = type(e).__name__ + ': ' + str(e)
            except Exception as e:                  # el motivo se guarda sin texto del proveedor: podría traer datos de la cuenta
                err = type(e).__name__ + (': ' + str(e) if isinstance(e, RuntimeError) else ''); break
        q.put((nombre, None, None, err))

    for n in activos: threading.Thread(target=corre, args=(n,), daemon=True).start()
    faltan = len(activos); buena = None
    while faltan and buena is None:
        try: nombre, motor, exp, err = q.get(timeout=max(1, espera + 5 - (time.time() - t0)))
        except queue.Empty: break
        faltan -= 1
        if exp is not None: buena = exp; informe['gano'] = motor
        else: informe['fallos'][nombre] = _corta(err, 120)
    listo.set()
    for n, c in list(conexiones.items()):            # el que no ganó se corta para no seguir gastando
        try: c.close()
        except Exception: pass
    informe['segundos'] = round(time.time() - t0, 1)
    return buena, informe


if __name__ == '__main__':
    import sys
    d = json.load(open(sys.argv[1], encoding='utf-8')) if len(sys.argv) > 1 else {'prueba': True}
    exp, inf = explicar(d)
    print(json.dumps(dict(explicacion=exp, informe=inf), ensure_ascii=False, indent=1))
