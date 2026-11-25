/* Árbol PPP · MÓDULO DE REPARTOS (SPPP · T-10 · copia de prueba; nada en producción).
   Implementa el diseño de repartos v3 (T-08) con las condiciones de los dictámenes T-08 v3 (N-02, B2, M3, M5 y reparto de un solo
   receptor inválido) y T-09 v2 (C1, C2, N1 y N3). Port exacto de t08v3_reparto.py: mismas reglas, mismos mensajes y la misma
   aritmética decimal (racionales exactos con BigInt en lugar de Decimal; redondeo «mitad hacia afuera» como ROUND_HALF_UP).

   Dos partes, igual que el guion:
     1. cascada(P): cascada independiente sobre el ejemplo sintético anual (forma de Hub La Colorada; NO es el modelo del Hub).
     2. repartoVertical(caso, parametros): módulo vertical EN VENTA sobre las series F-02 del motor (meses en base uno, pesos).
   Renta y el Hub NO se implementan: el vertical bloquea de forma explícita lo que no es vertical en venta.

   Estados de cada importe (siempre separados): simulado (cascada), autorizado (simulado menos lo pagado, sólo si pasan validación,
   candados, solvencia, reservas, receptores, identidades, pagos y pacto) y pagado (libro de pagos, fuera del Árbol).
   Decisión de Alejandro (parada P-02): opción A «50/50 y tercios» por omisión; B y C siguen disponibles como parámetros.
   Nada está firmado: «autorizado» queda en cero por falta de pacto; la decisión fija la simulación.
   Módulo puro, sin red, sin reloj y sin eval. Sirve en Node y en el navegador (UMD: window.ArbolReparto). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ArbolReparto = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const VERSION = 'reparto-t10-3.0.0';   // corrección 2 de T-10 (dictamen T-11 v2): N01

  /* ═════════════════════════ ARITMÉTICA EXACTA (equivale a Decimal del guion) ═════════════════════════ */
  const gcd = (a, b) => { if (a < 0n) a = -a; if (b < 0n) b = -b; while (b) { const t = a % b; a = b; b = t; } return a; };
  function Q(n, d) { if (d === 0n) throw new Error('división entre cero'); if (d < 0n) { n = -n; d = -d; } const g = gcd(n, d) || 1n; this.n = n / g; this.d = d / g; }
  const esQ = (x) => x instanceof Q;
  function desdeTexto(s) {
    const m = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(String(s).trim());
    if (!m || (m[2] === '' && (m[3] === undefined || m[3] === ''))) throw new Error('número inválido: ' + s);
    const ent = m[2] || '0', dec = m[3] || '', exp = parseInt(m[4] || '0', 10);
    let n = BigInt(ent + dec), d = 10n ** BigInt(dec.length);
    if (exp > 0) n *= 10n ** BigInt(exp); else if (exp < 0) d *= 10n ** BigInt(-exp);
    return new Q(m[1] === '-' ? -n : n, d);
  }
  function q(x) {
    if (esQ(x)) return x;
    if (typeof x === 'bigint') return new Q(x, 1n);
    if (typeof x === 'number') {
      if (!isFinite(x)) throw new Error('número no finito');
      if (Number.isInteger(x) && Math.abs(x) <= Number.MAX_SAFE_INTEGER) return new Q(BigInt(x), 1n);
      return desdeTexto(String(x));      // la representación más corta de JS es la misma que Python usa al escribir D(str(x))
    }
    if (typeof x === 'string') return desdeTexto(x);
    throw new Error('valor no numérico: ' + String(x));
  }
  const qa = (a, b) => { a = q(a); b = q(b); return new Q(a.n * b.d + b.n * a.d, a.d * b.d); };
  const qs = (a, b) => { a = q(a); b = q(b); return new Q(a.n * b.d - b.n * a.d, a.d * b.d); };
  const qm = (a, b) => { a = q(a); b = q(b); return new Q(a.n * b.n, a.d * b.d); };
  const qd = (a, b) => { a = q(a); b = q(b); if (b.n === 0n) throw new Error('división entre cero'); return new Q(a.n * b.d, a.d * b.n); };
  const qc = (a, b) => { a = q(a); b = q(b); const x = a.n * b.d - b.n * a.d; return x > 0n ? 1 : x < 0n ? -1 : 0; };
  const qpot = (a, k) => { let r = q(1); for (let i = 0; i < k; i++) r = qm(r, a); return r; };
  const qsuma = (xs) => xs.reduce((s, x) => qa(s, x), q(0));
  const qtrunc = (a) => { a = q(a); return a.n / a.d; };            // int() de Python: trunca hacia cero (BigInt)
  /* r(x) del guion: entero con ROUND_HALF_UP (mitad lejos de cero) */
  function r(x) {
    x = q(x); const neg = x.n < 0n, n = neg ? -x.n : x.n, e = n / x.d, resto = n - e * x.d;
    const k = 2n * resto >= x.d ? e + 1n : e;
    return Number(neg ? -k : k);
  }
  const aNum = (x) => (esQ(x) ? Number(x.n) / Number(x.d) : x);
  /* int(round(x)) de Python sobre flotantes: mitad al par */
  function pz(x) { const f = Math.floor(x), d = x - f; if (d > 0.5) return f + 1; if (d < 0.5) return f; return f % 2 === 0 ? f : f + 1; }
  const miles = (x) => { if (typeof x !== 'number' || !isFinite(x)) return String(x); const s = String(Math.abs(Math.trunc(x))).replace(/\B(?=(\d{3})+(?!\d))/g, ','); return (x < 0 ? '-' : '') + s; };
  const repr = (x) => (x === null || x === undefined ? 'None' : typeof x === 'string' ? "'" + x + "'" : typeof x === 'boolean' ? (x ? 'True' : 'False') : esQ(x) ? String(aNum(x)) : typeof x === 'object' ? JSON.stringify(x) : String(x));

  /* reparte(total, pesos): reparte el entero total (>= 0) en proporción a pesos con mayor residuo; en empate gana la primera llave
     del registro. Lanza Error con datos inválidos (A19c). `pesos` es un objeto (orden de llaves) o una lista de pares [llave, peso]. */
  function reparte(total, pesos) {
    const pares = Array.isArray(pesos) ? pesos.map((p) => [p[0], p[1]]) : Object.keys(pesos).map((k) => [k, pesos[k]]);
    if (total < 0) throw new Error('reparte: total negativo');
    if (pares.some((p) => qc(p[1], 0) < 0)) throw new Error('reparte: peso negativo');
    const s = qsuma(pares.map((p) => p[1]));
    const out = {};
    if (total === 0) { pares.forEach((p) => { out[p[0]] = 0; }); return out; }
    if (qc(s, 0) === 0) throw new Error('reparte: todos los pesos son cero');
    const exact = pares.map((p) => qd(qm(total, p[1]), s));
    const base = exact.map((e) => qtrunc(e));
    let resto = BigInt(total) - base.reduce((a, b) => a + b, 0n);
    const frac = exact.map((e, i) => qs(e, base[i]));
    const orden = pares.map((p, i) => i).sort((a, b) => -qc(frac[a], frac[b]) || a - b);
    for (let k = 0; k < orden.length && resto > 0n; k++, resto--) base[orden[k]] += 1n;
    pares.forEach((p, i) => { out[p[0]] = Number(base[i]); });
    return out;
  }
  const esEntero = (x) => typeof x === 'number' && Number.isInteger(x);
  const esNum = (x) => (typeof x === 'number' && isFinite(x)) || esQ(x);
  const esObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x) && !esQ(x);
  const clona = (x) => (Array.isArray(x) ? x.map(clona) : esObj(x) ? Object.keys(x).reduce((o, k) => { o[k] = clona(x[k]); return o; }, {}) : x);
  const suma = (xs) => xs.reduce((a, b) => a + b, 0);
  const sumaV = (o) => suma(Object.keys(o).map((k) => o[k]));

  /* ═════════════════════════ REGISTRO Y ENUMS (B4, B5) ═════════════════════════ */
  const ESTADOS_PACTO = ['pactado', 'acordado_avanzar', 'propuesto', 'pendiente', 'supuesto'];
  const SIN = 'SIN_ASIGNAR';     // receptor sin asignar: todo importe aquí deja la autorización en cero
  const NOMBRES = { YOD: 'YoDesarrollo', PG: 'Puebla Arquitectos', AVM: 'Avermont (Eduardo Lara)', JV: 'Jorge Vizcaíno', FC: 'Fernando Corral Torres', [SIN]: 'Sin asignar',
    DUENO: 'Dueño del terreno', CAP_A: 'Capital clase A', CAP_B: 'Capital clase B', SP: 'Socio patrimonial (respaldo)', TERCERO: 'Tercero' };
  const PARTES = Object.keys(NOMBRES);                 // registro: el único universo de receptores
  const PARTES_REALES = PARTES.filter((p) => p !== SIN);
  const ALIADOS = ['YOD', 'PG', 'AVM', 'JV', 'FC'];
  const CLASES_CAPITAL = ['CAP_A', 'CAP_B'];
  const ENUM_FEE_INDIRECTOS = ['no', 'si', 'desconocido'];    // el mismo enum en el ejemplo anual y en el vertical
  const ENUM_LIBERACION = ['no', 'al_liquidar'];
  const ENUM_IMPUTACION = ['principal_primero', 'prorrata'];
  const ENUM_ESQUEMA = ['A', 'B'];
  const ENUM_TIPOLOGIA = ['vivienda', 'comercial', 'mixto'];
  const ENUM_MODALIDAD_IVA = ['proxy', 'real', 'ya_incorporado'];
  const ENUM_CANAL = ['externo', 'master'];
  const ENUM_CORTE = ['final', 'intermedio'];
  const ENUM_FEE_BASE = ['pct_obra', 'pct_ingresos', 'monto'];
  const ENUM_PREF = ['simple', 'compuesto'];
  const ENUM_SI_NO = ['si', 'no'];
  const ENUM_DUENO_BASE = ['monto_fijo', 'pct_ingresos', 'pct_ub', 'pct_pool'];
  const ENUM_PRELACION = ['cascada', 'al_cobro'];
  const ENUM_REGLA_EXCEDENTE = ['matriz', 'tercios', 'pendiente'];
  const FILAS_IVA = [87, 88, 89, 90];
  /* T-10 (vertical): enums nuevos de B2, M3 y P-02 */
  const ENUM_OPCION_REPARTO = ['A', 'B', 'C'];
  const OPCION_POR_OMISION = 'A';                          // decisión de Alejandro en la parada P-02
  const ENUM_ISR_VERTICAL = ['transparente', 'monto', 'desconocido'];
  const ENUM_ACREEDORES = ['ninguno', 'lista', 'desconocido'];
  const ENUM_RESERVAS = ['ninguna', 'lista', 'desconocido'];
  const ENUM_REGLA_CLASES = ['pari_passu', 'prelacion'];
  const ENUM_DESTINO = ['Venta'];                          // lo único implementado; Renta y Reserva se bloquean por nombre
  const AGREGADOS_CF07 = { 'C-04': 'C-04', 'C-08': 'C-12', 'C-10': 'C-14', 'C-11': 'C-15' };   // agregado → su importe en pesos
  /* T-11 B02/B03: una línea de servicio con beneficiario se verifica contra el catálogo (CF-09) en el MISMO camino vertical. Fila → agregado que
     puede sustituir (supuesto de la copia de prueba: proyecto ejecutivo y estudios para el crédito puente viven en los indirectos, C-08). Urbanización
     (C-04), comisión (C-10) y cierre (C-11) no tienen fila en el catálogo: esas líneas se bloquean. */
  const CATALOGO_AGREGADO = { 'PE-5-9': 'C-08', 'F-102': 'C-08', 'F-103': 'C-08' };
  const ENUM_MODO_INTERNO = ['porcentajes', 'pesos'];           // B03: el reparto interno dice si son porcentajes (suman 100 %) o pesos relativos
  const ENUM_BASE_RECEPTOR = ['aporte', 'acuerdo'];             // B03: por qué recibe una parte que la opción no nombra
  const ENUM_CANAL_VERTICAL = ['externo', 'master'];            // B03/CF-03: canal de la comisión de venta (C-10)

  function enumera(nombre, valor, permitidos, e) {
    if (typeof valor !== 'string' || permitidos.indexOf(valor) < 0) e.push('V · ' + nombre + ' = ' + repr(valor) + ' no está en ' + permitidos.join(' / ') + ': estado desconocido, se bloquea');
  }
  function booleano(nombre, valor, e) { if (typeof valor !== 'boolean') e.push('V · ' + nombre + ' debe ser booleano (sí o no): ' + repr(valor)); }
  function registrado(rol, parte, permitidos, e) { if (permitidos.indexOf(parte) < 0) e.push('V · receptor no registrado en ' + rol + ': ' + repr(parte)); }

  /* ═════════════════════════ CATÁLOGO DE PRECIOS DE MERCADO (N-01) ═════════════════════════ */
  /* Catálogo de costos y fees v2 (T-03, aprobado por T-07 v2). Una entrada por alcance cotizable; el ID se verifica. */
  const FECHA_CATALOGO = '2026-11-23';
  const VIGENCIA_CATALOGO_MESES = 6;    // regla de diseño (supuesto, pendiente de pacto): un precio del catálogo vale seis meses
  const FILAS_5_9 = { 5: [300, 600, 1050], 6: [75, 155, 320], 7: [110, 240, 490], 8: [30, 75, 155], 9: [30, 65, 130] };   // bajo/medio/alto
  const CATALOGO = {
    'PE-5-9': { filas: '5–9', concepto: 'Proyecto ejecutivo único: arquitectónico, estructural, instalaciones, BIM y presupuesto', alcance: 'proyecto_ejecutivo',
      unidad: 'MXN por m² construido', medida: 'm2_construido', bajo: 545, medio: 1135, alto: 2145, fecha: FECHA_CATALOGO },
    'F-102': { filas: '102', concepto: 'Estudio de mercado para el crédito puente', alcance: 'estudio_mercado_credito', unidad: 'suma fija', medida: 'evento',
      bajo: 35000, medio: 85000, alto: 190000, fecha: FECHA_CATALOGO },
    'F-103': { filas: '103', concepto: 'Factibilidad financiera para el crédito puente (modelación y documentación para el banco; no incluye estructurar ni colocar la deuda)',
      alcance: 'factibilidad_credito', unidad: 'suma fija', medida: 'evento', bajo: 45000, medio: 100000, alto: 230000, fecha: FECHA_CATALOGO }
  };
  const ALTO_FEE = { A: [51, 0.055], B: [85, 0.02] };    // % de ventas netas (Catálogo filas 51 y 85, valor alto)
  const ALTO_GERENCIA_50 = 0.045;                        // % de costo directo (fila 50, valor alto)
  const ALTO_SUPERVISION_46 = 0.032;                     // % de costo directo (fila 46, valor alto)
  function fecha(s) {
    const p = String(s).split('-').map((x) => parseInt(x, 10));
    if (p.length !== 3 || p.some((x) => !isFinite(x)) || !(p[1] >= 1 && p[1] <= 12 && p[2] >= 1 && p[2] <= 31)) throw new Error('fecha inválida: ' + s);
    return p;
  }
  const masMeses = (f, n) => { let y = f[0], m = f[1] + n; y += Math.floor((m - 1) / 12); m = ((m - 1) % 12 + 12) % 12 + 1; return [y, m, f[2]]; };
  const cmpFecha = (a, b) => (a[0] - b[0]) || (a[1] - b[1]) || (a[2] - b[2]);

  /* Matriz de contribuciones: rubros y porcentajes de la lámina de Moréo («Fees propuestos v2 (T-04)», filas 58–69). Rige el DEVELOPER FEE
     (Acuerdo Marco). Beneficiarios ilustrativos sin confirmar; «Captación de LP» sin rol. Usarla para el EXCEDENTE de la alianza es otra regla. */
  const MATRIZ_MOREO = [
    ['Originación y relación con propietarios', 0.08, 'AVM', 'originacion'],
    ['HBU, estrategia y definición de producto', 0.08, 'PG', 'producto'],
    ['Modelo financiero y viabilidad', 0.09, 'YOD', 'modelo_financiero'],
    ['Gestión y obtención de capital para predesarrollo', 0.04, 'AVM', 'capital_predesarrollo'],
    ['Estructuración de capital', 0.06, 'JV', 'estructuracion_capital'],
    ['Captación efectiva de inversionistas LP', 0.26, SIN, 'captacion_lp'],
    ['Financiamiento bancario', 0.08, 'JV', 'gestion_credito'],
    ['Coordinación de diseño, ingenierías y permisos', 0.05, 'PG', 'coordinacion_diseno'],
    ['Gestión de costos, licitaciones y construcción', 0.08, 'YOD', 'gestion_costos'],
    ['Comercialización y absorción', 0.09, 'AVM', 'comercializacion'],
    ['Dirección y gobierno del proyecto', 0.06, 'YOD', 'direccion'],
    ['Entrega, cierre y liquidación', 0.03, 'YOD', 'cierre']
  ];

  /* ═════════════════════════ EJEMPLO SINTÉTICO (opción A de P-02 por omisión) ═════════════════════════ */
  const GLA = 21700;   // propuesta La Colorada §3.1: «Sup. Const. (GLA m²)»; es superficie rentable, no construida
  const PE_BASE_PROXY = { medida: 'm2_construido', cantidad: GLA, proxy: true, nota: '21,700 m² de GLA en lugar de m² construidos, dato no disponible' };
  const BASE = {
    nombre: 'Base', T: 4, corte: 'final',
    tierra: 65500000,
    obra: [0, 111825000, 136675000, 0, 0],
    licencias: [5000000, 4000000, 0, 0, 0],
    admin: [1500000, 1500000, 1500000, 1500000, 1500000],
    imprevistos_pct: 0.05,
    servicios: [
      { id: 'proyecto_ejecutivo', prestador: 'PG', catalogo: 'PE-5-9', alcance: 'proyecto_ejecutivo', unidad: 'MXN por m² construido', base: PE_BASE_PROXY, precio_pct_obra: 0.045,
        calendario: [0.4, 0.4, 0.2, 0, 0], fecha_precio: '2026-11-23', estado_pacto: 'supuesto' },
      { id: 'factibilidad_credito', prestador: 'JV', catalogo: 'F-103', alcance: 'factibilidad_credito', unidad: 'suma fija', base: { medida: 'evento', cantidad: 1, proxy: false },
        precio: 100000, calendario: [0, 1, 0, 0, 0], fecha_precio: '2026-11-23', estado_pacto: 'supuesto' }
    ],
    regla_cotizacion: null,
    fee: { base: 'pct_obra', tasa: 0.04, monto: 0, pct_a_costo: 0.5, estado_pacto: 'supuesto' },
    fee_en_indirectos: 'no', fee_en_indirectos_monto: 0,
    gestion: { esquema: 'A', gerencia_50: 0, supervision_46: 0, supervision_separada: false, tope_pct: 0.06 },
    comercial: { canal: 'externo', pct_53: 0.02, beneficiario_53: 'TERCERO', pct_54: 0, pct_55: 0, c56: 0, pct_86: 0, sala_incluida: true },
    captacion_52: 0,
    iva: { tipologia: 'comercial', modalidad: 'proxy', obra_bruta: false, iva_real: null, base_88: 0 },
    reparto_interno: { YOD: 1, PG: 1, AVM: 1 },     // tercios (opción A)
    acuerdo_marco: null,
    noi: [0, 0, 0, 28350000, 40500000], noi_siguiente: 42120000, cap_salida: 0.085,
    capital: { CAP_A: 165000000, CAP_B: 5000000 }, clases_orden: [['CAP_A'], ['CAP_B']],
    pref_tasa: { CAP_A: 0.15, CAP_B: 0.15 }, pref_tipo: 'simple', imputacion: 'principal_primero',
    linea_banco: 136675000, tasa_banco: 0.1151, apertura_pct: 0.015,
    respaldo: null,
    isr_vehiculo: true, isr_tasa: 0.30,
    reservas: [{ id: 'posventa', pct_obra: 0.008, liberacion_autorizada: false }],
    tierra_regla: { paga_tierra: 'si', prioridad_pactada: true, estado_pacto: 'supuesto' },
    dueno: { base: 'monto_fijo', pct: 0, monto: 65500000, prelacion: 'cascada', tierra_como_capital: false, pref_tierra: 0 },
    excedente: { DUENO: 0.5, ALIANZA: 0.5, CAPITAL: 0 },
    estado_pacto_capital: 'supuesto', estado_pacto_excedente: 'supuesto',
    pagos_registrados: {}
  };

  /* ───── validación previa (B4 enums, B5 receptores y pagos) ───── */
  function valida(P) {
    const e = [];
    const rango = (nombre, x, lo, hi) => { if (x === null || x === undefined || !esNum(x) || !(qc(lo, x) <= 0 && qc(x, hi) <= 0)) e.push('V · ' + nombre + ' fuera de rango [' + lo + ', ' + hi + ']: ' + repr(x)); };
    enumera('fee_en_indirectos', P.fee_en_indirectos, ENUM_FEE_INDIRECTOS, e);
    enumera('corte', P.corte, ENUM_CORTE, e);
    enumera('imputacion', P.imputacion, ENUM_IMPUTACION, e);
    enumera('pref_tipo', P.pref_tipo, ENUM_PREF, e);
    enumera('fee.base', P.fee.base, ENUM_FEE_BASE, e);
    const g = P.gestion;
    enumera('gestion.esquema', g.esquema, ENUM_ESQUEMA, e);
    booleano('gestion.supervision_separada', g.supervision_separada, e);
    const co = P.comercial;
    enumera('comercial.canal', co.canal, ENUM_CANAL, e);
    booleano('comercial.sala_incluida', co.sala_incluida, e);
    const iv = P.iva;
    enumera('iva.tipologia', iv.tipologia, ENUM_TIPOLOGIA, e);
    enumera('iva.modalidad', iv.modalidad, ENUM_MODALIDAD_IVA, e);
    booleano('iva.obra_bruta', iv.obra_bruta, e);
    Object.keys(iv.bases || {}).forEach((fila) => { if (FILAS_IVA.indexOf(Number(fila)) < 0) e.push('V · base de IVA en una fila que no es 87–90: ' + repr(fila)); });
    ['iva_real', 'base_88', 'obra_habitacional', 'base_comun'].forEach((k) => { const x = iv[k]; if (x !== null && x !== undefined && (!esEntero(x) || x < 0)) e.push('V · iva.' + k + ' debe ser un entero no negativo: ' + repr(x)); });
    if (iv.pct_no_acreditable_comun !== null && iv.pct_no_acreditable_comun !== undefined) rango('iva.pct_no_acreditable_comun', iv.pct_no_acreditable_comun, 0, 1);
    const tr = P.tierra_regla;
    enumera('tierra_regla.paga_tierra', tr.paga_tierra, ENUM_SI_NO, e);
    booleano('tierra_regla.prioridad_pactada', tr.prioridad_pactada, e);
    const du = P.dueno;
    enumera('dueno.base', du.base, ENUM_DUENO_BASE, e);
    enumera('dueno.prelacion', du.prelacion, ENUM_PRELACION, e);
    booleano('dueno.tierra_como_capital', du.tierra_como_capital, e);
    booleano('isr_vehiculo', P.isr_vehiculo, e);
    P.reservas.forEach((x) => booleano('reserva ' + x.id + '.liberacion_autorizada', x.liberacion_autorizada, e));
    let pactos = [['fee común', P.fee.estado_pacto], ['capital', P.estado_pacto_capital], ['excedente y pago al dueño', P.estado_pacto_excedente], ['tierra', tr.estado_pacto]];
    pactos = pactos.concat(P.servicios.map((s) => ['servicio ' + s.id, s.estado_pacto]));
    pactos.forEach(([nm, est]) => enumera('estado de pacto de ' + nm, est, ESTADOS_PACTO, e));
    /* porcentajes y sumas */
    const ex = P.excedente, llaves = ['DUENO', 'ALIANZA', 'CAPITAL'];
    if (Object.keys(ex).length !== 3 || llaves.some((k) => !(k in ex))) e.push('V · el excedente se reparte exactamente entre DUENO, ALIANZA y CAPITAL');
    llaves.forEach((k) => rango('excedente ' + k, ex[k], 0, 1));
    if (qc(qsuma(llaves.map((k) => (ex[k] === undefined ? 0 : ex[k])).filter(esNum)), 1) !== 0) e.push('V · los porcentajes del excedente no suman 100 % (CF-05)');
    /* receptores: todo receptor contra el registro, antes de calcular */
    const ri = P.reparto_interno;
    Object.keys(ri).forEach((k) => registrado('reparto_interno', k, ALIADOS, e));
    const vri = Object.keys(ri).map((k) => ri[k]);
    if (vri.some((v) => !esNum(v) || qc(v, 0) < 0)) e.push('V · reparto interno con peso negativo o no numérico');
    else if (qc(qsuma(vri), 0) === 0) e.push('V · reparto interno con todos los pesos en cero');
    const am = P.acuerdo_marco;
    if (am) {
      const tot = qsuma(am.matriz.map((f) => f[1]));
      if (qc(tot, 1) !== 0) e.push('V · la matriz de contribuciones suma ' + aNum(tot) + ', no 100 % (CF-05)');
      am.matriz.forEach((f) => { rango('matriz «' + f[0] + '»', f[1], 0, 1); registrado('matriz «' + f[0] + '»', f[2], ALIADOS.concat([SIN]), e); });
      rango('comisión del originador', am.comision_pct, 0, 0.3);
      registrado('originador', am.originador, ALIADOS, e);
      booleano('acuerdo_marco.comision_dentro_del_precio', am.comision_dentro_del_precio, e);
      enumera('acuerdo_marco.regla_excedente', am.regla_excedente, ENUM_REGLA_EXCEDENTE, e);
      enumera('estado de pacto de la matriz de contribuciones', am.estado_pacto, ESTADOS_PACTO, e);
      enumera('estado de pacto de la regla del excedente de la alianza', am.estado_pacto_regla_excedente, ESTADOS_PACTO, e);
    }
    Object.keys(P.capital).forEach((k) => { const v = P.capital[k]; registrado('capital', k, CLASES_CAPITAL, e); if (!esEntero(v) || v < 0) e.push('V · compromiso inválido de ' + k + ': ' + repr(v)); });
    const ord = [].concat.apply([], P.clases_orden).slice().sort(), cls = Object.keys(P.capital).slice().sort();
    if (JSON.stringify(ord) !== JSON.stringify(cls)) e.push('V · el orden de clases no cubre exactamente a las clases de capital');
    registrado('comercial.beneficiario_53', co.beneficiario_53, PARTES_REALES, e);
    P.servicios.forEach((s) => {
      registrado('servicio ' + s.id, s.prestador, ALIADOS.concat(['TERCERO']), e);
      if (s.fecha_precio !== null && s.fecha_precio !== undefined) { try { fecha(s.fecha_precio); } catch (x) { e.push('V · fecha de precio inválida en ' + s.id + ': ' + repr(s.fecha_precio)); } }
    });
    const rs = P.respaldo;
    if (rs !== null && rs !== undefined) {
      registrado('respaldo', rs.parte, PARTES_REALES, e);
      if (!esEntero(rs.tope) || rs.tope < 0) e.push('V · respaldo sin tope entero');
      rango('tasa del respaldo', rs.tasa, 0, 1);
      enumera('estado de pacto del respaldo', rs.estado_pacto, ESTADOS_PACTO, e);
    }
    Object.keys(P.pagos_registrados).forEach((k) => { const v = P.pagos_registrados[k]; registrado('pagos_registrados', k, PARTES_REALES, e); if (!esEntero(v) || v < 0) e.push('V · pago registrado inválido para ' + k + ': ' + repr(v)); });
    const rc = P.regla_cotizacion;
    if (rc !== null && rc !== undefined) enumera('estado de pacto de la regla de cotización', rc.estado_pacto, ESTADOS_PACTO, e);
    /* tasas, montos y combinaciones */
    Object.keys(P.pref_tasa).forEach((k) => rango('preferente ' + k, P.pref_tasa[k], 0, 1));
    rango('tasa del fee', P.fee.tasa, 0, 0.2);
    rango('parte a costo del fee', P.fee.pct_a_costo, 0, 1);
    rango('tasa del banco', P.tasa_banco, 0, 1);
    if (!esEntero(P.linea_banco) || P.linea_banco < 0) e.push('V · línea bancaria inválida');
    if (P.noi.some((x) => x < 0) || P.noi_siguiente < 0) e.push('V · NOI negativo');
    rango('tasa de capitalización de salida', P.cap_salida, 0.01, 1);
    rango('% del dueño', du.pct, 0, 1);
    if (du.prelacion === 'al_cobro' && du.base !== 'pct_ingresos') e.push('V · el pago al cobro sólo existe para la base % de ingresos');
    return e;
  }

  /* ───── CF-09 (N-01): precio de mercado verificable ───── */
  function verificaServicio(s, P, am) {
    const c = []; const sid = s.id; let tope = null, fuente = null;
    const cot = s.cotizacion;
    if (cot !== null && cot !== undefined) {
      const rc = P.regla_cotizacion;
      if (!rc || rc.estado_pacto !== 'pactado') c.push('CF-09 · «' + sid + '» trae una cotización sin regla expresa pactada que la admita en lugar del catálogo');
      else if (cot.estado_pacto !== 'pactado' || !esEntero(cot.monto) || cot.monto <= 0 || !cot.documento) c.push('CF-09 · la cotización de «' + sid + '» no está aprobada o le falta monto o documento');
      else { tope = cot.monto; fuente = 'cotización aprobada (' + cot.documento + ')'; }
    } else {
      const cid = s.catalogo, cat = Object.prototype.hasOwnProperty.call(CATALOGO, cid) ? CATALOGO[cid] : null;
      if (cat === null) {
        const extra = esEntero(s.mercado) ? '; el precio de mercado capturado a mano (' + miles(s.mercado) + ') no se acepta sin ID' : '';
        c.push('CF-09 · «' + sid + '» no tiene un ID de catálogo válido (' + repr(cid) + ')' + extra + ': no puede cobrarse aparte hasta cotizar');
        return { motivos: c, tope: null, fuente: null };
      }
      if (s.alcance !== cat.alcance) c.push('CF-09 · «' + sid + '» apunta a la fila ' + cat.filas + ' (' + cat.concepto + '), ajena a su alcance «' + s.alcance + '»');
      if (s.unidad !== cat.unidad) c.push('CF-09 · «' + sid + '» usa la unidad «' + s.unidad + '» y la fila ' + cat.filas + ' cotiza en «' + cat.unidad + '»');
      const b = s.base || {};
      if (b.medida !== cat.medida) c.push('CF-09 · «' + sid + '» mide su base en «' + b.medida + '» y la fila ' + cat.filas + ' en «' + cat.medida + '»');
      if (!esEntero(b.cantidad) || b.cantidad <= 0) c.push('CF-09 · «' + sid + '» no trae la cantidad de su base');
      else if (b.proxy) c.push('CF-09 · «' + sid + '» calcula su tope con una base proxy (' + (b.nota || 'sin nota') + '): tope rotulado como proxy, no autoriza');
      const fp = s.fecha_precio;
      if (fp === null || fp === undefined) c.push('CF-09 · «' + sid + '» sin fecha de precio para revisar la vigencia del catálogo');
      else if (cmpFecha(fecha(fp), masMeses(fecha(cat.fecha), VIGENCIA_CATALOGO_MESES)) > 0) c.push('CF-09 · el precio de «' + sid + '» (' + fp + ') cae fuera de la vigencia del catálogo (' + cat.fecha + ' + ' + VIGENCIA_CATALOGO_MESES + ' meses)');
      if (esEntero(b.cantidad) && b.cantidad > 0) { tope = cat.medio * b.cantidad; fuente = 'catálogo fila ' + cat.filas + ', valor medio × ' + miles(b.cantidad) + ' (' + cat.unidad + ')'; }
    }
    if (tope !== null) {
      const precio = s._precio; let encima = 0;
      if (am && s.prestador !== am.originador && !am.comision_dentro_del_precio) encima = r(qm(precio, am.comision_pct));
      if (precio + encima > tope) c.push('CF-09 · «' + sid + '» cuesta ' + miles(precio + encima) + ' con la comisión del originador, más que su tope de mercado (' + miles(tope) + '; ' + fuente + ')');
    }
    return { motivos: c, tope, fuente };
  }

  /* ───── candados (B4, Acuerdo Marco, tierra) ───── */
  function candados(P, ventas, feeTot, obraTot) {
    const c = [], notas = [], topes = {};
    const feeActivo = feeTot > 0;
    if (feeActivo && P.fee_en_indirectos === 'si') c.push('CF-01 · fee de la alianza contado dos veces: ' + miles(P.fee_en_indirectos_monto) + ' dentro de indirectos y ' + miles(feeTot) + ' por la regla común');
    if (feeActivo && P.fee_en_indirectos === 'desconocido') c.push('CF-01 · no se sabe si los indirectos ya incluyen el fee de la alianza (como Moréo, parada P-04): se bloquea hasta resolverlo por concepto y alcance');
    const g = P.gestion, fila = ALTO_FEE[g.esquema][0], alto = ALTO_FEE[g.esquema][1];
    const f51 = g.esquema === 'A' ? feeTot : 0, f85 = g.esquema === 'B' ? feeTot : 0;
    if (g.esquema === 'A' && (g.gerencia_50 > 0 || g.supervision_46 > 0)) c.push('CF-02 · esquema A (fee integrado, fila 51) con gerencia (50) o supervisión (46) cobradas aparte');
    if (g.esquema === 'B' && g.supervision_46 > 0 && !g.supervision_separada) c.push('CF-02 · esquema B con supervisión (46) sin alcance separado de la gerencia');
    const totGestion = f51 + f85 + g.gerencia_50 + g.supervision_46;
    if (totGestion > r(qm(ventas, g.tope_pct))) c.push('CF-02 · gestión de ' + miles(totGestion) + ' rebasa el tope de ' + (aNum(qm(g.tope_pct, 100))).toFixed(1) + ' % de ventas netas');
    if (feeActivo && ventas > 0) {
      const pct = qd(feeTot, ventas);
      if (qc(pct, alto) > 0) c.push('CF-02 · fee común de ' + (aNum(pct) * 100).toFixed(2) + ' % de ventas netas rebasa el valor alto de la fila ' + fila + ' (' + (alto * 100).toFixed(1) + ' %)');
      if (P.fee.base !== 'pct_ingresos') notas.push('NOTA · el fee se capturó como ' + P.fee.base + '; en la base de la fila ' + fila + ' (% de ventas netas) equivale a ' + (aNum(pct) * 100).toFixed(2) + ' %');
    }
    if (g.gerencia_50 > r(qm(obraTot, ALTO_GERENCIA_50))) c.push('CF-02 · gerencia (50) rebasa el valor alto de ' + (ALTO_GERENCIA_50 * 100).toFixed(1) + ' % de costo directo');
    if (g.supervision_46 > r(qm(obraTot, ALTO_SUPERVISION_46))) c.push('CF-02 · supervisión (46) rebasa el valor alto de ' + (ALTO_SUPERVISION_46 * 100).toFixed(1) + ' % de costo directo');
    const co = P.comercial;
    if (co.canal === 'master' && (co.pct_53 > 0 || co.pct_54 > 0 || co.pct_55 > 0 || (co.sala_incluida && co.c56 > 0))) c.push('CF-03 · canal master (86) junto con intermediación, operación, marketing o sala (53–56)');
    if (co.canal === 'externo' && co.pct_86 > 0) c.push('CF-03 · canal externo con paquete master (86)');
    const am = P.acuerdo_marco, funciones = {};
    if (am) am.matriz.forEach((f) => { if (qc(f[1], 0) > 0) (funciones[f[2]] = funciones[f[2]] || new Set()).add(f[3]); });
    if (funciones[co.beneficiario_53] && funciones[co.beneficiario_53].has('comercializacion') && co.pct_53 > 0) c.push('CF-03 · ' + NOMBRES[co.beneficiario_53] + ' cobra comercialización dentro del fee y además la comisión de venta (53)');
    if (P.captacion_52 > 0 && ((am && am.matriz.some((f) => qc(f[1], 0) > 0 && (f[3] === 'captacion_lp' || f[3] === 'estructuracion_capital'))) || (!am && P.fee.incluye_captacion))) c.push('CF-04 · fee de levantamiento de capital (52) con la captación ya dentro del fee común');
    P.servicios.forEach((s) => { if (funciones[s.prestador] && funciones[s.prestador].has(s.alcance)) c.push('CF-04 · ' + NOMBRES[s.prestador] + ' cobra «' + s.alcance + '» dentro del fee y como servicio aparte'); });
    const iv = P.iva, tip = iv.tipologia, mod = iv.modalidad;
    if (tip === 'vivienda' || tip === 'mixto') {
      if (mod === 'proxy' && iv.obra_bruta) c.push('CF-06 · proxy de IVA (87) sobre importes de obra que ya traen IVA');
      if (mod === 'real' && iv.obra_bruta) c.push('CF-06 · IVA real por CFDI sobre importes de obra que ya traen IVA: el mismo IVA se contaría dos veces (capturar obra neta o «ya incorporado»)');
      if (mod === 'real' && (iv.iva_real === null || iv.iva_real === undefined)) c.push('CF-06 · modalidad real sin IVA por CFDI capturado');
      if (mod === 'ya_incorporado' && !iv.obra_bruta) c.push('CF-06 · IVA declarado «ya incorporado» con la obra capturada neta: falta el IVA no acreditable');
    }
    if (tip === 'mixto') {
      if (mod === 'proxy' && (iv.obra_habitacional === null || iv.obra_habitacional === undefined)) c.push('CF-06 · mixto sin obra habitacional exclusiva para la fila 87');
      if ((iv.obra_habitacional || 0) > obraTot) c.push('CF-06 · obra habitacional exclusiva mayor que la obra total');
      if (iv.base_comun === null || iv.base_comun === undefined || iv.pct_no_acreditable_comun === null || iv.pct_no_acreditable_comun === undefined) c.push('CF-06 · mixto sin IVA de gastos comunes (fila 90): falta la base común o la proporción no acreditable (LIVA art. 5.V.c)');
    }
    const bases = {}; Object.keys(iv.bases || {}).forEach((f) => { bases[Number(f)] = (iv.bases[f] || []).slice(); });
    if (tip === 'comercial' && [87, 88, 90].some((f) => bases[f] && bases[f].length)) c.push('CF-06 · proyecto sólo gravado con bases de vivienda o de mixto (87, 88 o 90)');
    if (tip === 'vivienda' && bases[90] && bases[90].length) c.push('CF-06 · vivienda con base de gastos comunes de mixto (90)');
    if ((tip === 'vivienda' || tip === 'mixto') && mod !== 'ya_incorporado') { bases[87] = bases[87] || []; if (bases[87].indexOf('obra') < 0) bases[87].push('obra'); }
    const visto = {};
    Object.keys(bases).map(Number).sort((a, b) => a - b).forEach((f) => bases[f].forEach((costo) => {
      if (costo in visto && visto[costo] !== f) c.push('CF-06 · el costo «' + costo + '» está en dos bases de IVA (filas ' + visto[costo] + ' y ' + f + '): las bases 87–90 son excluyentes por costo');
      if (!(costo in visto)) visto[costo] = f;
    }));
    P.servicios.forEach((s) => { const v = verificaServicio(s, P, am); v.motivos.forEach((m) => c.push(m)); topes[s.id] = [v.tope, v.fuente]; });
    const tr = P.tierra_regla;
    if (tr.paga_tierra === 'no' && !tr.prioridad_pactada) c.push('CF-10 · tierra aportada en especie sin regla de prioridad pactada: lo del dueño, la alianza y el capital incluye tierra sin regla');
    return { candados: c, notas, topes };
  }

  /* ───── simulación del ejemplo sintético (cascada independiente) ───── */
  function cascada(P) {
    const out = { nombre: P.nombre, errores: valida(P) };
    if (out.errores.length) {
      const aut = {}; PARTES.forEach((k) => { aut[k] = 0; });
      return Object.assign(out, { estado: 'INVÁLIDO · no se calcula · autorizado no', simulado: null, autorizable: false, autorizado: aut, pagado: Object.assign({}, P.pagos_registrados || {}), motivos: out.errores });
    }
    const T = P.T, n = T + 1, I = []; for (let i = 0; i < n; i++) I.push(i);
    const obra = P.obra, obraTot = suma(obra);
    const pesosObra = () => I.reduce((o, i) => { o[i] = obra[i]; return o; }, {});
    const repObra = (x) => (x ? reparte(x, pesosObra()) : I.reduce((o, i) => { o[i] = 0; return o; }, {}));
    const imprev = I.map((i) => r(qm(obra[i], P.imprevistos_pct)));
    const venta = r(qd(P.noi_siguiente, P.cap_salida));
    const noi = P.noi;
    const ingresos = suma(noi) + venta;
    const servs = clona(P.servicios);
    const servPer = [];
    servs.forEach((s) => {
      s._precio = s.precio_pct_obra !== null && s.precio_pct_obra !== undefined ? r(qm(obraTot, s.precio_pct_obra)) : s.precio;
      const rp = reparte(s._precio, I.reduce((o, i) => { o[i] = s.calendario[i]; return o; }, {}));
      servPer.push(I.map((i) => rp[i]));
    });
    const servTotPer = I.map((i) => suma(servPer.map((sp) => sp[i])));
    const fz = P.fee;
    const feeTot = fz.base === 'pct_obra' ? r(qm(obraTot, fz.tasa)) : fz.base === 'pct_ingresos' ? r(qm(ingresos, fz.tasa)) : fz.monto;
    const feeCostoTot = r(qm(feeTot, fz.pct_a_costo));
    const feeSub = feeTot - feeCostoTot;
    let feeCostoF = 0, feeCosto;
    if (fz.base === 'pct_ingresos') { const pes = I.reduce((o, i) => { o[i] = noi[i]; return o; }, {}); pes.F = venta; const fc = reparte(feeCostoTot, pes); feeCosto = I.map((i) => fc[i]); feeCostoF = fc.F; }
    else { const fc = repObra(obraTot ? feeCostoTot : 0); feeCosto = I.map((i) => (obraTot ? fc[i] : 0)); }
    const feeInd = P.fee_en_indirectos === 'si' ? P.fee_en_indirectos_monto : 0;
    const fi = repObra(feeInd), feeIndPer = I.map((i) => fi[i]);
    const g = P.gestion, gestionExtra = g.gerencia_50 + g.supervision_46;
    const ge = repObra(gestionExtra), gestPer = I.map((i) => ge[i]);
    const iv = P.iva, tip = iv.tipologia, mod = iv.modalidad;
    let iva87 = 0, iva88 = 0, iva90 = 0;
    if (tip === 'vivienda' || tip === 'mixto') {
      const obraHab = tip === 'vivienda' ? obraTot : (iv.obra_habitacional || 0);
      iva87 = mod === 'ya_incorporado' ? 0 : mod === 'real' ? (iv.iva_real || 0) : r(qm(obraHab, '0.085'));
      iva88 = r(qm(iv.base_88 || 0, '0.16'));
    }
    if (tip === 'mixto') iva90 = r(qm(qm(iv.base_comun || 0, '0.16'), iv.pct_no_acreditable_comun || 0));
    const ivaTot = iva87 + iva88 + iva90;
    const ivr = repObra(ivaTot), ivaPer = I.map((i) => ivr[i]);
    const co = P.comercial;
    const comision = r(qm(venta, qsuma([co.pct_53, co.pct_54, co.pct_55, co.pct_86]))) + (!co.sala_incluida ? co.c56 : 0);
    const du = P.dueno, alCobro = du.prelacion === 'al_cobro';
    const dc = I.map((i) => (alCobro ? r(qm(noi[i], du.pct)) : 0));
    const dcF = alCobro ? r(qm(venta, du.pct)) : 0;
    const reservasReq = P.reservas.map((x) => ({ id: x.id, requerida: r(qm(obraTot, x.pct_obra)), liberacion_autorizada: x.liberacion_autorizada }));
    const costos = I.map((i) => obra[i] + servTotPer[i] + P.licencias[i] + P.admin[i] + imprev[i] + feeCosto[i] + feeIndPer[i] + gestPer[i] + ivaPer[i] + dc[i]);

    /* fondeo: capital (por compromiso), banco (línea), respaldo comprometido (tope), déficit sin fondeador */
    const comp = P.capital, clasesC = Object.keys(comp), compTot = sumaV(comp);
    const capAp = {}; clasesC.forEach((k) => { capAp[k] = I.map(() => 0); });
    const rs = P.respaldo;
    const z = () => I.map(() => 0);
    const bancoDisp = z(), bancoPago = z(), bancoSaldo = z(), interes = z(), apertura = z(), respDisp = z(), respPago = z(), respSaldo = z(), respInt = z(), sinFondeador = z(), caja = z();
    let capUsado = 0, saldo = 0, rsaldo = 0, abierto = false, dispAcum = 0, respAcum = 0;
    const tasaResp = rs ? rs.tasa : P.pref_tasa[Object.keys(P.pref_tasa)[0]];
    for (let i = 0; i < n; i++) {
      interes[i] = r(qm(saldo, P.tasa_banco));
      respInt[i] = r(qm(rsaldo, tasaResp));
      rsaldo += respInt[i];
      const necesidad = costos[i] + interes[i] - noi[i];
      if (necesidad > 0) {
        const deCap = Math.min(necesidad, compTot - capUsado);
        if (deCap > 0) {
          const antes = reparte(capUsado, comp); capUsado += deCap; const ahora = reparte(capUsado, comp);
          clasesC.forEach((k) => { capAp[k][i] = ahora[k] - antes[k]; if (capAp[k][i] < 0) throw new Error('llamada de capital negativa por redondeo'); });
        }
        let falta = necesidad - deCap;
        if (falta > 0 && P.linea_banco > 0) {
          if (!abierto) { apertura[i] = r(qm(P.linea_banco, P.apertura_pct)); abierto = true; falta += apertura[i]; }
          const d = Math.min(falta, P.linea_banco - dispAcum);
          bancoDisp[i] = d; dispAcum += d; saldo += d; falta -= d;
        }
        if (falta > 0) {
          const tope = rs ? rs.tope : 0;
          const d = Math.min(falta, Math.max(0, tope - respAcum));
          respDisp[i] = d; respAcum += d; falta -= d;
          sinFondeador[i] = falta;
          rsaldo += respDisp[i] + sinFondeador[i];
        }
      } else {
        let sobra = -necesidad;
        const p = Math.min(sobra, saldo); bancoPago[i] = p; saldo -= p; sobra -= p;
        const qq = Math.min(sobra, rsaldo); respPago[i] = qq; rsaldo -= qq; sobra -= qq;
        caja[i] = sobra;
      }
      bancoSaldo[i] = saldo; respSaldo[i] = rsaldo;
    }
    const cajaAcum = suma(caja);
    clasesC.forEach((k) => { if (suma(capAp[k]) > comp[k]) throw new Error('la clase ' + k + ' aportó más que su compromiso'); });

    /* cierre: caja disponible, acreedores en orden, reservas, caja repartible */
    const cd = cajaAcum + venta - comision - feeCostoF - dcF;
    const costosTotSinDc = suma(costos) - suma(dc) + suma(interes) + suma(apertura) + suma(respInt) + comision + feeCostoF;
    const resReqTot = suma(reservasReq.map((x) => x.requerida));
    const uePre = ingresos - P.tierra - costosTotSinDc - feeSub - resReqTot;
    const isr = P.isr_vehiculo ? r(qm(Math.max(0, uePre), P.isr_tasa)) : 0;
    const ue = uePre - isr;
    const acreedores = []; let resto = cd;
    [['banco', saldo], ['respaldo', rsaldo], ['ISR', isr]].forEach(([aid, exig]) => { const pg = Math.max(0, Math.min(resto, exig)); resto -= pg; acreedores.push({ id: aid, exigible: exig, pagado: pg, saldo: exig - pg }); });
    const faltAcr = suma(acreedores.map((a) => a.saldo));
    const reservas = [];
    reservasReq.forEach((x) => {
      const ret = Math.max(0, Math.min(resto, x.requerida)); resto -= ret;
      const lib = x.liberacion_autorizada && P.corte === 'final' ? ret : 0; resto += lib;
      reservas.push({ id: x.id, requerida: x.requerida, retenida: ret, faltante: x.requerida - ret, liberada: lib });
    });
    const faltRes = suma(reservas.map((x) => x.faltante));
    const cr = faltAcr === 0 ? Math.max(0, resto) : 0;

    /* cascada (pasos 3 a 7) */
    const PASOS = ['p3', 'p4', 'p5', 'p6', 'p7'];
    const socios = PARTES.slice();     // todo el registro: un receptor válido nunca produce un error de llave
    const dev = {}, sim = {}; socios.forEach((k) => { dev[k] = {}; sim[k] = {}; PASOS.forEach((s) => { dev[k][s] = 0; sim[k][s] = 0; }); });
    resto = cr;
    const clases = clona(P.clases_orden);
    const aportesCap = {}; clasesC.forEach((k) => { aportesCap[k] = suma(capAp[k]); });
    const pref = {};
    clasesC.forEach((k) => {
      let acc = q(0);
      for (let i = 0; i < n; i++) if (capAp[k][i]) {
        const yrs = T - i, t = P.pref_tasa[k];
        acc = qa(acc, qm(capAp[k][i], P.pref_tipo === 'simple' ? qm(t, yrs) : qs(qpot(qa(1, t), yrs), 1)));
      }
      pref[k] = r(acc);
    });
    if (du.tierra_como_capital) {
      aportesCap.DUENO = P.tierra;
      const anosOp = I.filter((i) => noi[i] > 0).length;
      pref.DUENO = r(qm(qm(P.tierra, du.pref_tierra), anosOp));
      clases[0] = clases[0].concat(['DUENO']);
    }
    const pagaGrupos = (paso, montos) => {
      clases.forEach((grupo) => {
        const debe = {}; grupo.forEach((k) => { debe[k] = montos[k] || 0; dev[k][paso] = debe[k]; });
        const tot = sumaV(debe), pg = Math.min(resto, tot);
        const rep = pg === tot ? debe : (tot ? reparte(pg, debe) : grupo.reduce((o, k) => { o[k] = 0; return o; }, {}));
        grupo.forEach((k) => { sim[k][paso] = rep[k]; });
        resto -= pg;
      });
    };
    pagaGrupos('p3', aportesCap);
    pagaGrupos('p4', pref);
    const am = P.acuerdo_marco;
    let pesosFee, pesosExc, reglaExc;
    if (am) {
      pesosFee = {}; am.matriz.forEach((f) => { pesosFee[f[2]] = pesosFee[f[2]] === undefined ? q(f[1]) : qa(pesosFee[f[2]], f[1]); });
      reglaExc = am.regla_excedente;
      pesosExc = reglaExc === 'matriz' ? Object.assign({}, pesosFee) : reglaExc === 'tercios' ? Object.assign({}, P.reparto_interno) : { [SIN]: 1 };
    } else { pesosFee = Object.assign({}, P.reparto_interno); pesosExc = Object.assign({}, P.reparto_interno); reglaExc = 'tercios'; }
    const repFeeSub = reparte(feeSub, pesosFee);
    Object.keys(repFeeSub).forEach((k) => { dev[k].p5 = repFeeSub[k]; });
    let pg = Math.min(resto, feeSub);
    const rp5 = pg === feeSub ? repFeeSub : reparte(pg, repFeeSub);
    Object.keys(rp5).forEach((k) => { sim[k].p5 = rp5[k]; });
    resto -= pg;
    const baseUb = ingresos - obraTot;
    let d6;
    if (du.tierra_como_capital || (P.tierra_regla.paga_tierra === 'no' && du.base === 'monto_fijo')) d6 = 0;
    else if (du.base === 'monto_fijo') d6 = du.monto;
    else if (du.base === 'pct_ingresos') d6 = alCobro ? 0 : r(qm(ingresos, du.pct));
    else if (du.base === 'pct_ub') d6 = r(qm(Math.max(0, baseUb), du.pct));
    else d6 = r(qm(Math.max(0, resto), du.pct));
    dev.DUENO.p6 = d6;
    pg = Math.min(resto, d6); sim.DUENO.p6 = pg; resto -= pg;
    const ex = P.excedente, exc = resto;
    const rep7 = reparte(exc, { DUENO: ex.DUENO, ALIANZA: ex.ALIANZA, CAPITAL: ex.CAPITAL });
    const ali7 = reparte(rep7.ALIANZA, pesosExc);
    const cap7 = reparte(rep7.CAPITAL, clasesC.reduce((o, k) => { o[k] = aportesCap[k]; return o; }, {}));
    sim.DUENO.p7 += rep7.DUENO;
    Object.keys(ali7).forEach((k) => { sim[k].p7 += ali7[k]; });
    Object.keys(cap7).forEach((k) => { sim[k].p7 += cap7[k]; });
    socios.forEach((k) => { dev[k].p7 = sim[k].p7; });
    resto -= exc;

    /* servicios, fee a costo, comisiones del originador y libro por beneficiario */
    const serv = {}, feeC = {}, comis = {}, aportado = {}; socios.forEach((k) => { serv[k] = 0; feeC[k] = 0; comis[k] = 0; aportado[k] = 0; });
    servs.forEach((s) => { serv[s.prestador] += s._precio; });
    const repFc = feeCostoTot ? reparte(feeCostoTot, pesosFee) : Object.keys(pesosFee).reduce((o, k) => { o[k] = 0; return o; }, {});
    Object.keys(repFc).forEach((k) => { feeC[k] += repFc[k]; });
    if (feeInd) { const x = reparte(feeInd, pesosFee); Object.keys(x).forEach((k) => { feeC[k] += x[k]; }); }
    if (am) servs.forEach((s) => { if (s.prestador !== am.originador) { const cm = r(qm(s._precio, am.comision_pct)); comis[s.prestador] -= cm; comis[am.originador] += cm; } });
    const duenoCobro = suma(dc) + dcF;
    clasesC.forEach((k) => { aportado[k] = aportesCap[k]; });
    aportado.DUENO = P.tierra;
    const recibido = {}, total = {}, resultado = {}, noCubierto = {};
    socios.forEach((k) => { recibido[k] = sumaV(sim[k]); });
    socios.forEach((k) => {
      total[k] = serv[k] + feeC[k] + comis[k] + recibido[k] + (k === 'DUENO' ? duenoCobro : 0);
      resultado[k] = total[k] - aportado[k];
      noCubierto[k] = suma(['p3', 'p4', 'p5', 'p6'].map((s) => dev[k][s])) - suma(['p3', 'p4', 'p5', 'p6'].map((s) => sim[k][s]));
    });

    /* identidades al peso (con capital efectivamente aportado: M2) */
    const capAportado = suma(clasesC.map((k) => aportesCap[k]));
    const flujoCd = ingresos + capAportado + suma(bancoDisp) + suma(respDisp) + suma(sinFondeador) - suma(costos) - suma(interes) - suma(apertura) - comision - feeCostoF - dcF - suma(bancoPago) - suma(respPago);
    const x0 = cd - suma(acreedores.map((a) => a.exigible)) - suma(reservas.map((x) => x.requerida));
    const ajuste = cr - x0;
    const ident = {
      'I1 caja disponible por dos caminos': flujoCd === cd,
      'I2 suma repartida = caja repartible': sumaV(recibido) === cr,
      'I3 caja − obligaciones − reservas requeridas = UE + capital aportado + tierra + fee subordinado − pagos al dueño al cobro': x0 === ue + capAportado + P.tierra + feeSub - duenoCobro,
      'I4 suma de resultados de socios = UE + servicios y fees a costo de socios + fee subordinado + (reservas liberadas y faltantes)': sumaV(resultado) === ue + sumaV(serv) + sumaV(feeC) + feeSub + ajuste,
      'I5 comisiones del originador suman cero': sumaV(comis) === 0,
      'I6 faltante de acreedores = exigible − pagado': faltAcr === suma(acreedores.map((a) => a.exigible - a.pagado))
    };
    const negativos = []; socios.forEach((k) => PASOS.forEach((s) => { if (sim[k][s] < 0) negativos.push(k); }));
    const cand = candados(Object.assign({}, P, { servicios: servs }), ingresos, feeTot, obraTot);

    /* autorización (sin pagos) */
    const motivos = cand.candados.slice();
    if (faltAcr > 0) motivos.push('SV · acreedores sin pagar: ' + miles(faltAcr) + ' (banco ' + miles(acreedores[0].saldo) + ', respaldo ' + miles(acreedores[1].saldo) + ', ISR ' + miles(acreedores[2].saldo) + ')');
    if (faltRes > 0) motivos.push('SV · reserva sin completar: ' + miles(faltRes));
    if (suma(sinFondeador) > 0) motivos.push('SV · déficit sin fondeador: ' + miles(suma(sinFondeador)) + ' (nadie comprometió ese respaldo)');
    if (rs && suma(respDisp) > 0 && rs.estado_pacto !== 'pactado') motivos.push('PACTO · respaldo comprometido sin firma');
    const malas = Object.keys(ident).filter((k) => ident[k] === false);
    if (malas.length) motivos.push('SV · identidad que no cuadra al peso: ' + malas.join(', '));
    if (negativos.length) motivos.push('SV · pagos negativos: ' + negativos.join(', '));
    const sinRec = sumaV(sim[SIN]) + feeC[SIN];
    if (sinRec > 0) motivos.push('RECEPTOR · importes sin receptor (matriz o regla del excedente «sin asignar»): ' + miles(sinRec));
    let pactos = [['fee común', P.fee.estado_pacto], ['capital', P.estado_pacto_capital], ['excedente y pago al dueño', P.estado_pacto_excedente], ['tierra', P.tierra_regla.estado_pacto]];
    pactos = pactos.concat(servs.map((s) => ['servicio ' + s.id, s.estado_pacto]));
    if (am) { pactos.push(['matriz de contribuciones (fee)', am.estado_pacto]); pactos.push(['regla del excedente de la alianza', am.estado_pacto_regla_excedente]); }
    const sinFirma = pactos.filter((p) => p[1] !== 'pactado').map((p) => p[0]);
    if (sinFirma.length) motivos.push('PACTO · acuerdos sin firma: ' + sinFirma.join(', '));
    const completo = socios.every((k) => noCubierto[k] === 0);
    if (P.corte === 'intermedio' && !completo) motivos.push('SV · corte intermedio con pasos sin cubrir al 100 %: lo posterior queda retenido');
    const autorizableBase = motivos.length === 0;

    /* pagos (B5): evidencia conservada; sobrepago, descuadre o pago sin autorización bloquean toda nueva autorización */
    const pagado = {}, sobrepago = {}; socios.forEach((k) => { pagado[k] = P.pagos_registrados[k] || 0; sobrepago[k] = Math.max(0, pagado[k] - recibido[k]); });
    const pagosTot = sumaV(pagado);
    if (pagosTot > 0 && !autorizableBase) motivos.push('PAGO · pagos registrados sin autorización vigente: ' + socios.filter((k) => pagado[k] > 0).join(', ') + ' · se conserva la evidencia y no hay nueva autorización');
    if (socios.some((k) => sobrepago[k])) motivos.push('PAGO · sobrepago: ' + socios.filter((k) => sobrepago[k]).map((k) => k + ' pagado ' + miles(pagado[k]) + ' contra derecho ' + miles(recibido[k])).join(', ') + ' · se conserva la evidencia y se bloquea toda nueva autorización');
    if (pagosTot > cr) motivos.push('PAGO · descuadre: lo pagado (' + miles(pagosTot) + ') excede la caja repartible del corte (' + miles(cr) + ')');
    const autorizable = motivos.length === 0;
    const autorizado = {}; socios.forEach((k) => { autorizado[k] = autorizable ? recibido[k] - pagado[k] : 0; });
    if (autorizable && !socios.every((k) => pagado[k] + autorizado[k] === recibido[k] && autorizado[k] >= 0)) throw new Error('conciliación por parte');
    const conciliacion = {}; socios.forEach((k) => { if (recibido[k] || pagado[k]) conciliacion[k] = { derecho: recibido[k], pagado: pagado[k], autorizado: autorizado[k], disponible_reintento: autorizado[k], sobrepago: sobrepago[k] }; });

    let estado;
    if (cand.candados.length) estado = 'BLOQUEADO · candado';
    else if (faltAcr > 0 || suma(sinFondeador) > 0) estado = 'INSOLVENTE o sin fondeador · nada autorizable';
    else if (motivos.some((m) => m.indexOf('PAGO') === 0)) estado = 'BLOQUEADO · pagos (sobrepago, descuadre o pago sin autorización)';
    else if (!completo) estado = 'CAJA INSUFICIENTE · lo no cubierto queda teórico';
    else estado = 'SIMULACIÓN COMPLETA';
    estado += ' · autorizado ' + (autorizable ? 'sí' : 'no');

    const tir = {}, flujos = {}; socios.forEach((k) => { flujos[k] = I.map(() => 0); });
    clasesC.forEach((k) => I.forEach((i) => { flujos[k][i] -= capAp[k][i]; }));
    flujos.DUENO[0] -= P.tierra;
    socios.forEach((k) => { flujos[k][T] += recibido[k]; });
    I.forEach((i) => { flujos.DUENO[i] += dc[i]; }); flujos.DUENO[T] += dcF;
    socios.forEach((k) => {
      const fl = flujos[k];
      if (fl.some((x) => x < 0) && fl.some((x) => x > 0)) {
        const f = (qq) => fl.reduce((s, x, t) => s + x / Math.pow(1 + qq, t), 0);
        let lo = -0.99, hi = 5.0;
        if (f(lo) * f(hi) <= 0) { for (let it = 0; it < 200; it++) { const mid = (lo + hi) / 2; if (f(lo) * f(mid) <= 0) hi = mid; else lo = mid; } tir[k] = (lo + hi) / 2; } else tir[k] = null;
      } else tir[k] = null;
    });
    const aTxt = (o) => Object.keys(o).reduce((a, k) => { a[k] = String(aNum(q(o[k]))); return a; }, {});
    return Object.assign(out, {
      estado, motivos, candados: cand.candados, notas: cand.notas, identidades: ident, autorizable,
      ingresos, venta, comision, cd, acreedores, reservas, cr, faltante_acreedores: faltAcr, faltante_reservas: faltRes, sin_fondeador: suma(sinFondeador), resp_disp: suma(respDisp),
      ue, ue_pre: uePre, isr, fee_tot: feeTot, fee_sub: feeSub, fee_costo_tot: feeCostoTot, iva: { f87: iva87, f88: iva88, f90: iva90 },
      obra_tot: obraTot, imprev, costos, noi, interes, apertura, banco_disp: bancoDisp, banco_pago: bancoPago, banco_saldo: bancoSaldo, resp_saldo: respSaldo,
      cap_ap: capAp, aportes_cap: aportesCap, cap_aportado: capAportado, pref, devengado: dev, simulado: sim, no_cubierto: noCubierto, serv, fee_c: feeC, comis,
      dueno_cobro: duenoCobro, aportado, recibido, total, resultado, autorizado, pagado, conciliacion, tir,
      servicios: servs.map((s) => ({ id: s.id, prestador: s.prestador, precio: s._precio, catalogo: s.catalogo, tope: cand.topes[s.id][0], fuente_tope: cand.topes[s.id][1] })),
      x0, ajuste, serv_per: servPer, pesos_fee: aTxt(pesosFee), pesos_excedente: aTxt(pesosExc), regla_excedente: reglaExc, base_ub: baseUb, tierra: P.tierra
    });
  }

  /* escenario(cambios): copia de BASE con cambios; los objetos se mezclan salvo excedente, reparto interno, preferente, capital y pagos */
  const NO_MEZCLA = ['excedente', 'reparto_interno', 'pref_tasa', 'capital', 'pagos_registrados'];
  function escenario(cambios) {
    const P = clona(BASE);
    Object.keys(cambios || {}).forEach((k) => {
      const v = cambios[k];
      if (esObj(v) && esObj(P[k]) && k.charAt(0) !== '_' && NO_MEZCLA.indexOf(k) < 0) P[k] = Object.assign({}, P[k], clona(v));
      else P[k] = clona(v);
    });
    return P;
  }
  const BAJAS = { nombre: 'Ventas bajas', noi: [0, 0, 0, 12150000, 28350000], noi_siguiente: 29484000, cap_salida: 0.1025 };
  const DUPLICADO = { nombre: 'Fee duplicado', fee_en_indirectos: 'si', fee_en_indirectos_monto: 9940000 };
  const ACUERDO_MARCO = { matriz: MATRIZ_MOREO, originador: 'AVM', comision_pct: 0.05, comision_dentro_del_precio: true, estado_pacto: 'propuesto', regla_excedente: 'matriz', estado_pacto_regla_excedente: 'supuesto' };
  /* Parada P-02: A por omisión (decisión de Alejandro); B y C se conservan como parámetros. */
  const OPCIONES = {
    A: { titulo: '50/50 y tercios', cambios: {}, reparto_interno: { YOD: 1, PG: 1, AVM: 1 }, preferente: { tasa: 0.15, tipo: 'simple' }, excedente: { DUENO: 0.5, ALIANZA: 0.5, CAPITAL: 0 } },
    B: { titulo: '50/50 y Acuerdo Marco', cambios: { acuerdo_marco: ACUERDO_MARCO }, reparto_interno: null, preferente: { tasa: 0.15, tipo: 'simple' }, excedente: { DUENO: 0.5, ALIANZA: 0.5, CAPITAL: 0 } },
    C: { titulo: 'Cascada de Eduardo (12 % + 30/20/50) y Acuerdo Marco', cambios: { acuerdo_marco: ACUERDO_MARCO, pref_tasa: { CAP_A: 0.12, CAP_B: 0.12 }, excedente: { DUENO: 0.3, ALIANZA: 0.2, CAPITAL: 0.5 } },
      reparto_interno: null, preferente: { tasa: 0.12, tipo: 'simple' }, excedente: { DUENO: 0.3, ALIANZA: 0.2, CAPITAL: 0.5 } }
  };
  const DUENO_BASES = {
    a: ['Monto fijo 65.5 MDP + 50 % del excedente', {}],
    b: ['Monto fijo 65.5 MDP, sin participación', { excedente: { DUENO: 0, ALIANZA: 1, CAPITAL: 0 } }],
    c: ['12 % de los ingresos, en cascada', { dueno: { base: 'pct_ingresos', pct: 0.12, monto: 0, prelacion: 'cascada', tierra_como_capital: false, pref_tierra: 0 }, excedente: { DUENO: 0, ALIANZA: 1, CAPITAL: 0 } }],
    c2: ['12 % de los ingresos, al cobro', { dueno: { base: 'pct_ingresos', pct: 0.12, monto: 0, prelacion: 'al_cobro', tierra_como_capital: false, pref_tierra: 0 }, excedente: { DUENO: 0, ALIANZA: 1, CAPITAL: 0 } }],
    d: ['12 % de la utilidad bruta (ingresos − obra directa)', { dueno: { base: 'pct_ub', pct: 0.12, monto: 0, prelacion: 'cascada', tierra_como_capital: false, pref_tierra: 0 }, excedente: { DUENO: 0, ALIANZA: 1, CAPITAL: 0 } }],
    e: ['20 % del pool después de costos e ISR', { dueno: { base: 'pct_pool', pct: 0.20, monto: 0, prelacion: 'cascada', tierra_como_capital: false, pref_tierra: 0 }, excedente: { DUENO: 0, ALIANZA: 1, CAPITAL: 0 } }],
    f: ['Tierra como capital + preferente 10 % desde operación + 22.5 % del remanente', { dueno: { base: 'monto_fijo', pct: 0, monto: 0, prelacion: 'cascada', tierra_como_capital: true, pref_tierra: 0.10 }, excedente: { DUENO: 0.225, ALIANZA: 0.775, CAPITAL: 0 } }]
  };
  function escenarioOpcion(opcion, cambios) {
    const k = opcion === undefined || opcion === null ? OPCION_POR_OMISION : opcion;
    if (!Object.prototype.hasOwnProperty.call(OPCIONES, k)) throw new Error('opción de reparto desconocida: ' + repr(opcion) + ' (A, B o C)');
    return escenario(Object.assign({}, OPCIONES[k].cambios, cambios || {}));
  }

  /* ═════════════════════════ VERTICAL EN VENTA (alcance de T-10) SOBRE F-02 ═════════════════════════ */
  /* (la segunda mitad del módulo está abajo, en repartoVertical) */
  const CAMPOS_VISOR = ['mes_reparto', 'dueno_meses', 'dueno_anos', 'dueno_recibe', 'dueno_veces', 'alianza_recibe', 'inversion_recibe'];
  const CAMPO_NODO = { dueno_recibe: 'R-22', dueno_veces: 'R-23', alianza_recibe: 'R-24', inversion_recibe: 'R-25' };
  const DEPENDEN_TIERRA = ['R-13', 'R-14', 'R-15', 'R-16', 'R-17', 'R-21', 'R-22', 'R-23', 'R-24', 'R-25'];   // fórmulas con si(S-02 = ...)
  const SIMPLIFICADOS = ['R-13', 'R-14', 'R-15', 'R-16', 'R-17'];                                          // antes de financiar; sin recálculo pactado
  const NODOS_REQ = ['T-04', 'PT-07', 'D-01', 'D-17', 'D-22', 'S-02', 'S-03', 'S-04', 'S-05', 'S-06', 'R-21', 'R-22', 'R-23', 'R-24', 'R-25', 'RV-06'];
  const SERIES_REQ = ['caja', 'caja_minima', 'saldo_banco', 'saldo_respaldo', 'saldo_capital', 'cap_aporta', 'pago_capital', 'cap_acum',
    'cobranza', 'egresos', 'interes', 'disposicion', 'pago_banco', 'pago_respaldo', 'respaldo', 'apertura'];
  const ACTIVIDAD = ['cobranza', 'egresos', 'interes', 'disposicion', 'pago_banco', 'pago_respaldo', 'pago_capital', 'cap_aporta', 'respaldo', 'apertura'];
  const PARTES_VERTICAL = ['DUENO', 'ALIANZA', 'CAPITAL'];
  const CONCEPTOS_PARTE = { CAPITAL: ['capital_principal', 'capital_preferente', 'capital_parte'], DUENO: ['dueno_tierra', 'dueno_parte'], ALIANZA: ['alianza_fee', 'alianza_parte'] };
  const PASO = { capital_principal: 3, capital_preferente: 4, alianza_fee: 5, dueno_tierra: 6, dueno_parte: 7, alianza_parte: 7, capital_parte: 7 };
  const CAMPOS_FECHA = ['mes_reparto', 'dueno_meses', 'dueno_anos', 'fecha_corte_autorizado', 'fecha_pago_registrado'];
  /* Lo que el vertical de prueba NO implementa se bloquea por nombre (diseño v3 §d): gestión B, IVA proxy/real/mixto, renta y Hub. */
  const NO_IMPLEMENTADO = ['esquema de gestión B (gerencia externa, fila 50, y fee reducido, fila 85)', 'IVA proxy o real y tipología mixta (sólo «ya incorporado» en vivienda o comercial)',
    'renta (calendario de NOI) y el Hub a diez años', 'preferente simple: las tres opciones de P-02 lo pactan simple y F-02 capitaliza cada mes (se bloquea salvo pacto expreso del preferente como lo calcula F-02)',
    'canal master de comercialización (paquete 86): el vertical sólo tiene la comisión C-10', 'pagos, derecho y saldo por clase de capital: sólo se concilia el capital agregado (con dos o más clases no se autoriza)',
    'líneas de servicio sin fila en el catálogo (urbanización C-04, comisión C-10, cierre C-11)', 'respaldo comprometido a una tasa distinta del D-01 con que F-02 lo cuesta'];

  /* C2 (dictamen T-09 v2): estado de cada dato de las fichas en el vertical y en el Hub. Regla: el Hub nunca supera al vertical.
     Es presentación: no amplía el alcance al Hub. I1 y P1 del Hub = «Patrón reutilizable (sólo superficie y norma)»; P4 del Hub = «Hueco». */
  const RANGO_ESTADO = { 'Hueco': 0, 'Patrón reutilizable': 1, 'Parcial': 2, 'Existe': 3 };
  const FICHAS = [
    ['I1', 'Proyecto y programa', 'Parcial', 'Patrón reutilizable (sólo superficie y norma)'], ['I2', 'Ventas, absorción y cobros', 'Parcial', 'Patrón reutilizable'],
    ['I3', 'Operación y salida patrimonial', 'Hueco', 'Hueco'], ['I4', 'Presupuesto y contingencias', 'Parcial', 'Patrón reutilizable'],
    ['I5', 'Fuentes y usos y exposición de capital', 'Parcial', 'Patrón reutilizable'], ['I6', 'Cronograma y caja mensual', 'Parcial', 'Patrón reutilizable'],
    ['I7', 'Cascada y distribución', 'Parcial', 'Patrón reutilizable'], ['I8', 'Rentabilidad, recuperación y riesgo de pérdida', 'Parcial', 'Patrón reutilizable'],
    ['I9', 'Escenarios, sensibilidad y riesgos', 'Parcial', 'Patrón reutilizable'], ['I10', 'Derechos, garantías y salida del inversionista', 'Hueco', 'Hueco'],
    ['P1', 'Predio y potencial de uso', 'Parcial', 'Patrón reutilizable (sólo superficie y norma)'], ['P2', 'Valor del suelo y alternativa de venta', 'Parcial', 'Patrón reutilizable'],
    ['P3', 'Qué recibe, en qué prioridad y a quién le toca', 'Parcial', 'Hueco'], ['P4', 'Cobros, saldos e hitos del aportante', 'Hueco', 'Hueco'],
    ['P5', 'Cuánto vale la aportación frente a vender', 'Parcial', 'Hueco'], ['P6', 'Fuentes, costos y reservas que condicionan el cobro', 'Parcial', 'Patrón reutilizable'],
    ['P7', 'Rentas y participación en el Hub', 'Hueco', 'Hueco'], ['P8', 'Derechos, prelación y pérdida máxima del dueño', 'Hueco', 'Hueco'],
    ['P9', 'Alternativas y sensibilidad', 'Parcial', 'Patrón reutilizable']
  ].map((f) => ({ id: f[0], dato: f[1], estado_vertical: f[2], estado_hub: f[3] }));
  const baseEstado = (t) => String(t).replace(/\s*\(.*\)\s*$/, '');
  function validaEstadosHub(filas) {
    const malas = [];
    (filas || FICHAS).forEach((f) => {
      const a = RANGO_ESTADO[baseEstado(f.estado_vertical)], b = RANGO_ESTADO[baseEstado(f.estado_hub)];
      if (a === undefined || b === undefined) malas.push(f.id + ': estado desconocido (' + f.estado_vertical + ' / ' + f.estado_hub + ')');
      else if (b > a) malas.push(f.id + ': el Hub («' + f.estado_hub + '») supera al vertical («' + f.estado_vertical + '»)');
    });
    return malas;
  }

  /* M3: reconstrucción del capital de F-02 hasta el corte, por clase, con capitalización mensual (tasa D-01 / 12, como motor.js) y la regla de
     imputación (principal primero o a prorrata). `clases` = [{clase, parte}] (parte de cada aportación); `reglaClases` reparte cada pago de F-02
     entre clases (pari passu sobre el saldo o por prelación en el orden dado). `desde` permite el ARRASTRE entre cortes: continúa desde el
     estado de un corte anterior {mes, clases: {CLASE: {pr, ac}}}. Devuelve el estado por clase, el agregado y la máxima diferencia contra F-02. */
  function reconstruyeCapital(S, hasta, tc, imputacion, clases, reglaClases, desde) {
    clases = clases && clases.length ? clases : [{ clase: 'CAPITAL', parte: 1 }];
    const st = {}; clases.forEach((c) => { st[c.clase] = { pr: 0, ac: 0, pag_pr: 0, pag_ac: 0 }; });
    let t0 = 1, aport = 0, pagosCap = 0, maxdif = 0;
    if (desde) { t0 = desde.mes + 1; Object.keys(desde.clases).forEach((k) => { st[k] = { pr: desde.clases[k].pr, ac: desde.clases[k].ac, pag_pr: 0, pag_ac: 0 }; }); }
    for (let t = t0; t <= hasta; t++) {
      clases.forEach((c) => { const x = st[c.clase]; x.ac += t > 1 ? (x.pr + x.ac) * tc / 12 : 0; });
      clases.forEach((c) => { st[c.clase].pr += S.cap_aporta[t] * aNum(q(c.parte)); });
      aport += S.cap_aporta[t];
      const pago = S.pago_capital[t]; pagosCap += pago;
      /* pago de F-02 a cada clase */
      const pagoClase = {};
      if (reglaClases === 'prelacion') { let resto = pago; clases.forEach((c) => { const x = st[c.clase], p = Math.min(resto, Math.max(0, x.pr + x.ac)); pagoClase[c.clase] = p; resto -= p; }); if (resto > 1e-9) pagoClase[clases[clases.length - 1].clase] += resto; }
      else { const tot = clases.reduce((s, c) => s + st[c.clase].pr + st[c.clase].ac, 0); clases.forEach((c) => { const x = st[c.clase]; pagoClase[c.clase] = clases.length === 1 ? pago : (tot > 0 ? pago * (x.pr + x.ac) / tot : pago * aNum(q(c.parte))); }); }
      clases.forEach((c) => {
        const x = st[c.clase], p = pagoClase[c.clase];
        let a, b;
        if (imputacion === 'principal_primero') { a = Math.min(p, x.pr); b = p - a; }
        else { const tot = x.pr + x.ac; a = tot > 0 ? p * (x.pr / tot) : 0; b = p - a; }
        x.pr -= a; x.ac -= b; x.pag_pr += a; x.pag_ac += b;
      });
      const agregado = clases.reduce((s, c) => s + st[c.clase].pr + st[c.clase].ac, 0);
      maxdif = Math.max(maxdif, Math.abs(agregado - S.saldo_capital[t]));
    }
    const pr = clases.reduce((s, c) => s + st[c.clase].pr, 0), ac = clases.reduce((s, c) => s + st[c.clase].ac, 0);
    const pagPr = clases.reduce((s, c) => s + st[c.clase].pag_pr, 0), pagAc = clases.reduce((s, c) => s + st[c.clase].pag_ac, 0);
    const arrastre = { mes: hasta, clases: {} }; clases.forEach((c) => { arrastre.clases[c.clase] = { pr: st[c.clase].pr, ac: st[c.clase].ac }; });
    return { pr, ac, pag_pr: pagPr, pag_ac: pagAc, aport, pagos_cap: pagosCap, maxdif, clases: st, arrastre };
  }

  /* B05 (T-11): el desglose por clase conserva el peso (resto mayor sobre el total redondeado), así la suma de las clases es el total */
  function porClase(rc, princ, pref) {
    const ks = Object.keys(rc.clases), o = {};
    const w = (k, c) => { const x = rc.clases[k][c]; return x > 0 ? q(String(Math.round(x * 1e6) / 1e6)) : q(0); };
    const tieneP = ks.some((k) => rc.clases[k].pr > 0), tieneA = ks.some((k) => rc.clases[k].ac > 0);
    const rp = princ > 0 && tieneP ? reparte(princ, ks.reduce((a, k) => { a[k] = w(k, 'pr'); return a; }, {})) : ks.reduce((a, k) => { a[k] = ks.length === 1 ? princ : 0; return a; }, {});
    const ra = pref > 0 && tieneA ? reparte(pref, ks.reduce((a, k) => { a[k] = w(k, 'ac'); return a; }, {})) : ks.reduce((a, k) => { a[k] = ks.length === 1 ? pref : 0; return a; }, {});
    ks.forEach((k) => { o[k] = { principal: rp[k] || 0, preferente: ra[k] || 0 }; });
    return o;
  }
  function validaVertical(caso, p) {
    const e = [];
    if (!esObj(caso) || ['series', 'nodos', 'visor', 'M'].some((k) => !(k in caso))) return ['V · caso sin series, nodos, visor u horizonte'];
    const S = caso.series, N = caso.nodos, V = caso.visor, M = caso.M;
    if (!esEntero(M) || M < 1) return ['V · horizonte inválido: ' + repr(M)];
    NODOS_REQ.forEach((k) => { if (N[k] === null || N[k] === undefined) e.push('V · dato requerido ausente: nodo ' + k); });
    SERIES_REQ.forEach((k) => { const s = S[k]; if (!Array.isArray(s) || s.length !== M + 1 || s.slice(1).some((x) => !esNum(x))) e.push('V · serie requerida ausente o incompleta: ' + k); });
    ['fin_obra', 'fuera_horizonte'].forEach((k) => { if (V[k] === null || V[k] === undefined) e.push('V · dato requerido ausente: visor ' + k); });
    if (!('mes_reparto' in V)) e.push('V · dato requerido ausente: visor mes_reparto');
    enumera('liberar_caja_minima', p.liberar_caja_minima, ENUM_LIBERACION, e);
    enumera('imputacion', p.imputacion, ENUM_IMPUTACION, e);
    const feePos = esNum(N['S-06']) && N['S-06'] > 0;
    if (p.fee_en_indirectos === null || p.fee_en_indirectos === undefined) { if (feePos) e.push('V · dato requerido ausente: inclusión del fee en indirectos (no / si / desconocido)'); }
    else enumera('fee_en_indirectos', p.fee_en_indirectos, ENUM_FEE_INDIRECTOS, e);
    if (p.gestion_esquema === null || p.gestion_esquema === undefined) { if (feePos) e.push('V · dato requerido ausente: esquema de gestión (A / B)'); }
    else enumera('gestion_esquema', p.gestion_esquema, ENUM_ESQUEMA, e);
    if (!esObj(p.iva)) e.push('V · dato requerido ausente: IVA (tipología y modalidad)');
    else { enumera('iva.tipologia', p.iva.tipologia, ENUM_TIPOLOGIA, e); enumera('iva.modalidad', p.iva.modalidad, ENUM_MODALIDAD_IVA, e); }
    booleano('prioridad_tierra_pactada', p.prioridad_tierra_pactada, e);
    booleano('acuerdos_pactados', p.acuerdos_pactados, e);
    if (p.mes_corte !== null && p.mes_corte !== undefined && (!esEntero(p.mes_corte) || !(p.mes_corte >= 1 && p.mes_corte <= M))) e.push('V · mes de corte fuera del horizonte 1–' + M + ': ' + repr(p.mes_corte));
    if (p.fondeador_respaldo !== null && p.fondeador_respaldo !== undefined) {
      const f = p.fondeador_respaldo;
      if (!esObj(f)) e.push('V · fondeador del respaldo mal capturado');
      else {
        registrado('fondeador del respaldo', f.parte, PARTES_REALES, e);
        if (!esEntero(f.tope) || f.tope < 0) e.push('V · fondeador del respaldo sin tope entero');
        if (!esNum(f.tasa) || !(qc(0, f.tasa) <= 0 && qc(f.tasa, 1) <= 0)) e.push('V · fondeador del respaldo sin tasa (0 a 1)');
        enumera('estado de pacto del fondeador', f.estado_pacto, ESTADOS_PACTO, e);
      }
    }
    if (p.pagos_registrados !== null && p.pagos_registrados !== undefined) {
      if (!esObj(p.pagos_registrados)) e.push('V · pagos registrados mal capturados');
      else Object.keys(p.pagos_registrados).forEach((k) => { const v = p.pagos_registrados[k]; registrado('pagos_registrados del vertical', k, PARTES_VERTICAL, e); if (!esEntero(v) || v < 0) e.push('V · pago registrado inválido para ' + k + ': ' + repr(v)); });
    }
    /* ── T-10: parámetros nuevos (P-02, B2, M3, CF-07, N-02) ── */
    enumera('opcion_reparto (P-02)', p.opcion_reparto, ENUM_OPCION_REPARTO, e);
    if (p.reparto_interno !== null && p.reparto_interno !== undefined) {
      /* B03 (T-11): el reparto interno dice si son porcentajes o pesos relativos; un 40 % capturado nunca se normaliza a 100 % en silencio */
      const ri = p.reparto_interno;
      if (!esObj(ri) || !esObj(ri.partes) || !Object.keys(ri.partes).length) e.push('V · reparto interno de la alianza mal capturado: debe traer modo («porcentajes» o «pesos»), partes y estado de pacto');
      else {
        enumera('reparto_interno.modo', ri.modo, ENUM_MODO_INTERNO, e);
        enumera('reparto_interno.estado_pacto', ri.estado_pacto, ESTADOS_PACTO, e);
        Object.keys(ri.partes).forEach((k) => registrado('reparto_interno de la alianza', k, ALIADOS, e));
        const vs = Object.keys(ri.partes).map((k) => ri.partes[k]);
        if (vs.some((v) => !esNum(v) || qc(v, 0) < 0)) e.push('V · reparto interno con peso negativo o no numérico');
        else if (qc(qsuma(vs), 0) === 0) e.push('V · reparto interno con todos los pesos en cero');
        else if (ri.modo === 'porcentajes') {
          if (vs.some((v) => qc(v, 1) > 0)) e.push('V · reparto interno en porcentajes con una parte mayor que 100 %');
          else if (qc(qsuma(vs), 1) !== 0) e.push('V · el reparto interno en porcentajes suma ' + (aNum(qsuma(vs)) * 100).toFixed(2) + ' %, no 100 % (CF-05): si son pesos relativos, decláralo con modo «pesos»');
        }
      }
    }
    if (p.acuerdos_receptor !== null && p.acuerdos_receptor !== undefined) {
      if (!esObj(p.acuerdos_receptor)) e.push('V · acuerdos por receptor mal capturados');
      else Object.keys(p.acuerdos_receptor).forEach((k) => {
        const a = p.acuerdos_receptor[k];
        registrado('acuerdos por receptor', k, ALIADOS, e);
        if (!esObj(a)) { e.push('V · acuerdo del receptor ' + repr(k) + ' mal capturado'); return; }
        enumera('acuerdo de ' + k + '.base', a.base, ENUM_BASE_RECEPTOR, e);
        if (typeof a.concepto !== 'string' || !a.concepto.trim()) e.push('V · el acuerdo de ' + k + ' no dice qué aporta o qué se pactó (concepto)');
        enumera('acuerdo de ' + k + '.estado_pacto', a.estado_pacto, ESTADOS_PACTO, e);
      });
    }
    if (p.comision_venta !== null && p.comision_venta !== undefined) {
      const cv = p.comision_venta;
      if (!esObj(cv)) e.push('V · comisión de venta mal capturada');
      else { registrado('comisión de venta (C-10)', cv.beneficiario, ALIADOS.concat(['TERCERO']), e); enumera('comision_venta.canal', cv.canal, ENUM_CANAL_VERTICAL, e); }
    }
    if (p.preferente_f02 !== null && p.preferente_f02 !== undefined) enumera('preferente_f02 (pacto del preferente como lo calcula F-02)', p.preferente_f02, ESTADOS_PACTO, e);
    const declara = (nombre, x, en, conLista) => {
      if (x === null || x === undefined) return;
      if (!esObj(x)) { e.push('V · ' + nombre + ' mal capturado'); return; }
      enumera(nombre + '.estado', x.estado, en, e);
      if (x.estado === 'lista' && !Array.isArray(x.lista)) e.push('V · ' + nombre + ' en «lista» sin lista');
      if (x.estado === 'lista' && Array.isArray(x.lista)) x.lista.forEach((it, j) => conLista(it, j));
    };
    declara('isr', p.isr, ENUM_ISR_VERTICAL, () => {});
    if (esObj(p.isr) && p.isr.estado === 'monto' && (!esEntero(p.isr.monto) || p.isr.monto < 0)) e.push('V · isr.monto debe ser un entero no negativo: ' + repr(p.isr.monto));
    declara('otros_acreedores', p.otros_acreedores, ENUM_ACREEDORES, (it, j) => {
      if (!esObj(it) || typeof it.id !== 'string' || !it.id) { e.push('V · acreedor ' + (j + 1) + ' sin id'); return; }
      registrado('acreedor «' + it.id + '»', it.parte, PARTES_REALES, e);
      if (!esEntero(it.exigible) || it.exigible < 0) e.push('V · exigible inválido del acreedor «' + it.id + '»: ' + repr(it.exigible));
    });
    declara('reservas', p.reservas, ENUM_RESERVAS, (it, j) => {
      if (!esObj(it) || typeof it.id !== 'string' || !it.id) { e.push('V · reserva ' + (j + 1) + ' sin id'); return; }
      if (!esEntero(it.requerida) || it.requerida < 0) e.push('V · requerida inválida de la reserva «' + it.id + '»: ' + repr(it.requerida));
      enumera('reserva «' + it.id + '».liberacion', it.liberacion, ENUM_LIBERACION, e);
    });
    if (p.clases_capital !== null && p.clases_capital !== undefined) {
      if (!Array.isArray(p.clases_capital) || !p.clases_capital.length) e.push('V · clases de capital mal capturadas');
      else {
        const vistas = new Set();
        p.clases_capital.forEach((c) => {
          if (!esObj(c)) { e.push('V · clase de capital mal capturada'); return; }
          registrado('clases de capital', c.clase, CLASES_CAPITAL, e);
          if (vistas.has(c.clase)) e.push('V · clase de capital repetida: ' + repr(c.clase)); vistas.add(c.clase);
          if (!esNum(c.parte) || qc(c.parte, 0) <= 0 || qc(c.parte, 1) > 0) e.push('V · parte de la clase ' + repr(c.clase) + ' fuera de (0, 1]: ' + repr(c.parte));
        });
        if (p.clases_capital.every((c) => esObj(c) && esNum(c.parte)) && qc(qsuma(p.clases_capital.map((c) => c.parte)), 1) !== 0) e.push('V · las partes de las clases de capital no suman 100 %');
      }
    }
    enumera('regla_clases', p.regla_clases, ENUM_REGLA_CLASES, e);
    if (p.capital_arrastre !== null && p.capital_arrastre !== undefined) {
      const a = p.capital_arrastre;
      if (!esObj(a) || !esEntero(a.mes) || !esObj(a.clases)) e.push('V · arrastre del capital mal capturado');
      else if (!(a.mes >= 1 && a.mes < (p.mes_corte || M))) e.push('V · el arrastre del capital debe venir de un corte anterior al actual: mes ' + repr(a.mes));
    }
    if (p.lineas !== null && p.lineas !== undefined) {
      if (!Array.isArray(p.lineas)) e.push('V · líneas con beneficiario mal capturadas');
      else p.lineas.forEach((l, j) => {
        if (!esObj(l) || typeof l.id !== 'string' || !l.id) { e.push('V · línea ' + (j + 1) + ' sin id'); return; }
        registrado('línea «' + l.id + '»', l.beneficiario, ALIADOS.concat(['TERCERO']), e);
        if (!esEntero(l.monto) || l.monto <= 0) e.push('V · monto inválido de la línea «' + l.id + '»: ' + repr(l.monto));
        enumera('línea «' + l.id + '».sustituye', l.sustituye, Object.keys(AGREGADOS_CF07), e);
        if (!esEntero(l.agregado_original) || l.agregado_original < 0) e.push('V · la línea «' + l.id + '» no trae el agregado original (pesos) para verificar CF-07');
        const ag = AGREGADOS_CF07[l.sustituye]; if (ag && (N[ag] === null || N[ag] === undefined)) e.push('V · dato requerido ausente: nodo ' + ag + ' (agregado de la línea «' + l.id + '»)');
        enumera('línea «' + l.id + '».estado_pacto', l.estado_pacto, ESTADOS_PACTO, e);
      });
      /* B02 (T-11): todas las líneas de un mismo agregado declaran el mismo agregado original (la baja se concilia una sola vez por agregado) */
      const orig = {}; p.lineas.forEach((l) => { if (esObj(l) && l.sustituye in AGREGADOS_CF07 && esEntero(l.agregado_original)) { if (orig[l.sustituye] !== undefined && orig[l.sustituye] !== l.agregado_original) e.push('V · las líneas de ' + l.sustituye + ' declaran agregados originales distintos (' + miles(orig[l.sustituye]) + ' y ' + miles(l.agregado_original) + ')'); orig[l.sustituye] = l.agregado_original; } });
      const ids = new Set(); p.lineas.forEach((l) => { if (esObj(l) && typeof l.id === 'string') { if (ids.has(l.id)) e.push('V · línea repetida: ' + repr(l.id)); ids.add(l.id); } });
    }
    if (p.fechas_pago !== null && p.fechas_pago !== undefined) {
      if (!esObj(p.fechas_pago)) e.push('V · fechas de pago mal capturadas');
      else Object.keys(p.fechas_pago).forEach((k) => { registrado('fechas_pago del vertical', k, PARTES_VERTICAL, e); const m = p.fechas_pago[k]; if (!esEntero(m) || m < 1 || m > M) e.push('V · mes de pago fuera del horizonte para ' + k + ': ' + repr(m)); });
    }
    return e;
  }

  const POR_OMISION_VERTICAL = { mes_corte: null, liberar_caja_minima: 'no', fondeador_respaldo: null, prioridad_tierra_pactada: false, fee_en_indirectos: null,
    imputacion: 'principal_primero', acuerdos_pactados: false, iva: null, gestion_esquema: null, pagos_registrados: null,
    opcion_reparto: OPCION_POR_OMISION, reparto_interno: null, isr: null, otros_acreedores: null, reservas: null, clases_capital: null, regla_clases: 'pari_passu',
    capital_arrastre: null, lineas: null, fechas_pago: null, estado_pacto_acuerdos: null, preferente_f02: null, comision_venta: null, acuerdos_receptor: null };

  /* repartoVertical(caso, parametros): caso = {M, series (pesos, base uno), nodos, visor, paquete_v, tipo, destino}. Todo se lee en UN corte (mes_corte;
     por omisión el último mes): fecha, caja, cartera, acreedores, reservas y autorización. Devuelve simulado, autorizado, pagado, conciliación por
     parte y la salida de la tarjeta «Reparto» y del paquete del visor con su estado (publicable o teórico), fuente y motivos. */
  function repartoVertical(caso, parametros) {
    const p = Object.assign({}, POR_OMISION_VERTICAL, parametros || {});
    if (p.opcion_reparto === null || p.opcion_reparto === undefined) p.opcion_reparto = OPCION_POR_OMISION;
    const vacio = (estado, errores) => ({ estado, errores, motivos: errores, motivos_utilidades: [], autorizable: false, simulado: {}, devengado: {}, autorizado: {},
      pagado: esObj(p.pagos_registrados) ? Object.assign({}, p.pagos_registrados) : {}, salida: null, rotulos: {}, cr: 0, corte: null, mes_corte: p.mes_corte,
      identidades: {}, conciliacion: {}, opcion_reparto: p.opcion_reparto, fecha_autorizable: null, no_implementado: NO_IMPLEMENTADO });
    /* alcance (T-10): sólo vertical en venta; renta y el Hub se bloquean de forma explícita, antes de validar o calcular */
    const fuera = [];
    if (esObj(caso) && caso.tipo !== undefined && caso.tipo !== null && caso.tipo !== 'vertical') fuera.push('ALCANCE · tipo «' + caso.tipo + '»: T-10 sólo implementa el vertical; el Hub queda fuera');
    if (esObj(caso) && caso.tipo_plan !== undefined && caso.tipo_plan !== null && caso.tipo_plan !== 'vertical') fuera.push('ALCANCE · el plan es de tipo «' + caso.tipo_plan + '» y se cargó en la definición «' + (caso.tipo || 'sin tipo') + '»: tipos distintos; T-10 sólo calcula planes verticales en venta');
    if (esObj(caso) && caso.destino !== undefined && caso.destino !== null && ENUM_DESTINO.indexOf(caso.destino) < 0) fuera.push('ALCANCE · destino «' + caso.destino + '»: renta y reserva no están implementadas (el Hub necesita su calendario de NOI a diez años); sólo vertical en venta');
    if (fuera.length) return vacio('BLOQUEADO · fuera de alcance', fuera);
    /* el estado del pacto (S-23) decide si los acuerdos están firmados: sólo «pactado» autoriza */
    const errPacto = [];
    if (p.estado_pacto_acuerdos !== null && p.estado_pacto_acuerdos !== undefined) { enumera('estado del pacto de los acuerdos de reparto (S-23)', p.estado_pacto_acuerdos, ESTADOS_PACTO, errPacto); p.acuerdos_pactados = p.estado_pacto_acuerdos === 'pactado'; }
    const errores = errPacto.concat(validaVertical(caso, p));
    if (errores.length) return vacio('INVÁLIDO · no se calcula', errores);
    const S = caso.series, N = caso.nodos, V = caso.visor, M = caso.M;
    const m = p.mes_corte || M;
    const tc = N['D-01'], T04 = pz(N['T-04']), ventas = pz(N['PT-07']);
    /* corte único (B1): primer mes de cierre = último movimiento de F-02 (y no antes del fin de obra) */
    const act = []; for (let t = 1; t <= M; t++) if (ACTIVIDAD.some((k) => Math.abs(S[k][t]) > 0.5)) act.push(t);
    const ultimoMov = act.length ? Math.max.apply(null, act) : 1;
    const fin = V.fin_obra, mr = V.mes_reparto === undefined ? null : V.mes_reparto;
    const trunc = mr === null || mr > M || V.fuera_horizonte > 0;
    const primerCierre = trunc ? null : Math.max(ultimoMov, fin);
    const corte = trunc ? 'truncado' : (m >= primerCierre ? 'final' : 'intermedio');
    let cartera = 0, egresosPend = 0; for (let t = m + 1; t <= M; t++) { cartera += S.cobranza[t]; egresosPend += S.egresos[t]; }
    cartera = pz(cartera); egresosPend = pz(egresosPend);
    /* imputación de lo que F-02 pagó al capital hasta el corte (M3: por clase, capitalización mensual, regla versionada y arrastre) */
    const rc = reconstruyeCapital(S, m, tc, p.imputacion, p.clases_capital, p.regla_clases, null);
    let arrastreOk = null;
    if (p.capital_arrastre) {
      const rc2 = reconstruyeCapital(S, m, tc, p.imputacion, p.clases_capital, p.regla_clases, p.capital_arrastre);
      /* B05 (T-11): el arrastre se valida CLASE POR CLASE (un +1,000 en una y −1,000 en otra ya no cuadra) */
      arrastreOk = Object.keys(rc.clases).every((k) => rc2.clases[k] && Math.abs(rc2.clases[k].pr - rc.clases[k].pr) <= 0.01 && Math.abs(rc2.clases[k].ac - rc.clases[k].ac) <= 0.01)
        && Object.keys(p.capital_arrastre.clases).every((k) => k in rc.clases);
    }
    let princPend = pz(rc.pr), prefPend = pz(rc.ac);
    if (princPend + prefPend !== pz(S.saldo_capital[m])) prefPend = pz(S.saldo_capital[m]) - princPend;
    const cd = pz(S.caja[m]), cmin = pz(S.caja_minima[m]);
    const banco = pz(S.saldo_banco[m]), resp = pz(S.saldo_respaldo[m]), rv06 = pz(N['RV-06']);
    let resto = cd; const acreed = [];
    [['banco', banco], ['respaldo', resp]].forEach(([aid, ex_]) => { const pg = Math.min(resto, ex_); resto -= pg; acreed.push({ id: aid, exigible: ex_, pagado: pg, saldo: ex_ - pg, estado: 'dato de F-02' }); });
    /* B2: ISR y demás acreedores del corte, con estado explícito de dato desconocido */
    const isrD = esObj(p.isr) ? p.isr : { estado: 'desconocido' };
    const isrEx = isrD.estado === 'monto' ? isrD.monto : 0;
    { const pg = Math.min(resto, isrEx); resto -= pg; acreed.push({ id: 'ISR', exigible: isrEx, pagado: pg, saldo: isrEx - pg, estado: isrD.estado === 'monto' ? 'dato' : isrD.estado === 'transparente' ? 'transparente (el vehículo no causa ISR; lo pagan los socios)' : 'dato desconocido' }); }
    const otrosD = esObj(p.otros_acreedores) ? p.otros_acreedores : { estado: 'desconocido' };
    if (otrosD.estado === 'lista') otrosD.lista.forEach((it) => { const pg = Math.min(resto, it.exigible); resto -= pg; acreed.push({ id: it.id, parte: it.parte, exigible: it.exigible, pagado: pg, saldo: it.exigible - pg, estado: 'dato' }); });
    /* B02 (T-11): una línea con beneficiario sustituye parte de un agregado que F-02 ya rebajó; su egreso sale de la caja del corte, a nombre de su beneficiario */
    (p.lineas || []).forEach((l) => { const pg = Math.min(resto, l.monto); resto -= pg; acreed.push({ id: 'línea «' + l.id + '»', parte: l.beneficiario, exigible: l.monto, pagado: pg, saldo: l.monto - pg, estado: 'servicio con beneficiario: ' + l.sustituye + ' se rebajó en F-02 y la línea se paga del corte' }); });
    const faltAcr = suma(acreed.map((a) => a.saldo));
    const ret = Math.min(resto, cmin); resto -= ret;
    const lib = p.liberar_caja_minima === 'al_liquidar' && corte === 'final' ? ret : 0;   // D-16 sólo al liquidar
    resto += lib;
    const reserva = { id: 'caja mínima (D-16)', requerida: cmin, retenida: ret, faltante: cmin - ret, liberada: lib };
    const resD = esObj(p.reservas) ? p.reservas : { estado: 'desconocido' };
    const otrasReservas = [];
    if (resD.estado === 'lista') resD.lista.forEach((it) => { const rt = Math.min(resto, it.requerida); resto -= rt; const lb = it.liberacion === 'al_liquidar' && corte === 'final' ? rt : 0; resto += lb; otrasReservas.push({ id: it.id, requerida: it.requerida, retenida: rt, faltante: it.requerida - rt, liberada: lb }); });
    const notas = [];
    if (ret > 0 && lib === 0) notas.push('RESERVA · caja mínima retenida en el corte ' + m + ': ' + miles(ret) + ' pesos no se reparten' + (corte !== 'final' ? ' (sólo se libera en el corte final con acuerdo de liberar al liquidar)' : ' (sin acuerdo de liberación)'));
    const cr = faltAcr === 0 ? resto : 0;
    /* pasos 3 a 7 */
    const sim = {}, dev = {}; let crR = cr;
    const paga = (k, x) => { const pp = Math.min(crR, x); crR -= pp; sim[k] = (sim[k] || 0) + pp; dev[k] = (dev[k] || 0) + x; };
    paga('capital_principal', princPend); paga('capital_preferente', prefPend);
    const fee = pz((N['S-06'] || 0) * ventas);
    paga('alianza_fee', fee);
    const s02 = N['S-02'];
    const tierraPrioridad = s02 === 'si' || p.prioridad_tierra_pactada;
    paga('dueno_tierra', tierraPrioridad ? T04 : 0);
    const rest7 = crR;
    /* B01 (T-11): el excedente del paso 7 es el de la opción de P-02 (A y B: 50/50/0; C: 30/20/50), no el del plan */
    const op = OPCIONES[p.opcion_reparto];
    const pesos7 = { dueno_parte: q(String(op.excedente.DUENO)), alianza_parte: q(String(op.excedente.ALIANZA)), capital_parte: q(String(op.excedente.CAPITAL)) };
    const estructuraDistinta = qc(String(N['S-03']), String(op.excedente.DUENO)) !== 0 || qc(String(N['S-05']), String(op.excedente.CAPITAL)) !== 0;
    const rp7 = rest7 > 0 ? reparte(rest7, pesos7) : { dueno_parte: 0, alianza_parte: 0, capital_parte: 0 };
    Object.keys(rp7).forEach((k) => { sim[k] = rp7[k]; dev[k] = rp7[k]; });
    crR -= rest7;
    const dueno = sim.dueno_tierra + sim.dueno_parte, alianza = sim.alianza_fee + sim.alianza_parte;
    const capitalCascada = sim.capital_principal + sim.capital_preferente + sim.capital_parte;
    /* candados y solvencia */
    const motivos = [];
    const feePos = fee > 0;
    if (feePos && p.fee_en_indirectos === 'si') motivos.push('CF-01 · fee dentro de indirectos y aparte');
    if (feePos && p.fee_en_indirectos === 'desconocido') motivos.push('CF-01 · inclusión del fee en indirectos desconocida (P-04)');
    if (feePos && p.gestion_esquema === 'B') motivos.push('CF-02 · esquema B (gerencia externa, fila 50, y fee reducido, fila 85) no implementado en el vertical de prueba: bloqueado hasta T-10');
    if (feePos && p.gestion_esquema === 'A') {
      if (qc(String(N['S-06']), ALTO_FEE.A[1]) > 0) motivos.push('CF-02 · S-06 = ' + (N['S-06'] * 100).toFixed(2) + ' % de ventas rebasa el valor alto de la fila 51 (5.5 %)');
      if (qc(String(N['S-06']), '0.06') > 0) motivos.push('CF-02 · S-06 rebasa el tope de gestión de 6 % de ventas netas');
    }
    if (p.iva.modalidad !== 'ya_incorporado' || p.iva.tipologia === 'mixto') motivos.push('CF-06 · IVA ' + p.iva.tipologia + ' / ' + p.iva.modalidad + ' no implementado en el vertical de prueba (sólo «ya incorporado» en vivienda o comercial): bloqueado hasta T-10');
    /* B01 (T-11): P-02 gobierna la estructura. El plan debe traer el excedente y el rendimiento de la opción (F-02 calcula con S-03, S-05 y D-01);
       si no, se bloquea (aplicar la opción al plan con Motor.planConOpcion recalcula F-02). El preferente simple de las tres opciones no lo representa F-02. */
    const tasaOpcion = op.preferente.tasa, efectiva = (Math.pow(1 + tc / 12, 12) - 1) * 100;
    if (estructuraDistinta) motivos.push('P-02 · el plan reparte el excedente ' + (N['S-03'] * 100).toFixed(0) + '/' + (N['S-04'] * 100).toFixed(0) + '/' + (N['S-05'] * 100).toFixed(0) + ' (S-03/S-04/S-05) y la opción ' + p.opcion_reparto + ' pacta ' + (op.excedente.DUENO * 100).toFixed(0) + '/' + (op.excedente.ALIANZA * 100).toFixed(0) + '/' + (op.excedente.CAPITAL * 100).toFixed(0) + ': el motor y la tarjeta usan el plan; aplica la opción al plan (planConOpcion) o queda bloqueado');
    if (qc(String(tc), String(tasaOpcion)) !== 0) motivos.push('P-02 · F-02 calculó el capital con D-01 = ' + (tc * 100).toFixed(1) + ' % y la opción ' + p.opcion_reparto + ' pacta un preferente de ' + (tasaOpcion * 100).toFixed(0) + ' %: aplica la opción al plan (planConOpcion) para que F-02 lo recalcule; mientras, bloqueado');
    if (p.preferente_f02 === null || p.preferente_f02 === undefined) motivos.push('P-02 · la opción ' + p.opcion_reparto + ' pacta un preferente simple de ' + (tasaOpcion * 100).toFixed(0) + ' % y F-02 capitaliza cada mes (' + (tc * 100).toFixed(1) + ' % nominal = ' + efectiva.toFixed(2) + ' % efectivo): variante no representable en F-02, bloqueada; para autorizar, las partes deben pactar el preferente como lo calcula F-02 (preferente_f02)');
    else if (p.preferente_f02 !== 'pactado') motivos.push('PACTO · preferente como lo calcula F-02 (capitalización mensual) sin firma: ' + p.preferente_f02);
    /* CF-07 (B02, T-11): las líneas de un mismo agregado se concilian JUNTAS contra la baja del agregado; cada una exige referencia de catálogo (CF-09)
       verificable con la construcción del plan (E-05) y no puede duplicar una función que su beneficiario ya cobra en el fee (CF-04) */
    const funciones = {};
    if (!op.reparto_interno) MATRIZ_MOREO.forEach((f) => { if (qc(f[1], 0) > 0) (funciones[f[2]] = funciones[f[2]] || new Set()).add(f[3]); });
    const porAgregado = {}; (p.lineas || []).forEach((l) => { porAgregado[l.sustituye] = (porAgregado[l.sustituye] || 0) + l.monto; });
    const lineas = (p.lineas || []).map((l) => {
      const ag = AGREGADOS_CF07[l.sustituye], actual = pz(N[ag]), bajada = l.agregado_original - actual, juntas = porAgregado[l.sustituye];
      const ok = bajada >= juntas;
      const mot = [];
      if (!ok) mot.push('CF-07 · las líneas de ' + l.sustituye + ' suman ' + miles(juntas) + ' y ' + ag + ' sólo bajó ' + miles(bajada) + ' de ' + miles(l.agregado_original) + ': la línea «' + l.id + '» (' + NOMBRES[l.beneficiario] + ', ' + miles(l.monto) + ') no cabe en la baja');
      const cid = l.catalogo, cat = typeof cid === 'string' && Object.prototype.hasOwnProperty.call(CATALOGO, cid) ? CATALOGO[cid] : null;
      let tope = null;
      if (cat === null) mot.push('CF-09 · la línea «' + l.id + '» no trae una referencia válida del catálogo (' + repr(cid) + '): sin precio de mercado verificable no se paga aparte');
      else {
        if (CATALOGO_AGREGADO[cid] !== l.sustituye) mot.push('CF-09 · la fila ' + cat.filas + ' (' + cat.concepto + ') no forma parte de ' + l.sustituye + ': la línea «' + l.id + '» no puede sustituirlo');
        if (l.alcance !== cat.alcance) mot.push('CF-09 · la línea «' + l.id + '» apunta a la fila ' + cat.filas + ', ajena a su alcance «' + l.alcance + '»');
        const b = l.base || {};
        if (b.medida !== cat.medida) mot.push('CF-09 · la línea «' + l.id + '» mide su base en «' + b.medida + '» y la fila ' + cat.filas + ' en «' + cat.medida + '»');
        else if (!esEntero(b.cantidad) || b.cantidad <= 0) mot.push('CF-09 · la línea «' + l.id + '» no trae la cantidad de su base');
        else if (b.proxy) mot.push('CF-09 · la línea «' + l.id + '» calcula su tope con una base proxy: no autoriza');
        else if (cat.medida === 'm2_construido' && (!esNum(N['E-05']) || Math.abs(b.cantidad - N['E-05']) > 0.5)) mot.push('CF-09 · la base de la línea «' + l.id + '» (' + miles(b.cantidad) + ' m²) no es la construcción del plan (E-05 = ' + (esNum(N['E-05']) ? miles(pz(N['E-05'])) : 'sin dato') + ' m²): tope no verificable');
        else if (cat.medida === 'evento' && b.cantidad !== 1) mot.push('CF-09 · la línea «' + l.id + '» cuenta ' + b.cantidad + ' eventos de una suma fija por evento');
        else tope = cat.medio * b.cantidad;
        const fp = l.fecha_precio;
        if (fp === null || fp === undefined) mot.push('CF-09 · la línea «' + l.id + '» sin fecha de precio para revisar la vigencia del catálogo');
        else { let f = null; try { f = fecha(fp); } catch (x) { mot.push('CF-09 · fecha de precio inválida en la línea «' + l.id + '»: ' + repr(fp)); } if (f && cmpFecha(f, masMeses(fecha(cat.fecha), VIGENCIA_CATALOGO_MESES)) > 0) mot.push('CF-09 · el precio de la línea «' + l.id + '» (' + fp + ') cae fuera de la vigencia del catálogo (' + cat.fecha + ' + ' + VIGENCIA_CATALOGO_MESES + ' meses)'); }
        if (tope !== null && l.monto > tope) mot.push('CF-09 · la línea «' + l.id + '» cuesta ' + miles(l.monto) + ', más que su tope de mercado (' + miles(tope) + '; catálogo fila ' + cat.filas + ', valor medio × ' + miles(l.base.cantidad) + ')');
      }
      if (funciones[l.beneficiario] && funciones[l.beneficiario].has(l.alcance)) mot.push('CF-04 · ' + NOMBRES[l.beneficiario] + ' cobra «' + l.alcance + '» dentro del fee (matriz de la opción ' + p.opcion_reparto + ') y como línea aparte');
      if (l.estado_pacto !== 'pactado') mot.push('PACTO · línea «' + l.id + '» sin firma: ' + l.estado_pacto);
      mot.forEach((x) => motivos.push(x));
      return { id: l.id, beneficiario: l.beneficiario, monto: l.monto, sustituye: l.sustituye, agregado: ag, agregado_original: l.agregado_original, agregado_actual: actual, bajada, lineas_del_agregado: juntas,
        cf07: ok ? 'pasa' : 'bloquea', catalogo: cat ? cat.filas : null, tope_mercado: tope, motivos: mot };
    });
    /* CF-03 (B03, T-11): la comisión de venta (C-10) se declara con su beneficiario y canal; un socio que también cobra el fee no puede cobrarla aparte */
    const c10 = pz(N['C-14'] || 0), cv = p.comision_venta;
    if (c10 > 0 && !esObj(cv)) motivos.push('SV · beneficiario y canal de la comisión de venta (C-10 = ' + miles(c10) + ') sin declarar: no se puede descartar la duplicidad de canal y fee (CF-03)');
    if (c10 > 0 && esObj(cv)) {
      if (cv.canal === 'master') motivos.push('CF-03 · canal master (paquete 86) no implementado en el vertical de prueba: sólo comisión externa C-10; bloqueado');
      const recibeFee = fee > 0 || op.excedente.ALIANZA > 0;
      if (cv.beneficiario !== 'TERCERO' && funciones[cv.beneficiario] && funciones[cv.beneficiario].has('comercializacion')) motivos.push('CF-03 · ' + NOMBRES[cv.beneficiario] + ' cobra comercialización dentro del fee (matriz de la opción ' + p.opcion_reparto + ') y además la comisión de venta (C-10)');
      else if (cv.beneficiario !== 'TERCERO' && recibeFee && op.reparto_interno && cv.beneficiario in op.reparto_interno) motivos.push('CF-03 · ' + NOMBRES[cv.beneficiario] + ' recibe parte del fee y del excedente de la alianza (tercios de la opción ' + p.opcion_reparto + ') y además la comisión de venta (C-10): duplicidad de canal no descartada');
    }
    const tierraSinRegla = s02 === 'no' && !p.prioridad_tierra_pactada;
    if (tierraSinRegla) motivos.push('CF-10 · tierra en especie sin regla de prioridad pactada');
    if (faltAcr > 0) motivos.push('SV · acreedores sin pagar en el corte ' + m + ': ' + miles(faltAcr));
    let maxResp = -Infinity; for (let t = 1; t <= M; t++) if (S.saldo_respaldo[t] > maxResp) maxResp = S.saldo_respaldo[t]; maxResp = pz(maxResp);
    if (rv06 > 0 && !(p.fondeador_respaldo && p.fondeador_respaldo.tope >= maxResp)) motivos.push('SV · déficit sin fondeador: RV-06 = ' + miles(rv06) + ' y nadie comprometió ese respaldo');
    if (p.fondeador_respaldo && p.fondeador_respaldo.estado_pacto !== 'pactado') motivos.push('PACTO · respaldo comprometido sin firma');
    /* B06 (T-11): F-02 cuesta el respaldo con D-01 capitalizable cada mes; un compromiso a otra tasa no lo representa el plan */
    if (p.fondeador_respaldo && maxResp > 0 && qc(String(p.fondeador_respaldo.tasa), String(tc)) !== 0) motivos.push('PACTO · el respaldo comprometido a ' + (p.fondeador_respaldo.tasa * 100).toFixed(2) + ' % no coincide con el costo que usa F-02 (D-01 = ' + (tc * 100).toFixed(1) + ' % capitalizable cada mes): el plan no representa ese compromiso; bloqueado');
    if (reserva.faltante > 0) motivos.push('SV · caja mínima sin completar ' + miles(reserva.faltante));
    if (isrD.estado === 'desconocido') motivos.push('SV · ISR del vehículo en el corte ' + m + ': dato desconocido (declararlo como monto o vehículo transparente antes de autorizar)');
    if (otrosD.estado === 'desconocido') motivos.push('SV · demás acreedores del corte ' + m + ': dato desconocido (declarar «ninguno» o la lista con exigible)');
    if (resD.estado === 'desconocido') motivos.push('SV · reservas del corte ' + m + ' además de la caja mínima: dato desconocido (declarar «ninguna» o la lista)');
    otrasReservas.forEach((x) => { if (x.faltante > 0) motivos.push('SV · reserva «' + x.id + '» sin completar ' + miles(x.faltante)); });
    if (trunc) motivos.push('SV · horizonte truncado: mes_reparto ' + mr + ' > ' + M + ' o unidades fuera del horizonte');
    if (corte === 'intermedio') motivos.push('CORTE · intermedio: el mes ' + m + ' es anterior al primer mes de cierre ' + primerCierre + ' (cartera por cobrar ' + miles(cartera) + ', egresos pendientes ' + miles(egresosPend) + '): la caja mínima no se libera y nada se autoriza');
    if (!p.acuerdos_pactados) motivos.push('PACTO · acuerdos de reparto sin firma');
    if (arrastreOk === false) motivos.push('SV · el arrastre del capital del corte ' + p.capital_arrastre.mes + ' no cuadra, clase por clase, con F-02 reconstruido hasta el corte ' + m);
    if (Array.isArray(p.clases_capital) && p.clases_capital.length > 1) motivos.push('M3 · clases de capital: la copia de prueba concilia derecho, pago y saldo sólo del capital agregado; con ' + p.clases_capital.length + ' clases el desglose es de presentación y no se autoriza (entrada cerrada hasta conciliar por clase)');
    /* P-02: reparto interno de la alianza (A tercios por omisión; B y C por la matriz del Acuerdo Marco) */
    let pesosFeeA, pesosExcA;
    if (p.reparto_interno) { pesosFeeA = Object.assign({}, p.reparto_interno.partes); pesosExcA = Object.assign({}, p.reparto_interno.partes); }
    else if (op.reparto_interno) { pesosFeeA = Object.assign({}, op.reparto_interno); pesosExcA = Object.assign({}, op.reparto_interno); }
    else { pesosFeeA = {}; MATRIZ_MOREO.forEach((f) => { pesosFeeA[f[2]] = pesosFeeA[f[2]] === undefined ? q(f[1]) : qa(pesosFeeA[f[2]], f[1]); }); pesosExcA = Object.assign({}, pesosFeeA); }
    const repAli = (feeX, parteX) => { const a = reparte(feeX, pesosFeeA), b = reparte(parteX, pesosExcA), o = {}; ALIADOS.concat([SIN]).forEach((k) => { const x = (a[k] || 0) + (b[k] || 0); if (x || k in a || k in b) o[k] = x; }); return o; };
    const alianzaSim = repAli(sim.alianza_fee, sim.alianza_parte);
    if ((alianzaSim[SIN] || 0) > 0) motivos.push('RECEPTOR · importes de la alianza sin receptor (matriz «sin asignar», opción ' + p.opcion_reparto + '): ' + miles(alianzaSim[SIN]));
    /* B03 (T-11): sólo recibe quien tiene base: la opción (A: tercios de YoDesarrollo, PG y Avermont; B y C: filas de la matriz) o un aporte o
       acuerdo registrado por receptor. Un reparto interno distinto del de la opción es otro pacto y necesita firma. */
    const baseOpcion = new Set(op.reparto_interno ? Object.keys(op.reparto_interno) : MATRIZ_MOREO.filter((f) => f[2] !== SIN && qc(f[1], 0) > 0).map((f) => f[2]));
    const acuerdos = esObj(p.acuerdos_receptor) ? p.acuerdos_receptor : {};
    Object.keys(alianzaSim).filter((k) => k !== SIN && alianzaSim[k] > 0).forEach((k) => {
      if (baseOpcion.has(k)) return;
      if (!acuerdos[k]) motivos.push('RECEPTOR · ' + NOMBRES[k] + ' recibiría ' + miles(alianzaSim[k]) + ' sin aporte ni acuerdo registrado (la opción ' + p.opcion_reparto + ' no lo nombra): no puede recibir');
      else if (acuerdos[k].estado_pacto !== 'pactado') motivos.push('PACTO · el acuerdo por el que recibe ' + NOMBRES[k] + ' (' + acuerdos[k].base + ': ' + acuerdos[k].concepto + ') no está firmado: ' + acuerdos[k].estado_pacto);
    });
    if (p.reparto_interno && p.reparto_interno.estado_pacto !== 'pactado') motivos.push('PACTO · reparto interno de la alianza distinto del de la opción ' + p.opcion_reparto + ' sin firma: ' + p.reparto_interno.estado_pacto);
    const notasOpcion = [];
    const difiere = (a, b) => Math.abs(a - b) > 1e-9;
    notasOpcion.push('NOTA · opción ' + p.opcion_reparto + ' (' + op.titulo + '): excedente ' + (op.excedente.DUENO * 100).toFixed(0) + '/' + (op.excedente.ALIANZA * 100).toFixed(0) + '/' + (op.excedente.CAPITAL * 100).toFixed(0) + ' aplicado en el paso 7; preferente de ' + (op.preferente.tasa * 100).toFixed(0) + ' % ' + op.preferente.tipo + (difiere(tc, op.preferente.tasa) || estructuraDistinta ? '; el plan no la trae: bloqueado (planConOpcion la aplica y F-02 se recalcula)' : '; el plan la trae (S-03, S-05 y D-01)'));
    const suma7 = sumaV(sim);
    const extra = suma(acreed.slice(2).map((a) => a.pagado)) + suma(otrasReservas.map((x) => x.retenida - x.liberada));
    const ident = { 'suma repartida = CR': suma7 === cr, 'saldo de capital reconstruido hasta el corte (≤ 0.01 peso)': rc.maxdif <= 0.01 };
    if (faltAcr === 0 && lib === ret && corte === 'final') ident['CR − saldo de capital = D-22 (±1 peso)'] = cr + extra > princPend + prefPend ? Math.abs(cr + extra - (princPend + prefPend) - N['D-22']) <= 1 : null;
    if (Object.keys(ident).some((k) => ident[k] === false)) motivos.push('SV · identidad que no cuadra');
    const capitalCubierto = sim.capital_principal === dev.capital_principal && sim.capital_preferente === dev.capital_preferente;
    const motivosUtilidades = [];
    if (!capitalCubierto) motivosUtilidades.push('SV · el capital no quedó cubierto al 100 %: los pasos 5 a 7 quedan teóricos');
    const autorizableBase = motivos.length === 0;
    const aut0 = {}; Object.keys(sim).forEach((k) => { aut0[k] = autorizableBase && (PASO[k] <= 4 || !motivosUtilidades.length) ? sim[k] : 0; });
    /* pagos (B5) por parte: evidencia, sobrepago, descuadre y saldo por autorizar */
    const pag = {}, derecho = {}, autALaFecha = {}, sobrepago = {};
    PARTES_VERTICAL.forEach((pp) => { pag[pp] = (p.pagos_registrados || {})[pp] || 0; derecho[pp] = suma(CONCEPTOS_PARTE[pp].map((c) => sim[c])); autALaFecha[pp] = suma(CONCEPTOS_PARTE[pp].map((c) => aut0[c])); sobrepago[pp] = Math.max(0, pag[pp] - derecho[pp]); });
    const pagTot = sumaV(pag);
    if (pagTot > 0 && !autorizableBase) motivos.push('PAGO · pagos registrados sin autorización vigente: ' + PARTES_VERTICAL.filter((pp) => pag[pp]).join(', ') + ' · se conserva la evidencia');
    if (PARTES_VERTICAL.some((pp) => sobrepago[pp])) motivos.push('PAGO · sobrepago: ' + PARTES_VERTICAL.filter((pp) => sobrepago[pp]).map((pp) => pp + ' pagado ' + miles(pag[pp]) + ' contra derecho ' + miles(derecho[pp])).join(', ') + ' · nueva autorización bloqueada');
    else if (autorizableBase && PARTES_VERTICAL.some((pp) => pag[pp] > autALaFecha[pp])) motivos.push('PAGO · pagado más que lo autorizable a la fecha: ' + PARTES_VERTICAL.filter((pp) => pag[pp] > autALaFecha[pp]).join(', ') + ' · nueva autorización bloqueada');
    if (pagTot > cr) motivos.push('PAGO · descuadre: lo pagado (' + miles(pagTot) + ') excede la caja repartible del corte (' + miles(cr) + ')');
    const autorizable = motivos.length === 0;
    const autorizado = {}; Object.keys(sim).forEach((k) => { autorizado[k] = autorizable ? aut0[k] : 0; });
    if (autorizable) PARTES_VERTICAL.forEach((pp) => { let rr = pag[pp]; CONCEPTOS_PARTE[pp].forEach((c) => { const d = Math.min(rr, autorizado[c]); autorizado[c] -= d; rr -= d; }); if (rr !== 0) throw new Error('pago no imputado'); });
    const conciliacion = {};
    PARTES_VERTICAL.forEach((pp) => { const a = suma(CONCEPTOS_PARTE[pp].map((c) => autorizado[c])); conciliacion[pp] = { derecho: derecho[pp], autorizable_a_la_fecha: autorizableBase ? autALaFecha[pp] : 0, pagado: pag[pp], autorizado: a, disponible_reintento: a, sobrepago: sobrepago[pp] }; });
    const alianzaAut = autorizable ? repAli(autorizado.alianza_fee, autorizado.alianza_parte) : Object.keys(alianzaSim).reduce((o, k) => { o[k] = 0; return o; }, {});
    const fechaAut = autorizable && corte === 'final' && !motivosUtilidades.length ? m : null;
    /* salida de la tarjeta «Reparto» y del paquete del visor (B3, C1) */
    const cajaCierre = cd - banco - resp - extra - (princPend + prefPend);
    const tierraF = tierraPrioridad ? T04 : 0;
    const R21p = cajaCierre - fee - tierraF;
    const sp = R21p >= 0 ? reparte(R21p, pesos7) : Object.keys(pesos7).reduce((o, k) => { o[k] = r(qm(R21p, pesos7[k])); return o; }, {});
    const netoF02 = pz(rc.pagos_cap - rc.aport);
    const pact = { 'R-21': R21p, 'R-22': tierraF + sp.dueno_parte, 'R-24': fee + sp.alianza_parte, 'R-25': netoF02 + princPend + prefPend + sp.capital_parte };
    pact['R-23'] = T04 ? pact['R-22'] / T04 : null;
    const covered = capitalCubierto && faltAcr === 0 && lib === ret && corte === 'final';
    let reconciliado = covered && Math.abs(pact['R-21'] - rest7) <= 1 && Math.abs(pact['R-22'] - dueno) <= 1 && Math.abs(pact['R-24'] - alianza) <= 1 && Math.abs(pact['R-25'] - netoF02 - capitalCascada) <= 1;
    if (s02 === 'si') reconciliado = reconciliado && ['R-21', 'R-22', 'R-24', 'R-25'].every((k) => Math.abs(pact[k] - N[k]) <= 1);
    const basePublicable = autorizable && !motivosUtilidades.length && corte === 'final';
    const campo = (valor, fuente, motivosC) => {
      const mot = motivosC.slice();
      if (esNum(valor) && valor < 0) mot.push('pérdida asignada (teórica)');
      const estado = basePublicable && !mot.length ? 'publicable' : 'teórico';
      if (!basePublicable && !mot.length) mot.push('corte no autorizable: ' + (motivos.concat(motivosUtilidades).slice(0, 3).join('; ') || 'sin autorización'));
      return { valor, estado, fuente, motivos: mot };
    };
    const legado = {}, publicado = {};
    ['R-21', 'R-22', 'R-23', 'R-24', 'R-25'].forEach((k) => {
      if (s02 === 'no' && p.prioridad_tierra_pactada) {
        legado[k] = { valor: N[k], estado: 'teórico', fuente: 'motor (legado)', motivos: ['legado: el motor calculó la tierra en especie sin la prioridad pactada (M8b interno); no se publica'] };
        publicado[k] = campo(pact[k], 'cascada pactada reconciliada', reconciliado ? [] : ['cascada pactada sin reconciliar en este corte']);
      } else if (s02 === 'no') publicado[k] = campo(N[k], 'motor (legado)', ['incluye tierra aportada sin regla pactada']);
      else publicado[k] = campo(N[k], 'motor', estructuraDistinta ? ['estructura del plan (S-03/S-05) distinta de la opción ' + p.opcion_reparto + ' de P-02'] : reconciliado ? [] : ['sin reconciliar con la cascada del corte']);
    });
    SIMPLIFICADOS.forEach((k) => {
      if (N[k] === null || N[k] === undefined) return;
      const mot = ['versión simplificada antes de financiar; no es salida de reparto'];
      if (s02 === 'no') mot.push(!p.prioridad_tierra_pactada ? 'incluye tierra aportada sin regla pactada' : 'legado sin la prioridad pactada');
      legado[k] = { valor: N[k], estado: 'teórico', fuente: s02 === 'no' ? 'motor (legado)' : 'motor', motivos: mot };
    });
    const tarjeta = {}; ['R-23', 'R-22', 'R-24', 'R-25'].forEach((k) => { tarjeta[k] = publicado[k]; });
    tarjeta['T-04'] = campo(T04, 'motor', []);
    const paquete = {}; Object.keys(CAMPO_NODO).forEach((c) => { paquete[c] = Object.assign({}, publicado[CAMPO_NODO[c]], { nodo: CAMPO_NODO[c] }); });
    /* N-02 (dictamen T-08 v3): las fechas distinguen el hito del motor (referencia del Árbol), el corte autorizado y el pago registrado.
       El mes de reparto del motor nunca se presenta como fecha autorizada de otro corte. */
    const hito = mr, motTrunc = trunc ? ['horizonte truncado'] : [];
    const motHito = motTrunc.length ? motTrunc : (fechaAut !== null && hito !== fechaAut ? ['referencia del Árbol (hito del motor, mes ' + hito + '): no es la fecha autorizada del corte ' + fechaAut] : []);
    paquete.mes_reparto = Object.assign(campo(hito, 'motor (hito del Árbol)', motHito), { rol: 'hito del motor' });
    paquete.fecha_corte_autorizado = Object.assign(campo(fechaAut, 'corte del reparto (S-21)', fechaAut === null ? ['sin fecha autorizada en este corte'] : []), { rol: 'corte autorizado' });
    if (fechaAut !== null) {
      paquete.dueno_meses = Object.assign(campo(fechaAut, 'corte autorizado', []), { rol: 'corte autorizado', hito_motor: V.dueno_meses === undefined ? null : V.dueno_meses });
      paquete.dueno_anos = Object.assign(campo(fechaAut / 12, 'corte autorizado', []), { rol: 'corte autorizado', hito_motor: V.dueno_anos === undefined ? null : V.dueno_anos });
    } else {
      const motRef = motTrunc.concat(['referencia del Árbol (hito del motor), no es fecha autorizada']);
      paquete.dueno_meses = Object.assign(campo(V.dueno_meses === undefined ? null : V.dueno_meses, 'motor (hito del Árbol)', motRef), { rol: 'hito del motor' });
      paquete.dueno_anos = Object.assign(campo(V.dueno_anos === undefined ? null : V.dueno_anos, 'motor (hito del Árbol)', motRef), { rol: 'hito del motor' });
    }
    /* N01 (dictamen T-11 v2): un pago existe sólo con importe registrado. Una fecha sin importe no es pago: queda «inconsistente», sin valor
       (nadie la lee como mes de pago), conserva su motivo y la fecha declarada aparte; nunca toca el corte autorizado. */
    const mesPago = esObj(p.fechas_pago) && p.fechas_pago.DUENO ? p.fechas_pago.DUENO : null, conImporte = pag.DUENO > 0;
    const basePago = { fuente: 'libro de pagos (fuera del Árbol)', rol: 'pago registrado' };
    paquete.fecha_pago_registrado = mesPago !== null && conImporte ? Object.assign({ valor: mesPago, estado: 'registrado' }, basePago, { motivos: [] })
      : mesPago !== null ? Object.assign({ valor: null, estado: 'inconsistente', fecha_sin_importe: mesPago }, basePago, { motivos: ['fecha sin pago registrado al dueño: el mes ' + mesPago + ' no tiene importe en el libro de pagos; no es un pago'] })
        : Object.assign({ valor: null, estado: 'sin registro' }, basePago, { motivos: [conImporte ? 'pago registrado sin fecha en el libro de pagos' : 'sin pago registrado'] });
    if (caso.paquete_v && caso.paquete_v.resultado_repartir !== null && caso.paquete_v.resultado_repartir !== undefined) paquete.resultado_repartir = campo(caso.paquete_v.resultado_repartir * 1e6, 'motor', []);
    const rot = {}; Object.keys(paquete).forEach((c) => { const x = paquete[c]; rot[c] = x.estado === 'publicable' ? 'publicable' : x.estado === 'registrado' ? 'registrado' : 'teórico · ' + x.motivos.join('; '); });
    DEPENDEN_TIERRA.forEach((k) => { const x = publicado[k] || legado[k]; if (x) rot[k] = x.estado === 'publicable' ? 'publicable' : 'teórico · ' + x.motivos.join('; '); });
    const estado = autorizable && !motivosUtilidades.length ? 'AUTORIZABLE' : autorizable ? 'AUTORIZABLE sólo pasos 3 y 4' : 'NO AUTORIZABLE';
    const ue = (N['R-20'] !== undefined && N['R-20'] !== null ? pz(N['R-20']) : null);
    return {
      estado, corte, mes_corte: m, primer_mes_cierre: primerCierre, cartera_por_cobrar: cartera, egresos_pendientes: egresosPend,
      cd, acreedores: acreed, faltante_acreedores: faltAcr, reserva, reservas_otras: otrasReservas, cr, simulado: sim, devengado: dev,
      dueno, alianza, capital_cascada: capitalCascada, capital_pagado_en_F02: { principal: pz(rc.pag_pr), rendimiento: pz(rc.pag_ac) },
      principal_pendiente: princPend, preferente_pendiente: prefPend, capital_por_clase: porClase(rc, princPend, prefPend),
      capital_arrastre: rc.arrastre, arrastre_cuadra: arrastreOk, capitalizacion: 'mensual', tasa_efectiva_anual: Math.pow(1 + tc / 12, 12) - 1,
      fecha_autorizable: fechaAut, mes_reparto: mr, motivos, motivos_utilidades: motivosUtilidades, notas: notas.concat(notasOpcion), autorizable, autorizado,
      pagado: pag, conciliacion, identidades: ident, salida: { tarjeta, paquete, legado, reconciliado }, rotulos: rot,
      R22: N['R-22'], R24: N['R-24'], R25: N['R-25'], rv06, imputacion: p.imputacion, regla_clases: p.regla_clases,
      opcion_reparto: p.opcion_reparto, opcion_titulo: op.titulo, alianza_por_socio: { simulado: alianzaSim, autorizado: alianzaAut },
      utilidad_economica: ue !== null ? ue - T04 - fee - isrEx : null, lineas, no_implementado: NO_IMPLEMENTADO,
      obligaciones: suma(acreed.map((a) => a.exigible)), reservas_requeridas: cmin + suma(otrasReservas.map((x) => x.requerida))
    };
  }

  return {
    VERSION, q, qm, r, pz, reparte, miles,
    PARTES, PARTES_REALES, ALIADOS, CLASES_CAPITAL, NOMBRES, SIN, ESTADOS_PACTO,
    ENUM_FEE_INDIRECTOS, ENUM_LIBERACION, ENUM_IMPUTACION, ENUM_ESQUEMA, ENUM_TIPOLOGIA, ENUM_MODALIDAD_IVA, ENUM_OPCION_REPARTO, OPCION_POR_OMISION,
    ENUM_ISR_VERTICAL, ENUM_ACREEDORES, ENUM_RESERVAS, ENUM_REGLA_CLASES, AGREGADOS_CF07, CATALOGO_AGREGADO, ENUM_MODO_INTERNO, ENUM_BASE_RECEPTOR, ENUM_CANAL_VERTICAL,
    CATALOGO, FILAS_5_9, MATRIZ_MOREO, BASE, BAJAS, DUPLICADO, ACUERDO_MARCO, OPCIONES, DUENO_BASES, GLA,
    valida, verificaServicio, candados, cascada, escenario, escenarioOpcion,
    CAMPOS_VISOR, CAMPO_NODO, CAMPOS_FECHA, DEPENDEN_TIERRA, SIMPLIFICADOS, NODOS_REQ, SERIES_REQ, PARTES_VERTICAL, CONCEPTOS_PARTE, PASO, NO_IMPLEMENTADO,
    FICHAS, RANGO_ESTADO, POR_OMISION_VERTICAL, validaEstadosHub, reconstruyeCapital, validaVertical, repartoVertical
  };
});
