#!/usr/bin/env python3
"""Lo que el libro REAL calcula para cada combinación que una ronda prueba.

La ronda del plan (server/ppp2/PPP2.gs, `ronda_`) mueve capital y arranque de obra en una versión de
trabajo y lee lo que el libro recalcula. Aquí se arma, con el plan INVENTADO de ejemplo-plan.json y
LibreOffice, la tabla de esos resultados para varias situaciones de partida. Con ella
tests/ppp2-ronda.test.cjs corre el servidor real sobre cifras reales del libro, no sobre reglas inventadas.

    python3 rejilla.py ../../tests/fixtures/ppp2-rejilla.json

Nunca con datos reales.
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
CLAVES = ["rv_resultado", "respaldo", "dueno_recibe", "dueno_meses", "ganancia", "rv_aportacion", "rv_preventa", "huella"]
# Los tres golpes leves de la ronda (RONDA.GOLPES en el servidor): cada uno por separado.
GOLPES = {"": lambda p: {}, "precio-5": lambda p: {"ajuste_precio": -0.05}, "obra+5": lambda p: {"ajuste_obra": 0.05},
          "lentas": lambda p: {"ventas_meses": round(p["ventas_meses"] * 1.25)}}

# Situaciones de partida. `palancas`: las de la versión de partida (si no, las del ejemplo).
CASOS = {
    # El consejo regresó la V2 del ejemplo (capital 60, obra en el mes 12): pasa justa y no aguanta las ventas lentas.
    "regresada": {"origen": 2, "destino": 3, "estados": {}, "capital": [40, 50, 60, 70, 80], "obra": [11, 12, 13]},
    # Sólo existe la base, que no pasa la revisión (sin banco); el capital disponible es el que ya usa.
    "base_no_pasa": {"origen": 1, "destino": 2, "estados": {2: "descartada"}, "capital": [100, 110, 120], "obra": [7, 8, 9]},
    # Una propuesta que no pasa, con una combinación cercana que sí pasa.
    "no_pasa_y_hay_salida": {"origen": 2, "destino": 3, "estados": {}, "palancas": {"obra_inicio": 11, "individualizar": 1, "capital": 40, "durante_obra_1": 0.2},
                             "capital": [20, 30, 40, 50, 60], "obra": [10, 11, 12]},
    # Una propuesta que no pasa y cuyas vecinas tampoco pasan, aunque alguna falla menos pruebas.
    "no_pasa_y_mejora_a_medias": {"origen": 2, "destino": 3, "estados": {}, "palancas": {"obra_inicio": 11, "individualizar": 1, "capital": 30, "durante_obra_1": 0.2},
                                  "capital": [10, 20, 30, 40, 50], "obra": [10, 11, 12]},
    # La propuesta del propio plan (capital 80, obra en el mes 12) ya pasa limpia y aguanta: al afinarla en su lugar no hay mejora.
    "afinar_en_su_lugar": {"origen": 3, "destino": 3, "estados": {2: "vigente", 3: "propuesta"}, "palancas": {"obra_inicio": 12, "individualizar": 1, "capital": 80, "durante_obra_1": 0.2},
                           "capital": [60, 70, 80, 90, 100], "obra": [11, 12, 13]},
}


def recalcular(rutas, destino):
    for i in range(0, len(rutas), 20):
        subprocess.run(["soffice", "--headless", "--calc", "--convert-to", "xlsx", "--outdir", destino] + rutas[i:i + 20],
                       check=True, capture_output=True, timeout=900)


def resumen(ruta):
    wb = openpyxl.load_workbook(ruta, data_only=True)
    return {wb["Resumen"].cell(r, 1).value: wb["Resumen"].cell(r, 2).value for r in range(4, wb["Resumen"].max_row + 1)}


def limpio(v):
    return round(v, 6) if isinstance(v, float) else ("" if v is None else v)


def main(salida):
    with open(os.path.join(AQUI, "ejemplo-plan.json"), encoding="utf-8") as fh:
        base = json.load(fh)
    with open(os.path.join(AQUI, "catalogo-preguntas.json"), encoding="utf-8") as fh:
        catalogo = json.load(fh)
    ventas_meses = base["datos"]["cal.ventas_meses"]["valor"]
    out = {}
    with tempfile.TemporaryDirectory() as tmp:
        calc = os.path.join(tmp, "calc")
        os.makedirs(calc)
        trabajos = []
        for nombre, caso in CASOS.items():
            partida = copy.deepcopy(base)
            for k, est in caso["estados"].items():
                partida["versiones"][k - 1]["estado"] = est
            if "palancas" in caso:
                partida["versiones"][caso["origen"] - 1]["palancas"] = dict(caso["palancas"])
            ruta0 = os.path.join(tmp, f"{nombre}__partida.xlsx")
            generar.construir(partida, catalogo).save(ruta0)
            trabajos.append((nombre, "partida", ruta0))
            for cap in caso["capital"]:
                for obra in caso["obra"]:
                    for g, ops in GOLPES.items():
                        plan = copy.deepcopy(partida)
                        pal = dict(plan["versiones"][caso["origen"] - 1].get("palancas", {}))
                        pal.update({"capital": cap, "obra_inicio": obra})
                        pal.update(ops({"ventas_meses": ventas_meses}))
                        plan["versiones"][caso["destino"] - 1]["palancas"] = pal
                        ruta = os.path.join(tmp, f"{nombre}__{cap}_{obra}_{g.replace('+', 'mas') or 'propia'}.xlsx")
                        generar.construir(plan, catalogo).save(ruta)
                        trabajos.append((nombre, f"{cap}|{obra}|{g}", ruta))
        recalcular([r for _, _, r in trabajos], calc)
        for nombre, clave, ruta in trabajos:
            caso = CASOS[nombre]
            res = resumen(os.path.join(calc, os.path.basename(ruta)))
            d = out.setdefault(nombre, {"origen": caso["origen"], "destino": caso["destino"], "estados": {str(k): v for k, v in caso["estados"].items()},
                                        "palancas": caso.get("palancas"), "tabla": {}})
            if clave == "partida":
                o = caso["origen"]
                d["partida"] = {"capital": None, "paso_capital": limpio(res.get("plan.paso_capital")), "defiende": res.get("plan.defiende"),
                                "paso": res.get("plan.paso"), "resumen": {k: limpio(v) for k, v in res.items() if k.startswith(f"v{o}.") or k.startswith("plan.")}}
            else:
                d["tabla"][clave] = {c: limpio(res.get(f"v{caso['destino']}.{c}")) for c in CLAVES}
    for nombre, d in out.items():
        print("==", nombre, "· partida:", d["partida"]["resumen"].get(f"v{d['origen']}.rv_resultado"), "· paso del libro:", d["partida"]["paso"], "· paso de capital:", d["partida"]["paso_capital"])
        for k, v in d["tabla"].items():
            if k.endswith("|"):
                g = {x: d["tabla"][k + x]["respaldo"] for x in ("precio-5", "obra+5", "lentas")}
                print(f"   {k:9s} «{v['rv_resultado']}» respaldo {v['respaldo'] or 0:7.2f} · dueño {v['dueno_recibe']:.2f} en {v['dueno_meses']} · aport {v['rv_aportacion']:.3f} · golpes {g}")
    with open(salida, "w", encoding="utf-8") as fh:
        json.dump({"_generador": generar.huella_generador(), "casos": out}, fh, ensure_ascii=False, separators=(",", ":"))
    print("ok", salida)


if __name__ == "__main__":
    main(sys.argv[1])
