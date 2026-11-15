/* Generado por ppp2/libro/relaciones.py desde la plantilla del libro (ppp2-libro-v1).
   No se edita a mano: si cambia ppp2/libro/generar.py, se vuelve a correr ese guion
   (tests/ppp2-lapiz.test.cjs lo vigila). Sólo nombres y ligas entre celdas: ninguna cifra. */
window.PPP2_RELACIONES = {
 "esquema": "ppp2-libro-v1",
 "huella": "aea0f62648ee1cfa7e9aecb14c51b6497a01de6c5fae8aebfbf9cd1dafde4226",
 "cuadros": {
  "terreno": [
   "dato:terreno.m2",
   "palanca:tierra",
   "dato:lamina.m2_construidos"
  ],
  "producto": [
   "productos",
   "palanca:ajuste_precio",
   "palanca:comision"
  ],
  "tiempo": [
   "palanca:predesarrollo",
   "palanca:ventas_inicio",
   "palanca:ventas_meses",
   "palanca:obra_inicio",
   "palanca:obra_duracion",
   "palanca:campana",
   "palanca:individualizar",
   "palanca:meses_saldos",
   "palanca:saldo_posterior"
  ],
  "costo": [
   "dato:costo.obra_directa",
   "dato:lamina.costo_total",
   "dato:lamina.ventas",
   "palanca:ajuste_obra",
   "palanca:indirectos",
   "palanca:imprevistos",
   "palanca:cierre",
   "palanca:ind_predesarrollo"
  ],
  "dinero": [
   "palanca:capital",
   "palanca:tasa_capital",
   "palanca:enganche",
   "palanca:durante_obra_1",
   "palanca:durante_obra_2",
   "palanca:durante_obra_3",
   "palanca:durante_obra_4",
   "palanca:durante_obra_5",
   "palanca:durante_obra_6",
   "palanca:usa_banco",
   "palanca:tiie",
   "palanca:sobretasa",
   "palanca:apertura",
   "palanca:banco_pct_obra",
   "palanca:banco_pct_costo",
   "palanca:banco_pct_ventas",
   "palanca:caja_pct",
   "palanca:devolver_con_obra"
  ],
  "reparto": [
   "reparto:esquema",
   "palanca:tierra"
  ],
  "riesgo": [
   "candados",
   "preguntas",
   "dato:acuerdo.firmado"
  ]
 },
 "entradas": {
  "candados": {
   "tipo": "candados",
   "concepto": "Candados",
   "unidad": "",
   "nota": "Lo que debe estar resuelto antes de presentar el plan: tenencia, uso de suelo, agua, vialidad, banco y acuerdo.",
   "pasa_por": [],
   "mueve": [],
   "revision": [],
   "cuadro": "riesgo"
  },
  "dato:acuerdo.firmado": {
   "tipo": "dato",
   "dato": "acuerdo.firmado",
   "concepto": "¿Ya hay acuerdo firmado con el dueño? (sí/no)",
   "unidad": "texto",
   "nota": "",
   "pasa_por": [],
   "mueve": [
    "Edad del plan"
   ],
   "revision": [],
   "cuadro": "riesgo"
  },
  "dato:costo.obra_directa": {
   "tipo": "dato",
   "dato": "costo.obra_directa",
   "concepto": "Obra directa",
   "unidad": "MDP",
   "nota": "Se deriva de la lámina: costo total menos tierra, comisiones y cierre, entre 1 + indirectos + imprevistos. Si hay presupuesto, se escribe aquí.",
   "pasa_por": [
    "Obra directa",
    "Indirectos",
    "Imprevistos",
    "Costo sin tierra",
    "Costo con tierra",
    "Mes desde el que se cobran los saldos",
    "Saldos por cobrar al individualizar",
    "Línea del banco",
    "Caja mínima",
    "Tierra más capital entre costo con tierra",
    "Firmadas antes de los saldos · producto 1",
    "Firmadas antes de los saldos · producto 2",
    "Firmadas antes de los saldos · producto 3",
    "Firmadas antes de los saldos · producto 4",
    "Firmadas antes de los saldos · producto 5",
    "Firmadas antes de los saldos · producto 6"
   ],
   "mueve": [
    "Costo sin tierra",
    "Capital",
    "Banco (saldo máximo)",
    "Dinero ajeno máximo",
    "Dinero que faltaría",
    "Costo del dinero",
    "Ganancia real",
    "Margen",
    "Lo que recibe el dueño",
    "Cuándo recibe lo último",
    "Lo que recibe la alianza",
    "Mes de reparto",
    "Revisión para fondos"
   ],
   "revision": [
    "línea del banco entre ventas",
    "línea del banco entre costo",
    "tierra y capital entre costo",
    "preventa antes del primer desembolso",
    "cobertura del banco",
    "margen sobre costo",
    "meses de crédito",
    "dinero que faltaría"
   ],
   "cuadro": "costo"
  },
  "dato:lamina.costo_total": {
   "tipo": "dato",
   "dato": "lamina.costo_total",
   "concepto": "Costo total con terreno",
   "unidad": "MDP",
   "nota": "Total de costos del anteproyecto, incluida la tierra.",
   "pasa_por": [
    "Obra directa",
    "Indirectos",
    "Imprevistos",
    "Costo sin tierra",
    "Costo con tierra",
    "Mes desde el que se cobran los saldos",
    "Saldos por cobrar al individualizar",
    "Línea del banco",
    "Caja mínima",
    "Tierra más capital entre costo con tierra",
    "Firmadas antes de los saldos · producto 1",
    "Firmadas antes de los saldos · producto 2",
    "Firmadas antes de los saldos · producto 3",
    "Firmadas antes de los saldos · producto 4",
    "Firmadas antes de los saldos · producto 5",
    "Firmadas antes de los saldos · producto 6"
   ],
   "mueve": [
    "Costo sin tierra",
    "Capital",
    "Banco (saldo máximo)",
    "Dinero ajeno máximo",
    "Dinero que faltaría",
    "Costo del dinero",
    "Ganancia real",
    "Margen",
    "Lo que recibe el dueño",
    "Cuándo recibe lo último",
    "Lo que recibe la alianza",
    "Mes de reparto",
    "Revisión para fondos"
   ],
   "revision": [
    "línea del banco entre ventas",
    "línea del banco entre costo",
    "tierra y capital entre costo",
    "preventa antes del primer desembolso",
    "cobertura del banco",
    "margen sobre costo",
    "meses de crédito",
    "dinero que faltaría"
   ],
   "cuadro": "costo"
  },
  "dato:lamina.m2_construidos": {
   "tipo": "dato",
   "dato": "lamina.m2_construidos",
   "concepto": "Construcción total",
   "unidad": "m²",
   "nota": "",
   "pasa_por": [],
   "mueve": [
    "Edad del plan"
   ],
   "revision": [],
   "cuadro": "terreno"
  },
  "dato:lamina.ventas": {
   "tipo": "dato",
   "dato": "lamina.ventas",
   "concepto": "Ventas proyectadas",
   "unidad": "MDP",
   "nota": "Total de ventas del anteproyecto; sirve para cuadrar.",
   "pasa_por": [
    "Obra directa",
    "Indirectos",
    "Imprevistos",
    "Costo sin tierra",
    "Costo con tierra",
    "Mes desde el que se cobran los saldos",
    "Saldos por cobrar al individualizar",
    "Línea del banco",
    "Caja mínima",
    "Tierra más capital entre costo con tierra",
    "Firmadas antes de los saldos · producto 1",
    "Firmadas antes de los saldos · producto 2",
    "Firmadas antes de los saldos · producto 3",
    "Firmadas antes de los saldos · producto 4",
    "Firmadas antes de los saldos · producto 5",
    "Firmadas antes de los saldos · producto 6"
   ],
   "mueve": [
    "Costo sin tierra",
    "Capital",
    "Banco (saldo máximo)",
    "Dinero ajeno máximo",
    "Dinero que faltaría",
    "Costo del dinero",
    "Ganancia real",
    "Margen",
    "Lo que recibe el dueño",
    "Cuándo recibe lo último",
    "Lo que recibe la alianza",
    "Mes de reparto",
    "Revisión para fondos"
   ],
   "revision": [
    "línea del banco entre ventas",
    "línea del banco entre costo",
    "tierra y capital entre costo",
    "preventa antes del primer desembolso",
    "cobertura del banco",
    "margen sobre costo",
    "meses de crédito",
    "dinero que faltaría"
   ],
   "cuadro": "costo"
  },
  "dato:terreno.m2": {
   "tipo": "dato",
   "dato": "terreno.m2",
   "concepto": "Superficie del terreno",
   "unidad": "m²",
   "nota": "",
   "pasa_por": [],
   "mueve": [
    "Edad del plan"
   ],
   "revision": [],
   "cuadro": "terreno"
  },
  "palanca:ajuste_obra": {
   "tipo": "palanca",
   "palanca": "ajuste_obra",
   "concepto": "Ajuste del costo de obra",
   "unidad": "%",
   "nota": "Sube o baja el costo de obra directa en esta versión.",
   "pasa_por": [
    "Obra directa",
    "Indirectos",
    "Imprevistos",
    "Costo sin tierra",
    "Costo con tierra",
    "Mes desde el que se cobran los saldos",
    "Saldos por cobrar al individualizar",
    "Línea del banco",
    "Caja mínima",
    "Tierra más capital entre costo con tierra",
    "Firmadas antes de los saldos · producto 1",
    "Firmadas antes de los saldos · producto 2",
    "Firmadas antes de los saldos · producto 3",
    "Firmadas antes de los saldos · producto 4",
    "Firmadas antes de los saldos · producto 5",
    "Firmadas antes de los saldos · producto 6"
   ],
   "mueve": [
    "Costo sin tierra",
    "Capital",
    "Banco (saldo máximo)",
    "Dinero ajeno máximo",
    "Dinero que faltaría",
    "Costo del dinero",
    "Ganancia real",
    "Margen",
    "Lo que recibe el dueño",
    "Cuándo recibe lo último",
    "Lo que recibe la alianza",
    "Mes de reparto",
    "Revisión para fondos"
   ],
   "revision": [
    "línea del banco entre ventas",
    "línea del banco entre costo",
    "tierra y capital entre costo",
    "preventa antes del primer desembolso",
    "cobertura del banco",
    "margen sobre costo",
    "meses de crédito",
    "dinero que faltaría"
   ],
   "cuadro": "costo"
  },
  "palanca:ajuste_precio": {
   "tipo": "palanca",
   "palanca": "ajuste_precio",
   "concepto": "Ajuste de precio sobre la lista",
   "unidad": "%",
   "nota": "Sube o baja todos los precios de lista en esta versión (−5% = cinco por ciento abajo).",
   "pasa_por": [
    "Ventas",
    "Comisiones",
    "Costo sin tierra",
    "Costo con tierra",
    "Saldos por cobrar al individualizar",
    "Línea del banco",
    "Caja mínima",
    "Tierra más capital entre costo con tierra",
    "Precio por unidad · producto 1",
    "Precio por unidad · producto 2",
    "Precio por unidad · producto 3",
    "Precio por unidad · producto 4",
    "Precio por unidad · producto 5",
    "Precio por unidad · producto 6"
   ],
   "mueve": [
    "Ventas",
    "Costo sin tierra",
    "Capital",
    "Banco (saldo máximo)",
    "Dinero ajeno máximo",
    "Dinero que faltaría",
    "Costo del dinero",
    "Ganancia real",
    "Margen",
    "Lo que recibe el dueño",
    "Cuándo recibe lo último",
    "Lo que recibe la alianza",
    "Mes de reparto",
    "Revisión para fondos"
   ],
   "revision": [
    "línea del banco entre ventas",
    "línea del banco entre costo",
    "tierra y capital entre costo",
    "preventa antes del primer desembolso",
    "cobertura del banco",
    "margen sobre costo",
    "meses de crédito",
    "dinero que faltaría"
   ],
   "cuadro": "producto"
  },
  "palanca:apertura": {
   "tipo": "palanca",
   "palanca": "apertura",
   "concepto": "Comisión de apertura",
   "unidad": "%",
   "dato": "din.apertura",
   "nota": "",
   "pasa_por": [],
   "mueve": [
    "Capital",
    "Banco (saldo máximo)",
    "Dinero ajeno máximo",
    "Dinero que faltaría",
    "Costo del dinero",
    "Ganancia real",
    "Margen",
    "Lo que recibe el dueño",
    "Cuándo recibe lo último",
    "Lo que recibe la alianza",
    "Mes de reparto",
    "Revisión para fondos"
   ],
   "revision": [
    "preventa antes del primer desembolso",
    "cobertura del banco",
    "meses de crédito",
    "dinero que faltaría"
   ],
   "cuadro": "dinero"
  },
  "palanca:banco_pct_costo": {
   "tipo": "palanca",
   "palanca": "banco_pct_costo",
   "concepto": "Banco: tope sobre costo con terreno",
   "unidad": "%",
   "dato": "din.banco_pct_costo",
   "nota": "",
   "pasa_por": [
    "Línea del banco"
   ],
   "mueve": [
    "Capital",
    "Banco (saldo máximo)",
    "Dinero ajeno máximo",
    "Dinero que faltaría",
    "Costo del dinero",
    "Ganancia real",
    "Margen",
    "Lo que recibe el dueño",
    "Cuándo recibe lo último",
    "Lo que recibe la alianza",
    "Mes de reparto",
    "Revisión para fondos"
   ],
   "revision": [
    "línea del banco entre ventas",
    "línea del banco entre costo",
    "preventa antes del primer desembolso",
    "cobertura del banco",
    "meses de crédito",
    "dinero que faltaría"
   ],
   "cuadro": "dinero"
  },
  "palanca:banco_pct_obra": {
   "tipo": "palanca",
   "palanca": "banco_pct_obra",
   "concepto": "Banco: tope sobre obra directa",
   "unidad": "%",
   "dato": "din.banco_pct_obra",
   "nota": "",
   "pasa_por": [
    "Línea del banco"
   ],
   "mueve": [
    "Capital",
    "Banco (saldo máximo)",
    "Dinero ajeno máximo",
    "Dinero que faltaría",
    "Costo del dinero",
    "Ganancia real",
    "Margen",
    "Lo que recibe el dueño",
    "Cuándo recibe lo último",
    "Lo que recibe la alianza",
    "Mes de reparto",
    "Revisión para fondos"
   ],
   "revision": [
    "línea del banco entre ventas",
    "línea del banco entre costo",
    "preventa antes del primer desembolso",
    "cobertura del banco",
    "meses de crédito",
    "dinero que faltaría"
   ],
   "cuadro": "dinero"
  },
  "palanca:banco_pct_ventas": {
   "tipo": "palanca",
   "palanca": "banco_pct_ventas",
   "concepto": "Banco: tope sobre ventas",
   "unidad": "%",
   "dato": "din.banco_pct_ventas",
   "nota": "",
   "pasa_por": [
    "Línea del banco"
   ],
   "mueve": [
    "Capital",
    "Banco (saldo máximo)",
    "Dinero ajeno máximo",
    "Dinero que faltaría",
    "Costo del dinero",
    "Ganancia real",
    "Margen",
    "Lo que recibe el dueño",
    "Cuándo recibe lo último",
    "Lo que recibe la alianza",
    "Mes de reparto",
    "Revisión para fondos"
   ],
   "revision": [
    "línea del banco entre ventas",
    "línea del banco entre costo",
    "preventa antes del primer desembolso",
    "cobertura del banco",
    "meses de crédito",
    "dinero que faltaría"
   ],
   "cuadro": "dinero"
  },
  "palanca:caja_pct": {
   "tipo": "palanca",
   "palanca": "caja_pct",
   "concepto": "Caja mínima (% del costo sin tierra)",
   "unidad": "%",
   "dato": "din.caja_pct",
   "nota": "",
   "pasa_por": [
    "Caja mínima"
   ],
   "mueve": [
    "Capital",
    "Banco (saldo máximo)",
    "Dinero ajeno máximo",
    "Dinero que faltaría",
    "Costo del dinero",
    "Ganancia real",
    "Margen",
    "Lo que recibe el dueño",
    "Cuándo recibe lo último",
    "Lo que recibe la alianza",
    "Mes de reparto",
    "Revisión para fondos"
   ],
   "revision": [
    "preventa antes del primer desembolso",
    "cobertura del banco",
    "meses de crédito",
    "dinero que faltaría"
   ],
   "cuadro": "dinero"
  },
  "palanca:campana": {
   "tipo": "palanca",
   "palanca": "campana",
   "concepto": "Curva de obra: desviación",
   "unidad": "%",
   "dato": "cal.campana",
   "nota": "Pico a mitad de plazo.",
   "pasa_por": [
    "Mes desde el que se cobran los saldos",
    "Saldos por cobrar al individualizar",
    "Firmadas antes de los saldos · producto 1",
    "Firmadas antes de los saldos · producto 2",
    "Firmadas antes de los saldos · producto 3",
    "Firmadas antes de los saldos · producto 4",
    "Firmadas antes de los saldos · producto 5",
    "Firmadas antes de los saldos · producto 6"
   ],
   "mueve": [
    "Capital",
    "Banco (saldo máximo)",
    "Dinero ajeno máximo",
    "Dinero que faltaría",
    "Costo del dinero",
    "Ganancia real",
    "Margen",
    "Lo que recibe el dueño",
    "Cuándo recibe lo último",
    "Lo que recibe la alianza",
    "Mes de reparto",
    "Revisión para fondos"
   ],
   "revision": [
    "preventa antes del primer desembolso",
    "cobertura del banco",
    "meses de crédito",
    "dinero que faltaría"
   ],
   "cuadro": "tiempo"
  },
  "palanca:capital": {
   "tipo": "palanca",
   "palanca": "capital",
   "concepto": "Capital",
   "unidad": "MDP",
   "dato": "din.capital",
   "nota": "Lo más que puede soportar el proyecto. Entre menos capital, mejor; pasarse sólo da aviso. La base lo usa y la ronda no lo rebasa.",
   "pasa_por": [
    "Tierra más capital entre costo con tierra"
   ],
   "mueve": [
    "Capital",
    "Banco (saldo máximo)",
    "Dinero ajeno máximo",
    "Dinero que faltaría",
    "Costo del dinero",
    "Ganancia real",
    "Margen",
    "Lo que recibe el dueño",
    "Cuándo recibe lo último",
    "Lo que recibe la alianza",
    "Mes de reparto",
    "Revisión para fondos"
   ],
   "revision": [
    "tierra y capital entre costo",
    "preventa antes del primer desembolso",
    "cobertura del banco",
    "meses de crédito",
    "dinero que faltaría"
   ],
   "cuadro": "dinero"
  },
  "palanca:cierre": {
   "tipo": "palanca",
   "palanca": "cierre",
   "concepto": "Cierre sobre el valor de la tierra",
   "unidad": "%",
   "dato": "costo.cierre",
   "nota": "Referencia del oficio: PPP vertical.",
   "dato_otros": true,
   "dato_pasa_por": [
    "Cierre de tierra",
    "Obra directa",
    "Indirectos",
    "Imprevistos",
    "Costo sin tierra",
    "Costo con tierra",
    "Mes desde el que se cobran los saldos",
    "Saldos por cobrar al individualizar",
    "Línea del banco",
    "Caja mínima",
    "Tierra más capital entre costo con tierra",
    "Firmadas antes de los saldos · producto 1",
    "Firmadas antes de los saldos · producto 2",
    "Firmadas antes de los saldos · producto 3",
    "Firmadas antes de los saldos · producto 4",
    "Firmadas antes de los saldos · producto 5",
    "Firmadas antes de los saldos · producto 6"
   ],
   "dato_mueve": [
    "Costo sin tierra",
    "Capital",
    "Banco (saldo máximo)",
    "Dinero ajeno máximo",
    "Dinero que faltaría",
    "Costo del dinero",
    "Ganancia real",
    "Margen",
    "Lo que recibe el dueño",
    "Cuándo recibe lo último",
    "Lo que recibe la alianza",
    "Mes de reparto",
    "Revisión para fondos"
   ],
   "pasa_por": [
    "Cierre de tierra",
    "Costo sin tierra",
    "Costo con tierra",
    "Línea del banco",
    "Caja mínima",
    "Tierra más capital entre costo con tierra"
   ],
   "mueve": [
    "Costo sin tierra",
    "Capital",
    "Banco (saldo máximo)",
    "Dinero ajeno máximo",
    "Dinero que faltaría",
    "Costo del dinero",
    "Ganancia real",
    "Margen",
    "Lo que recibe el dueño",
    "Cuándo recibe lo último",
    "Lo que recibe la alianza",
    "Mes de reparto",
    "Revisión para fondos"
   ],
   "revision": [
    "línea del banco entre ventas",
    "línea del banco entre costo",
    "tierra y capital entre costo",
    "preventa antes del primer desembolso",
    "cobertura del banco",
    "margen sobre costo",
    "meses de crédito",
    "dinero que faltaría"
   ],
   "cuadro": "costo"
  },
  "palanca:comision": {
   "tipo": "palanca",
   "palanca": "comision",
   "concepto": "Comisión sobre ventas",
   "unidad": "%",
   "dato": "costo.comision",
   "nota": "Referencia del oficio: PPP vertical.",
   "dato_otros": true,
   "dato_pasa_por": [
    "Comisiones",
    "Obra directa",
    "Indirectos",
    "Imprevistos",
    "Costo sin tierra",
    "Costo con tierra",
    "Mes desde el que se cobran los saldos",
    "Saldos por cobrar al individualizar",
    "Línea del banco",
    "Caja mínima",
    "Tierra más capital entre costo con tierra",
    "Firmadas antes de los saldos · producto 1",
    "Firmadas antes de los saldos · producto 2",
    "Firmadas antes de los saldos · producto 3",
    "Firmadas antes de los saldos · producto 4",
    "Firmadas antes de los saldos · producto 5",
    "Firmadas antes de los saldos · producto 6"
   ],
   "dato_mueve": [
    "Costo sin tierra",
    "Capital",
    "Banco (saldo máximo)",
    "Dinero ajeno máximo",
    "Dinero que faltaría",
    "Costo del dinero",
    "Ganancia real",
    "Margen",
    "Lo que recibe el dueño",
    "Cuándo recibe lo último",
    "Lo que recibe la alianza",
    "Mes de reparto",
    "Revisión para fondos"
   ],
   "pasa_por": [
    "Comisiones",
    "Costo sin tierra",
    "Costo con tierra",
    "Línea del banco",
    "Caja mínima",
    "Tierra más capital entre costo con tierra"
   ],
   "mueve": [
    "Costo sin tierra",
    "Capital",
    "Banco (saldo máximo)",
    "Dinero ajeno máximo",
    "Dinero que faltaría",
    "Costo del dinero",
    "Ganancia real",
    "Margen",
    "Lo que recibe el dueño",
    "Cuándo recibe lo último",
    "Lo que recibe la alianza",
    "Mes de reparto",
    "Revisión para fondos"
   ],
   "revision": [
    "línea del banco entre ventas",
    "línea del banco entre costo",
    "tierra y capital entre costo",
    "preventa antes del primer desembolso",
    "cobertura del banco",
    "margen sobre costo",
    "meses de crédito",
    "dinero que faltaría"
   ],
   "cuadro": "producto"
  },
  "palanca:devolver_con_obra": {
   "tipo": "palanca",
   "palanca": "devolver_con_obra",
   "concepto": "¿El capital espera a que termine la obra para salir? (1 sí, 0 sale en cuanto sobra dinero)",
   "unidad": "1/0",
   "nota": "1 = el capital espera a que termine la obra para salir; 0 = sale en cuanto sobra dinero.",
   "pasa_por": [],
   "mueve": [
    "Capital",
    "Banco (saldo máximo)",
    "Dinero ajeno máximo",
    "Dinero que faltaría",
    "Costo del dinero",
    "Ganancia real",
    "Margen",
    "Lo que recibe el dueño",
    "Cuándo recibe lo último",
    "Lo que recibe la alianza",
    "Mes de reparto",
    "Revisión para fondos"
   ],
   "revision": [
    "preventa antes del primer desembolso",
    "cobertura del banco",
    "meses de crédito",
    "dinero que faltaría"
   ],
   "cuadro": "dinero"
  },
  "palanca:durante_obra_1": {
   "tipo": "palanca",
   "palanca": "durante_obra_1",
   "concepto": "% pagado durante la obra · producto 1",
   "unidad": "%",
   "producto": 1,
   "nota": "Cuánto paga el cliente durante la obra en este producto; la base sale de la pestaña Productos.",
   "pasa_por": [
    "Saldos por cobrar al individualizar"
   ],
   "mueve": [
    "Capital",
    "Banco (saldo máximo)",
    "Dinero ajeno máximo",
    "Dinero que faltaría",
    "Costo del dinero",
    "Ganancia real",
    "Margen",
    "Lo que recibe el dueño",
    "Cuándo recibe lo último",
    "Lo que recibe la alianza",
    "Mes de reparto",
    "Revisión para fondos"
   ],
   "revision": [
    "preventa antes del primer desembolso",
    "cobertura del banco",
    "meses de crédito",
    "dinero que faltaría"
   ],
   "cuadro": "dinero"
  },
  "palanca:durante_obra_2": {
   "tipo": "palanca",
   "palanca": "durante_obra_2",
   "concepto": "% pagado durante la obra · producto 2",
   "unidad": "%",
   "producto": 2,
   "nota": "Cuánto paga el cliente durante la obra en este producto; la base sale de la pestaña Productos.",
   "pasa_por": [
    "Saldos por cobrar al individualizar"
   ],
   "mueve": [
    "Capital",
    "Banco (saldo máximo)",
    "Dinero ajeno máximo",
    "Dinero que faltaría",
    "Costo del dinero",
    "Ganancia real",
    "Margen",
    "Lo que recibe el dueño",
    "Cuándo recibe lo último",
    "Lo que recibe la alianza",
    "Mes de reparto",
    "Revisión para fondos"
   ],
   "revision": [
    "preventa antes del primer desembolso",
    "cobertura del banco",
    "meses de crédito",
    "dinero que faltaría"
   ],
   "cuadro": "dinero"
  },
  "palanca:durante_obra_3": {
   "tipo": "palanca",
   "palanca": "durante_obra_3",
   "concepto": "% pagado durante la obra · producto 3",
   "unidad": "%",
   "producto": 3,
   "nota": "Cuánto paga el cliente durante la obra en este producto; la base sale de la pestaña Productos.",
   "pasa_por": [
    "Saldos por cobrar al individualizar"
   ],
   "mueve": [
    "Capital",
    "Banco (saldo máximo)",
    "Dinero ajeno máximo",
    "Dinero que faltaría",
    "Costo del dinero",
    "Ganancia real",
    "Margen",
    "Lo que recibe el dueño",
    "Cuándo recibe lo último",
    "Lo que recibe la alianza",
    "Mes de reparto",
    "Revisión para fondos"
   ],
   "revision": [
    "preventa antes del primer desembolso",
    "cobertura del banco",
    "meses de crédito",
    "dinero que faltaría"
   ],
   "cuadro": "dinero"
  },
  "palanca:durante_obra_4": {
   "tipo": "palanca",
   "palanca": "durante_obra_4",
   "concepto": "% pagado durante la obra · producto 4",
   "unidad": "%",
   "producto": 4,
   "nota": "Cuánto paga el cliente durante la obra en este producto; la base sale de la pestaña Productos.",
   "pasa_por": [
    "Saldos por cobrar al individualizar"
   ],
   "mueve": [
    "Capital",
    "Banco (saldo máximo)",
    "Dinero ajeno máximo",
    "Dinero que faltaría",
    "Costo del dinero",
    "Ganancia real",
    "Margen",
    "Lo que recibe el dueño",
    "Cuándo recibe lo último",
    "Lo que recibe la alianza",
    "Mes de reparto",
    "Revisión para fondos"
   ],
   "revision": [
    "preventa antes del primer desembolso",
    "cobertura del banco",
    "meses de crédito",
    "dinero que faltaría"
   ],
   "cuadro": "dinero"
  },
  "palanca:durante_obra_5": {
   "tipo": "palanca",
   "palanca": "durante_obra_5",
   "concepto": "% pagado durante la obra · producto 5",
   "unidad": "%",
   "producto": 5,
   "nota": "Cuánto paga el cliente durante la obra en este producto; la base sale de la pestaña Productos.",
   "pasa_por": [
    "Saldos por cobrar al individualizar"
   ],
   "mueve": [
    "Capital",
    "Banco (saldo máximo)",
    "Dinero ajeno máximo",
    "Dinero que faltaría",
    "Costo del dinero",
    "Ganancia real",
    "Margen",
    "Lo que recibe el dueño",
    "Cuándo recibe lo último",
    "Lo que recibe la alianza",
    "Mes de reparto",
    "Revisión para fondos"
   ],
   "revision": [
    "preventa antes del primer desembolso",
    "cobertura del banco",
    "meses de crédito",
    "dinero que faltaría"
   ],
   "cuadro": "dinero"
  },
  "palanca:durante_obra_6": {
   "tipo": "palanca",
   "palanca": "durante_obra_6",
   "concepto": "% pagado durante la obra · producto 6",
   "unidad": "%",
   "producto": 6,
   "nota": "Cuánto paga el cliente durante la obra en este producto; la base sale de la pestaña Productos.",
   "pasa_por": [
    "Saldos por cobrar al individualizar"
   ],
   "mueve": [
    "Capital",
    "Banco (saldo máximo)",
    "Dinero ajeno máximo",
    "Dinero que faltaría",
    "Costo del dinero",
    "Ganancia real",
    "Margen",
    "Lo que recibe el dueño",
    "Cuándo recibe lo último",
    "Lo que recibe la alianza",
    "Mes de reparto",
    "Revisión para fondos"
   ],
   "revision": [
    "preventa antes del primer desembolso",
    "cobertura del banco",
    "meses de crédito",
    "dinero que faltaría"
   ],
   "cuadro": "dinero"
  },
  "palanca:enganche": {
   "tipo": "palanca",
   "palanca": "enganche",
   "concepto": "Enganche al firmar",
   "unidad": "%",
   "dato": "cob.enganche",
   "nota": "",
   "pasa_por": [
    "Saldos por cobrar al individualizar"
   ],
   "mueve": [
    "Capital",
    "Banco (saldo máximo)",
    "Dinero ajeno máximo",
    "Dinero que faltaría",
    "Costo del dinero",
    "Ganancia real",
    "Margen",
    "Lo que recibe el dueño",
    "Cuándo recibe lo último",
    "Lo que recibe la alianza",
    "Mes de reparto",
    "Revisión para fondos"
   ],
   "revision": [
    "preventa antes del primer desembolso",
    "cobertura del banco",
    "meses de crédito",
    "dinero que faltaría"
   ],
   "cuadro": "dinero"
  },
  "palanca:imprevistos": {
   "tipo": "palanca",
   "palanca": "imprevistos",
   "concepto": "Imprevistos sobre obra directa",
   "unidad": "%",
   "dato": "costo.imprevistos",
   "nota": "Referencia del oficio: PPP vertical.",
   "dato_otros": true,
   "dato_pasa_por": [
    "Obra directa",
    "Indirectos",
    "Imprevistos",
    "Costo sin tierra",
    "Costo con tierra",
    "Mes desde el que se cobran los saldos",
    "Saldos por cobrar al individualizar",
    "Línea del banco",
    "Caja mínima",
    "Tierra más capital entre costo con tierra",
    "Firmadas antes de los saldos · producto 1",
    "Firmadas antes de los saldos · producto 2",
    "Firmadas antes de los saldos · producto 3",
    "Firmadas antes de los saldos · producto 4",
    "Firmadas antes de los saldos · producto 5",
    "Firmadas antes de los saldos · producto 6"
   ],
   "dato_mueve": [
    "Costo sin tierra",
    "Capital",
    "Banco (saldo máximo)",
    "Dinero ajeno máximo",
    "Dinero que faltaría",
    "Costo del dinero",
    "Ganancia real",
    "Margen",
    "Lo que recibe el dueño",
    "Cuándo recibe lo último",
    "Lo que recibe la alianza",
    "Mes de reparto",
    "Revisión para fondos"
   ],
   "pasa_por": [
    "Imprevistos",
    "Costo sin tierra",
    "Costo con tierra",
    "Línea del banco",
    "Caja mínima",
    "Tierra más capital entre costo con tierra"
   ],
   "mueve": [
    "Costo sin tierra",
    "Capital",
    "Banco (saldo máximo)",
    "Dinero ajeno máximo",
    "Dinero que faltaría",
    "Costo del dinero",
    "Ganancia real",
    "Margen",
    "Lo que recibe el dueño",
    "Cuándo recibe lo último",
    "Lo que recibe la alianza",
    "Mes de reparto",
    "Revisión para fondos"
   ],
   "revision": [
    "línea del banco entre ventas",
    "línea del banco entre costo",
    "tierra y capital entre costo",
    "preventa antes del primer desembolso",
    "cobertura del banco",
    "margen sobre costo",
    "meses de crédito",
    "dinero que faltaría"
   ],
   "cuadro": "costo"
  },
  "palanca:ind_predesarrollo": {
   "tipo": "palanca",
   "palanca": "ind_predesarrollo",
   "concepto": "Indirectos que se gastan en predesarrollo",
   "unidad": "%",
   "dato": "costo.ind_predesarrollo",
   "nota": "",
   "pasa_por": [],
   "mueve": [
    "Capital",
    "Banco (saldo máximo)",
    "Dinero ajeno máximo",
    "Dinero que faltaría",
    "Costo del dinero",
    "Ganancia real",
    "Margen",
    "Lo que recibe el dueño",
    "Cuándo recibe lo último",
    "Lo que recibe la alianza",
    "Mes de reparto",
    "Revisión para fondos"
   ],
   "revision": [
    "preventa antes del primer desembolso",
    "cobertura del banco",
    "meses de crédito",
    "dinero que faltaría"
   ],
   "cuadro": "costo"
  },
  "palanca:indirectos": {
   "tipo": "palanca",
   "palanca": "indirectos",
   "concepto": "Indirectos sobre obra directa",
   "unidad": "%",
   "dato": "costo.indirectos",
   "nota": "Referencia del oficio: PPP vertical.",
   "dato_otros": true,
   "dato_pasa_por": [
    "Obra directa",
    "Indirectos",
    "Imprevistos",
    "Costo sin tierra",
    "Costo con tierra",
    "Mes desde el que se cobran los saldos",
    "Saldos por cobrar al individualizar",
    "Línea del banco",
    "Caja mínima",
    "Tierra más capital entre costo con tierra",
    "Firmadas antes de los saldos · producto 1",
    "Firmadas antes de los saldos · producto 2",
    "Firmadas antes de los saldos · producto 3",
    "Firmadas antes de los saldos · producto 4",
    "Firmadas antes de los saldos · producto 5",
    "Firmadas antes de los saldos · producto 6"
   ],
   "dato_mueve": [
    "Costo sin tierra",
    "Capital",
    "Banco (saldo máximo)",
    "Dinero ajeno máximo",
    "Dinero que faltaría",
    "Costo del dinero",
    "Ganancia real",
    "Margen",
    "Lo que recibe el dueño",
    "Cuándo recibe lo último",
    "Lo que recibe la alianza",
    "Mes de reparto",
    "Revisión para fondos"
   ],
   "pasa_por": [
    "Indirectos",
    "Costo sin tierra",
    "Costo con tierra",
    "Línea del banco",
    "Caja mínima",
    "Tierra más capital entre costo con tierra"
   ],
   "mueve": [
    "Costo sin tierra",
    "Capital",
    "Banco (saldo máximo)",
    "Dinero ajeno máximo",
    "Dinero que faltaría",
    "Costo del dinero",
    "Ganancia real",
    "Margen",
    "Lo que recibe el dueño",
    "Cuándo recibe lo último",
    "Lo que recibe la alianza",
    "Mes de reparto",
    "Revisión para fondos"
   ],
   "revision": [
    "línea del banco entre ventas",
    "línea del banco entre costo",
    "tierra y capital entre costo",
    "preventa antes del primer desembolso",
    "cobertura del banco",
    "margen sobre costo",
    "meses de crédito",
    "dinero que faltaría"
   ],
   "cuadro": "costo"
  },
  "palanca:individualizar": {
   "tipo": "palanca",
   "palanca": "individualizar",
   "concepto": "Avance para individualizar (100% = obra terminada)",
   "unidad": "%",
   "dato": "cob.individualizar",
   "nota": "",
   "pasa_por": [
    "Mes desde el que se cobran los saldos",
    "Saldos por cobrar al individualizar",
    "Firmadas antes de los saldos · producto 1",
    "Firmadas antes de los saldos · producto 2",
    "Firmadas antes de los saldos · producto 3",
    "Firmadas antes de los saldos · producto 4",
    "Firmadas antes de los saldos · producto 5",
    "Firmadas antes de los saldos · producto 6"
   ],
   "mueve": [
    "Capital",
    "Banco (saldo máximo)",
    "Dinero ajeno máximo",
    "Dinero que faltaría",
    "Costo del dinero",
    "Ganancia real",
    "Margen",
    "Lo que recibe el dueño",
    "Cuándo recibe lo último",
    "Lo que recibe la alianza",
    "Mes de reparto",
    "Revisión para fondos"
   ],
   "revision": [
    "preventa antes del primer desembolso",
    "cobertura del banco",
    "meses de crédito",
    "dinero que faltaría"
   ],
   "cuadro": "tiempo"
  },
  "palanca:meses_saldos": {
   "tipo": "palanca",
   "palanca": "meses_saldos",
   "concepto": "Meses para cobrar saldos al individualizar",
   "unidad": "meses",
   "dato": "cob.meses_saldos",
   "nota": "",
   "pasa_por": [],
   "mueve": [
    "Capital",
    "Banco (saldo máximo)",
    "Dinero ajeno máximo",
    "Dinero que faltaría",
    "Costo del dinero",
    "Ganancia real",
    "Margen",
    "Lo que recibe el dueño",
    "Cuándo recibe lo último",
    "Lo que recibe la alianza",
    "Mes de reparto",
    "Revisión para fondos"
   ],
   "revision": [
    "preventa antes del primer desembolso",
    "cobertura del banco",
    "meses de crédito",
    "dinero que faltaría"
   ],
   "cuadro": "tiempo"
  },
  "palanca:obra_duracion": {
   "tipo": "palanca",
   "palanca": "obra_duracion",
   "concepto": "Obra: duración (meses)",
   "unidad": "meses",
   "dato": "cal.obra_duracion",
   "nota": "",
   "pasa_por": [
    "Obra: mes de terminación",
    "Mes desde el que se cobran los saldos",
    "Saldos por cobrar al individualizar",
    "Firmadas antes de los saldos · producto 1",
    "Firmadas antes de los saldos · producto 2",
    "Firmadas antes de los saldos · producto 3",
    "Firmadas antes de los saldos · producto 4",
    "Firmadas antes de los saldos · producto 5",
    "Firmadas antes de los saldos · producto 6"
   ],
   "mueve": [
    "Fin de obra",
    "Capital",
    "Banco (saldo máximo)",
    "Dinero ajeno máximo",
    "Dinero que faltaría",
    "Costo del dinero",
    "Ganancia real",
    "Margen",
    "Lo que recibe el dueño",
    "Cuándo recibe lo último",
    "Lo que recibe la alianza",
    "Mes de reparto",
    "Revisión para fondos"
   ],
   "revision": [
    "preventa antes del primer desembolso",
    "cobertura del banco",
    "meses de crédito",
    "dinero que faltaría"
   ],
   "cuadro": "tiempo"
  },
  "palanca:obra_inicio": {
   "tipo": "palanca",
   "palanca": "obra_inicio",
   "concepto": "Obra: mes de inicio",
   "unidad": "mes",
   "dato": "cal.obra_inicio",
   "nota": "",
   "pasa_por": [
    "Obra: mes de terminación",
    "Mes desde el que se cobran los saldos",
    "Saldos por cobrar al individualizar",
    "Preventa firmada al arrancar la obra",
    "Firmadas antes de los saldos · producto 1",
    "Firmadas antes de los saldos · producto 2",
    "Firmadas antes de los saldos · producto 3",
    "Firmadas antes de los saldos · producto 4",
    "Firmadas antes de los saldos · producto 5",
    "Firmadas antes de los saldos · producto 6"
   ],
   "mueve": [
    "Arranque de obra",
    "Fin de obra",
    "Capital",
    "Banco (saldo máximo)",
    "Dinero ajeno máximo",
    "Dinero que faltaría",
    "Costo del dinero",
    "Ganancia real",
    "Margen",
    "Lo que recibe el dueño",
    "Cuándo recibe lo último",
    "Lo que recibe la alianza",
    "Mes de reparto",
    "Revisión para fondos"
   ],
   "revision": [
    "preventa al arrancar la obra",
    "preventa antes del primer desembolso",
    "cobertura del banco",
    "meses de crédito",
    "dinero que faltaría"
   ],
   "cuadro": "tiempo"
  },
  "palanca:predesarrollo": {
   "tipo": "palanca",
   "palanca": "predesarrollo",
   "concepto": "Predesarrollo (meses)",
   "unidad": "meses",
   "dato": "cal.predesarrollo",
   "nota": "Proyecto, permisos y estudios.",
   "pasa_por": [],
   "mueve": [
    "Capital",
    "Banco (saldo máximo)",
    "Dinero ajeno máximo",
    "Dinero que faltaría",
    "Costo del dinero",
    "Ganancia real",
    "Margen",
    "Lo que recibe el dueño",
    "Cuándo recibe lo último",
    "Lo que recibe la alianza",
    "Mes de reparto",
    "Revisión para fondos"
   ],
   "revision": [
    "preventa antes del primer desembolso",
    "cobertura del banco",
    "meses de crédito",
    "dinero que faltaría"
   ],
   "cuadro": "tiempo"
  },
  "palanca:saldo_posterior": {
   "tipo": "palanca",
   "palanca": "saldo_posterior",
   "concepto": "Lo firmado después paga el saldo a los (meses)",
   "unidad": "meses",
   "dato": "cob.saldo_posterior",
   "nota": "",
   "pasa_por": [],
   "mueve": [
    "Capital",
    "Banco (saldo máximo)",
    "Dinero ajeno máximo",
    "Dinero que faltaría",
    "Costo del dinero",
    "Ganancia real",
    "Margen",
    "Lo que recibe el dueño",
    "Cuándo recibe lo último",
    "Lo que recibe la alianza",
    "Mes de reparto",
    "Revisión para fondos"
   ],
   "revision": [
    "preventa antes del primer desembolso",
    "cobertura del banco",
    "meses de crédito",
    "dinero que faltaría"
   ],
   "cuadro": "tiempo"
  },
  "palanca:sobretasa": {
   "tipo": "palanca",
   "palanca": "sobretasa",
   "concepto": "Sobretasa",
   "unidad": "%",
   "dato": "din.sobretasa",
   "nota": "",
   "pasa_por": [
    "Tasa del banco"
   ],
   "mueve": [
    "Capital",
    "Banco (saldo máximo)",
    "Dinero ajeno máximo",
    "Dinero que faltaría",
    "Costo del dinero",
    "Ganancia real",
    "Margen",
    "Lo que recibe el dueño",
    "Cuándo recibe lo último",
    "Lo que recibe la alianza",
    "Mes de reparto",
    "Revisión para fondos"
   ],
   "revision": [
    "preventa antes del primer desembolso",
    "cobertura del banco",
    "meses de crédito",
    "dinero que faltaría"
   ],
   "cuadro": "dinero"
  },
  "palanca:tasa_capital": {
   "tipo": "palanca",
   "palanca": "tasa_capital",
   "concepto": "Rendimiento anual del capital",
   "unidad": "%",
   "dato": "din.tasa_capital",
   "nota": "",
   "pasa_por": [],
   "mueve": [
    "Capital",
    "Banco (saldo máximo)",
    "Dinero ajeno máximo",
    "Dinero que faltaría",
    "Costo del dinero",
    "Ganancia real",
    "Margen",
    "Lo que recibe el dueño",
    "Cuándo recibe lo último",
    "Lo que recibe la alianza",
    "Mes de reparto",
    "Revisión para fondos"
   ],
   "revision": [
    "preventa antes del primer desembolso",
    "cobertura del banco",
    "meses de crédito",
    "dinero que faltaría"
   ],
   "cuadro": "dinero"
  },
  "palanca:tierra": {
   "tipo": "palanca",
   "palanca": "tierra",
   "concepto": "Valor de la tierra",
   "unidad": "MDP",
   "dato": "tierra.valor",
   "nota": "Lo que vale la tierra que aporta el dueño.",
   "dato_otros": true,
   "dato_pasa_por": [
    "Cierre de tierra",
    "Obra directa",
    "Indirectos",
    "Imprevistos",
    "Costo sin tierra",
    "Costo con tierra",
    "Mes desde el que se cobran los saldos",
    "Saldos por cobrar al individualizar",
    "Línea del banco",
    "Caja mínima",
    "Tierra más capital entre costo con tierra",
    "Firmadas antes de los saldos · producto 1",
    "Firmadas antes de los saldos · producto 2",
    "Firmadas antes de los saldos · producto 3",
    "Firmadas antes de los saldos · producto 4",
    "Firmadas antes de los saldos · producto 5",
    "Firmadas antes de los saldos · producto 6"
   ],
   "dato_mueve": [
    "Costo sin tierra",
    "Tierra",
    "Capital",
    "Banco (saldo máximo)",
    "Dinero ajeno máximo",
    "Dinero que faltaría",
    "Costo del dinero",
    "Ganancia real",
    "Margen",
    "Lo que recibe el dueño",
    "Cuándo recibe lo último",
    "Lo que recibe la alianza",
    "Mes de reparto",
    "Revisión para fondos"
   ],
   "pasa_por": [
    "Cierre de tierra",
    "Costo sin tierra",
    "Costo con tierra",
    "Línea del banco",
    "Caja mínima",
    "Tierra más capital entre costo con tierra"
   ],
   "mueve": [
    "Costo sin tierra",
    "Tierra",
    "Capital",
    "Banco (saldo máximo)",
    "Dinero ajeno máximo",
    "Dinero que faltaría",
    "Costo del dinero",
    "Ganancia real",
    "Margen",
    "Lo que recibe el dueño",
    "Cuándo recibe lo último",
    "Lo que recibe la alianza",
    "Mes de reparto",
    "Revisión para fondos"
   ],
   "revision": [
    "línea del banco entre ventas",
    "línea del banco entre costo",
    "tierra y capital entre costo",
    "preventa antes del primer desembolso",
    "cobertura del banco",
    "margen sobre costo",
    "meses de crédito",
    "dinero que faltaría"
   ],
   "cuadro": "terreno"
  },
  "palanca:tiie": {
   "tipo": "palanca",
   "palanca": "tiie",
   "concepto": "TIIE",
   "unidad": "%",
   "dato": "din.tiie",
   "nota": "",
   "pasa_por": [
    "Tasa del banco"
   ],
   "mueve": [
    "Capital",
    "Banco (saldo máximo)",
    "Dinero ajeno máximo",
    "Dinero que faltaría",
    "Costo del dinero",
    "Ganancia real",
    "Margen",
    "Lo que recibe el dueño",
    "Cuándo recibe lo último",
    "Lo que recibe la alianza",
    "Mes de reparto",
    "Revisión para fondos"
   ],
   "revision": [
    "preventa antes del primer desembolso",
    "cobertura del banco",
    "meses de crédito",
    "dinero que faltaría"
   ],
   "cuadro": "dinero"
  },
  "palanca:usa_banco": {
   "tipo": "palanca",
   "palanca": "usa_banco",
   "concepto": "¿Usa crédito del banco? (1 sí, 0 no)",
   "unidad": "1/0",
   "nota": "1 = esta versión usa crédito del banco; 0 = se hace sin banco.",
   "pasa_por": [
    "Línea del banco"
   ],
   "mueve": [
    "Capital",
    "Banco (saldo máximo)",
    "Dinero ajeno máximo",
    "Dinero que faltaría",
    "Costo del dinero",
    "Ganancia real",
    "Margen",
    "Lo que recibe el dueño",
    "Cuándo recibe lo último",
    "Lo que recibe la alianza",
    "Mes de reparto",
    "Revisión para fondos"
   ],
   "revision": [
    "línea del banco entre ventas",
    "línea del banco entre costo",
    "preventa antes del primer desembolso",
    "cobertura del banco",
    "meses de crédito",
    "dinero que faltaría"
   ],
   "cuadro": "dinero"
  },
  "palanca:ventas_inicio": {
   "tipo": "palanca",
   "palanca": "ventas_inicio",
   "concepto": "Ventas: mes de inicio",
   "unidad": "mes",
   "dato": "cal.ventas_inicio",
   "nota": "",
   "pasa_por": [
    "Saldos por cobrar al individualizar",
    "Preventa firmada al arrancar la obra",
    "Firmadas antes de los saldos · producto 1",
    "Firmadas antes de los saldos · producto 2",
    "Firmadas antes de los saldos · producto 3",
    "Firmadas antes de los saldos · producto 4",
    "Firmadas antes de los saldos · producto 5",
    "Firmadas antes de los saldos · producto 6"
   ],
   "mueve": [
    "Capital",
    "Banco (saldo máximo)",
    "Dinero ajeno máximo",
    "Dinero que faltaría",
    "Costo del dinero",
    "Ganancia real",
    "Margen",
    "Lo que recibe el dueño",
    "Cuándo recibe lo último",
    "Lo que recibe la alianza",
    "Mes de reparto",
    "Revisión para fondos"
   ],
   "revision": [
    "preventa al arrancar la obra",
    "preventa antes del primer desembolso",
    "cobertura del banco",
    "meses de crédito",
    "dinero que faltaría"
   ],
   "cuadro": "tiempo"
  },
  "palanca:ventas_meses": {
   "tipo": "palanca",
   "palanca": "ventas_meses",
   "concepto": "Ventas: meses de comercialización",
   "unidad": "meses",
   "dato": "cal.ventas_meses",
   "nota": "",
   "pasa_por": [
    "Saldos por cobrar al individualizar",
    "Preventa firmada al arrancar la obra",
    "Firmadas antes de los saldos · producto 1",
    "Firmadas antes de los saldos · producto 2",
    "Firmadas antes de los saldos · producto 3",
    "Firmadas antes de los saldos · producto 4",
    "Firmadas antes de los saldos · producto 5",
    "Firmadas antes de los saldos · producto 6"
   ],
   "mueve": [
    "Capital",
    "Banco (saldo máximo)",
    "Dinero ajeno máximo",
    "Dinero que faltaría",
    "Costo del dinero",
    "Ganancia real",
    "Margen",
    "Lo que recibe el dueño",
    "Cuándo recibe lo último",
    "Lo que recibe la alianza",
    "Mes de reparto",
    "Revisión para fondos"
   ],
   "revision": [
    "preventa al arrancar la obra",
    "preventa antes del primer desembolso",
    "cobertura del banco",
    "meses de crédito",
    "dinero que faltaría"
   ],
   "cuadro": "tiempo"
  },
  "preguntas": {
   "tipo": "preguntas",
   "concepto": "La pregunta que más mueve el plan",
   "unidad": "",
   "nota": "El plan ordena sus preguntas por cuánto mueven el resultado.",
   "pasa_por": [],
   "mueve": [],
   "revision": [],
   "cuadro": "riesgo"
  },
  "productos": {
   "tipo": "productos",
   "concepto": "Productos: unidades, m² y precio",
   "unidad": "",
   "nota": "Lo que se vende. Cambiar unidades, m² o precio mueve las ventas de todas las versiones.",
   "pasa_por": [
    "Ventas",
    "Comisiones",
    "Costo sin tierra",
    "Costo con tierra",
    "Saldos por cobrar al individualizar",
    "Línea del banco",
    "Caja mínima",
    "Preventa firmada al arrancar la obra",
    "Tierra más capital entre costo con tierra",
    "Precio por unidad · producto 1",
    "Firmadas antes de los saldos · producto 1"
   ],
   "mueve": [
    "Ventas",
    "Costo sin tierra",
    "Capital",
    "Banco (saldo máximo)",
    "Dinero ajeno máximo",
    "Dinero que faltaría",
    "Costo del dinero",
    "Ganancia real",
    "Margen",
    "Lo que recibe el dueño",
    "Cuándo recibe lo último",
    "Lo que recibe la alianza",
    "Mes de reparto",
    "Revisión para fondos"
   ],
   "revision": [
    "línea del banco entre ventas",
    "línea del banco entre costo",
    "tierra y capital entre costo",
    "preventa al arrancar la obra",
    "preventa antes del primer desembolso",
    "cobertura del banco",
    "margen sobre costo",
    "meses de crédito",
    "dinero que faltaría"
   ],
   "cuadro": "producto"
  },
  "reparto:esquema": {
   "tipo": "reparto",
   "concepto": "Esquema de reparto con el dueño",
   "unidad": "",
   "nota": "Cómo se reparte el resultado entre el dueño de la tierra, el capital y la alianza.",
   "pasa_por": [],
   "mueve": [],
   "revision": [],
   "cuadro": "reparto"
  }
 },
 "sobran": [
  {
   "clave": "preventa_minima",
   "concepto": "Preventa mínima para arrancar obra",
   "palanca": true,
   "motivo": "ninguna fórmula la lee"
  },
  {
   "clave": "lamina.utilidad",
   "concepto": "Utilidad del anteproyecto",
   "motivo": "sólo cuenta para la edad del plan"
  },
  {
   "clave": "lamina.pago_dueno",
   "concepto": "Pago total al dueño en la oferta",
   "motivo": "sólo cuenta para la edad del plan"
  },
  {
   "clave": "lamina.m2_vendibles",
   "concepto": "Área vendible total",
   "motivo": "sólo cuenta para la edad del plan"
  }
 ],
 "firma": "6102a37363a60b35ed7300354b780136f970c7d7f8a3c52f973ce58993a10704"
};
