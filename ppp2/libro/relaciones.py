#!/usr/bin/env python3
"""PPP 2 · «está ligado a»: qué mueve cada dato y cada palanca del libro del plan.

Lee las fórmulas de la plantilla del libro (generar.py) y sigue sus referencias, celda por celda, desde
cada dato y cada palanca hasta los resultados que enseña el visor (las claves de la pestaña Versiones).
No calcula ninguna cifra: sólo recorre el grafo de fórmulas. Escribe `ppp2-relaciones.js` en la raíz
del repositorio, que la ficha del plan carga para el lápiz de cada cuadro.

Lo que sale, por cada entrada (dato o palanca):
  · pasa_por  — los cálculos del Modelo que toca primero (obra directa, comisiones, línea del banco…);
  · mueve     — los resultados que cambia (ventas, ganancia real, lo que recibe el dueño…);
  · revision  — las pruebas de la revisión para fondos que puede mover;
  · cuadro    — el cuadro del visor donde se edita (la ingeniería inversa: del visor hacia atrás);
  · dato_otros — (palancas que copian un dato) otras cuentas del libro también leen ese dato: guardarlo en los
                datos mueve más que la palanca, así que el lápiz no lo prueba antes (el servidor tampoco); con
                dato_pasa_por y dato_mueve, lo que mueve al guardarlo en los datos.
Y además `sobran`: datos que el libro pide y que no llegan a ningún resultado del visor.

Uso (desde la raíz del repo):
    python3 ppp2/libro/relaciones.py           # reescribe ppp2-relaciones.js
    python3 ppp2/libro/relaciones.py --check   # no escribe; sale con 1 si el archivo no coincide
"""
import hashlib
import json
import os
import re
import sys
from collections import defaultdict, deque

from openpyxl.formula.tokenizer import Token, Tokenizer
from openpyxl.utils.cell import range_boundaries

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(os.path.dirname(AQUI))
SALIDA = os.path.join(RAIZ, "ppp2-relaciones.js")
sys.path.insert(0, AQUI)
import generar as G  # noqa: E402

FUENTES = ["generar.py", "relaciones.py"]

# Los resultados que enseña el visor, con su nombre llano (claves de Versiones).
MUEVE = [
    ("ventas", "Ventas"), ("costo_sin_tierra", "Costo sin tierra"), ("tierra", "Tierra"),
    ("obra_inicio", "Arranque de obra"), ("fin_obra", "Fin de obra"), ("capital", "Capital"),
    ("banco_max", "Banco (saldo máximo)"), ("max_ajeno", "Dinero ajeno máximo"), ("respaldo", "Dinero que faltaría"),
    ("costo_dinero", "Costo del dinero"), ("ganancia", "Ganancia real"), ("margen", "Margen"),
    ("dueno_recibe", "Lo que recibe el dueño"), ("dueno_meses", "Cuándo recibe lo último"),
    ("alianza_recibe", "Lo que recibe la alianza"), ("mes_reparto", "Mes de reparto"), ("rv_resultado", "Revisión para fondos"),
]
REVISION = [
    ("rv_linea_ventas", "línea del banco entre ventas"), ("rv_linea_costo", "línea del banco entre costo"),
    ("rv_aportacion", "tierra y capital entre costo"), ("rv_preventa", "preventa al arrancar la obra"),
    ("rv_preventa_banco", "preventa antes del primer desembolso"), ("rv_cobertura", "cobertura del banco"),
    ("rv_margen", "margen sobre costo"), ("rv_meses_credito", "meses de crédito"), ("rv_falta", "dinero que faltaría"),
]

