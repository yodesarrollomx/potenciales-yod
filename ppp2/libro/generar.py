#!/usr/bin/env python3
"""PPP 2 · generador del libro del plan (cálculo nativo en Google Sheets).

El libro es la fuente de verdad: los datos y TODAS las fórmulas viven en la hoja
(contrato del 30-sep-2026, ARQUITECTURA-SHEETS.md). Este script sólo arma el
archivo .xlsx que luego se sube a Drive convertido a Google Sheets; no calcula
nada por su cuenta.

Uso:
    python3 generar.py salida.xlsx                 # plantilla en blanco
    python3 generar.py salida.xlsx --plan plan.json  # plantilla con los datos de un plan

El JSON de un plan vive FUERA del repositorio (los datos de tratos no se publican).
Formato: ver `ejemplo-plan.json` (datos inventados).
"""
import json
import sys

from openpyxl import Workbook
from openpyxl.formatting.rule import CellIsRule, FormulaRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter as L
from openpyxl.worksheet.datavalidation import DataValidation

ESQUEMA = "ppp2-libro-v1"
MESES = 60
C1 = 3  # columna del mes 1 (C)
NP = 6  # productos posibles


def MC(m):
    return L(C1 + m - 1)


ULT = MC(MESES)

# ---------------------------------------------------------------- estilo
TINTA = "231D14"
ORO = "9A7B3F"
VERDE = "39744B"
ROJO = "A94438"
AZUL = "3E6484"
GRIS = "766F62"
LINEA = "E1DACB"
FONDO_SECCION = "EFE8DA"
FONDO_DATO = "FFF6D6"  # celdas que se capturan (la costumbre del borrador: amarillas)
FONDO_PALANCA = "EAF1F7"  # palancas de una versión distintas de la base

F_BASE = Font(name="Arial", size=10, color=TINTA)
F_TITULO = Font(name="Arial", size=16, bold=True, color=TINTA)
F_SUB = Font(name="Arial", size=10, italic=True, color=GRIS)
F_SECCION = Font(name="Arial", size=10, bold=True, color=ORO)
F_ENCABEZADO = Font(name="Arial", size=10, bold=True, color=TINTA)
F_GRANDE = Font(name="Arial", size=14, bold=True, color=TINTA)
FILL_SECCION = PatternFill("solid", fgColor=FONDO_SECCION)
FILL_DATO = PatternFill("solid", fgColor=FONDO_DATO)
FILL_PALANCA = PatternFill("solid", fgColor=FONDO_PALANCA)
BORDE = Border(bottom=Side(style="thin", color=LINEA))
ENVOLVER = Alignment(wrap_text=True, vertical="top")

MDP = '#,##0.0;[Red]-#,##0.0;"–"'
PCT = '0.0%'
ENT = '#,##0'
VECES = '0.00"x"'

ESTADOS_DATO = ["confirmado", "supuesto", "por confirmar", "en conflicto", "derivado", "falta"]
ESTADOS_VERSION = ["base", "propuesta", "vigente", "alterna", "descartada"]
ESTADOS_PREGUNTA = ["abierta", "respondida", "no se sabe", "investigando", "en conflicto", "no aplica"]
ESTADOS_CANDADO = ["abierto", "en revisión", "cerrado", "no aplica"]
VOTOS = ["aprueba", "regresa", "veto"]
ESTADOS_HALLAZGO = ["propuesto", "aceptado", "descartado"]


def celda(ws, ref, valor=None, font=None, fmt=None, fill=None, align=None):
    c = ws[ref]
    if valor is not None:
        c.value = valor
    c.font = font or F_BASE
    if fmt:
        c.number_format = fmt
    if fill:
        c.fill = fill
    if align:
        c.alignment = align
    return c


def seccion(ws, fila, texto, hasta="F"):
    for col in range(1, ws[hasta + "1"].column + 1):
        ws.cell(row=fila, column=col).fill = FILL_SECCION
    celda(ws, f"A{fila}", texto, F_SECCION, fill=FILL_SECCION)


def anchos(ws, d):
    for col, w in d.items():
        ws.column_dimensions[col].width = w


def lista(ws, rango, opciones):
    dv = DataValidation(type="list", formula1='"' + ",".join(opciones) + '"', allow_blank=True)
    dv.add(rango)
    ws.add_data_validation(dv)


# ---------------------------------------------------------------- Datos
# (clave, concepto, unidad, formato, requerido para calcular, valor por omisión de la plantilla, nota)
DATOS = [
    ("§", "Identidad del plan"),
    ("plan.nombre", "Nombre del plan", "texto", None, False, None, ""),
    ("plan.ubicacion", "Ubicación", "texto", None, False, None, ""),
    ("plan.tipo", "Tipo de proyecto", "texto", None, False, None, ""),
    ("plan.objetivo", "Qué se quiere conseguir", "texto", None, False, None, ""),
    ("plan.caso_ppp", "Caso en el PPP actual (si existe)", "texto", None, False, None, ""),
    ("§", "Terreno y tierra"),
    ("terreno.m2", "Superficie del terreno", "m²", ENT, False, None, ""),
    ("tierra.valor", "Valor de la tierra", "MDP", MDP, True, None, "Lo que vale la tierra que aporta el dueño."),
    ("acuerdo.firmado", "¿Ya hay acuerdo firmado con el dueño? (sí/no)", "texto", None, False, "no", ""),
    ("§", "Lo que dice la lámina o el anteproyecto"),
    ("lamina.ventas", "Ventas proyectadas", "MDP", MDP, True, None, "Total de ventas del anteproyecto; sirve para cuadrar."),
    ("lamina.costo_total", "Costo total con terreno", "MDP", MDP, True, None, "Total de costos del anteproyecto, incluida la tierra."),
    ("lamina.utilidad", "Utilidad del anteproyecto", "MDP", MDP, False, None, "Referencia."),
    ("lamina.pago_dueno", "Pago total al dueño en la oferta", "MDP", MDP, False, None, "Referencia: tierra más utilidad ofrecida."),
    ("lamina.m2_construidos", "Construcción total", "m²", ENT, False, None, ""),
    ("lamina.m2_vendibles", "Área vendible total", "m²", ENT, False, None, ""),
    ("§", "Costos (proporciones)"),
    ("costo.indirectos", "Indirectos sobre obra directa", "%", PCT, True, 0.12, "Referencia del oficio: PPP vertical."),
    ("costo.imprevistos", "Imprevistos sobre obra directa", "%", PCT, True, 0.06, "Referencia del oficio: PPP vertical."),
    ("costo.comision", "Comisión sobre ventas", "%", PCT, True, 0.047, "Referencia del oficio: PPP vertical."),
    ("costo.cierre", "Cierre sobre el valor de la tierra", "%", PCT, True, 0.04, "Referencia del oficio: PPP vertical."),
    ("costo.ind_predesarrollo", "Parte de los indirectos que se gasta en predesarrollo", "%", PCT, True, 0.3, ""),
    ("costo.obra_directa", "Obra directa", "MDP", MDP, True, "=OBRA", "Se deriva de la lámina: costo total menos tierra, comisiones y cierre, entre 1 + indirectos + imprevistos. Si hay presupuesto, se escribe aquí."),
    ("§", "Calendario"),
    ("cal.predesarrollo", "Predesarrollo", "meses", ENT, True, 6, "Proyecto, permisos y estudios."),
    ("cal.ventas_inicio", "Ventas: mes de inicio", "mes", ENT, True, 3, ""),
    ("cal.ventas_meses", "Ventas: meses de comercialización", "meses", ENT, True, None, ""),
    ("cal.obra_inicio", "Obra: mes de inicio", "mes", ENT, True, None, ""),
    ("cal.obra_duracion", "Obra: duración", "meses", ENT, True, None, ""),
    ("cal.campana", "Curva de obra: desviación (% de la duración)", "%", PCT, True, 0.2, "Pico a mitad de plazo."),
    ("§", "Cobranza"),
    ("cob.enganche", "Enganche al firmar", "%", PCT, True, 0.3, ""),
    ("cob.individualizar", "Avance de obra para individualizar (100% = obra terminada)", "%", PCT, True, 1, ""),
    ("cob.meses_saldos", "Meses para cobrar los saldos al individualizar", "meses", ENT, True, 6, ""),
    ("cob.saldo_posterior", "Lo firmado después paga el saldo a los", "meses", ENT, True, 2, ""),
    ("§", "Dinero"),
    ("din.tasa_capital", "Rendimiento anual del capital (tasa fija)", "%", PCT, True, 0.15, ""),
    ("din.capital", "Capital disponible", "MDP", MDP, True, None, "Se usa primero; lo demás es banco o respaldo."),
    ("din.tiie", "TIIE de referencia", "%", PCT, True, None, ""),
    ("din.sobretasa", "Sobretasa del banco", "%", PCT, True, 0.045, ""),
    ("din.apertura", "Comisión de apertura del banco", "%", PCT, True, 0.025, ""),
    ("din.banco_pct_obra", "Banco: tope sobre obra directa", "%", PCT, True, 0.55, ""),
    ("din.banco_pct_costo", "Banco: tope sobre costo total con terreno", "%", PCT, True, 0.4, ""),
    ("din.banco_pct_ventas", "Banco: tope sobre ventas", "%", PCT, True, 0.65, ""),
    ("din.caja_pct", "Caja mínima desde el arranque de obra (% del costo sin tierra)", "%", PCT, True, 0.05, ""),
    ("din.preventa_minima", "Preventa mínima para arrancar obra", "%", PCT, False, 0.35, "Guía de mercado."),
]

DATO_FILA = {}


def _filas_datos():
    fila = 5
    for item in DATOS:
        if item[0] != "§":
            DATO_FILA[item[0]] = fila
        fila += 1


_filas_datos()


