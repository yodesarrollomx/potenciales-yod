#!/usr/bin/env python3
"""La edad sólo pasa a árbol cuando el consejo APRUEBA: lo comprueba una hoja de cálculo de verdad.

Arma la plantilla con el plan INVENTADO de ejemplo-plan.json (V2 vigente) y distintos votos del
consejo, la recalcula con LibreOffice y guarda la edad y el resumen del consejo de cada escenario
en el accesorio que lee tests/ppp2-libro.test.cjs.

    python3 consejo_edad.py tests/fixtures/ppp2-consejo-edad.json

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


def votos(sesion, version, aprueba=0, regresa=0, veto=0):
    filas = []
    for voto, n in (("aprueba", aprueba), ("regresa", regresa), ("veto", veto)):
        for _ in range(n):
            filas.append(["2026-01-15", sesion, version, f"Juez {len(filas) + 1}", voto, "Razón de prueba", ""])
    return filas


ESCENARIOS = [
    ("sin consejo", []),
    ("regresa 7 de 7", votos("CP-1", "V2", regresa=7)),
    ("aprueba 5 de 7", votos("CP-1", "V2", aprueba=5, regresa=2)),
    ("aprueba 4 de 7", votos("CP-1", "V2", aprueba=4, regresa=3)),
    ("aprueba 6 con veto", votos("CP-1", "V2", aprueba=6, veto=1)),
    ("aprobó y luego regresó", votos("CP-1", "V2", aprueba=6, regresa=1) + votos("CP-2", "V2", regresa=7)),
    ("aprobó otra versión", votos("CP-1", "V3", aprueba=7)),
    ("versión escrita como 2", votos("CP-1", "2", aprueba=5, regresa=2)),
]


def main(salida):
    with open(os.path.join(AQUI, "ejemplo-plan.json"), encoding="utf-8") as fh:
        base = json.load(fh)
    with open(os.path.join(AQUI, "catalogo-preguntas.json"), encoding="utf-8") as fh:
        catalogo = json.load(fh)
    out = []
    with tempfile.TemporaryDirectory() as tmp:
        calc = os.path.join(tmp, "calc")
        os.makedirs(calc)
        # la plantilla vacía (lo que copia «Sembrar») es semilla y no enseña resultados
        vacia = os.path.join(tmp, "vacia.xlsx")
        generar.construir(None, catalogo).save(vacia)
        subprocess.run(["soffice", "--headless", "--calc", "--convert-to", "xlsx", "--outdir", calc, vacia],
                       check=True, capture_output=True, timeout=180)
        wb = openpyxl.load_workbook(os.path.join(calc, "vacia.xlsx"), data_only=True)
        out.append({"escenario": "plantilla vacía", "edad": wb["Plan"]["B4"].value, "muestra": wb["Plan"]["D6"].value,
                    "falta": wb["Plan"]["B5"].value, "consejo": wb["Consejo"]["A3"].value})
        for i, (nombre, filas) in enumerate(ESCENARIOS):
            plan = copy.deepcopy(base)
            plan["versiones"][1]["estado"] = "vigente"
            plan["consejo"] = filas
            ruta = os.path.join(tmp, f"e{i}.xlsx")
            generar.construir(plan, catalogo).save(ruta)
            subprocess.run(["soffice", "--headless", "--calc", "--convert-to", "xlsx", "--outdir", calc, ruta],
                           check=True, capture_output=True, timeout=180)
            wb = openpyxl.load_workbook(os.path.join(calc, f"e{i}.xlsx"), data_only=True)
            out.append({"escenario": nombre, "edad": wb["Plan"]["B4"].value,
                        "falta": wb["Plan"]["B5"].value, "consejo": wb["Consejo"]["A3"].value})
            print(nombre, "→", out[-1]["edad"], "·", out[-1]["consejo"])
    with open(salida, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)
    print("ok", salida)


if __name__ == "__main__":
    main(sys.argv[1])