# Del visor hacia atrás: qué se edita en cada uno de los siete cuadros, en el orden en que se lee.
CUADROS = {
    "terreno": ["dato:terreno.m2", "palanca:tierra", "dato:lamina.m2_construidos"],
    "producto": ["productos", "palanca:ajuste_precio", "palanca:comision"],
    "tiempo": ["palanca:predesarrollo", "palanca:ventas_inicio", "palanca:ventas_meses", "palanca:obra_inicio",
               "palanca:obra_duracion", "palanca:campana", "palanca:individualizar", "palanca:meses_saldos",
               "palanca:saldo_posterior"],
    "costo": ["dato:costo.obra_directa", "dato:lamina.costo_total", "dato:lamina.ventas", "palanca:ajuste_obra", "palanca:indirectos", "palanca:imprevistos",
              "palanca:cierre", "palanca:ind_predesarrollo"],
    "dinero": ["palanca:capital", "palanca:tasa_capital", "palanca:enganche"]
              + ["palanca:durante_obra_%d" % (i + 1) for i in range(G.NP)]
              + ["palanca:usa_banco", "palanca:tiie", "palanca:sobretasa", "palanca:apertura", "palanca:banco_pct_obra",
                 "palanca:banco_pct_costo", "palanca:banco_pct_ventas", "palanca:caja_pct", "palanca:devolver_con_obra"],
    "reparto": ["reparto:esquema", "palanca:tierra"],
    "riesgo": ["candados", "preguntas", "dato:acuerdo.firmado"],
}

# Lo que dice cada palanca que no copia un dato (las demás toman la nota de su dato).
NOTAS = {
    "ajuste_precio": "Sube o baja todos los precios de lista en esta versión (−5% = cinco por ciento abajo).",
    "ajuste_obra": "Sube o baja el costo de obra directa en esta versión.",
    "usa_banco": "1 = esta versión usa crédito del banco; 0 = se hace sin banco.",
    "devolver_con_obra": "1 = el capital espera a que termine la obra para salir; 0 = sale en cuanto sobra dinero.",
}
EXTRAS = {
    "productos": {"tipo": "productos", "concepto": "Productos: unidades, m² y precio", "unidad": "",
                  "nota": "Lo que se vende. Cambiar unidades, m² o precio mueve las ventas de todas las versiones."},
    "reparto:esquema": {"tipo": "reparto", "concepto": "Esquema de reparto con el dueño", "unidad": "",
                        "nota": "Cómo se reparte el resultado entre el dueño de la tierra, el capital y la alianza."},
    "candados": {"tipo": "candados", "concepto": "Candados", "unidad": "",
                 "nota": "Lo que debe estar resuelto antes de presentar el plan: tenencia, uso de suelo, agua, vialidad, banco y acuerdo."},
    "preguntas": {"tipo": "preguntas", "concepto": "La pregunta que más mueve el plan", "unidad": "",
                  "nota": "El plan ordena sus preguntas por cuánto mueven el resultado."},
}

REF = re.compile(r"^(?:(?:'((?:[^']|'')+)'|([^'!]+))!)?(\$?[A-Z]{1,3}\$?\d+(?::\$?[A-Z]{1,3}\$?\d+)?|\$?[A-Z]{1,3}:\$?[A-Z]{1,3}|\$?\d+:\$?\d+)$")


def referencias(formula, hoja):
    """Las celdas que lee una fórmula: [(hoja, c1, r1, c2, r2)]. Sin calcular nada."""
    out = []
    try:
        fichas = Tokenizer(formula).items
    except Exception:
        return out
    for t in fichas:
        if t.type != Token.OPERAND or t.subtype != Token.RANGE:
            continue
        m = REF.match(t.value.strip())
        if not m:
            continue
        h = (m.group(1) or "").replace("''", "'") or (m.group(2) or "").strip() or hoja
        try:
            c1, r1, c2, r2 = range_boundaries(m.group(3).replace("$", ""))
        except ValueError:
            continue
        out.append((h, c1, r1, c2, r2))
    return out


def grafo(wb):
    """Quién lee a quién: dependientes[(hoja, fila, col)] = celdas con fórmula que la leen."""
    dep = defaultdict(set)
    tam = {ws.title: (ws.max_row, ws.max_column) for ws in wb.worksheets}
    for ws in wb.worksheets:
        for fila in ws.iter_rows():
            for c in fila:
                if not (isinstance(c.value, str) and c.value.startswith("=")):
                    continue
                yo = (ws.title, c.row, c.column)
                for h, c1, r1, c2, r2 in referencias(c.value, ws.title):
                    mr, mc = tam.get(h, (0, 0))
                    r1, r2 = r1 or 1, r2 or mr
                    c1, c2 = c1 or 1, c2 or mc
                    for r in range(r1, min(r2, max(mr, r1)) + 1):
                        for col in range(c1, min(c2, max(mc, c1)) + 1):
                            dep[(h, r, col)].add(yo)
    return dep