def hoja_datos(wb, plan):
    ws = wb.create_sheet("Datos")
    celda(ws, "A1", "Datos del plan: cada cifra con su estado y su fuente", F_TITULO)
    celda(ws, "A2", "Lo amarillo se captura. Un dato sin fuente es un supuesto. Cambiar un dato aquí cambia todas las versiones que lo usan.", F_SUB)
    enc = ["clave", "Concepto", "Valor", "Unidad", "Estado", "Fuente", "Fecha", "Quién", "Pregunta", "Nota", "¿Se necesita para calcular?"]
    for i, t in enumerate(enc):
        celda(ws, f"{L(i + 1)}4", t, F_ENCABEZADO).border = BORDE
    fila = 5
    for item in DATOS:
        if item[0] == "§":
            seccion(ws, fila, item[1], "K")
            fila += 1
            continue
        clave, concepto, unidad, fmt, req, defecto, nota = item
        DATO_FILA[clave] = fila
        celda(ws, f"A{fila}", clave, Font(name="Arial", size=9, color=GRIS))
        celda(ws, f"B{fila}", concepto)
        celda(ws, f"D{fila}", unidad, Font(name="Arial", size=9, color=GRIS))
        celda(ws, f"J{fila}", nota, Font(name="Arial", size=9, color=GRIS), align=ENVOLVER)
        celda(ws, f"K{fila}", "sí" if req else "no", Font(name="Arial", size=9, color=GRIS))
        fila += 1
    ultima = fila - 1
    # valores: primero la plantilla, después lo que traiga el plan
    for item in DATOS:
        if item[0] == "§":
            continue
        clave, concepto, unidad, fmt, req, defecto, nota = item
        r = DATO_FILA[clave]
        valor = defecto
        estado = "supuesto" if defecto is not None else ("falta" if req else "")
        fuente = "Referencia del oficio (plantilla PPP 2)" if defecto is not None else ""
        quien, fecha, pregunta = "", "", ""
        d = (plan or {}).get("datos", {}).get(clave)
        if d is not None:
            valor = d.get("valor", valor)
            estado = d.get("estado", estado)
            fuente = d.get("fuente", fuente)
            quien = d.get("quien", "")
            fecha = d.get("fecha", "")
            pregunta = d.get("pregunta", "")
            if d.get("nota"):
                ws[f"J{r}"].value = d["nota"]
        if valor == "=OBRA":
            valor = obra_derivada()
            estado = estado if d is not None else "derivado"
            fuente = fuente if d is not None else "Derivado de la lámina"
        celda(ws, f"C{r}", valor, fmt=fmt, fill=FILL_DATO)
        celda(ws, f"E{r}", estado, fill=FILL_DATO)
        celda(ws, f"F{r}", fuente, fill=FILL_DATO, align=ENVOLVER)
        celda(ws, f"G{r}", fecha, fill=FILL_DATO)
        celda(ws, f"H{r}", quien, fill=FILL_DATO)
        celda(ws, f"I{r}", pregunta, fill=FILL_DATO)
    lista(ws, f"E5:E{ultima}", ESTADOS_DATO)
    ws.conditional_formatting.add(f"E5:E{ultima}", CellIsRule(operator="equal", formula=['"en conflicto"'], font=Font(color=ROJO, bold=True)))
    ws.conditional_formatting.add(f"E5:E{ultima}", CellIsRule(operator="equal", formula=['"falta"'], font=Font(color=ROJO)))
    ws.conditional_formatting.add(f"E5:E{ultima}", CellIsRule(operator="equal", formula=['"por confirmar"'], font=Font(color=ORO)))
    ws.conditional_formatting.add(f"E5:E{ultima}", CellIsRule(operator="equal", formula=['"confirmado"'], font=Font(color=VERDE)))
    anchos(ws, {"A": 22, "B": 46, "C": 14, "D": 8, "E": 14, "F": 52, "G": 11, "H": 18, "I": 10, "J": 40, "K": 10})
    ws.freeze_panes = "C5"
    return ws


def D(clave):
    return f"Datos!$C${DATO_FILA[clave]}"


def obra_derivada():
    return ("=IFERROR(({ct}-{t}-{com}*{v}-{ci}*{t})/(1+{ind}+{imp}),\"\")").format(
        ct=D("lamina.costo_total"), t=D("tierra.valor"), com=D("costo.comision"), v=D("lamina.ventas"),
        ci=D("costo.cierre"), ind=D("costo.indirectos"), imp=D("costo.imprevistos"))


# ---------------------------------------------------------------- Productos
PROD_FILA0 = 5  # primera fila de producto


def hoja_productos(wb, plan):
    ws = wb.create_sheet("Productos")
    celda(ws, "A1", "Productos: lo que se vende", F_TITULO)
    celda(ws, "A2", "Hasta seis productos. Las ventas y el precio por unidad se calculan; lo amarillo se captura.", F_SUB)
    enc = ["Producto", "Unidades", "m² vendibles", "Precio $/m²", "Ventas MDP", "Precio por unidad MDP", "% pagado durante la obra (base)", "Estado", "Fuente"]
    for i, t in enumerate(enc):
        celda(ws, f"{L(i + 1)}4", t, F_ENCABEZADO, align=ENVOLVER).border = BORDE
    prods = (plan or {}).get("productos", [])
    for i in range(NP):
        r = PROD_FILA0 + i
        p = prods[i] if i < len(prods) else {}
        precio = p.get("precio_m2")
        if isinstance(precio, str) and precio.startswith("=CUADRAR"):
            # precio que cuadra las ventas de la lámina: lámina menos los otros productos
            otros = "-".join(f"C{PROD_FILA0 + j}*D{PROD_FILA0 + j}" for j in range(NP) if j != i)
            precio = f"=IFERROR(({D('lamina.ventas')}*1000000-{otros})/C{r},\"\")"
        celda(ws, f"A{r}", p.get("nombre"), fill=FILL_DATO)
        celda(ws, f"B{r}", p.get("unidades"), fmt=ENT, fill=FILL_DATO)
        celda(ws, f"C{r}", p.get("m2"), fmt=ENT, fill=FILL_DATO)
        celda(ws, f"D{r}", precio, fmt=ENT, fill=FILL_DATO)
        celda(ws, f"E{r}", f"=IFERROR(N(C{r})*N(D{r})/1000000,0)", fmt=MDP)
        celda(ws, f"F{r}", f"=IFERROR(E{r}/B{r},0)", fmt='#,##0.00')
        celda(ws, f"G{r}", p.get("durante_obra", 0), fmt=PCT, fill=FILL_DATO)
        celda(ws, f"H{r}", p.get("estado", ""), fill=FILL_DATO)
        celda(ws, f"I{r}", p.get("fuente", ""), fill=FILL_DATO, align=ENVOLVER)
    t = PROD_FILA0 + NP
    celda(ws, f"A{t}", "Total", F_ENCABEZADO)
    celda(ws, f"B{t}", f"=SUM(B{PROD_FILA0}:B{t - 1})", F_ENCABEZADO, fmt=ENT)
    celda(ws, f"C{t}", f"=SUM(C{PROD_FILA0}:C{t - 1})", F_ENCABEZADO, fmt=ENT)
    celda(ws, f"E{t}", f"=SUM(E{PROD_FILA0}:E{t - 1})", F_ENCABEZADO, fmt=MDP)
    celda(ws, f"A{t + 2}", "Cuadre con la lámina (ventas de la lámina menos ventas de los productos)", F_SUB)
    celda(ws, f"E{t + 2}", f"=IFERROR({D('lamina.ventas')}-E{t},\"\")", fmt=MDP)
    lista(ws, f"H{PROD_FILA0}:H{t - 1}", ESTADOS_DATO)
    anchos(ws, {"A": 26, "B": 10, "C": 12, "D": 12, "E": 12, "F": 12, "G": 14, "H": 14, "I": 46})
    ws.freeze_panes = "B5"
    return ws


PT = PROD_FILA0 + NP  # fila del total de productos

# ---------------------------------------------------------------- Modelo
VERS = [("E", "Flujo V1"), ("F", "Flujo V2"), ("G", "Flujo V3"), ("H", "Flujo prueba")]
# (clave, concepto, unidad, formato, base en la columna D)
PALANCAS = [
    ("§", "Precio y costo"),
    ("tierra", "Valor de la tierra", "MDP", MDP, D("tierra.valor")),
    ("ajuste_precio", "Ajuste de precio sobre la lista", "%", PCT, 0),
    ("ajuste_obra", "Ajuste del costo de obra", "%", PCT, 0),
    ("indirectos", "Indirectos sobre obra directa", "%", PCT, D("costo.indirectos")),
    ("imprevistos", "Imprevistos sobre obra directa", "%", PCT, D("costo.imprevistos")),
    ("comision", "Comisión sobre ventas", "%", PCT, D("costo.comision")),
    ("cierre", "Cierre sobre el valor de la tierra", "%", PCT, D("costo.cierre")),
    ("ind_predesarrollo", "Indirectos que se gastan en predesarrollo", "%", PCT, D("costo.ind_predesarrollo")),
    ("§", "Calendario"),
    ("predesarrollo", "Predesarrollo (meses)", "meses", ENT, D("cal.predesarrollo")),
    ("ventas_inicio", "Ventas: mes de inicio", "mes", ENT, D("cal.ventas_inicio")),
    ("ventas_meses", "Ventas: meses de comercialización", "meses", ENT, D("cal.ventas_meses")),
    ("obra_inicio", "Obra: mes de inicio", "mes", ENT, D("cal.obra_inicio")),
    ("obra_duracion", "Obra: duración (meses)", "meses", ENT, D("cal.obra_duracion")),
    ("campana", "Curva de obra: desviación", "%", PCT, D("cal.campana")),
    ("§", "Cobranza"),
    ("enganche", "Enganche al firmar", "%", PCT, D("cob.enganche")),
    ("individualizar", "Avance para individualizar (100% = obra terminada)", "%", PCT, D("cob.individualizar")),
    ("meses_saldos", "Meses para cobrar saldos al individualizar", "meses", ENT, D("cob.meses_saldos")),
    ("saldo_posterior", "Lo firmado después paga el saldo a los (meses)", "meses", ENT, D("cob.saldo_posterior")),
] + [
    (f"durante_obra_{i + 1}", f"% pagado durante la obra · producto {i + 1}", "%", PCT, f"Productos!$G${PROD_FILA0 + i}")
    for i in range(NP)
] + [
    ("§", "Dinero"),
    ("tasa_capital", "Rendimiento anual del capital", "%", PCT, D("din.tasa_capital")),
    ("capital", "Capital", "MDP", MDP, D("din.capital")),
    ("usa_banco", "¿Usa crédito del banco? (1 sí, 0 no)", "1/0", ENT, 1),
    ("devolver_con_obra", "¿El capital espera a que termine la obra para salir? (1 sí, 0 sale en cuanto sobra dinero)", "1/0", ENT, 1),
    ("tiie", "TIIE", "%", PCT, D("din.tiie")),
    ("sobretasa", "Sobretasa", "%", PCT, D("din.sobretasa")),
    ("apertura", "Comisión de apertura", "%", PCT, D("din.apertura")),
    ("banco_pct_obra", "Banco: tope sobre obra directa", "%", PCT, D("din.banco_pct_obra")),
    ("banco_pct_costo", "Banco: tope sobre costo con terreno", "%", PCT, D("din.banco_pct_costo")),
    ("banco_pct_ventas", "Banco: tope sobre ventas", "%", PCT, D("din.banco_pct_ventas")),
    ("caja_pct", "Caja mínima (% del costo sin tierra)", "%", PCT, D("din.caja_pct")),
    ("preventa_minima", "Preventa mínima para arrancar obra", "%", PCT, D("din.preventa_minima")),
]
DERIVADOS = [
    ("ventas", "Ventas", "MDP", MDP),
    ("comisiones", "Comisiones", "MDP", MDP),
    ("cierre_monto", "Cierre de tierra", "MDP", MDP),
    ("obra", "Obra directa", "MDP", MDP),
    ("indirectos_monto", "Indirectos", "MDP", MDP),
    ("imprevistos_monto", "Imprevistos", "MDP", MDP),
    ("costo_sin_tierra", "Costo sin tierra", "MDP", MDP),
    ("costo_con_tierra", "Costo con tierra", "MDP", MDP),
    ("fin_obra", "Obra: mes de terminación", "mes", ENT),
    ("mes_saldos", "Mes desde el que se cobran los saldos", "mes", ENT),
    ("saldos_individualizar", "Saldos por cobrar al individualizar", "MDP", MDP),
    ("tasa_banco", "Tasa del banco", "%", PCT),
    ("tope_banco", "Línea del banco", "MDP", MDP),
    ("caja_minima", "Caja mínima", "MDP", MDP),
    ("preventa_inicio", "Preventa firmada al arrancar la obra", "%", PCT),
    ("aportacion", "Tierra más capital entre costo con tierra", "%", PCT),
] + [(f"precio_u_{i + 1}", f"Precio por unidad · producto {i + 1}", "MDP", '#,##0.00') for i in range(NP)] \
  + [(f"firmadas_{i + 1}", f"Firmadas antes de los saldos · producto {i + 1}", "unidades", ENT) for i in range(NP)]

