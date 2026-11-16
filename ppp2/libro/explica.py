#!/usr/bin/env python3
"""Visor · «de qué depende» cada cifra: el grafo de fórmulas de la plantilla, leído hacia atrás.

relaciones.py sigue las fórmulas de la plantilla (generar.py) HACIA ADELANTE: de cada dato y palanca a los
resultados que mueve (el lápiz de la ficha). Este guion recorre el MISMO grafo, con la misma lectura de
referencias (relaciones.referencias), en sentido contrario: de cada cifra que el visor enseña a las celdas que
lee su fórmula (sus entradas directas) y, de cada una de ésas, a las que lee la suya (el segundo nivel).
No calcula ninguna cifra. Escribe `visor-explica-grafo.js` en la raíz del repositorio; el visor lo carga para
decir de qué depende cada cifra que se toca (los textos que la explican viven aparte, en visor-explica.js).

Cada nodo lleva su tipo, como lo define el libro:
  · palanca   — un renglón de palanca del Modelo: cada versión lo puede mover (si no, toma la cifra de los datos);
  · dato      — una celda que alguien captura: Datos, Productos, los registros (candados, consejo, pruebas…);
  · resultado — una celda con fórmula: sale de otras cifras.
Una cifra que sólo copia otra celda (p. ej. v{n}.rv_falta = el total de «Respaldo: lo que faltaría») se recorre
hasta la celda que de verdad calcula; el recorrido queda en `via`.

Uso (desde la raíz del repo):
    python3 ppp2/libro/explica.py           # reescribe visor-explica-grafo.js
    python3 ppp2/libro/explica.py --check   # no escribe; sale con 1 si el archivo no coincide
"""
import hashlib
import json
import os
import re
import sys

from openpyxl.utils.cell import get_column_letter

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(os.path.dirname(AQUI))
SALIDA = os.path.join(RAIZ, "visor-explica-grafo.js")
sys.path.insert(0, AQUI)
import generar as G  # noqa: E402
import relaciones as R  # noqa: E402  (sólo se lee su recorrido de referencias; no se modifica)

FUENTES = ["generar.py", "relaciones.py", "explica.py"]
FLUJO = "Flujo V1"            # la V1 representa a las tres: sus fórmulas son las mismas, en otra columna
COL_V1, COL_M1 = 3, 5         # Versiones!C y Modelo!E

# Renglones de «Flujo Vn» que el servidor entrega al visor (server/ppp2/Visor.gs, VISOR.FILAS; una prueba los compara).
FLUJO_SERIES = {
    "firmas": 11, "enganches": 13, "saldos": 14, "pagos_obra": 15, "cobranza": 16, "obra": 19, "indirectos": 21,
    "imprevistos": 22, "comisiones": 23, "cierre": 24, "egresos": 25, "caja_minima": 28, "interes": 29, "cap_aporta": 31,
    "cap_acum": 32, "apertura": 34, "disposicion": 35, "respaldo": 37, "pago_banco": 38, "pago_respaldo": 39,
    "pago_capital": 40, "saldo_banco": 41, "saldo_capital": 42, "saldo_respaldo": 43, "caja": 45, "flujo_acum": 49, "ajeno": 57,
}
# Las claves de Datos que el servidor entrega al visor (VISOR.DATOS de server/ppp2/Visor.gs; una prueba las compara).
DATOS_VISOR = ["terreno.m2", "tierra.valor", "lamina.m2_construidos", "lamina.m2_vendibles", "cob.enganche", "din.tasa_capital",
               "din.tiie", "din.sobretasa", "din.apertura", "din.caja_pct", "din.preventa_minima", "costo.comision"]
# Las claves del plan (Resumen) que el visor enseña en «Riesgo y estado».
PLAN_VISOR = ["plan.edad", "plan.candados_abiertos", "plan.paso_texto"]
# Lo que decide si una prueba aplica (sin banco no hay línea): se lista, pero no impide recorrer una copia.
GUARDAS = {"palanca:usa_banco"}

