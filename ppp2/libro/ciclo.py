#!/usr/bin/env python3
"""El ciclo del plan lo calcula el libro: lo comprueba una hoja de cálculo de verdad.

Arma la plantilla con el plan INVENTADO de ejemplo-plan.json en distintos momentos de su vida
(sin probar, probada, regresada por el consejo, sin mejora, aprobada, vigente, con votos mal
escritos, con la evidencia cambiada…), la recalcula con LibreOffice y guarda la edad y el
siguiente paso de cada escenario en el accesorio que lee tests/ppp2-libro.test.cjs.

    python3 ciclo.py ../../tests/fixtures/ppp2-ciclo.json

Dos pasadas: la primera sólo sirve para leer la huella de cada versión y la evidencia; la
segunda arma los escenarios con ellas. Nunca con datos reales.
"""
import copy
import json
import os
import subprocess
import sys
import tempfile

import openpyxl

import generar

AQUI = os.path.dirname(os.path.abspath(__file__))

# Variantes de palancas del plan inventado (para tener una V3 que sí pasa y una V2 que no).
VARIANTES = {
    "normal": {},
    "v3pasa": {3: {"obra_inicio": 12, "individualizar": 1, "capital": 80, "durante_obra_1": 0.2}},
    "v2nopasa": {2: {"obra_inicio": 11, "individualizar": 1, "capital": 40, "durante_obra_1": 0.2}},
    # una base que sí pasa la revisión (las mismas palancas que la V2 del ejemplo)
    "v1pasa": {1: {"obra_inicio": 12, "individualizar": 1, "capital": 60, "durante_obra_1": 0.2}},
}


def recalcular(rutas, destino):
    for i in range(0, len(rutas), 20):
        subprocess.run(["soffice", "--headless", "--calc", "--convert-to", "xlsx", "--outdir", destino] + rutas[i:i + 20],
                       check=True, capture_output=True, timeout=900)


def leer(ruta):
    wb = openpyxl.load_workbook(ruta, data_only=True)
    res = {wb["Resumen"].cell(r, 1).value: wb["Resumen"].cell(r, 2).value for r in range(4, wb["Resumen"].max_row + 1)}
    return {"edad": wb["Plan"]["B4"].value, "muestra": wb["Plan"]["D6"].value, "falta": wb["Plan"]["B5"].value,
            "paso": res.get("plan.paso"), "paso_texto": res.get("plan.paso_texto"), "defiende": res.get("plan.defiende"),
            "consejo": wb["Consejo"]["A3"].value, "sesion": res.get("plan.consejo_sesion") or "",
            "aprueban": res.get("plan.consejo_aprueban"), "vetos": res.get("plan.consejo_vetos"), "votaron": res.get("plan.consejo_votaron"),
            "aprobada": res.get("plan.consejo_aprobada"), "probada": res.get("plan.probada"), "sin_mejora": res.get("plan.sin_mejora"),
            "sin_leer": res.get("plan.consejo_sin_leer"), "evidencia": res.get("plan.evidencia") or "",
            "evidencia_sesion": res.get("plan.evidencia_sesion") or "", "paso_capital": res.get("plan.paso_capital"),
            "revision": [res.get(f"v{k}.rv_resultado") or "" for k in (1, 2, 3)],
            "huellas": [res.get(f"v{k}.huella") or "" for k in (1, 2, 3)]}


def votos(sesion, version, huella, aprueba=0, regresa=0, veto=0, evidencia=""):
    filas = []
    for voto, n in (("aprueba", aprueba), ("regresa", regresa), ("veto", veto)):
        for _ in range(n):
            filas.append(["2026-01-15", sesion, version, f"Juez {len(filas) + 1}", voto, "Razón de prueba", "", huella, evidencia])
    return filas


def prueba(version, huella):
    return [["Base de la versión", "(sin cambios)", 1, 0, 1, 1, 30, version, "2026-01-15 10:00", "Pruebas", huella]]


def ronda(n, parte, huella, resultado, en="", huella_prop=""):
    return [[n, "2026-01-15 11:00", "El plan", parte, huella, "Motivo de prueba", resultado, en, huella_prop, "", 15, "{}", ""]]