MOD_FILA = {}


def M(clave, col):
    return f"Modelo!${col}${MOD_FILA[clave]}"


def hoja_modelo(wb, plan):
    ws = wb.create_sheet("Modelo")
    celda(ws, "A1", "Modelo: las palancas de cada versión", F_TITULO)
    celda(ws, "A2", "La columna Datos sale de las pestañas Datos y Productos. Cada versión copia la base salvo donde se escribe otra cifra (azul). La columna Prueba sirve para pruebas de estrés y se restablece sola.", F_SUB)
    enc = ["clave", "Concepto", "Unidad", "Datos (base)", "V1", "V2", "V3", "Prueba", "De dónde sale", "Cambia en V1", "Cambia en V2", "Cambia en V3"]
    for i, t in enumerate(enc):
        celda(ws, f"{L(i + 1)}4", t, F_ENCABEZADO).border = BORDE
    celda(ws, "B5", "Nombre de la versión", F_ENCABEZADO)
    celda(ws, "D5", "Datos", F_ENCABEZADO)
    for k, (col, _) in enumerate(VERS[:3]):
        celda(ws, f"{col}5", f"=Versiones!{L(3 + k)}5", F_ENCABEZADO)
    celda(ws, "H5", "Prueba", F_ENCABEZADO)
    fila = 7
    for item in PALANCAS:
        if item[0] == "§":
            seccion(ws, fila, item[1], "L")
            fila += 1
            continue
        MOD_FILA[item[0]] = fila
        fila += 1
    fila += 1
    seccion(ws, fila, "Calculado por versión (no se captura)", "L")
    fila += 1
    for item in DERIVADOS:
        MOD_FILA[item[0]] = fila
        fila += 1
    ultima = fila - 1
    over = (plan or {}).get("versiones", [{}, {}, {}])
    # palancas
    for item in PALANCAS:
        if item[0] == "§":
            continue
        clave, concepto, unidad, fmt, base = item
        r = MOD_FILA[clave]
        celda(ws, f"A{r}", clave, Font(name="Arial", size=9, color=GRIS))
        celda(ws, f"B{r}", concepto)
        celda(ws, f"C{r}", unidad, Font(name="Arial", size=9, color=GRIS))
        celda(ws, f"D{r}", base if isinstance(base, (int, float)) else f"={base}", fmt=fmt,
              fill=FILL_DATO if isinstance(base, (int, float)) else None)
        celda(ws, f"I{r}", "palanca" if isinstance(base, (int, float)) else base.replace("$", ""), Font(name="Arial", size=9, color=GRIS))
        for k, (col, _) in enumerate(VERS[:3]):
            ov = (over[k] if k < len(over) else {}).get("palancas", {})
            if clave in ov:
                celda(ws, f"{col}{r}", ov[clave], fmt=fmt, fill=FILL_PALANCA)
            else:
                celda(ws, f"{col}{r}", f"=$D{r}", fmt=fmt)
            celda(ws, f"{L(10 + k)}{r}", f"=IF({col}{r}<>$D{r},\"cambia\",\"\")", Font(name="Arial", size=9, color=AZUL))
        celda(ws, f"H{r}", f"=INDEX($E{r}:$G{r},1,Pruebas!$B$4)", fmt=fmt)
    # derivados por versión
    for item in DERIVADOS:
        clave, concepto, unidad, fmt = item
        r = MOD_FILA[clave]
        celda(ws, f"A{r}", clave, Font(name="Arial", size=9, color=GRIS))
        celda(ws, f"B{r}", concepto)
        celda(ws, f"C{r}", unidad, Font(name="Arial", size=9, color=GRIS))
        for col, flujo in VERS:
            celda(ws, f"{col}{r}", derivado(clave, col, flujo), fmt=fmt)
    anchos(ws, {"A": 20, "B": 48, "C": 8, "D": 13, "E": 13, "F": 13, "G": 13, "H": 13, "I": 28, "J": 10, "K": 10, "L": 10})
    ws.freeze_panes = "E6"
    return ws


def derivado(clave, col, flujo):
    P = lambda k: f"{col}{MOD_FILA[k]}"
    F = f"'{flujo}'"
    if clave == "ventas":
        return f"=Productos!$E${PT}*(1+{P('ajuste_precio')})"
    if clave == "comisiones":
        return f"={P('comision')}*{P('ventas')}"
    if clave == "cierre_monto":
        return f"={P('cierre')}*{P('tierra')}"
    if clave == "obra":
        return f"=IFERROR({D('costo.obra_directa')}*(1+{P('ajuste_obra')}),\"\")"
    if clave == "indirectos_monto":
        return f"=IFERROR({P('indirectos')}*{P('obra')},\"\")"
    if clave == "imprevistos_monto":
        return f"=IFERROR({P('imprevistos')}*{P('obra')},\"\")"
    if clave == "costo_sin_tierra":
        return f"=IFERROR({P('obra')}+{P('indirectos_monto')}+{P('imprevistos_monto')}+{P('comisiones')}+{P('cierre_monto')},\"\")"
    if clave == "costo_con_tierra":
        return f"=IFERROR({P('costo_sin_tierra')}+{P('tierra')},\"\")"
    if clave == "fin_obra":
        return f"={P('obra_inicio')}+{P('obra_duracion')}-1"
    if clave == "mes_saldos":
        return (f"=IFERROR(IF({P('individualizar')}>=1,{P('fin_obra')},"
                f"MATCH({P('individualizar')}*{P('obra')},{F}!$C$20:${ULT}$20,1)+1),\"\")")
    if clave == "saldos_individualizar":
        pu = f"{col}{MOD_FILA['precio_u_1']}:{col}{MOD_FILA[f'precio_u_{NP}']}"
        fi = f"{col}{MOD_FILA['firmadas_1']}:{col}{MOD_FILA[f'firmadas_{NP}']}"
        return f"=IFERROR((1-{P('enganche')})*SUMPRODUCT({pu},{fi})-{F}!$B$15,\"\")"
    if clave == "tasa_banco":
        return f"=N({P('tiie')})+N({P('sobretasa')})"
    if clave == "tope_banco":
        return (f"=IFERROR({P('usa_banco')}*MIN({P('banco_pct_obra')}*{P('obra')},"
                f"{P('banco_pct_costo')}*{P('costo_con_tierra')},{P('banco_pct_ventas')}*{P('ventas')}),\"\")")
    if clave == "caja_minima":
        return f"=IFERROR({P('caja_pct')}*{P('costo_sin_tierra')},\"\")"
    if clave == "preventa_inicio":
        return (f"=IFERROR(SUMIF({F}!$C$3:${ULT}$3,\"<\"&{P('obra_inicio')},{F}!$C$11:${ULT}$11)"
                f"/Productos!$B${PT},\"\")")
    if clave == "aportacion":
        return f"=IFERROR(({P('tierra')}+{P('capital')})/{P('costo_con_tierra')},\"\")"
    if clave.startswith("precio_u_"):
        i = int(clave.rsplit("_", 1)[1]) - 1
        return f"=IFERROR(Productos!$F${PROD_FILA0 + i}*(1+{P('ajuste_precio')}),0)"
    if clave.startswith("firmadas_"):
        i = int(clave.rsplit("_", 1)[1]) - 1
        r = 5 + i
        return (f"=IFERROR(SUMIF({F}!$C$3:${ULT}$3,\"<=\"&{P('mes_saldos')},"
                f"{F}!$C${r}:${ULT}${r}),0)")
    raise KeyError(clave)


# ---------------------------------------------------------------- Flujo
ETIQUETAS = {
    4: ("§", "UNIDADES QUE SE FIRMAN"),
    11: ("Total de unidades firmadas", "SUM"),
    12: ("§", "COBRANZA: DINERO QUE ENTRA"),
    13: ("Enganches al firmar", "SUM"),
    14: ("Saldos al escriturar", "SUM"),
    15: ("Pagos durante la obra", "SUM"),
    16: ("Cobranza total", "SUM"),
    17: ("§", "EGRESOS: DINERO QUE SALE"),
    18: ("Curva de obra (peso del mes)", None),
    19: ("Obra directa", "SUM"),
    20: ("Obra acumulada", None),
    21: ("Indirectos", "SUM"),
    22: ("Imprevistos", "SUM"),
    23: ("Comisiones", "SUM"),
    24: ("Cierre de tierra", "SUM"),
    25: ("Egresos totales", "SUM"),
    26: ("§", "DINERO: CAPITAL, BANCO Y RESPALDO"),
    27: ("Avance de obra acumulado", None),
    28: ("Caja mínima exigida en el mes", "MAX"),
    29: ("Banco: interés del mes (se paga en efectivo)", "SUM"),
    30: ("Falta (+) o sobra (-) en el mes, antes de dinero nuevo", None),
    31: ("Capital: aportación del mes", "SUM"),
    32: ("Capital aportado acumulado", "MAX"),
    33: ("Banco: tope disponible según el avance del mes anterior", "MAX"),
    34: ("Banco: comisión de apertura (al primer desembolso)", "SUM"),
    35: ("Banco: disposición del mes", "SUM"),
    36: ("Banco: dispuesto acumulado", "MAX"),
    37: ("Respaldo: lo que faltaría (debe ser cero)", "SUM"),
    38: ("Banco: pago del mes", "SUM"),
    39: ("Respaldo: pago", "SUM"),
    40: ("Capital: pago con su rendimiento (después del banco, obra terminada)", "SUM"),
    41: ("Saldo del banco al cierre del mes", "MAX"),
    42: ("Saldo del capital con su rendimiento", "MAX"),
    43: ("Saldo del respaldo", "MAX"),
    44: ("Rendimiento del capital devengado en el mes", "SUM"),
    45: ("Caja del proyecto al cierre del mes", "ULT"),
    46: ("nota", "Los totales de las filas de saldo son el máximo del periodo; el de la caja es el cierre del último mes."),
    47: ("§", "FLUJO DE CAJA"),
    48: ("Flujo neto del mes (cobranza - egresos - interés y apertura)", "SUM"),
    49: ("Flujo acumulado antes de pagar la tierra", "ULT"),
    50: ("Comprobación: cambio de caja menos flujo y dinero (debe ser cero)", "ABS"),
    51: ("Por cobrar de contratos ya firmados", "MAX"),
    52: ("Cobertura: por cobrar firmado entre saldo del banco (veces)", "MIN"),
    53: ("§", "PAGOS DURANTE LA OBRA"),
    54: ("Mensualidad que generan las firmas del mes", None),
    56: ("§", "INDICADORES (para el resumen)"),
    57: ("Dinero ajeno en uso (banco + capital aportado + respaldo)", "MAX"),
    58: ("Mes con saldo del banco (el total es el mes en que se liquida)", "LIQ"),
    59: ("Mes con saldo del capital (el total es el mes en que se liquida)", "LIQ"),
    60: ("Mes con cobranza", "MAX"),
    61: ("Mes con banco dispuesto", "MIN"),
    62: ("Mes con saldo del respaldo (el total es el mes en que se liquida)", "LIQ"),
}