def alcanza(dep, semillas):
    vistos, cola = set(semillas), deque(semillas)
    while cola:
        x = cola.popleft()
        for y in dep.get(x, ()):
            if y not in vistos:
                vistos.add(y)
                cola.append(y)
    return vistos


def construir():
    with open(os.path.join(AQUI, "catalogo-preguntas.json"), encoding="utf-8") as fh:
        catalogo = json.load(fh)
    wb = G.construir(None, catalogo)
    dep = grafo(wb)
    col_v1 = 3                      # Versiones!C = V1
    col_m1 = 5                      # Modelo!E = V1
    ver_de_fila = {f: k for k, f in G.VER_FILA.items()}
    der = [d[0] for d in G.DERIVADOS]
    der_nombre = {d[0]: d[1] for d in G.DERIVADOS}
    der_de_fila = {G.MOD_FILA[k]: k for k in der}
    mueve_nombre, rev_nombre = dict(MUEVE), dict(REVISION)
    dato = {d[0]: d for d in G.DATOS if d[0] != "§"}
    palanca = {p[0]: p for p in G.PALANCAS if p[0] != "§"}

    # una palanca que copia un dato (=Datos!$C$n) o una columna de Productos
    fila_dato = {f: k for k, f in G.DATO_FILA.items()}
    copia = {}
    for k, p in palanca.items():
        base = p[4]
        if isinstance(base, str):
            m = re.match(r"^Datos!\$C\$(\d+)$", base)
            if m and int(m.group(1)) in fila_dato:
                copia[k] = {"hoja": "Datos", "clave": fila_dato[int(m.group(1))]}
            m = re.match(r"^Productos!\$G\$(\d+)$", base)
            if m:
                copia[k] = {"hoja": "Productos", "fila": int(m.group(1)) - G.PROD_FILA0 + 1, "campo": "durante_obra"}

    fila_edad = G.RES_FILA.get("plan.edad")
    # las hojas que alimentan lo que el lápiz lee (las mismas que mira el servidor antes de probar un dato)
    HOJAS_CIFRAS = {"Datos", "Modelo", "Productos", "Reparto"}

    def otros_leen(clave_dato, palanca_k):
        fila = G.DATO_FILA[clave_dato]
        propia = ("Modelo", G.MOD_FILA[palanca_k], 4)
        return sorted(x for x in dep.get(("Datos", fila, 3), ())
                      if x[0] in HOJAS_CIFRAS and x != propia and not (x[0] == "Datos" and x[1] == fila))

    def resultado(semillas):
        r = alcanza(dep, semillas)
        pasa = [k for k in der if ("Modelo", G.MOD_FILA[k], col_m1) in r]
        vers = {ver_de_fila[f] for (h, f, c) in r if h == "Versiones" and c == col_v1 and f in ver_de_fila}
        mueve = [mueve_nombre[k] for k, _ in MUEVE if k in vers]
        if not mueve and fila_edad and ("Resumen", fila_edad, 2) in r:
            mueve = ["Edad del plan"]
        return {
            "pasa_por": [der_nombre[k] for k in pasa],
            "mueve": mueve,
            "revision": [rev_nombre[k] for k, _ in REVISION if k in vers],
        }

    entradas, sobran = {}, []
    for k, p in palanca.items():
        if p[4] in (None, ""):
            continue
        e = {"tipo": "palanca", "palanca": k, "concepto": p[1], "unidad": p[2]}
        c = copia.get(k)
        if c and c["hoja"] == "Datos":
            e["dato"] = c["clave"]
            e["nota"] = dato[c["clave"]][6] or ""
            if otros_leen(c["clave"], k):
                r = resultado([("Datos", G.DATO_FILA[c["clave"]], 3)])
                e.update({"dato_otros": True, "dato_pasa_por": r["pasa_por"], "dato_mueve": r["mueve"]})
        elif c:
            e["producto"] = c["fila"]
            e["nota"] = "Cuánto paga el cliente durante la obra en este producto; la base sale de la pestaña Productos."
        else:
            e["nota"] = NOTAS.get(k, "")
        e.update(resultado([("Modelo", G.MOD_FILA[k], col_m1)]))
        if not e["mueve"] and "palanca:" + k not in {i for lista in CUADROS.values() for i in lista}:
            sobran.append({"clave": k, "concepto": p[1], "palanca": True, "motivo": "ninguna fórmula la lee"})
            continue
        entradas["palanca:" + k] = e
    copiados = {c["clave"] for c in copia.values() if c["hoja"] == "Datos"}
    en_cuadro = {i.split(":", 1)[1] for lista in CUADROS.values() for i in lista if i.startswith("dato:")}
    for k, d in dato.items():
        if k in copiados or k.startswith("plan."):      # lo que copia una palanca entra por ella; la identidad no se mueve aquí
            continue
        r = resultado([("Datos", G.DATO_FILA[k], 3)])
        if r["mueve"] in ([], ["Edad del plan"]) and k not in en_cuadro:
            sobran.append({"clave": k, "concepto": d[1], "motivo": "sólo cuenta para la edad del plan" if r["mueve"] else "ninguna fórmula lo lee"})
            continue
        e = {"tipo": "dato", "dato": k, "concepto": d[1], "unidad": d[2], "nota": d[6] or ""}
        if not r["mueve"]:
            e["solo_se_ve"] = True          # el visor lo enseña, pero ninguna cifra del plan depende de él
        e.update(r)
        entradas["dato:" + k] = e
    filas_prod = [("Productos", G.PROD_FILA0, col) for col in (2, 3, 4)]
    for k, e in EXTRAS.items():
        e = dict(e)
        if k == "productos":
            e.update(resultado(filas_prod))
        else:
            e.update({"pasa_por": [], "mueve": [], "revision": []})
        entradas[k] = e
    cuadro_de = {}
    for cu, lista in CUADROS.items():
        for ident in lista:
            if ident not in entradas:
                raise SystemExit("relaciones: el cuadro %s nombra %s, que no existe en la plantilla" % (cu, ident))
            cuadro_de.setdefault(ident, cu)
    for ident, e in entradas.items():
        e["cuadro"] = cuadro_de.get(ident, "")
    sin_cuadro = [i for i, e in entradas.items() if e["tipo"] in ("palanca", "dato") and not e["cuadro"]]
    if sin_cuadro:
        raise SystemExit("relaciones: entradas que no se editan en ningún cuadro: " + ", ".join(sin_cuadro))
    datos = {
        "esquema": G.ESQUEMA,
        "huella": huella(),
        "cuadros": CUADROS,
        "entradas": dict(sorted(entradas.items())),
        "sobran": sobran,
    }
    datos["firma"] = firma(datos)
    return datos