def escenarios(H, E):
    """H[variante] = huellas de las tres versiones; E = evidencia de hoy sin tocar nada, E['cerrados'] con los candados cerrados."""
    h1, h2, h3 = H["normal"]
    p3 = H["v3pasa"][2]           # una V3 que sí pasa la revisión
    n2 = H["v2nopasa"][1]         # una V2 que no la pasa
    b1 = H["v1pasa"][0]           # una base que sí la pasa
    base = {"variante": "v1pasa", "estados": {2: "alterna"}}
    e0, ec = E["hoy"], E["cerrados"]
    vig2 = {"estados": {2: "vigente"}}
    reg = lambda **k: votos("CP-1", "V2", h2, regresa=7, evidencia=e0, **k)
    return [
        ("propuesta sin probar", {}),
        ("probada, falta el consejo", {"pruebas": prueba("V2", h2)}),
        ("pruebas de otros números", {"pruebas": prueba("V2", "hotra")}),
        ("el consejo la regresa", {"pruebas": prueba("V2", h2), "consejo": reg()}),
        ("regresada y sin mejora por palancas", {"pruebas": prueba("V2", h2), "consejo": reg(), "rondas": ronda(2, 2, h2, "sin mejora")}),
        ("sin mejora desde otros números", {"pruebas": prueba("V2", h2), "consejo": reg(), "rondas": ronda(2, 2, "hotra", "sin mejora")}),
        ("el consejo aprueba la propuesta", {"pruebas": prueba("V2", h2), "consejo": votos("CP-1", "V2", h2, aprueba=5, regresa=2, evidencia=e0)}),
        ("aprueban 4 de 7", {"pruebas": prueba("V2", h2), "consejo": votos("CP-1", "V2", h2, aprueba=4, regresa=3, evidencia=e0)}),
        ("vigente y aprobada", dict(vig2, pruebas=prueba("V2", h2), consejo=votos("CP-1", "V2", h2, aprueba=5, regresa=2, evidencia=e0))),
        ("vigente y aprobada, versión escrita como 2", dict(vig2, pruebas=prueba("V2", h2), consejo=votos("CP-1", "2", h2, aprueba=5, regresa=2, evidencia=e0))),
        ("vigente con votos de otros números", dict(vig2, pruebas=prueba("V2", h2), consejo=votos("CP-1", "V2", "hotra", aprueba=7, evidencia=e0))),
        ("vigente con veto", dict(vig2, pruebas=prueba("V2", h2), consejo=votos("CP-1", "V2", h2, aprueba=6, veto=1, evidencia=e0))),
        ("vigente sin consejo", dict(vig2, pruebas=prueba("V2", h2))),
        ("vigente regresada y propuesta nueva en la V3", {"variante": "v3pasa", "estados": {2: "vigente", 3: "propuesta"}, "pruebas": prueba("V2", h2),
                                                         "consejo": reg(), "rondas": ronda(2, 2, h2, "propuesta", 3, p3)}),
        ("vigente aprobada y propuesta nueva regresada", {"variante": "v3pasa", "estados": {2: "vigente", 3: "propuesta"},
                                                         "pruebas": prueba("V2", h2) + prueba("V3", p3),
                                                         "consejo": votos("CP-1", "V2", h2, aprueba=6, regresa=1, evidencia=e0) + votos("CP-2", "V3", p3, regresa=7, evidencia=e0)}),
        ("sólo la base", {"estados": {2: "alterna"}}),
        ("la base sin mejora y no pasa", {"estados": {2: "alterna"}, "rondas": ronda(1, 1, h1, "sin mejora")}),
        ("árbol con candados cerrados", dict(vig2, pruebas=prueba("V2", h2), consejo=votos("CP-1", "V2", h2, aprueba=7, evidencia=e0), candados="cerrados")),
        ("acuerdo firmado", dict(vig2, pruebas=prueba("V2", h2), consejo=votos("CP-1", "V2", h2, aprueba=7, evidencia=e0), candados="cerrados", firmado=True)),
        # ── una propuesta que no pasa la revisión nunca va a pruebas ni al consejo ──
        ("la propuesta no pasa la revisión", {"variante": "v2nopasa"}),
        ("la propuesta no pasa y ya no hay mejora", {"variante": "v2nopasa", "rondas": ronda(2, 2, n2, "sin mejora")}),
        ("la propuesta no pasa aunque tenga pruebas y votos", {"variante": "v2nopasa", "pruebas": prueba("V2", n2),
                                                              "consejo": votos("CP-1", "V2", n2, aprueba=7, evidencia=e0)}),
        # ── los votos se cuentan por sesión, versión Y huella; una sesión vale con los siete ──
        ("sesión incompleta: votaron 4", {"pruebas": prueba("V2", h2), "consejo": votos("CP-1", "V2", h2, regresa=4, evidencia=e0)}),
        ("la misma sesión dos veces: 14 votos", {"pruebas": prueba("V2", h2),
                                                "consejo": votos("CP-1", "V2", h2, aprueba=4, regresa=3, evidencia=e0) + votos("CP-1", "V2", h2, aprueba=3, regresa=4, evidencia=e0)}),
        ("mismo nombre de sesión: aprobó números viejos y regresa los de hoy", {"pruebas": prueba("V2", h2),
                                                                              "consejo": votos("CP-1", "V2", "hotra", aprueba=7, evidencia=e0) + reg()}),
        ("vigente: mismo nombre de sesión aprobó números viejos y regresa los de hoy", dict(vig2, pruebas=prueba("V2", h2),
                                                                                         consejo=votos("CP-1", "V2", "hotra", aprueba=7, evidencia=e0) + reg())),
        ("vigente: la misma sesión aprobó la V3 y regresa la V2", dict(vig2, variante="v3pasa", pruebas=prueba("V2", h2),
                                                                      consejo=votos("CP-1", "V3", p3, aprueba=7, evidencia=e0) + reg())),
        ("votos escritos con espacios", {"pruebas": prueba("V2", h2),
                                        "consejo": [f[:2] + [v] + f[3:7] + [h2 + " ", e0] for f, v in zip(votos("CP-1", "V2", h2, aprueba=5, regresa=2), ["V2 ", " V2", "V 2", "v2", "2", " 2 ", "Versión 2"])]}),
        ("votos sin huella", {"pruebas": prueba("V2", h2), "consejo": votos("CP-1", "V2", "", aprueba=7, evidencia=e0)}),
        ("votos sin versión", {"pruebas": prueba("V2", h2), "consejo": votos("CP-1", "", h2, aprueba=7, evidencia=e0)}),
        # ── el mundo real: si cambia la evidencia después de una sesión que la regresó, el plan vuelve a presentarse ──
        ("regresada, sin mejora y cambió la evidencia", {"pruebas": prueba("V2", h2), "consejo": reg(), "rondas": ronda(2, 2, h2, "sin mejora"), "candados": "cerrados"}),
        ("regresada, sin mejora, y se volvió a presentar con la evidencia nueva", {"pruebas": prueba("V2", h2), "rondas": ronda(2, 2, h2, "sin mejora"), "candados": "cerrados",
                                                                                 "consejo": reg() + votos("CP-2", "V2", h2, regresa=7, evidencia=ec)}),
        ("regresada, sin mejora, votos sin evidencia anotada", {"pruebas": prueba("V2", h2), "consejo": votos("CP-1", "V2", h2, regresa=7), "rondas": ronda(2, 2, h2, "sin mejora")}),
        # ── una base que pasa la revisión explora primero: no se prueba ni se presenta sin haber movido sus palancas ──
        ("la base pasa: primero explora", dict(base)),
        ("la base pasa con pruebas y votos pero sin haber explorado", dict(base, pruebas=prueba("V1", b1), consejo=votos("CP-1", "V1", b1, aprueba=7, evidencia=e0))),
        ("la base pasa y ya exploró sin mejora: se prueba", dict(base, rondas=ronda(1, 1, b1, "sin mejora"))),
        ("la base pasa, exploró y se probó: al consejo", dict(base, rondas=ronda(1, 1, b1, "sin mejora"), pruebas=prueba("V1", b1))),
        ("la base pasa, exploró y el consejo la aprueba: decide Dirección", dict(base, rondas=ronda(1, 1, b1, "sin mejora"), pruebas=prueba("V1", b1),
                                                                         consejo=votos("CP-1", "V1", b1, aprueba=6, regresa=1, evidencia=e0))),
        ("flor con una propuesta nueva regresada y sin mejora", {"variante": "v3pasa", "estados": {2: "vigente", 3: "propuesta"}, "candados": "cerrados",
                                                                "pruebas": prueba("V2", h2) + prueba("V3", p3), "rondas": ronda(3, 3, p3, "sin mejora"),
                                                                "consejo": votos("CP-1", "V2", h2, aprueba=7, evidencia=ec) + votos("CP-2", "V3", p3, regresa=7, evidencia=ec)}),
    ]