def hoja_flujo(wb, titulo, col, num):
    ws = wb.create_sheet(titulo)
    P = lambda k: f"Modelo!${col}${MOD_FILA[k]}"
    pu = f"Modelo!${col}${MOD_FILA['precio_u_1']}:${col}${MOD_FILA[f'precio_u_{NP}']}"
    do = f"Modelo!${col}${MOD_FILA['durante_obra_1']}:${col}${MOD_FILA[f'durante_obra_{NP}']}"
    nombre = f"=\"{titulo} · \"&Modelo!{col}5" if num else f"=\"{titulo}\""
    celda(ws, "A1", nombre, F_TITULO)
    celda(ws, "A2", "Cifras en millones de pesos (MDP). Todo se calcula con las palancas de la pestaña Modelo; aquí no se captura nada.", F_SUB)
    celda(ws, "A3", "Mes", F_ENCABEZADO)
    celda(ws, "B3", "Total", F_ENCABEZADO)
    for m in range(1, MESES + 1):
        celda(ws, f"{MC(m)}3", m, F_ENCABEZADO, fmt=ENT)
    for fila, (et, tot) in ETIQUETAS.items():
        if et == "§":
            seccion(ws, fila, tot, ULT)
        elif et == "nota":
            celda(ws, f"A{fila}", tot, F_SUB)
        else:
            celda(ws, f"A{fila}", et)
    for i in range(NP):
        r = 5 + i
        celda(ws, f"A{r}", f"=IF(Productos!$A${PROD_FILA0 + i}=\"\",\"(producto {i + 1} sin capturar)\",Productos!$A${PROD_FILA0 + i})")
        ws[f"B{r}"] = f"=SUM(C{r}:{ULT}{r})"
    # totales
    for fila, (et, tot) in ETIQUETAS.items():
        if et in ("§", "nota") or tot is None:
            continue
        rng = f"C{fila}:{ULT}{fila}"
        f = {"SUM": f"=SUM({rng})", "MAX": f"=MAX({rng})", "MIN": f"=MIN({rng})", "ULT": f"={ULT}{fila}",
             "ABS": f"=SUMPRODUCT(ABS({rng}))", "LIQ": f"=IF(MAX({rng})=0,\"\",MAX({rng})+1)"}[tot]
        if fila == 61:
            f = f"=IF(MIN({rng})>=999,\"\",MIN({rng}))"
        if fila == 52:
            f = f"=IF(COUNT({rng})=0,\"\",MIN({rng}))"
        celda(ws, f"B{fila}", f, F_ENCABEZADO)
    tiny = "1/1000000"
    for m in range(1, MESES + 1):
        c = MC(m)
        p = MC(m - 1) if m > 1 else None
        f = {}
        U_ini, U_mes = P("ventas_inicio"), P("ventas_meses")
        for i in range(NP):
            U = f"Productos!$B${PROD_FILA0 + i}"
            f[5 + i] = (f"=ROUND(N({U})*MIN(MAX({c}$3-{U_ini}+1,0),{U_mes})/{U_mes},0)"
                        f"-ROUND(N({U})*MIN(MAX({c}$3-{U_ini},0),{U_mes})/{U_mes},0)")
        f[11] = f"=SUM({c}5:{c}10)"
        f[13] = f"={P('enganche')}*SUMPRODUCT({pu},{c}5:{c}10)"
        B49, B21, B22, B50, B19 = P("mes_saldos"), P("meses_saldos"), P("saldo_posterior"), P("saldos_individualizar"), P("enganche")
        terms = "+".join(f"Modelo!${col}${MOD_FILA[f'precio_u_{i + 1}']}*INDEX($C{5 + i}:${ULT}{5 + i},1,{c}$3-{B22})" for i in range(NP))
        f[14] = (f"=IF(AND({c}$3>{B49},{c}$3<={B49}+{B21}),{B50}/{B21},0)"
                 f"+IF({c}$3-{B22}>{B49},(1-{B19})*({terms}),0)")
        f[15] = "=0" if m == 1 else f"=IF({c}$3<={B49},SUM($C$54:{p}54),0)"
        f[16] = f"={c}13+{c}14+{c}15"
        B11, B12, B13 = P("obra_inicio"), P("obra_duracion"), P("campana")
        f[18] = (f"=IF(AND({c}$3>={B11},{c}$3<={B11}+{B12}-1),"
                 f"EXP(-0.5*(({c}$3-({B11}+({B12}-1)/2))/({B13}*{B12}))^2),0)")
        B45, B46, B47, B16, B29 = P("obra"), P("indirectos_monto"), P("imprevistos_monto"), P("predesarrollo"), P("ind_predesarrollo")
        f[19] = f"={B45}*{c}18/SUM($C$18:${ULT}$18)"
        f[20] = f"={c}19" if m == 1 else f"={p}20+{c}19"
        f[21] = f"=IF({c}$3<={B16},{B29}*{B46}/{B16},0)+(1-{B29})*{B46}*{c}19/{B45}"
        f[22] = f"={B47}*{c}19/{B45}"
        f[23] = f"={P('comision')}*{c}16"
        f[24] = f"=IF({c}$3=1,{P('cierre_monto')},0)"
        f[25] = f"={c}19+{c}21+{c}22+{c}23+{c}24"
        f[27] = f"={c}20/{B45}"
        f[28] = f"=IF({c}$3>={B11},{P('caja_minima')},0)"
        B55, B33, B60, B56, B32, B63 = P("tasa_banco"), P("capital"), P("tope_banco"), P("apertura"), P("tasa_capital"), P("fin_obra")
        if m == 1:
            f[29] = "=0"
            f[30] = f"={c}25+{c}29-{c}16+{c}28"
            f[31] = f"=MAX(0,MIN({c}30,{B33}))"
            f[32] = f"={c}31"
            f[33] = "=0"
            f[34] = "=0"
            f[35] = "=0"
            f[36] = f"={c}35"
            f[38] = "=0"
            f[39] = "=0"
            f[40] = "=0"
            f[41] = f"={c}35-{c}38"
            f[42] = f"={c}31-{c}40"
            f[43] = f"={c}37-{c}39"
            f[44] = "=0"
            f[49] = f"={c}48"
            f[50] = f"={c}45-({c}48+{c}31+{c}35+{c}37-{c}38-{c}39-{c}40)"
            f[51] = f"=SUMPRODUCT({pu},{c}5:{c}10)-{c}16"
        else:
            f[29] = f"={p}41*{B55}/12"
            f[30] = f"={c}25+{c}29-{c}16-{p}45+{c}28"
            f[31] = f"=MAX(0,MIN({c}30,{B33}-{p}32))"
            f[32] = f"={p}32+{c}31"
            f[33] = f"={B60}*{p}27"
            f[34] = f"=IF(AND({c}30-{c}31>0,{c}33-{p}36>0,{p}36=0),{B56}*{B60},0)"
            f[35] = f"=MIN(MAX(0,{c}30-{c}31)+{c}34,MAX(0,{c}33-{p}36))"
            f[36] = f"={p}36+{c}35"
            f[38] = f"=MIN(MAX(0,-{c}30),{p}41)"
            espera = f"OR({P('devolver_con_obra')}=0,{c}$3>{B63})"
            f[39] = (f"=IF(AND({p}41-{c}38<={tiny},{espera}),"
                     f"MIN(MAX(0,-{c}30)-{c}38,{p}43*(1+{B32}/12)),0)")
            f[40] = (f"=IF(AND({p}41-{c}38<={tiny},{espera}),"
                     f"MIN(MAX(0,-{c}30)-{c}38-{c}39,{p}42*(1+{B32}/12)),0)")
            f[41] = f"={p}41+{c}35-{c}38"
            f[42] = f"={p}42*(1+{B32}/12)+{c}31-{c}40"
            f[43] = f"={p}43*(1+{B32}/12)+{c}37-{c}39"
            f[44] = f"=({p}42+{p}43)*{B32}/12"
            f[49] = f"={p}49+{c}48"
            f[50] = f"={c}45-{p}45-({c}48+{c}31+{c}35+{c}37-{c}38-{c}39-{c}40)"
            f[51] = f"={p}51+SUMPRODUCT({pu},{c}5:{c}10)-{c}16"
        f[37] = f"=MAX(0,{c}30-{c}31)+{c}34-{c}35"
        f[45] = f"={c}28+MAX(0,-{c}30)-{c}38-{c}39-{c}40"
        f[48] = f"={c}16-{c}25-{c}29-{c}34"
        f[52] = f"=IF({c}41>{tiny},{c}51/{c}41,\"\")"
        f[54] = f"=IF({c}$3<{B49},SUMPRODUCT({pu},{do},{c}5:{c}10)/({B49}-{c}$3),0)"
        f[57] = f"={c}41+{c}32+{c}43"
        f[58] = f"=IF({c}41>{tiny},{c}$3,0)"
        f[59] = f"=IF({c}42>{tiny},{c}$3,0)"
        f[62] = f"=IF({c}43>{tiny},{c}$3,0)"
        f[60] = f"=IF({c}16>{tiny},{c}$3,0)"
        f[61] = f"=IF({c}36>{tiny},{c}$3,999)"
        for fila, frm in f.items():
            fmt = ENT if fila in (5, 6, 7, 8, 9, 10, 11, 58, 59, 60, 61, 62) else (PCT if fila == 27 else ('0.000' if fila == 18 else ('0.00' if fila == 52 else MDP)))
            celda(ws, f"{c}{fila}", frm, fmt=fmt)
    for fila in range(5, 63):
        b = ws[f"B{fila}"]
        if b.value is not None:
            b.number_format = ENT if fila in (5, 6, 7, 8, 9, 10, 11, 58, 59, 60, 61, 62) else ('0.00' if fila == 52 else MDP)
    anchos(ws, {"A": 58, "B": 10})
    for m in range(1, MESES + 1):
        ws.column_dimensions[MC(m)].width = 8
    ws.freeze_panes = "C4"
    return ws


