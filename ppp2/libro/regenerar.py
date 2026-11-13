#!/usr/bin/env python3
"""Regenera los tres accesorios de prueba de PPP 2 con el plan INVENTADO (necesita LibreOffice):

    python3 ppp2/libro/regenerar.py

  tests/fixtures/ppp2-libro-ejemplo.json  el libro de ejemplo recalculado (lo usan las pruebas del servidor)
  tests/fixtures/ppp2-ciclo.json          la edad y el siguiente paso en distintos momentos (ciclo.py)
  tests/fixtures/ppp2-rejilla.json        lo que el libro calcula para cada combinación de una ronda (rejilla.py)

Cada accesorio guarda la huella de estos archivos; tests/ppp2-libro.test.cjs falla si cambian y no se regeneran.
"""
import json
import os
import subprocess
import sys
import tempfile

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import ciclo      # noqa: E402
import fixture    # noqa: E402
import generar    # noqa: E402
import rejilla    # noqa: E402

DESTINO = os.path.normpath(os.path.join(AQUI, "..", "..", "tests", "fixtures"))


def main():
    with open(os.path.join(AQUI, "ejemplo-plan.json"), encoding="utf-8") as fh:
        plan = json.load(fh)
    with open(os.path.join(AQUI, "catalogo-preguntas.json"), encoding="utf-8") as fh:
        catalogo = json.load(fh)
    with tempfile.TemporaryDirectory() as tmp:
        form = os.path.join(tmp, "ejemplo.xlsx")
        generar.construir(plan, catalogo).save(form)
        os.makedirs(os.path.join(tmp, "calc"))
        subprocess.run(["soffice", "--headless", "--calc", "--convert-to", "xlsx", "--outdir", os.path.join(tmp, "calc"), form],
                       check=True, capture_output=True, timeout=900)
        fixture.main(os.path.join(tmp, "calc", "ejemplo.xlsx"), form, os.path.join(DESTINO, "ppp2-libro-ejemplo.json"))
    ciclo.main(os.path.join(DESTINO, "ppp2-ciclo.json"))
    rejilla.main(os.path.join(DESTINO, "ppp2-rejilla.json"))
    print("accesorios regenerados · huella", generar.huella_generador()[:16])


if __name__ == "__main__":
    main()