# Registros (pestañas de renglones): un rango de una de sus columnas es un solo nodo, con su nombre llano.
TABLAS = {
    ("Candados", "A"): "Candados registrados", ("Candados", "D"): "Estado de cada candado",
    ("Datos", "C"): "Valores de los datos", ("Datos", "E"): "Estado de cada dato (confirmado, por confirmar…)",
    ("Datos", "K"): "Datos que se necesitan para calcular",
    ("Consejo", None): "Votos del consejo de planes", ("Rondas", None): "Rondas del plan",
    ("Pruebas", None): "Pruebas de estrés corridas", ("Hallazgos", None): "Hallazgos aceptados",
    ("Preguntas", None): "Preguntas del plan", ("Bitácora", None): "Bitácora",
}
# Notas de unidad al final de un rótulo del libro: se quitan para leerlo en una frase («Ventas (MDP)» → «Ventas»).
NOTA_FINAL = re.compile(r"\s*\((?:MDP[^()]*|meses|mes|\d[^()]*|debe [^()]*|1 s[ií][^()]*|s[ií]\s*/\s*no|[^()]*\bo m[aá]s\b[^()]*|[^()]*\bo menos\b[^()]*)\)\s*$")


def limpia(t):
    t = re.sub(r"\s+", " ", str(t or "")).strip()
    return NOTA_FINAL.sub("", t).strip()