# ---------------------------------------------------------------- Versiones
VER_FILAS = [
    ("§", "QUÉ ES CADA VERSIÓN"),
    ("nombre", "Nombre", None, "dato"),
    ("estado", "Estado (base, propuesta, vigente, alterna, descartada)", None, "dato"),
    ("que_cambia", "Qué cambia", None, "dato"),
    ("propuesta_por", "Quién la propone", None, "dato"),
    ("aprobada_por", "Aprobada por (sólo Dirección)", None, "dato"),
    ("fecha_aprobacion", "Fecha de aprobación", None, "dato"),
    ("§", "LO QUE RECIBE EL DUEÑO (esquema elegido en Reparto)"),
    ("dueno_aporta", "El dueño aporta su tierra (MDP)", MDP, "tierra"),
    ("dueno_recibe", "El dueño recibe en total (MDP)", MDP, "dueno"),
    ("dueno_veces", "Veces el valor de su tierra", VECES, "veces"),
    ("dueno_meses", "En cuántos meses recibe lo último", ENT, "mes_reparto"),
    ("dueno_anos", "En años", '0.0', "anos"),
    ("alianza_recibe", "La alianza recibe (MDP)", MDP, "alianza"),
    ("inversion_recibe", "El capital recibe, rendimiento incluido (MDP)", MDP, "inversion"),
    ("§", "LO QUE NECESITA EL PROYECTO"),
    ("ventas", "Ventas (MDP)", MDP, "m:ventas"),
    ("costo_sin_tierra", "Costo sin tierra (MDP)", MDP, "m:costo_sin_tierra"),
    ("tierra", "Tierra (MDP)", MDP, "m:tierra"),
    ("obra_inicio", "Obra: mes de inicio", ENT, "m:obra_inicio"),
    ("fin_obra", "Obra: mes de terminación", ENT, "m:fin_obra"),
    ("mes_saldos", "Saldos se cobran desde el mes", ENT, "m:mes_saldos"),
    ("pagos_obra", "Pagos durante la obra (MDP)", MDP, "f:B15"),
    ("max_ajeno", "Máximo de dinero ajeno en uso (MDP)", MDP, "f:B57"),
    ("capital", "Capital aportado (MDP)", MDP, "f:B32"),
    ("banco_max", "Crédito del banco, saldo máximo (MDP)", MDP, "f:B41"),
    ("respaldo", "Respaldo que haría falta (MDP; debe ser cero)", MDP, "f:B43"),
    ("costo_dinero", "Costo del dinero: intereses, apertura y rendimientos (MDP)", MDP, "costo_dinero"),
    ("rend_capital", "Rendimiento pagado al capital (MDP)", MDP, "rend_capital"),
    ("caja_cierre", "Caja al cierre, ya pagados banco y capital, antes de la tierra (MDP)", MDP, "caja"),
    ("ganancia", "Ganancia real: después de la tierra, antes de impuestos (MDP)", MDP, "ganancia"),
    ("margen", "Ganancia real sobre ventas", PCT, "margen"),
    ("resultado_repartir", "Resultado a repartir antes de capital y tierra (MDP)", MDP, "repartir"),
    ("banco_mes", "Banco liquidado en el mes", ENT, "f:B58"),
    ("capital_mes", "Capital liquidado en el mes", ENT, "f:B59"),
    ("respaldo_mes", "Respaldo liquidado en el mes", ENT, "f:B62"),
    ("ultimo_cobro", "Último mes con cobranza", ENT, "f:B60"),
    ("mes_reparto", "Mes de reparto", ENT, "mes_reparto_calc"),
    ("§", "REVISIÓN PARA FONDOS (lo que revisa un comité de crédito)"),
    ("rv_linea_ventas", "Línea del banco entre ventas (65% o menos)", PCT, "rv1"),
    ("rv_linea_costo", "Línea del banco entre costo con terreno (50% o menos)", PCT, "rv2"),
    ("rv_aportacion", "Tierra más capital entre costo (25% o más; 20% justo)", PCT, "m:aportacion"),
    ("rv_preventa", "Preventa firmada al arrancar la obra (35% o más)", PCT, "m:preventa_inicio"),
    ("rv_preventa_banco", "Preventa firmada antes del primer desembolso (40% o más)", PCT, "rv5"),
    ("rv_cobertura", "Por cobrar firmado entre saldo del banco, mínimo (1.3 o más)", '0.00', "rv6"),
    ("rv_margen", "Margen antes de financiamiento sobre costo (20% o más)", PCT, "rv7"),
    ("rv_meses_credito", "Meses de crédito, del arranque de obra al pago (36 o menos)", ENT, "rv8"),
    ("rv_falta", "Dinero que faltaría (respaldo; debe ser cero)", MDP, "f:B37"),
    ("rv_resultado", "Resultado de la revisión", None, "rv_res"),
    ("§", "COMPROBACIONES"),
    ("ck_flujo", "El flujo cuadra (debe ser 0)", '0.000', "f:B50"),
    ("ck_cobranza", "Se cobra todo lo vendido (cobranza menos ventas; debe ser 0)", MDP, "ck_cob"),
    ("ck_unidades", "Se firman todas las unidades (debe ser 0)", ENT, "ck_uni"),
]
VER_FILA = {}


def V(clave, k):
    return f"Versiones!${L(3 + k)}${VER_FILA[clave]}"


def hoja_versiones(wb, plan):
    ws = wb.create_sheet("Versiones")
    celda(ws, "A1", "Versiones: maneras de hacer el mismo proyecto", F_TITULO)
    celda(ws, "A2", "Cada versión se calcula sola en su pestaña de flujo. Sólo Dirección vuelve vigente una versión; el autón y el equipo proponen.", F_SUB)
    for i, t in enumerate(["clave", "Concepto", "V1", "V2", "V3"]):
        celda(ws, f"{L(i + 1)}4", t, F_ENCABEZADO).border = BORDE
    fila = 5
    for item in VER_FILAS:
        if item[0] == "§":
            if fila > 5:
                fila += 1
            seccion(ws, fila, item[1], "E")
            fila += 1
            continue
        VER_FILA[item[0]] = fila
        fila += 1
    # la primera sección ocupa la fila 5; corrimos: nombre debe quedar en la fila 5 para Modelo!E5
    # (ajuste: si la primera fila de dato no es 5, Modelo lee el nombre desde VER_FILA)
    vers = (plan or {}).get("versiones", [{}, {}, {}])
    ROJO_F = Font(color=ROJO, bold=True)
    for item in VER_FILAS:
        if item[0] == "§":
            continue
        clave, concepto, fmt, kind = item
        r = VER_FILA[clave]
        celda(ws, f"A{r}", clave, Font(name="Arial", size=9, color=GRIS))
        celda(ws, f"B{r}", concepto, align=ENVOLVER)
        for k in range(3):
            col = L(3 + k)
            mc = VERS[k][0]
            fl = f"'{VERS[k][1]}'"
            v = vers[k] if k < len(vers) else {}
            Pm = lambda key: f"Modelo!${mc}${MOD_FILA[key]}"
            val = None
            if kind == "dato":
                defecto = {"nombre": f"Versión {k + 1}", "estado": "base" if k == 0 else "alterna"}.get(clave, "")
                celda(ws, f"{col}{r}", v.get(clave, defecto), fill=FILL_DATO, align=ENVOLVER)
                continue
            if kind.startswith("m:"):
                val = f"=IFERROR({Pm(kind[2:])},\"\")"
            elif kind.startswith("f:"):
                val = f"=IFERROR({fl}!{kind[2:]},\"\")"
            elif kind == "costo_dinero":
                val = f"=IFERROR({fl}!B29+{fl}!B34+({fl}!B40-{fl}!B31)+({fl}!B39-{fl}!B37),\"\")"
            elif kind == "rend_capital":
                val = f"=IFERROR({fl}!B40-{fl}!B31,\"\")"
            elif kind == "caja":
                val = f"=IFERROR({fl}!B45-{fl}!{ULT}41-{fl}!{ULT}42-{fl}!{ULT}43,\"\")"
            elif kind == "ganancia":
                val = f"=IFERROR({col}{VER_FILA['caja_cierre']}-{Pm('tierra')},\"\")"
            elif kind == "margen":
                val = f"=IFERROR({col}{VER_FILA['ganancia']}/{col}{VER_FILA['ventas']},\"\")"
            elif kind == "repartir":
                val = f"=IFERROR({col}{VER_FILA['caja_cierre']}+{col}{VER_FILA['rend_capital']},\"\")"
            elif kind == "mes_reparto_calc":
                bm, cm, rm, uc = (f"{col}{VER_FILA[x]}" for x in ("banco_mes", "capital_mes", "respaldo_mes", "ultimo_cobro"))
                val = (f"=IFERROR(MAX(IF(ISNUMBER({bm}),{bm},0),IF(ISNUMBER({cm}),{cm},0),"
                       f"IF(ISNUMBER({rm}),{rm},0),N({uc})),\"\")")
            elif kind == "tierra":
                val = f"=IFERROR({Pm('tierra')},\"\")"
            elif kind in ("dueno", "alianza", "inversion", "veces"):
                val = None  # se escribe cuando ya existe la pestaña Reparto
            elif kind == "mes_reparto":
                val = f"={col}{VER_FILA['mes_reparto']}"
            elif kind == "anos":
                val = f"=IFERROR({col}{VER_FILA['mes_reparto']}/12,\"\")"
            elif kind == "rv1":
                val = f"=IF({Pm('usa_banco')}=0,\"sin banco\",IFERROR({Pm('tope_banco')}/{Pm('ventas')},\"\"))"
            elif kind == "rv2":
                val = f"=IF({Pm('usa_banco')}=0,\"sin banco\",IFERROR({Pm('tope_banco')}/{Pm('costo_con_tierra')},\"\"))"
            elif kind == "rv5":
                val = (f"=IF({Pm('usa_banco')}=0,\"sin banco\",IFERROR(SUMIF({fl}!$C$3:${ULT}$3,\"<\"&{fl}!$B$61,"
                       f"{fl}!$C$11:${ULT}$11)/Productos!$B${PT},\"\"))")
            elif kind == "rv6":
                val = f"=IF({Pm('usa_banco')}=0,\"sin banco\",IFERROR({fl}!B52,\"\"))"
            elif kind == "rv7":
                val = f"=IFERROR(({Pm('ventas')}-{Pm('costo_con_tierra')})/{Pm('costo_con_tierra')},\"\")"
            elif kind == "rv8":
                val = (f"=IF({Pm('usa_banco')}=0,\"sin banco\",IFERROR({col}{VER_FILA['banco_mes']}"
                       f"-{Pm('obra_inicio')},\"\"))")
            elif kind == "rv_res":
                val = revision_formula(col)
            elif kind == "ck_cob":
                val = f"=IFERROR({fl}!B16-{Pm('ventas')},\"\")"
            elif kind == "ck_uni":
                val = f"=IFERROR({fl}!B11-Productos!$B${PT},\"\")"
            celda(ws, f"{col}{r}", val, fmt=fmt)
    lista(ws, f"C{VER_FILA['estado']}:E{VER_FILA['estado']}", ESTADOS_VERSION)
    ws.conditional_formatting.add(f"C{VER_FILA['estado']}:E{VER_FILA['estado']}",
                                  CellIsRule(operator="equal", formula=['"vigente"'], font=Font(color=VERDE, bold=True)))
    ws.conditional_formatting.add(f"C{VER_FILA['estado']}:E{VER_FILA['estado']}",
                                  CellIsRule(operator="equal", formula=['"propuesta"'], font=Font(color=AZUL, bold=True)))
    ws.conditional_formatting.add(f"C{VER_FILA['rv_resultado']}:E{VER_FILA['rv_resultado']}",
                                  FormulaRule(formula=[f'LEFT(C{VER_FILA["rv_resultado"]},4)="Pasa"'], font=Font(color=VERDE, bold=True)))
    ws.conditional_formatting.add(f"C{VER_FILA['rv_resultado']}:E{VER_FILA['rv_resultado']}",
                                  FormulaRule(formula=[f'LEFT(C{VER_FILA["rv_resultado"]},2)="No"'], font=ROJO_F))
    for clave in ("dueno_recibe", "dueno_meses", "ganancia"):
        for k in range(3):
            ws[f"{L(3 + k)}{VER_FILA[clave]}"].font = Font(name="Arial", size=11, bold=True, color=TINTA)
    anchos(ws, {"A": 18, "B": 58, "C": 22, "D": 22, "E": 22})
    ws.freeze_panes = "C5"
    return ws