def firma(datos):
    """Huella del contenido (sin la firma): si alguien edita ppp2-relaciones.js a mano, la prueba de Node la recalcula
    y no coincide (así no hace falta Python en la integración continua)."""
    cuerpo = {k: datos[k] for k in ("esquema", "huella", "cuadros", "entradas", "sobran")}
    return hashlib.sha256(json.dumps(cuerpo, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()


def huella():
    h = hashlib.sha256()
    for nombre in FUENTES:
        with open(os.path.join(AQUI, nombre), "rb") as fh:
            h.update(nombre.encode("utf-8") + b"\0" + fh.read() + b"\0")
    return h.hexdigest()


def texto(datos):
    return ("/* Generado por ppp2/libro/relaciones.py desde la plantilla del libro (" + datos["esquema"] + ").\n"
            "   No se edita a mano: si cambia ppp2/libro/generar.py, se vuelve a correr ese guion\n"
            "   (tests/ppp2-lapiz.test.cjs lo vigila). Sólo nombres y ligas entre celdas: ninguna cifra. */\n"
            "window.PPP2_RELACIONES = " + json.dumps(datos, ensure_ascii=False, indent=1) + ";\n")


def main(argv):
    nuevo = texto(construir())
    if "--check" in argv:
        actual = open(SALIDA, encoding="utf-8").read() if os.path.exists(SALIDA) else ""
        if actual != nuevo:
            print("ppp2-relaciones.js no coincide con la plantilla: corre python3 ppp2/libro/relaciones.py")
            return 1
        print("ok · ppp2-relaciones.js al día")
        return 0
    with open(SALIDA, "w", encoding="utf-8") as fh:
        fh.write(nuevo)
    print("ok", os.path.relpath(SALIDA, RAIZ))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