def construir():
    with open(os.path.join(AQUI, "catalogo-preguntas.json"), encoding="utf-8") as fh:
        catalogo = json.load(fh)
    wb = G.construir(None, catalogo)
    tam = {ws.title: (ws.max_row, ws.max_column) for ws in wb.worksheets}
    palanca_fila = {G.MOD_FILA[p[0]]: p[0] for p in G.PALANCAS if p[0] != "§"}
    derivado_fila = {G.MOD_FILA[d[0]]: d for d in G.DERIVADOS}
    ver_fila = {f: k for k, f in G.VER_FILA.items()}
    ver_kind = {it[0]: it[3] for it in G.VER_FILAS if it[0] != "§"}
    ver_concepto = {it[0]: it[1] for it in G.VER_FILAS if it[0] != "§"}
    dato_fila = {f: k for k, f in G.DATO_FILA.items()}
    dato_concepto = {d[0]: d[1] for d in G.DATOS if d[0] != "§"}
    palanca = {p[0]: p for p in G.PALANCAS if p[0] != "§"}
    res_fila = {f: k for k, f in G.RES_FILA.items()}
    etiqueta_flujo = {f: et for f, (et, _) in G.ETIQUETAS.items() if et not in ("§", "nota")}
    # un renglón del flujo que se llama igual que un total del Modelo (obra directa, indirectos…) es ese mismo costo
    # repartido mes a mes: se dice, para no leer dos veces lo mismo
    nombres_modelo = {limpia(d[1]) for d in G.DERIVADOS}

    def texto(hoja, ref):
        v = wb[hoja][ref].value
        return v if isinstance(v, str) else ""

    def formula(hoja, fila, col):
        v = wb[hoja].cell(fila, col).value
        return v if isinstance(v, str) and v.startswith("=") else None

    # ── el nodo de cada celda ──
    nodos = {}

    def nodo(hoja, fila, col, ancho=1, alto=1):
        """(id, tipo, nombre) de la celda, o None si no es una cifra del plan (encabezados, el eje de meses)."""
        if hoja == "Modelo":
            if fila in palanca_fila:
                k = palanca_fila[fila]
                if k.startswith("durante_obra_"):          # las seis del mismo concepto, una por producto: un solo nodo
                    return "palanca:durante_obra", "palanca", "% pagado durante la obra de cada producto"
                return "palanca:" + k, "palanca", limpia(palanca[k][1])
            if fila in derivado_fila:
                k = derivado_fila[fila][0]
                if k.startswith("precio_u_"):
                    return "modelo:precio_u", "resultado", "Precio por unidad de cada producto"
                if k.startswith("firmadas_"):
                    return "modelo:firmadas", "resultado", "Unidades de cada producto firmadas antes de los saldos"
                return "modelo:" + k, "resultado", limpia(derivado_fila[fila][1])
            return None
        if hoja == "Versiones":
            k = ver_fila.get(fila)
            if not k:
                return None
            return "v:" + k, "dato" if ver_kind.get(k) == "dato" else "resultado", limpia(ver_concepto[k])
        if hoja.startswith("Flujo"):
            if fila == 3:
                return None                                  # el número de mes: el eje del calendario, no una cifra
            if 5 <= fila <= 10:
                return "flujo:firmas_producto", "resultado", "Unidades que se firman de cada producto"
            if fila in etiqueta_flujo:
                n = limpia(etiqueta_flujo[fila])
                return "flujo:%d" % fila, "resultado", n + (", mes a mes" if n in nombres_modelo else "")
            return None
        if hoja == "Productos":
            return "dato:productos", "dato", "Productos: unidades, m² y precio"
        if hoja == "Datos":
            if alto > 3:                                     # un rango de toda una columna de Datos: el registro
                n = TABLAS.get(("Datos", get_column_letter(col)))
                return ("tabla:Datos:" + get_column_letter(col), "dato", n) if n else None
            k = dato_fila.get(fila)
            if not k:
                return None
            return "dato:" + k, "dato", limpia(dato_concepto[k])
        if hoja == "Plan":
            t = texto("Plan", "A%d" % fila)
            return ("plan:%d" % fila, "resultado" if formula("Plan", fila, col) else "dato", limpia(t)) if t else None
        if hoja == "Reparto":
            if fila == 5 and col == 2:
                return "reparto:esquema", "palanca", "Esquema de reparto con el dueño"
            t = texto("Reparto", "A%d" % fila)
            if not t:
                return None
            con_formula = any(formula("Reparto", fila, c) for c in range(2, 7))
            return "reparto:%d" % fila, "resultado" if con_formula else "dato", limpia(t)
        if hoja == "Resumen":
            k = res_fila.get(fila, "")
            if re.match(r"^v\d\.huella$", k):
                return "res:huella", "resultado", "Huella de la versión (cambia si cambian sus números)"
            if not k:
                return None
            # una clave del plan copia un renglón de la pestaña Plan: se nombra con su rótulo («En palabras» es el siguiente paso)
            m = re.match(r"^=Plan!\$B\$(\d+)$", str(wb["Resumen"].cell(fila, 2).value or ""))
            f = int(m.group(1)) if m else 0
            rotulo = (texto("Plan", "A%d" % (f - 1)) if f == 39 else texto("Plan", "A%d" % f)) if f else ""
            return "res:" + k, "resultado", limpia(rotulo) or k
        letra = get_column_letter(col)
        n = TABLAS.get((hoja, letra)) or TABLAS.get((hoja, None))
        return ("tabla:" + hoja + (":" + letra if (hoja, letra) in TABLAS else ""), "dato", n) if n else None

    def registra(n):
        if n and n[0] not in nodos:
            nodos[n[0]] = {"t": n[1], "n": n[2]}
        return n[0] if n else None

    # ── lo que lee la fórmula de una celda, en nodos (en el orden en que aparecen, sin repetir) ──
    def precedentes_celda(hoja, fila, col):
        f = formula(hoja, fila, col)
        if not f:
            return []
        out = []
        for h, c1, r1, c2, r2 in R.referencias(f, hoja):
            mr, mc = tam.get(h, (0, 0))
            r1, r2 = r1 or 1, r2 or mr
            c1, c2 = c1 or 1, c2 or mc
            alto, ancho = r2 - r1 + 1, c2 - c1 + 1
            if h == "Datos" and alto > 3:                    # una columna entera de Datos: un solo nodo
                ids = [registra(nodo(h, r1, c1, ancho, alto))]
            elif h not in ("Modelo", "Versiones", "Datos", "Plan", "Reparto", "Resumen", "Productos") and not h.startswith("Flujo"):
                ids = [registra(nodo(h, r1, c1, ancho, alto))]
            else:
                ids = []
                for r in range(r1, min(r2, max(mr, r1)) + 1):
                    for c in range(c1, min(c2, max(mc, c1)) + 1):
                        ids.append(registra(nodo(h, r, c)))
            for i in ids:
                if i and i not in out:
                    out.append(i)
        return out

    def celdas_de(ident):
        """Las celdas que forman un nodo (un renglón de flujo son todos sus meses y su total)."""
        tipo, _, k = ident.partition(":")
        if ident in ("modelo:precio_u", "modelo:firmadas"):
            return [("Modelo", G.MOD_FILA["%s_%d" % (k, i + 1)], COL_M1) for i in range(G.NP)]
        if tipo == "modelo":
            return [("Modelo", G.MOD_FILA[k], COL_M1)]
        if tipo == "v":
            return [("Versiones", G.VER_FILA[k], COL_V1)]
        if tipo == "flujo" and k.isdigit():
            fila = int(k)
            return [(FLUJO, fila, c) for c in range(2, G.MESES + 3)]
        if ident == "flujo:firmas_producto":
            return [(FLUJO, f, c) for f in range(5, 11) for c in range(2, G.MESES + 3)]
        if tipo == "dato" and k in G.DATO_FILA:
            return [("Datos", G.DATO_FILA[k], 3)]
        if tipo == "plan":
            return [("Plan", int(k), 2)]
        if tipo == "reparto" and k.isdigit():
            return [("Reparto", int(k), c) for c in range(2, 7)]
        if tipo == "res" and k == "huella":
            return [("Resumen", G.RES_FILA["v1.huella"], 2)]
        return []

    def precedentes(ident):
        out = []
        for h, f, c in celdas_de(ident):
            for i in precedentes_celda(h, f, c):
                if i != ident and i not in out:
                    out.append(i)
        return out

    def baja(lista, propio, via):
        """Una cifra que sólo copia otra celda (o el total de un renglón del flujo) se recorre hasta la que calcula, sin
        dar vueltas. Una guarda (¿usa banco?) no cuenta para decidirlo y se conserva. `via` se llena con lo recorrido;
        lo que ya se recorrió o la cifra misma no vuelven a salir."""
        vistos = list(via)
        while True:
            nucleo = [i for i in lista if i not in GUARDAS]
            if len(nucleo) != 1 or nucleo[0] in vistos or nodos[nucleo[0]]["t"] != "resultado":
                return lista
            x = nucleo[0]
            vistos.append(x)
            if x not in via:
                via.append(x)
            guardas = [i for i in lista if i in GUARDAS]
            lista = guardas + [i for i in precedentes(x) if i != propio and i not in vistos and i not in guardas]

    # ── las cifras que el visor enseña ──
    figuras_celda = {}
    for it in G.VER_FILAS:
        if it[0] != "§" and it[3] != "dato":
            figuras_celda["v." + it[0]] = ("v:" + it[0], [("Versiones", G.VER_FILA[it[0]], COL_V1)])
    figuras_celda["v.huella"] = ("res:huella", [("Resumen", G.RES_FILA["v1.huella"], 2)])
    for serie, fila in FLUJO_SERIES.items():
        figuras_celda["flujo." + serie] = ("flujo:%d" % fila, [(FLUJO, fila, c) for c in range(2, G.MESES + 3)])
    for k in DATOS_VISOR:
        figuras_celda["datos." + k] = ("dato:" + k, [("Datos", G.DATO_FILA[k], 3)])
    for k in PLAN_VISOR:
        figuras_celda[k] = ("res:" + k, [("Resumen", G.RES_FILA[k], 2)])
    figuras_celda["productos"] = ("dato:productos", [])
    figuras_celda["reparto.esquema"] = ("reparto:esquema", [("Reparto", 5, 2)])
    # el nodo de la cifra misma (su tipo dice, si no sale de otra cifra, si es un dato o una decisión)
    propios = {"dato:productos": ("Productos", G.PROD_FILA0, 2), "reparto:esquema": ("Reparto", 5, 2)}
    for clave, (propio, celdas) in figuras_celda.items():
        h, f, c = propios.get(propio) or celdas[0]
        n = nodo(h, f, c)
        if n and n[0] == propio:
            registra(n)
        elif propio.startswith("res:"):
            nodos.setdefault(propio, {"t": "resultado", "n": clave})

    figuras = {}
    for clave, (propio, celdas) in sorted(figuras_celda.items()):
        directas = []
        for h, f, c in celdas:
            for i in precedentes_celda(h, f, c):
                if i != propio and i not in directas:
                    directas.append(i)
        via = []
        directas = baja(directas, propio, via)
        segundo = {}
        for i in directas:
            if nodos[i]["t"] == "dato" and not i.startswith("dato:"):
                continue                                     # un registro (candados, consejo…): no se abre
            s = baja([j for j in precedentes(i) if j != propio and j not in via and j != i], propio, via + [i])
            if s:
                segundo[i] = s
        fig = {"yo": propio, "d": directas}
        if via:
            fig["via"] = via
        if segundo:
            fig["s"] = segundo
        figuras[clave] = fig

    usados = set()
    for f in figuras.values():
        usados.add(f["yo"])
        usados.update(f["d"])
        usados.update(f.get("via", []))
        for k, s in f.get("s", {}).items():
            usados.add(k)
            usados.update(s)
    # lo que copia una palanca: si la versión no la mueve, toma la cifra de ese dato (la ficha lo enseña igual)
    for ident in usados:
        if ident.startswith("palanca:") and ident.split(":", 1)[1] in palanca:
            base = palanca[ident.split(":", 1)[1]][4]
            m = re.match(r"^Datos!\$C\$(\d+)$", base) if isinstance(base, str) else None
            if m and int(m.group(1)) in dato_fila:
                nodos[ident]["dato"] = dato_fila[int(m.group(1))]
    datos = {
        "esquema": G.ESQUEMA,
        "huella": huella(),
        "nodos": {k: nodos[k] for k in sorted(usados)},
        "figuras": figuras,
    }
    datos["firma"] = firma(datos)
    return datos