def revision_formula(col):
    g = lambda c: f"{col}{VER_FILA[c]}"
    pruebas = [
        f"IF(ISNUMBER({g('rv_linea_ventas')}),IF({g('rv_linea_ventas')}<=0.65,0,1),0)",
        f"IF(ISNUMBER({g('rv_linea_costo')}),IF({g('rv_linea_costo')}<=0.5,0,1),0)",
        f"IF({g('rv_aportacion')}>=0.2,0,1)",
        f"IF({g('rv_preventa')}>=0.35,0,1)",
        f"IF(ISNUMBER({g('rv_preventa_banco')}),IF({g('rv_preventa_banco')}>=0.4,0,1),0)",
        f"IF(ISNUMBER({g('rv_cobertura')}),IF({g('rv_cobertura')}>=1.3,0,1),0)",
        f"IF({g('rv_margen')}>=0.2,0,1)",
        f"IF(ISNUMBER({g('rv_meses_credito')}),IF({g('rv_meses_credito')}<=36,0,1),0)",
        f"IF({g('rv_falta')}<0.01,0,1)",
    ]
    fallas = "+".join(pruebas)
    return (f"=IFERROR(IF(NOT(ISNUMBER({g('ganancia')})),\"Falta calcular\",IF(({fallas})=0,IF({g('rv_aportacion')}<0.25,\"Pasa (aportación justa)\",\"Pasa\"),"
            f"\"No pasa: \"&({fallas})&\" de 9 pruebas\")),\"Falta calcular\")")


# ---------------------------------------------------------------- Reparto
ESQUEMAS_DEFECTO = [
    ("A · Desarrollador tradicional", 0.15, 1, 0.0, 1.0, 0.0, 0.0),
    ("B · 50/50 con tierra pagada", 0.15, 1, 0.5, 0.5, 0.0, 0.0),
    ("C · 50/50 sin pagar tierra aparte", 0.15, 0, 0.5, 0.5, 0.0, 0.0),
    ("D · Cascada 30/20/50", 0.12, 1, 0.3, 0.2, 0.5, 0.0),
    ("E · Intermedio 40/40/20", 0.12, 1, 0.4, 0.4, 0.2, 0.0),
]
REP = {}


def hoja_reparto(wb, plan):
    ws = wb.create_sheet("Reparto")
    celda(ws, "A1", "Reparto con el dueño de la tierra: qué recibe cada parte", F_TITULO)
    celda(ws, "A2", "Parte del resultado real del flujo de la versión elegida: ventas menos costos y menos lo que cuestan el banco y el respaldo. El costo del capital se toma del flujo y se ajusta a la tasa de cada esquema.", F_SUB)
    celda(ws, "A4", "Versión que se reparte (1, 2 o 3)", F_ENCABEZADO)
    rep = (plan or {}).get("reparto", {})
    celda(ws, "B4", rep.get("version", "=Plan!$B$6"), fmt=ENT, fill=FILL_DATO)
    celda(ws, "A5", "Esquema elegido para el plan (1 a 5)", F_ENCABEZADO)
    celda(ws, "B5", rep.get("esquema", 2), fmt=ENT, fill=FILL_DATO)
    celda(ws, "C5", "=INDEX($B$8:$F$8,1,$B$5)", F_ENCABEZADO)
    filas_param = [("nombre", "Esquema", None), ("tasa", "Tasa anual del capital antes de repartir", PCT),
                   ("paga_tierra", "¿Se paga la tierra a su valor antes de repartir? (1 sí, 0 no)", ENT),
                   ("p_dueno", "Parte de la utilidad para el dueño", PCT), ("p_alianza", "Parte para la alianza", PCT),
                   ("p_inv", "Parte para el capital", PCT), ("honorarios", "Honorarios adicionales de la alianza (% de ventas)", PCT),
                   ("suma", "Suma de las partes (debe dar 100%)", PCT)]
    esquemas = rep.get("esquemas") or ESQUEMAS_DEFECTO
    r = 8
    for clave, concepto, fmt in filas_param:
        REP[clave] = r
        celda(ws, f"A{r}", concepto, F_ENCABEZADO if clave == "nombre" else None, align=ENVOLVER)
        for j in range(5):
            col = L(2 + j)
            if clave == "suma":
                celda(ws, f"{col}{r}", f"={col}{REP['p_dueno']}+{col}{REP['p_alianza']}+{col}{REP['p_inv']}", fmt=fmt)
            else:
                idx = [x[0] for x in filas_param].index(clave)
                celda(ws, f"{col}{r}", esquemas[j][idx], F_ENCABEZADO if clave == "nombre" else None, fmt=fmt,
                      fill=FILL_DATO, align=ENVOLVER)
        r += 1
    r += 1
    seccion(ws, r, "Resultado para la versión elegida (MDP)", "F")
    r += 1
    sel = "$B$4"
    vsel = lambda clave: f"INDEX(Versiones!$C${VER_FILA[clave]}:$E${VER_FILA[clave]},1,{sel})"
    tasa_cap = f"INDEX(Modelo!$E${MOD_FILA['tasa_capital']}:$G${MOD_FILA['tasa_capital']},1,{sel})"
    filas_res = [
        ("R", "Resultado a repartir antes de capital y tierra", lambda c: f"=IFERROR({vsel('resultado_repartir')},\"\")"),
        ("H", "Honorarios adicionales de la alianza", lambda c: f"=IFERROR({c}{REP['honorarios']}*{vsel('ventas')},\"\")"),
        ("CF", "Costo del capital antes de repartir", lambda c: f"=IFERROR({vsel('rend_capital')}*{c}{REP['tasa']}/{tasa_cap},0)"),
        ("T", "Pago de la tierra a su valor", lambda c: f"=IFERROR({vsel('tierra')}*{c}{REP['paga_tierra']},\"\")"),
        ("U", "Utilidad real a repartir", lambda c: f"=IFERROR({c}{{R}}-{c}{{H}}-{c}{{CF}}-{c}{{T}},\"\")"),
        ("dueno_parte", "Dueño · su parte de la utilidad", lambda c: f"=IFERROR({c}{REP['p_dueno']}*{c}{{U}},\"\")"),
        ("dueno", "Dueño · total que recibe", lambda c: f"=IFERROR({c}{{T}}+{c}{{dueno_parte}},\"\")"),
        ("veces", "Dueño · veces el valor de su tierra", lambda c: f"=IFERROR({c}{{dueno}}/{vsel('tierra')},\"\")"),
        ("alianza", "Alianza · utilidad más honorarios", lambda c: f"=IFERROR({c}{REP['p_alianza']}*{c}{{U}}+{c}{{H}},\"\")"),
        ("alianza_pct", "Alianza · % de las ventas", lambda c: f"=IFERROR({c}{{alianza}}/{vsel('ventas')},\"\")"),
        ("inv", "Capital · ganancia total", lambda c: f"=IFERROR({c}{{CF}}+{c}{REP['p_inv']}*{c}{{U}},\"\")"),
        ("check", "Comprobación (debe dar 0)", lambda c: f"=IFERROR({c}{{dueno}}+{c}{{alianza}}+{c}{{inv}}-{c}{{R}},\"\")"),
        ("meses", "Meses hasta el reparto", lambda c: f"=IFERROR({vsel('mes_reparto')},\"\")"),
    ]
    for clave, _, _ in filas_res:
        REP[clave] = r
        r += 1
    for clave, concepto, fn in filas_res:
        rr = REP[clave]
        celda(ws, f"A{rr}", concepto, F_ENCABEZADO if clave in ("dueno", "alianza", "inv") else None)
        for j in range(5):
            col = L(2 + j)
            frm = fn(col).format(**{k: REP[k] for k in ("R", "H", "CF", "T", "U", "dueno_parte", "dueno", "alianza", "inv")})
            fmt = VECES if clave == "veces" else (PCT if clave == "alianza_pct" else (ENT if clave == "meses" else MDP))
            celda(ws, f"{col}{rr}", frm, fmt=fmt)
    for clave in ("dueno", "alianza", "inv"):
        ws.conditional_formatting.add(f"B{REP[clave]}:F{REP[clave]}", FormulaRule(formula=["TRUE"], fill=PatternFill("solid", fgColor="E6F0E8")))
    anchos(ws, {"A": 52, "B": 18, "C": 18, "D": 18, "E": 18, "F": 18})
    ws.freeze_panes = "B9"
    return ws


def reparto_formula(kind, k):
    """Lo que recibe cada parte en la versión k con el esquema elegido (Reparto!B5)."""
    col = L(3 + k)
    e = lambda clave: f"INDEX(Reparto!$B${REP[clave]}:$F${REP[clave]},1,Reparto!$B$5)"
    R = f"{col}{VER_FILA['resultado_repartir']}"
    ventas = f"{col}{VER_FILA['ventas']}"
    tierra = f"{col}{VER_FILA['tierra']}"
    tasa_cap = f"Modelo!${VERS[k][0]}${MOD_FILA['tasa_capital']}"
    H = f"{e('honorarios')}*{ventas}"
    CF = f"IFERROR({col}{VER_FILA['rend_capital']}*{e('tasa')}/{tasa_cap},0)"
    T = f"{tierra}*{e('paga_tierra')}"
    U = f"({R}-{H}-{CF}-{T})"
    if kind == "dueno":
        return f"=IFERROR({T}+{e('p_dueno')}*{U},\"\")"
    if kind == "veces":
        return f"=IFERROR({col}{VER_FILA['dueno_recibe']}/{tierra},\"\")"
    if kind == "alianza":
        return f"=IFERROR({e('p_alianza')}*{U}+{H},\"\")"
    if kind == "inversion":
        return f"=IFERROR({CF}+{e('p_inv')}*{U},\"\")"
    raise KeyError(kind)