def armar(base, cambios):
    plan = copy.deepcopy(base)
    for k, pal in VARIANTES[cambios.get("variante", "normal")].items():
        plan["versiones"][k - 1]["palancas"] = dict(pal)
    for k, est in cambios.get("estados", {}).items():
        plan["versiones"][k - 1]["estado"] = est
    for tabla in ("pruebas", "consejo", "rondas"):
        plan[tabla] = cambios.get(tabla, [])
    if cambios.get("candados") == "cerrados":
        for c in plan["candados"]:
            c[3], c[4] = "cerrado", "Evidencia de prueba"
    if cambios.get("firmado"):
        plan["datos"]["acuerdo.firmado"] = {"valor": "sí", "estado": "confirmado", "fuente": "Prueba", "quien": "Pruebas", "fecha": "2026-01-15"}
    return plan


def main(salida):
    with open(os.path.join(AQUI, "ejemplo-plan.json"), encoding="utf-8") as fh:
        base = json.load(fh)
    with open(os.path.join(AQUI, "catalogo-preguntas.json"), encoding="utf-8") as fh:
        catalogo = json.load(fh)
    out = []
    with tempfile.TemporaryDirectory() as tmp:
        calc = os.path.join(tmp, "calc")
        os.makedirs(calc)
        generar.construir(None, catalogo).save(os.path.join(tmp, "vacia.xlsx"))
        primeras = ["vacia.xlsx"]
        for v in VARIANTES:
            generar.construir(armar(base, {"variante": v}), catalogo).save(os.path.join(tmp, f"var_{v}.xlsx"))
            primeras.append(f"var_{v}.xlsx")
        generar.construir(armar(base, {"candados": "cerrados"}), catalogo).save(os.path.join(tmp, "cerrados.xlsx"))
        primeras.append("cerrados.xlsx")
        recalcular([os.path.join(tmp, f) for f in primeras], calc)
        vacia = leer(os.path.join(calc, "vacia.xlsx"))
        out.append(dict(vacia, escenario="plantilla vacía", entradas={"estados": ["base", "", ""], "pruebas": [], "consejo": [], "rondas": []}))
        H = {v: leer(os.path.join(calc, f"var_{v}.xlsx"))["huellas"] for v in VARIANTES}
        normal = leer(os.path.join(calc, "var_normal.xlsx"))
        E = {"hoy": normal["evidencia"], "cerrados": leer(os.path.join(calc, "cerrados.xlsx"))["evidencia"]}
        assert all(h.startswith("h") for h in H["normal"]) and len(set(H["normal"])) == 3, H
        assert E["hoy"] and E["hoy"] != E["cerrados"], E
        rev = {v: leer(os.path.join(calc, f"var_{v}.xlsx"))["revision"] for v in VARIANTES}
        assert rev["v3pasa"][2].startswith("Pasa") and rev["v2nopasa"][1].startswith("No pasa") and rev["v1pasa"][0].startswith("Pasa"), rev
        lista = escenarios(H, E)
        rutas = []
        for i, (nombre, cambios) in enumerate(lista):
            ruta = os.path.join(tmp, f"e{i}.xlsx")
            generar.construir(armar(base, cambios), catalogo).save(ruta)
            rutas.append(ruta)
        recalcular(rutas, calc)
        for i, (nombre, cambios) in enumerate(lista):
            e = leer(os.path.join(calc, f"e{i}.xlsx"))
            assert e["huellas"] == H[cambios.get("variante", "normal")], (nombre, "la huella no debe depender del estado ni de los votos")
            plan = armar(base, cambios)
            # lo que entró al libro: con esto tests/ppp2-libro.test.cjs comprueba que el ciclo «en chico» del mundo
            # de prueba (tests/ppp2-mundo.cjs) dice lo mismo que las fórmulas del libro.
            entradas = {"estados": [v.get("estado", "") for v in plan["versiones"]], "pruebas": plan["pruebas"], "consejo": plan["consejo"], "rondas": plan["rondas"]}
            out.append(dict(e, escenario=nombre, entradas=entradas))
            print(f"{nombre:75s} → {e['edad']:9s} · {e['paso']:10s} · defiende V{e['defiende']} · sesión {e['sesion'] or '—':5s} {e['aprueban']}/{e['votaron']} · sin leer {e['sin_leer']}")
    with open(salida, "w", encoding="utf-8") as fh:
        json.dump({"_generador": generar.huella_generador(), "escenarios": out}, fh, ensure_ascii=False, indent=1)
    print("ok", salida)


if __name__ == "__main__":
    main(sys.argv[1])