def firma(datos):
    """Huella del contenido (sin la firma): si alguien edita visor-explica-grafo.js a mano, la prueba de Node la recalcula
    y no coincide (así no hace falta Python en la integración continua)."""
    cuerpo = {k: datos[k] for k in ("esquema", "huella", "nodos", "figuras")}
    return hashlib.sha256(json.dumps(cuerpo, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()


def huella():
    h = hashlib.sha256()
    for nombre in FUENTES:
        with open(os.path.join(AQUI, nombre), "rb") as fh:
            h.update(nombre.encode("utf-8") + b"\0" + fh.read() + b"\0")
    return h.hexdigest()


def texto_js(datos):
    return ("/* Generado por ppp2/libro/explica.py desde la plantilla del libro (" + datos["esquema"] + ").\n"
            "   No se edita a mano: si cambia ppp2/libro/generar.py, se vuelve a correr ese guion\n"
            "   (tests/visor-explica.test.cjs lo vigila). De cada cifra del visor: su nodo (yo), lo que lee su fórmula (d), el\n"
            "   segundo nivel (s) y, si sólo copia otra celda, por dónde pasa (via). Sólo nombres y ligas: ninguna cifra. */\n"
            "(function (root) { root.VISOR_EXPLICA_GRAFO = " + json.dumps(datos, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + ";\n"
            "  if (typeof module !== 'undefined' && module.exports) module.exports = root.VISOR_EXPLICA_GRAFO;\n"
            "})(typeof window !== 'undefined' ? window : globalThis);\n")


def main(argv):
    nuevo = texto_js(construir())
    if "--check" in argv:
        actual = open(SALIDA, encoding="utf-8").read() if os.path.exists(SALIDA) else ""
        if actual != nuevo:
            print("visor-explica-grafo.js no coincide con la plantilla: corre python3 ppp2/libro/explica.py")
            return 1
        print("ok · visor-explica-grafo.js al día")
        return 0
    with open(SALIDA, "w", encoding="utf-8") as fh:
        fh.write(nuevo)
    print("ok", os.path.relpath(SALIDA, RAIZ))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