# ---------------------------------------------------------------- tablas de registro
def hoja_tabla(wb, titulo, sub, columnas, anch, filas=None, validaciones=None, n=200):
    ws = wb.create_sheet(titulo)
    celda(ws, "A1", titulo if titulo != "Bitácora" else "Bitácora: quién cambió qué", F_TITULO)
    celda(ws, "A2", sub, F_SUB)
    for i, t in enumerate(columnas):
        celda(ws, f"{L(i + 1)}4", t, F_ENCABEZADO, align=ENVOLVER).border = BORDE
    for i, fila in enumerate(filas or []):
        for j, v in enumerate(fila):
            celda(ws, f"{L(j + 1)}{5 + i}", v, align=ENVOLVER)
    for col, opciones in (validaciones or {}).items():
        lista(ws, f"{col}5:{col}{4 + n}", opciones)
    anchos(ws, anch)
    ws.freeze_panes = "A5"
    return ws


PREG_COLS = ["id", "Módulo", "Pregunta", "Nivel", "Edad", "Mueve", "Estado", "Respuesta", "Fuente", "Responsable", "Fecha", "Impacto", "Prioridad", "¿Siguiente?"]
IMPACTO_MODULO = {"M03": "alto", "M04": "alto", "M05": "alto", "M11": "alto", "M12": "alto", "M13": "alto", "M14": "alto",
                  "M06": "medio", "M08": "medio", "M10": "medio", "M16": "medio", "M02": "medio"}
EDAD_NIVEL = {"mínimo": "semilla", "piloto": "plántula", "completo": "árbol"}


def hoja_preguntas(wb, plan, catalogo):
    filas = []
    resp = (plan or {}).get("preguntas", {})
    mueve = (plan or {}).get("mueve", {})
    for mod in catalogo["modules"]:
        for q in mod["questions"]:
            r = resp.get(q["id"], {})
            filas.append([q["id"], mod["title"], q["text"], q["level"], EDAD_NIVEL.get(q["level"], ""),
                          r.get("mueve", mueve.get(q["id"], "")), r.get("estado", "abierta"), r.get("respuesta", ""),
                          r.get("fuente", ""), r.get("responsable", ""), r.get("fecha", ""),
                          r.get("impacto", IMPACTO_MODULO.get(q["id"][:3], "bajo"))])
    ws = hoja_tabla(wb, "Preguntas", "Las 96 preguntas del oficio. La prioridad sube con el impacto (alto, medio, bajo) y con lo básico de la pregunta; sólo cuentan las que siguen sin responder.",
                    PREG_COLS, {"A": 9, "B": 22, "C": 54, "D": 10, "E": 10, "F": 20, "G": 13, "H": 40, "I": 30, "J": 14, "K": 11, "L": 9, "M": 9, "N": 10},
                    filas, {"G": ESTADOS_PREGUNTA, "L": ["alto", "medio", "bajo"]}, n=len(filas))
    n = len(filas)
    for i in range(n):
        r = 5 + i
        edades = '{"semilla","plántula","árbol","flor","fruto"}'
        ws[f"M{r}"] = (f"=IF(OR(G{r}=\"abierta\",G{r}=\"no se sabe\",G{r}=\"investigando\",G{r}=\"en conflicto\"),"
                       f"IF(IFERROR(MATCH(E{r},{edades},0),9)<=IFERROR(MATCH(Plan!$B$4,{edades},0),1),100,0)"
                       f"+IF(L{r}=\"alto\",3,IF(L{r}=\"medio\",2,1))*10+IF(D{r}=\"mínimo\",3,IF(D{r}=\"piloto\",2,1)),0)")
        ws[f"N{r}"] = f"=IF(AND(M{r}>0,ROW()=MATCH(MAX($M$5:$M${4 + n}),$M$5:$M${4 + n},0)+4),\"siguiente\",\"\")"
        for col in "GHIJKL":
            ws[f"{col}{r}"].fill = FILL_DATO
    ws.conditional_formatting.add(f"N5:N{4 + n}", CellIsRule(operator="equal", formula=['"siguiente"'], font=Font(color=ORO, bold=True)))
    return ws, n


def consejo_partes(ver_ref):
    """La última sesión del consejo (las filas se agregan en orden): cuántas filas hay, qué sesión,
    sobre qué versión, cuántos jueces aprueban, si hubo veto, cuántos votaron y si la sesión fue sobre
    la versión `ver_ref` (acepta «V2», «v2» o «2»)."""
    n = "COUNTA(Consejo!$A$5:$A$500)"
    ses = f"INDEX(Consejo!$B$5:$B$500,{n})"
    ver = f"INDEX(Consejo!$C$5:$C$500,{n})"
    si = f"COUNTIFS(Consejo!$B$5:$B$500,{ses},Consejo!$E$5:$E$500,\"aprueba\")"
    veto = f"COUNTIFS(Consejo!$B$5:$B$500,{ses},Consejo!$E$5:$E$500,\"veto\")"
    total = f"COUNTIF(Consejo!$B$5:$B$500,{ses})"
    misma = f"SUBSTITUTE(UPPER({ver}&\"\"),\"V\",\"\")={ver_ref}&\"\""
    return n, ses, ver, si, veto, total, misma


def resumen_consejo(ws):
    """Consejo!A3: lo que decidió la última sesión, en palabras. Lo calcula el libro."""
    n, ses, ver, si, veto, total, _ = consejo_partes("Plan!$B$6")
    celda(ws, "A3", f"=IF({n}=0,\"El consejo todavía no se reúne.\",\"Última sesión \"&{ses}&\" sobre la V\"&SUBSTITUTE(UPPER({ver}&\"\"),\"V\",\"\")"
                    f"&\": aprueban \"&{si}&\" de \"&{total}&IF({veto}>0,\", con veto\",\"\")&\". \"&IF(AND({si}>=5,{veto}=0),\"La aprueba.\",\"La regresa.\"))",
          Font(name="Arial", size=10, bold=True, color=TINTA))


def hoja_plan(wb, plan, npreg):
    ws = wb.create_sheet("Plan", 0)
    g = lambda c: f"INDEX(Versiones!$C${VER_FILA[c]}:$E${VER_FILA[c]},1,$B$6)"
    celda(ws, "A1", f"=IF({D('plan.nombre')}=\"\",\"Plan sin nombre\",{D('plan.nombre')})", Font(name="Arial", size=20, bold=True, color=TINTA))
    celda(ws, "A2", f"={D('plan.ubicacion')}&IF({D('plan.tipo')}=\"\",\"\",\" · \"&{D('plan.tipo')})", F_SUB)
    celda(ws, "A4", "Edad del plan", F_SECCION)
    calcula = f"ISNUMBER(INDEX(Versiones!$C${VER_FILA['ganancia']}:$E${VER_FILA['ganancia']},1,$B$6))"
    vig = f"COUNTIF(Versiones!$C${VER_FILA['estado']}:$E${VER_FILA['estado']},\"vigente\")>0"
    n_c, _, _, si_c, veto_c, _, misma_c = consejo_partes("$B$6")
    # el consejo cuenta sólo si su ÚLTIMA sesión aprobó la versión que se muestra: 5 de 7 y sin veto
    consejo = f"IF({n_c}=0,FALSE,AND({si_c}>=5,{veto_c}=0,{misma_c}))"
    candados = "AND(COUNTA(Candados!$A$5:$A$60)>0,COUNTIF(Candados!$D$5:$D$60,\"abierto\")+COUNTIF(Candados!$D$5:$D$60,\"en revisión\")=0)"
    fruto = f"{D('acuerdo.firmado')}=\"sí\""
    celda(ws, "B4", f"=IF({fruto},\"fruto\",IF(AND({vig},{consejo},{candados}),\"flor\",IF(AND({vig},{consejo}),\"árbol\",IF({calcula},\"plántula\",\"semilla\"))))", F_GRANDE)
    celda(ws, "A5", "Para crecer falta", F_SECCION)
    falta = (f"=IF(B4=\"semilla\",IF(Productos!$B${PT}=0,\"Capturar al menos un producto. \",\"\")&\"Que la versión base calcule: faltan \"&COUNTIFS(Datos!$K$5:$K$200,\"sí\",Datos!$C$5:$C$200,\"\")&\" datos para calcular.\","
             f"IF(B4=\"plántula\",IF(NOT({vig}),\"Que Dirección apruebe una versión. \",\"\")&IF(NOT({consejo}),IF({n_c}=0,\"Que el consejo de planes revise la versión. \",\"Que el consejo de planes la apruebe (5 de 7, sin veto). \"&Consejo!$A$3&\" \"),\"\")&\"Datos sin resolver: \"&$B$22&\".\","
             f"IF(B4=\"árbol\",\"Cerrar los candados: \"&$B$23&\" abiertos.\",IF(B4=\"flor\",\"Firmar el acuerdo con el dueño.\",\"Plan cumplido.\"))))")
    celda(ws, "B5", falta, align=ENVOLVER)
    celda(ws, "A6", "Versión que se muestra", F_SECCION)
    est = f"Versiones!$C${VER_FILA['estado']}:$E${VER_FILA['estado']}"
    celda(ws, "B6", f"=IFERROR(MATCH(\"vigente\",{est},0),IFERROR(MATCH(\"propuesta\",{est},0),1))", F_GRANDE, fmt=ENT)
    celda(ws, "C6", f"=\"V\"&B6&\" · \"&{g('nombre')}&\" · \"&{g('estado')}&IF({g('estado')}=\"propuesta\",\" (falta que Dirección la apruebe)\",\"\")", align=ENVOLVER)
    celda(ws, "D6", f"={calcula}", Font(name="Arial", size=8, color="FFFFFF"))
    seccion(ws, 8, "LO QUE RECIBE EL DUEÑO", "D")
    filas = [("El dueño aporta su tierra (MDP)", "dueno_aporta", MDP), ("Recibe en total (MDP)", "dueno_recibe", MDP),
             ("Veces el valor de su tierra", "dueno_veces", VECES), ("En cuántos meses recibe lo último", "dueno_meses", ENT),
             ("En años", "dueno_anos", '0.0')]
    for i, (t, c, fmt) in enumerate(filas):
        celda(ws, f"A{9 + i}", t)
        celda(ws, f"B{9 + i}", f"=IF($D$6,IFERROR({g(c)},\"\"),\"\")", F_GRANDE if c in ("dueno_recibe", "dueno_meses") else F_ENCABEZADO, fmt=fmt)
    celda(ws, "A14", "Bajo el esquema")
    celda(ws, "B14", "=Reparto!$C$5")
    seccion(ws, 16, "LO QUE NECESITA EL PROYECTO", "D")
    filas2 = [("Ventas (MDP)", "ventas", MDP), ("Máximo de dinero ajeno en uso (MDP)", "max_ajeno", MDP),
              ("Ganancia real, ya pagada la tierra (MDP)", "ganancia", MDP), ("Revisión para fondos", "rv_resultado", None),
              ("Obra: mes de inicio", "obra_inicio", ENT)]
    for i, (t, c, fmt) in enumerate(filas2):
        celda(ws, f"A{17 + i}", t)
        celda(ws, f"B{17 + i}", f"=IF($D$6,IFERROR({g(c)},\"\"),IF(\"{c}\"=\"rv_resultado\",\"Falta calcular\",\"\"))", F_ENCABEZADO, fmt=fmt)
    celda(ws, "A22", "Datos sin resolver (por confirmar, en conflicto o falta)")
    celda(ws, "B22", "=COUNTIF(Datos!$E$5:$E$200,\"por confirmar\")+COUNTIF(Datos!$E$5:$E$200,\"en conflicto\")+COUNTIF(Datos!$E$5:$E$200,\"falta\")", fmt=ENT)
    celda(ws, "A23", "Candados abiertos")
    celda(ws, "B23", "=COUNTIF(Candados!$D$5:$D$60,\"abierto\")+COUNTIF(Candados!$D$5:$D$60,\"en revisión\")", fmt=ENT)
    celda(ws, "A24", "Preguntas abiertas")
    celda(ws, "B24", f"=COUNTIF(Preguntas!$M$5:$M${4 + npreg},\">0\")", fmt=ENT)
    celda(ws, "A25", "Siguiente pregunta")
    celda(ws, "B25", f"=IFERROR(INDEX(Preguntas!$C$5:$C${4 + npreg},MATCH(\"siguiente\",Preguntas!$N$5:$N${4 + npreg},0)),\"\")", align=ENVOLVER)
    celda(ws, "A27", "Libro del Plan de Potencial 2 (PPP 2). Todo se calcula en este libro; el tablero sólo lo lee y escribe los datos permitidos.", F_SUB)
    anchos(ws, {"A": 46, "B": 22, "C": 60, "D": 10})
    return ws


