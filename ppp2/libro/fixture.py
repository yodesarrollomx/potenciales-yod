#!/usr/bin/env python3
"""Convierte un libro PPP 2 ya recalculado (.xlsx) en el accesorio JSON que usan
las pruebas del servidor (tests/ppp2-servidor.test.cjs).

    python3 fixture.py libro-recalculado.xlsx libro-con-formulas.xlsx salida.json

Sólo se usa con el plan INVENTADO de ejemplo-plan.json: nunca con datos reales.
"""
import json
import sys

import openpyxl

HOJAS = ["Plan", "Versiones", "Reparto", "Datos", "Productos", "Candados", "Preguntas", "Hallazgos", "Consejo",
         "Modelo", "Pruebas", "Bitácora", "Resumen", "Flujo V1", "Flujo V2", "Flujo V3"]


def limpio(v):
    if isinstance(v, float):
        return round(v, 6)
    if v is None:
        return ""
    return v if isinstance(v, (int, str, bool)) else str(v)


def main(calc, form, salida):
    wv = openpyxl.load_workbook(calc, data_only=True)
    wf = openpyxl.load_workbook(form, data_only=False)
    out = {}
    for t in HOJAS:
        sv, sf = wv[t], wf[t]
        filas = sv.max_row
        cols = sv.max_column if not t.startswith("Flujo") else 62
        if t.startswith("Flujo"):
            filas = 62
        vals, frms = [], {}
        for r in range(1, filas + 1):
            vals.append([limpio(sv.cell(r, c).value) for c in range(1, cols + 1)])
            if t in ("Modelo", "Pruebas"):
                for c in range(1, cols + 1):
                    f = sf.cell(r, c).value
                    if isinstance(f, str) and f.startswith("="):
                        frms[f"{r},{c}"] = f
        out[t] = {"valores": vals, "formulas": frms}
    with open(salida, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    print("ok", salida)


if __name__ == "__main__":
    main(*sys.argv[1:4])