def hoja_resumen(wb, npreg):
    """Clave → valor para el servidor: así no depende de la posición de nada."""
    ws = wb.create_sheet("Resumen")
    celda(ws, "A1", "Resumen para el tablero (no se edita)", F_TITULO)
    celda(ws, "A2", "El servidor de PPP 2 lee estas claves. Si se mueve algo en otra pestaña, las fórmulas siguen apuntando bien.", F_SUB)
    filas = [("esquema", f"=\"{ESQUEMA}\""), ("plan.nombre", f"={D('plan.nombre')}"), ("plan.ubicacion", f"={D('plan.ubicacion')}"),
             ("plan.tipo", f"={D('plan.tipo')}"), ("plan.objetivo", f"={D('plan.objetivo')}"), ("plan.caso_ppp", f"={D('plan.caso_ppp')}"),
             ("plan.edad", "=Plan!$B$4"), ("plan.para_crecer", "=Plan!$B$5"), ("plan.version_mostrada", "=Plan!$B$6"),
             ("plan.esquema", "=Reparto!$C$5"), ("plan.datos_sin_resolver", "=Plan!$B$22"), ("plan.candados_abiertos", "=Plan!$B$23"),
             ("plan.preguntas_abiertas", "=Plan!$B$24"), ("plan.siguiente_pregunta", "=Plan!$B$25")]
    for item in VER_FILAS:
        if item[0] == "§":
            continue
        for k in range(3):
            filas.append((f"v{k + 1}.{item[0]}", f"=IFERROR({V(item[0], k)},\"\")"))
    for i, (clave, frm) in enumerate(filas):
        celda(ws, f"A{4 + i}", clave)
        celda(ws, f"B{4 + i}", frm)
    anchos(ws, {"A": 34, "B": 40})
    return ws


def hoja_pruebas(wb, plan):
    ws = wb.create_sheet("Pruebas")
    celda(ws, "A1", "Pruebas de estrés: qué pasa si algo sale peor", F_TITULO)
    celda(ws, "A2", "El autón cambia una palanca en la columna Prueba del Modelo, lee el resultado de abajo y lo deja escrito en la lista. Después restablece la columna.", F_SUB)
    celda(ws, "A4", "Versión que se prueba (1, 2 o 3)", F_ENCABEZADO)
    celda(ws, "B4", "=Plan!$B$6", fmt=ENT, fill=FILL_DATO)
    vivo = [("Banco: saldo máximo (MDP)", "='Flujo prueba'!B41"), ("Respaldo que haría falta (MDP)", "='Flujo prueba'!B43"),
            ("Costo del dinero (MDP)", "='Flujo prueba'!B29+'Flujo prueba'!B34+('Flujo prueba'!B40-'Flujo prueba'!B31)+('Flujo prueba'!B39-'Flujo prueba'!B37)"),
            ("Ganancia real (MDP)", f"='Flujo prueba'!B45-'Flujo prueba'!{ULT}41-'Flujo prueba'!{ULT}42-'Flujo prueba'!{ULT}43-Modelo!$H${MOD_FILA['tierra']}"),
            ("Mes de reparto", "=MAX(IF(ISNUMBER('Flujo prueba'!B58),'Flujo prueba'!B58,0),IF(ISNUMBER('Flujo prueba'!B59),'Flujo prueba'!B59,0),IF(ISNUMBER('Flujo prueba'!B62),'Flujo prueba'!B62,0),'Flujo prueba'!B60)")]
    celda(ws, "A5", "Resultado en vivo de la columna Prueba", F_SECCION)
    for i, (t, frm) in enumerate(vivo):
        celda(ws, f"A{6 + i}", t)
        celda(ws, f"B{6 + i}", f"=IFERROR({frm[1:]},\"\")", fmt=ENT if "Mes" in t else MDP)
    cols = ["Escenario", "Qué cambia", "Banco: saldo máximo", "Respaldo que haría falta", "Costo del dinero", "Ganancia real", "Mes de reparto", "Versión", "Fecha", "Quién"]
    for i, t in enumerate(cols):
        celda(ws, f"{L(i + 1)}13", t, F_ENCABEZADO, align=ENVOLVER).border = BORDE
    for i, fila in enumerate((plan or {}).get("pruebas", [])):
        for j, v in enumerate(fila):
            celda(ws, f"{L(j + 1)}{14 + i}", v, fmt=MDP if j in (2, 3, 4, 5) else None, align=ENVOLVER)
    anchos(ws, {"A": 40, "B": 40, "C": 12, "D": 12, "E": 12, "F": 12, "G": 10, "H": 8, "I": 11, "J": 14})
    return ws


def construir(plan=None, catalogo=None):
    wb = Workbook()
    wb.remove(wb.active)
    hoja_datos(wb, plan)
    hoja_productos(wb, plan)
    # Versiones necesita las filas del Modelo y viceversa: se reservan primero
    hoja_modelo(wb, plan)
    hoja_versiones(wb, plan)
    # el nombre de cada versión en Modelo!E5:G5 apunta a la fila real de Versiones
    ws_m = wb["Modelo"]
    for k, (col, _) in enumerate(VERS[:3]):
        ws_m[f"{col}5"].value = f"=Versiones!{L(3 + k)}{VER_FILA['nombre']}"
    for k, (col, titulo) in enumerate(VERS):
        hoja_flujo(wb, titulo, col, k < 3)
    hoja_reparto(wb, plan)
    # Versiones usa REP (filas del reparto): se rellena ahora que existen
    rellenar_reparto_en_versiones(wb, plan)
    hoja_tabla(wb, "Candados", "Lo que tiene que estar resuelto antes de presentar el plan a socios. Un candado abierto detiene la flor.",
               ["id", "Candado", "Qué lo cierra (evidencia)", "Estado", "Evidencia", "Responsable", "Fecha", "Detiene", "Nota"],
               {"A": 12, "B": 26, "C": 48, "D": 12, "E": 40, "F": 16, "G": 11, "H": 9, "I": 36},
               (plan or {}).get("candados", []), {"D": ESTADOS_CANDADO}, n=56)
    _, npreg = hoja_preguntas(wb, plan, catalogo)
    hoja_tabla(wb, "Hallazgos", "Lo que el autón o el equipo encuentran. Un hallazgo no cambia ningún dato hasta que alguien lo acepta.",
               ["Fecha", "Tema", "Hallazgo", "Fuente", "Confianza", "Mueve", "Estado", "Quién", "Nota"],
               {"A": 11, "B": 18, "C": 60, "D": 40, "E": 10, "F": 18, "G": 12, "H": 14, "I": 30},
               (plan or {}).get("hallazgos", []), {"E": ["alta", "media", "baja"], "G": ESTADOS_HALLAZGO})
    ws_consejo = hoja_tabla(wb, "Consejo", "Las sesiones del consejo de planes: cada juez vota con su razón. Aprueba con 5 de 7 y sin veto; Alejandro virtual puede vetar por un candado. Cuenta la última sesión.",
               ["Fecha", "Sesión", "Versión", "Juez", "Voto", "Razón", "Condición para aprobar"],
               {"A": 11, "B": 12, "C": 9, "D": 26, "E": 10, "F": 60, "G": 50},
               (plan or {}).get("consejo", []), {"E": VOTOS})
    resumen_consejo(ws_consejo)
    hoja_tabla(wb, "Bitácora", "Cada cambio queda aquí: quién, qué, antes y después, de dónde salió.",
               ["Fecha", "Actor", "Acción", "Pestaña", "Clave o celda", "Antes", "Después", "Fuente", "Revisión base", "request_id"],
               {"A": 17, "B": 16, "C": 40, "D": 12, "E": 18, "F": 16, "G": 16, "H": 36, "I": 12, "J": 16},
               (plan or {}).get("bitacora", []), n=2000)
    hoja_pruebas(wb, plan)
    hoja_plan(wb, plan, npreg)
    hoja_resumen(wb, npreg)
    # orden y colores de pestaña
    orden = ["Plan", "Versiones", "Reparto", "Datos", "Productos", "Candados", "Preguntas", "Hallazgos", "Consejo",
             "Modelo", "Flujo V1", "Flujo V2", "Flujo V3", "Pruebas", "Flujo prueba", "Bitácora", "Resumen"]
    wb._sheets = [wb[t] for t in orden]
    color = {"Plan": ORO, "Versiones": ORO, "Reparto": ORO, "Datos": VERDE, "Productos": VERDE, "Candados": VERDE,
             "Preguntas": VERDE, "Hallazgos": VERDE, "Consejo": AZUL, "Modelo": GRIS, "Flujo V1": GRIS, "Flujo V2": GRIS,
             "Flujo V3": GRIS, "Pruebas": GRIS, "Flujo prueba": GRIS, "Bitácora": GRIS, "Resumen": GRIS}
    for t, c in color.items():
        wb[t].sheet_properties.tabColor = c
        wb[t].sheet_view.showGridLines = t not in ("Plan",)
    return wb


def rellenar_reparto_en_versiones(wb, plan):
    ws = wb["Versiones"]
    for clave, kind in (("dueno_recibe", "dueno"), ("dueno_veces", "veces"), ("alianza_recibe", "alianza"), ("inversion_recibe", "inversion")):
        for k in range(3):
            ws[f"{L(3 + k)}{VER_FILA[clave]}"].value = reparto_formula(kind, k)


def main(argv):
    if len(argv) < 2:
        print(__doc__)
        return 2
    salida = argv[1]
    plan = None
    if "--plan" in argv:
        with open(argv[argv.index("--plan") + 1], encoding="utf-8") as fh:
            plan = json.load(fh)
    import os
    aqui = os.path.dirname(os.path.abspath(__file__))
    with open(os.path.join(aqui, "catalogo-preguntas.json"), encoding="utf-8") as fh:
        catalogo = json.load(fh)
    wb = construir(plan, catalogo)
    wb.save(salida)
    print("ok", salida)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
