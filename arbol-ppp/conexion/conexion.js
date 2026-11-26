/* Adaptadores de conexión del Árbol PPP (tarea 9). Código puro: sin red, sin DOM, sin Google; sirve en navegador y en Node.
   Hablan en tres idiomas:  el plan del árbol (motor.js)  ↔  la columna del PPP Maestro (un renglón por ID de factor)  ↔  las pestañas ARBOL_*.

     planAColumna(definicion, plan, resultado, opciones)  → lista ordenada [{id, valor, tipo, estado, fuente, ...}] con TODOS los factores del Maestro que el árbol conoce
     columnaAPlan(definicion, columna, opciones)          → plan del árbol (para reabrir un plan guardado); ida y vuelta da el mismo resultado
     definicionDeTablas(pestanas)                         → definición lista para Motor.carga (pestañas en matrices con encabezado, como las devuelve Sheets)

   Valores: la columna guarda el valor del FACTOR (pesos, fracciones, meses, m²), no el de la vista. Los sí/no van «sí»/«no» (como el Maestro);
   dentro del plan van «si»/«no». Las medidas de los componentes del edificio (CP-01…CP-07) van en m². Lo que el árbol no sabe va vacío, nunca 0. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.ArbolConexion = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const T = (x) => (x === null || x === undefined ? '' : String(x).trim());
  /* D5 · el Maestro escribe «sí» con tilde y el árbol «si»: una celda que es exactamente sí / Sí / SI / si se lee siempre como «si» (no toca textos más largos ni 'si' entre comillas) */
  const normSi = (x) => (typeof x === 'string' && /^\s*s[ií]\s*$/i.test(x) ? 'si' : x);
  const esNum = (x) => typeof x === 'number' && isFinite(x);
  /* Ola 6 · números con formato de pantalla. «2,000», «$14,000,000», «36.0%» se aceptan (la coma es de miles, como se ve en el libro); lo que parece número pero es dudoso
     («1,5», «1.234,5», «12.3.4», «1,23») se RECHAZA con aviso y no se adivina. Un texto que no parece número (fechas, «2 recámaras») no se toca. */
  function numeroDePantalla(x) {
    if (typeof x !== 'string') return null;
    const t = x.trim();
    if (!/^[-−+]?\s*\$?\s*[\d.,]+\s*%?$/.test(t) || !/\d/.test(t)) return null;   // no parece un número
    const neg = /^[-−]/.test(t), pct = /%$/.test(t), cuerpo = t.replace(/^[-−+]?\s*\$?\s*/, '').replace(/\s*%$/, '');
    const bien = /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(cuerpo) || /^\d+(\.\d+)?$/.test(cuerpo);
    if (!bien) return { error: 'La celda dice «' + t + '», que parece un número pero no se puede leer sin adivinar (la coma es de miles y el punto de decimales, por ejemplo 2,000 o 36.0%).' };
    let n = Number(cuerpo.replace(/,/g, '')); if (neg) n = -n; if (pct) n = n / 100;
    return isFinite(n) ? { valor: n } : { error: 'La celda dice «' + t + '» y no es un número válido.' };
  }
  const clona = (x) => JSON.parse(JSON.stringify(x));
  const casi = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
  const NOMBRES = ['ARBOL_TIPOS', 'ARBOL_NODOS', 'ARBOL_OPCIONES', 'ARBOL_REGLAS', 'ARBOL_FACTORES', 'ARBOL_COMPONENTES', 'ARBOL_FLUJOS', 'ARBOL_LISTAS', 'ARBOL_VERSIONES'];
  const SIN_ARBOL = { tipos: 'ARBOL_TIPOS', nodos: 'ARBOL_NODOS', opciones: 'ARBOL_OPCIONES', reglas: 'ARBOL_REGLAS', factores: 'ARBOL_FACTORES', componentes: 'ARBOL_COMPONENTES', flujos: 'ARBOL_FLUJOS', listas: 'ARBOL_LISTAS', versiones: 'ARBOL_VERSIONES' };

  /* ───────────── c) definicionDeTablas ───────────── */
  /* pestanas: {ARBOL_NODOS: matriz con encabezado (o filas con nombre), …}. Devuelve {definicion, errores, avisos}:
     `definicion` son las pestañas en filas con nombre y todo en texto (lo que el motor espera); se carga con Motor.carga(definicion). */
  function definicionDeTablas(pestanas) {
    const errores = [], avisos = [], out = {};
    if (!pestanas || typeof pestanas !== 'object') return { definicion: null, errores: [{ pestana: '', fila: 0, columna: '', codigo: 'sin_definicion', mensaje: 'No se recibieron pestañas.' }], avisos };
    Object.keys(pestanas).forEach((k) => {
      const nombre = NOMBRES.indexOf(k) >= 0 ? k : NOMBRES.indexOf(k.toUpperCase()) >= 0 ? k.toUpperCase() : SIN_ARBOL[k.toLowerCase()] || null;
      if (!nombre) { avisos.push({ pestana: k, mensaje: 'La pestaña «' + k + '» no es una de las nueve ARBOL_* y se ignoró.' }); return; }
      const m = pestanas[k];
      if (!Array.isArray(m)) { errores.push({ pestana: nombre, fila: 0, columna: '', codigo: 'formato', mensaje: nombre + ' no es una lista de filas.' }); return; }
      if (!m.length) { out[nombre] = []; return; }
      let filas;
      if (Array.isArray(m[0])) {
        const cab = m[0].map(T);
        if (cab.indexOf('id') < 0 && cab.indexOf('nodo') < 0 && cab.indexOf('flujo') < 0 && cab.indexOf('lista') < 0 && cab.indexOf('version') < 0) errores.push({ pestana: nombre, fila: 1, columna: '', codigo: 'sin_encabezado', mensaje: 'La primera fila de ' + nombre + ' no parece un encabezado.' });
        const vistos = {}; cab.forEach((c, i) => { if (c && vistos[c]) errores.push({ pestana: nombre, fila: 1, columna: c, codigo: 'columna_repetida', mensaje: 'La columna «' + c + '» está repetida en ' + nombre + '.' }); vistos[c] = true; });
        filas = [];
        m.slice(1).forEach((r, q) => {
          if (!r.some((x) => T(x) !== '')) return;   // fila vacía
          const o = {};
          cab.forEach((c, i) => {
            if (!c) return;
            let x = r[i]; if (x === undefined || x === null) x = '';
            if (typeof x === 'boolean') x = x ? 'si' : 'no'; else if (typeof x === 'number') x = String(x); else x = normSi(x);
            if (/^#(REF|NAME|VALUE|DIV\/0|N\/A|NUM|NULL|ERROR)[!?]?/.test(String(x))) errores.push({ pestana: nombre, fila: q + 2, columna: c, codigo: 'celda_con_error', mensaje: 'La celda trae el error de Sheets «' + x + '».' });
            o[c] = x;
          });
          filas.push(o);
        });
      } else filas = m.map((r) => { const o = {}; Object.keys(r).forEach((c) => { o[c] = r[c] === null || r[c] === undefined ? '' : normSi(String(r[c])); }); return o; });
      out[nombre] = filas;
    });
    if (!out.ARBOL_NODOS || !out.ARBOL_NODOS.length) errores.push({ pestana: 'ARBOL_NODOS', fila: 0, columna: '', codigo: 'sin_definicion', mensaje: 'Falta ARBOL_NODOS (o está vacía): sin ella no hay árbol.' });
    return { definicion: errores.length ? null : out, errores, avisos };
  }

  /* ───────────── lectura neutra de una definición (JSON canónico o pestañas) ───────────── */
  function modelo(def) {
    let raw = def && def._fuente ? def._fuente : def;
    if (typeof raw === 'string') raw = JSON.parse(raw);
    if (!raw || typeof raw !== 'object') throw new Error('Definición no válida.');
    if (!Array.isArray(raw.nodos)) {
      const r = definicionDeTablas(raw); if (!r.definicion) throw new Error('Pestañas no válidas: ' + r.errores.map((e) => e.mensaje).join(' '));
      raw = r.definicion;
      const nodos = (raw.ARBOL_NODOS || []).map((n) => ({
        id: T(n.id), tipo: T(n.tipo), compuesto: /^(si|sí|true)$/i.test(T(n.compuesto)), permite_otro: /^(si|sí|true)$/i.test(T(n.permite_otro)),
        referencia: { valor: T(n.referencia_valor), opcion: T(n.referencia_opcion), origen: T(n.referencia_origen) },
        unidad: { clase: T(n.unidad_clase), escala: T(n.unidad_escala) === '' ? null : Number(n.unidad_escala) }, vista: T(n.vista_a_factor) ? { a_factor: T(n.vista_a_factor), de_factor: T(n.vista_de_factor) } : null, opciones: []
      }));
      const por = {}; nodos.forEach((n) => { por[n.id] = n; });
      (raw.ARBOL_OPCIONES || []).forEach((o) => { const n = por[T(o.nodo)]; if (n) n.opciones.push({ clave: T(o.clave), nombre: T(o.nombre), valor: T(o.valor) === '' ? null : o.valor, componentes: T(o.componentes), fuente: T(o.fuente) }); });
      return { nodos, por, factores: (raw.ARBOL_FACTORES || []).map((f) => ({ id: T(f.id), origen_maestro: T(f.origen_maestro), unidad_maestro: T(f.unidad_maestro), nota: T(f.nota), nombre: T(f.nombre) })), componentes: (raw.ARBOL_COMPONENTES || []).map((c) => Object.assign({}, c)), tipo: raw.ARBOL_TIPOS && raw.ARBOL_TIPOS[0] ? T(raw.ARBOL_TIPOS[0].id) : 'vertical' };
    }
    const nodos = raw.nodos.map((n) => ({
      id: n.id, tipo: n.tipo, compuesto: !!(n.compuesto === true || /^(si|sí|true)$/i.test(T(n.compuesto))), permite_otro: !!(n.permite_otro === true || /^(si|sí|true)$/i.test(T(n.permite_otro))),
      referencia: { valor: n.referencia && n.referencia.valor !== undefined ? T(n.referencia.valor) : '', opcion: n.referencia ? T(n.referencia.opcion) : '', origen: n.referencia ? T(n.referencia.origen) : '' },
      unidad: { clase: n.unidad && n.unidad.clase, escala: n.unidad && n.unidad.escala ? Number(n.unidad.escala) : null }, vista: n.vista && T(n.vista.a_factor) ? n.vista : null,
      opciones: (n.opciones || []).map((o) => ({ clave: o.clave, nombre: o.nombre, valor: o.valor === undefined || o.valor === null || T(o.valor) === '' ? null : o.valor, componentes: T(o.componentes), fuente: T(o.fuente) }))
    }));
    const por = {}; nodos.forEach((n) => { por[n.id] = n; });
    return { nodos, por, factores: (raw.factores || []).map((f) => ({ id: f.id, origen_maestro: T(f.origen_maestro), unidad_maestro: T(f.unidad_maestro), nota: T(f.nota), nombre: T(f.nombre) })), componentes: raw.componentes || [], tipo: raw.tipo && raw.tipo.id ? raw.tipo.id : 'vertical' };
  }

  const sinComillas = (x) => (typeof x === 'string' && /^'.*'$/.test(x) ? x.slice(1, -1) : x);
  const aMaestro = (x) => (x === 'si' ? 'sí' : x);
  const dePlan = (x) => normSi(x);
  /* CP-01…CP-07 ↔ componente del catálogo de E-15 (lo dice la nota de ARBOL_FACTORES: «Tamaño del componente E-15.pasillos») */
  function componenteDe(f) { const m = /componente\s+([A-Z0-9-]+)\.([a-z0-9_]+)/.exec(f.nota || ''); return m && /^CP-/.test(f.id) ? { nodo: m[1], clave: m[2] } : null; }

  /* ───────────── a) planAColumna ───────────── */
  /* resultado: lo que devolvió Motor.evalua(definicion, plan) (nodos visibles). opciones.valores: el mapa `valores` que da
     Motor.paqueteVisor(…, {informe:true}), con TODOS los factores (también los ocultos y los que escribe una opción); sin él, esos salen vacíos.
     opciones.orden: lista de IDs en el orden del libro (el de MAESTRO); sin ella, el de ARBOL_FACTORES. */
  function planAColumna(definicion, plan, resultado, opciones) {
    opciones = opciones || {};
    const MotorA = opciones.motor || (typeof root !== 'undefined' && root.ArbolMotor) || null;
    const M = modelo(definicion), res = resultado || {}, vals = opciones.valores || res.valores || {};
    plan = plan || {}; const pv = plan.valores || {}, pd = plan.datos || {};
    const nodoR = {}; (res.nodos || []).forEach((n) => { nodoR[n.id] = n; });
    const e15 = nodoR['E-15'], comps = e15 && Array.isArray(e15.componentes) ? e15.componentes : [];
    let ids = M.factores.map((f) => f.id);
    if (Array.isArray(opciones.orden)) { const pos = {}; opciones.orden.forEach((id, i) => { pos[id] = i; }); ids = ids.filter((id) => pos[id] !== undefined).sort((a, b) => pos[a] - pos[b]).concat(ids.filter((id) => pos[id] === undefined)); }
    const fac = {}; M.factores.forEach((f) => { fac[f.id] = f; });
    /* rama Lotes o Casas: el tamaño por unidad del edificio (P1-05) no existe, pero las fórmulas del libro lo usan
       para contar unidades y m²; se escribe con el tamaño de la rama (lote L-07 o casa L-05) */
    const rama = nodoR['DS-01'] ? nodoR['DS-01'].valor : null;
    const tamRama = rama === 'Lotes' ? nodoR['L-07'] : rama === 'Casas' ? nodoR['L-05'] : null;
    const cuentas = ids.map((id) => {
      const f = fac[id], nodo = M.por[id] || null, nr = nodoR[id], vv = vals[id] || null, cp = componenteDe(f), reg = pv[id] || null;
      let valor = null, estado = null, opcion = null, fuente = '', unidad = null, extra = null, fuentePlan = null;
      if (cp) {
        const c = comps.find((q) => q.clave === cp.clave);
        if (c) {
          /* ola 6: el área lleva su estado (referencia, decidido, confirmado con fuente) como cualquier dato */
          const ep = c.estado_plan || (c.estado === 'confirmado' ? 'confirmado' : c.estado === 'editado' ? 'decidido' : 'referencia');
          valor = c.activo === false ? 0 : c.m2; estado = ep; unidad = 'm2';
          const pe = plan.componentes && plan.componentes['E-15'] && plan.componentes['E-15'][cp.clave];   // la fuente del catálogo no es la de la persona: solo vale la que está en el plan
          if (ep !== 'referencia' && pe && pe.fuente) fuentePlan = String(pe.fuente);
          fuente = fuentePlan ? fuentePlan : 'Componente ' + cp.nodo + '.' + cp.clave + (ep === 'decidido' ? ' (editado por la persona)' : ' (preajuste, provisional)') + ', en m²';
        }
      } else if (id === 'E-19') {
        /* ola 6: las áreas propias y los nombres puestos a las áreas del catálogo, en UNA celda con código (Motor.areasACelda) */
        if (MotorA && MotorA.areasACelda) {
          const ac = MotorA.areasACelda(plan.componentes && plan.componentes['E-15']);
          valor = ac.celda; estado = ac.celda ? 'decidido' : 'referencia'; fuente = ac.celda ? 'Celda con código: áreas propias y nombres del edificio' : 'Sin áreas propias ni nombres cambiados';
          if (ac.errores.length) extra = { errores: ac.errores };
        }
      } else if (nr) {
        valor = nr.valor === undefined ? null : nr.valor; estado = nr.estado || null; opcion = nr.opcion || null;
        if (nr.tipo === 'calculado') { estado = 'calculado'; fuente = 'Calculado por el árbol (' + (nr.de_que_sale && nr.de_que_sale.texto ? nr.de_que_sale.texto.replace(/^Se calcula con /, 'con ') : 'fórmula del nodo') + ')'; }
        else if (reg && reg.fuente) fuente = String(reg.fuente);
        else if (estado === 'referencia') fuente = 'Referencia del árbol' + (nr.origen ? ': ' + nr.origen : '');
        else if (nr.fuentes && nr.fuentes.length && nr.fuentes.find((q) => q.elegida)) fuente = 'Fuente elegida: ' + (nr.fuentes.find((q) => q.elegida).nombre || '');
        else if (opcion && nr.opciones) { const o = nr.opciones.find((q) => q.clave === opcion); fuente = 'Decisión: ' + (o ? o.nombre : opcion); }
        else fuente = estado === 'no_se' ? '«No sé todavía»: se usa la referencia' : 'Valor puesto por la persona';
      } else if (vv && vv.valor !== null && vv.valor !== undefined) {
        valor = vv.valor; estado = nodo && nodo.tipo === 'calculado' ? 'calculado' : (vv.estado || 'decidido');
        if (nodo && nodo.tipo === 'calculado') { fuente = 'Calculado por el árbol (nodo oculto)'; } else if (nodo && vv.estado === 'referencia') fuente = 'Referencia del árbol (nodo oculto)'; else fuente = vv.clase === 'virtual' ? 'Lo escribe la opción elegida (' + (id.indexOf('E-1') === 0 || /^C-0[23]$/.test(id) ? 'E-16' : 'una decisión') + ')' : 'Valor del plan';
      } else if (pd[id] !== undefined) {
        const d = pd[id]; valor = d && typeof d === 'object' ? d.valor : d; estado = d && d.estado ? d.estado : 'decidido'; fuente = (d && d.fuente) || 'Dato del plan puesto a mano';
      }
      if (!fuentePlan && reg && reg.fuente && estado !== 'calculado') fuentePlan = String(reg.fuente);
      if (valor === undefined || (typeof valor === 'number' && !isFinite(valor))) valor = null;
      if (valor === null) { estado = 'falta'; fuente = fuente || 'El árbol todavía no lo calcula'; }
      if (typeof valor === 'string') valor = aMaestro(valor);
      const o = { id, valor, tipo: f.origen_maestro === 'formula' ? 'fórmula' : 'captura', estado, fuente };
      if (fuentePlan && valor !== null) { o.fuente = fuentePlan; o.fuente_plan = true; }   // ola 6: la fuente que escribió la persona viaja con el dato (decidido o confirmado) y vuelve igual
      if (id === 'E-15' && nr && nr.opcion_base) o.opcion_base = nr.opcion_base;
      if (opcion) o.opcion = opcion; if (unidad) o.unidad = unidad; if (reg && reg.marca) o.marca = reg.marca; if (extra) Object.assign(o, extra);
      return o;
    });
    if (tamRama && typeof tamRama.valor === 'number' && tamRama.valor > 0) {
      const c = cuentas.find((q) => q.id === 'P1-05');
      if (c && c.valor === null) { c.valor = tamRama.valor; c.estado = 'calculado'; c.fuente = 'Tamaño por unidad de la rama ' + rama + ' (' + (rama === 'Lotes' ? 'L-07, lote' : 'L-05, casa') + '), para las fórmulas del libro'; }
    }
    return cuentas;
  }

  /* ───────────── b) columnaAPlan ───────────── */
  /* columna: lista [{id, valor, estado?, opcion?, fuente?}] (lo que da planAColumna) o un mapa {ID: valor} (lo que se lee de la hoja).
     Con `estado` el plan queda idéntico; sin él (solo valores) todo lo que difiere de la referencia queda «decidido».
     opciones.motor: el motor (Motor de motor.js); hace falta para pasar de factor a vista y para saber qué valores son la referencia. */
  function columnaAPlan(definicion, columna, opciones) {
    opciones = opciones || {};
    const Mo = opciones.motor || (typeof root !== 'undefined' && root.ArbolMotor) || null;
    if (!Mo) throw new Error('columnaAPlan necesita el motor: opciones.motor.');
    const M = modelo(definicion), cargada = opciones.definicionCargada || (definicion && definicion._interna ? definicion : (Mo.carga(clona(definicion._fuente || definicion)).definicion));
    const entra = {};
    const avisos = [];
    /* repetición ola 6 · «d.ddd» (punto y exactamente 3 dígitos) en un factor de m² o de pesos: puede ser 1.234 de una hoja con otra configuración regional (mil doscientos treinta y cuatro) o un decimal; no se adivina */
    const uni = {}; M.factores.forEach((f) => { uni[f.id] = f.unidad_maestro; });
    const dudosoMilesPunto = (c) => typeof c.valor === 'string' && /^(m²|m2|MXN)/i.test(uni[c.id] || '') && /^\$?\s*[1-9]\d{0,2}\.\d{3}$/.test(c.valor.trim());
    const pon = (c) => {
      const p = dudosoMilesPunto(c) ? { error: 'La celda dice «' + c.valor.trim() + '», que puede ser ' + c.valor.trim().replace(/^\$\s*/, '').replace('.', ',') + ' (punto de miles) o ese mismo número con decimales; no se puede saber sin adivinar. Escríbelo con coma de miles (por ejemplo ' + c.valor.trim().replace(/^\$\s*/, '').replace('.', ',') + ') o con punto y los decimales completos.' } : numeroDePantalla(c.valor);
      if (p && p.error) { avisos.push({ id: c.id, codigo: 'numero_dudoso', mensaje: p.error + ' Se ignoró ese valor.' }); entra[c.id] = Object.assign({}, c, { valor: null }); }
      else if (p) entra[c.id] = Object.assign({}, c, { valor: p.valor });
      else entra[c.id] = c;
    };
    if (Array.isArray(columna)) columna.forEach(pon); else Object.keys(columna || {}).forEach((id) => { pon({ id, valor: columna[id] }); });
    const num = (x) => { if (esNum(x)) return x; if (typeof x === 'string' && x.trim() !== '' && isFinite(Number(x))) return Number(x); return null; };
    const lleno = (c) => c && c.valor !== null && c.valor !== undefined && T(c.valor) !== '' && c.estado !== 'falta';
    const plan = { tipo: opciones.tipo || M.tipo, valores: {}, componentes: {}, aparcados: {}, datos: {} };
    const valorDe = (id) => { const c = entra[id]; if (!lleno(c)) return null; const x = typeof c.valor === 'string' ? dePlan(c.valor) : c.valor; const n = num(x); return n !== null ? n : x; };
    /* la fuente que escribió la persona (marcada por planAColumna con fuente_plan) o, en una columna de otra mano, cualquier texto que no sea de los que arma el árbol */
    const GENERICA = /^(Referencia|Valor puesto|Decisión:|Calculado|Fuente elegida:|Lo escribe|«No sé|Valor del plan|Dato del plan|Componente |Celda con código|Sin áreas|El árbol)/;
    const fuenteDe = (c) => (c && c.fuente && (c.fuente_plan === true || (c.fuente_plan === undefined && !GENERICA.test(String(c.fuente)))) ? String(c.fuente) : null);
    const estadoDe = (c, porOmision) => (c.estado && ['referencia', 'no_se', 'decidido', 'confirmado'].indexOf(c.estado) >= 0 ? c.estado : porOmision);
    const nodosDeCaptura = M.nodos.filter((n) => n.tipo !== 'calculado');
    /* 1 · decisiones con opciones (se_decide con opciones, nodos con fuentes) */
    const sinResolver = [], explicitos = [];
    nodosDeCaptura.forEach((n) => {
      const c = entra[n.id]; if (!lleno(c) && !(c && c.estado === 'no_se')) return;
      if (n.compuesto) return;   // E-15: se resuelve con los componentes (paso 2)
      const v = valorDe(n.id);
      if (c.estado === 'no_se') { plan.valores[n.id] = { estado: 'no_se' }; return; }
      if (n.opciones.length && v !== null) {
        let o = c.opcion ? n.opciones.find((q) => q.clave === c.opcion) : null;
        if (!o && c.marca !== 'valor_propio') { const cand = n.opciones.filter((q) => q.valor !== null && (casi(num(q.valor) === null ? NaN : num(q.valor), typeof v === 'number' ? v : NaN) || String(sinComillas(q.valor)) === String(v))); if (cand.length) o = cand[0]; }
        if (o) {
          if (n.tipo !== 'se_decide' && !c.estado && o.clave === n.referencia.opcion) return;   // sin estados: la fuente por omisión sigue siendo la referencia
          plan.valores[n.id] = { estado: estadoDe(c, 'decidido'), opcion: o.clave }; if (fuenteDe(c) && plan.valores[n.id].estado !== 'referencia') plan.valores[n.id].fuente = fuenteDe(c); if (plan.valores[n.id].estado === 'referencia') delete plan.valores[n.id];
          else if (!c.estado && n.tipo !== 'se_decide') explicitos.push(n.id);   // ola 6: sin estados, si la opción da lo mismo que la referencia, vuelve a ser la referencia (el ritmo 4% y el valor fijo 1.2 pueden coincidir)
          return;
        }
        if (!n.permite_otro && n.tipo === 'se_decide') avisos.push({ id: n.id, codigo: 'opcion_no_encontrada', mensaje: 'El valor ' + v + ' de ' + n.id + ' no es el de ninguna opción: se guardó como valor propio.' });
      }
      sinResolver.push(n);
    });
    /* 3 · el resto de las capturas: valores propios, en unidades de la VISTA (millones, % del terreno…). Con estados en la columna se respetan tal cual;
       sin ellos todo entra «decidido» y después se quita lo que es igual a lo que el árbol ya traía como referencia. */
    const numerosCol = {}; Object.keys(entra).forEach((k) => { const x = valorDe(k); if (typeof x === 'number') numerosCol[k] = x; });
    const aVista = (n, x) => {
      if (!esNum(x)) return x;
      if (n.vista) { const e = Mo.evaluaExpresion(n.vista.de_factor, numerosCol); return esNum(e) ? e : x; }
      return n.unidad && n.unidad.escala ? x / n.unidad.escala : x;
    };
    sinResolver.forEach((n) => {
      const c = entra[n.id], v = valorDe(n.id);
      if (c.estado === 'no_se') { plan.valores[n.id] = { estado: 'no_se' }; return; }
      if (c.estado === 'referencia') return;
      const reg = { valor: aVista(n, v), estado: estadoDe(c, n.id === 'T-01' ? 'confirmado' : 'decidido') };
      if (c.marca) reg.marca = c.marca; else if (!c.estado && reg.estado === 'decidido') reg.marca = 'valor_propio';
      if (fuenteDe(c) && reg.estado !== 'referencia') reg.fuente = fuenteDe(c);
      plan.valores[n.id] = reg; if (!c.estado && n.id !== 'T-01') explicitos.push(n.id);
    });
    if (!plan.valores['T-01'] && valorDe('T-01') !== null && !(entra['T-01'] && entra['T-01'].estado === 'referencia')) plan.valores['T-01'] = { valor: valorDe('T-01'), estado: estadoDe(entra['T-01'], 'confirmado') };
    /* 4 (antes del paso 2, para que el motor los vea) · datos del plan (captura directa opcional) */
    ['E-04', 'C-06', 'K-03'].forEach((id) => { const v = valorDe(id); if (v !== null) plan.datos[id] = v; });
    const valoresDe = (p) => Mo.paqueteVisor(cargada, p, { informe: true }).valores;
    /* 2 · componentes del edificio: el preajuste que coincide, y lo demás como edición */
    const e15 = M.por['E-15'];
    if (e15 && e15.compuesto) {
      const comp = M.componentes.filter((q) => T(q.nodo) === 'E-15');
      /* M7 (ola 5): la construcción (E-05) ya no se lee del renglón de la hoja (es fórmula): la calcula el motor con las capturas ya puestas. Solo si el motor no puede, se usa el renglón. */
      let constr = null;
      try { const pv0 = Object.assign({}, plan, { valores: Object.assign({}, plan.valores) }); const v0 = valoresDe(pv0)['E-05']; if (v0 && esNum(v0.valor)) constr = v0.valor; } catch (e) { constr = null; }
      if (!constr) constr = valorDe('E-05');
      const tam = {}; M.factores.forEach((f) => { const cp = componenteDe(f); if (cp && cp.nodo === 'E-15') { const v = valorDe(f.id); if (v !== null) tam[cp.clave] = v; } });
      if (Object.keys(tam).length && constr) {
        const m2 = (q, cant) => (T(q.unidad_base) === 'pct' ? Number(cant) * constr : Number(cant));
        /* F5 (ola 6): una opción puede decir «pasillos=18%» (porcentaje de la construcción); antes se leía como NaN y la opción «Eficiencia del motor del PPP» volvía como «Personalizado» */
        const presetM2 = (o) => {
          const lista = {}; o.componentes.split(';').map(T).filter(Boolean).forEach((p) => { const k = p.split('='), t = k[1] === undefined ? null : T(k[1]); lista[k[0]] = t === null ? null : /%$/.test(t) ? { pct: Number(t.replace(/%$/, '')) / 100 } : Number(t); });
          const out = {}; comp.forEach((q) => { if (q.clave in lista) { const x = lista[q.clave]; out[q.clave] = x === null ? m2(q, q.cantidad) : (typeof x === 'object' ? x.pct * constr : m2(q, x)); } else out[q.clave] = 0; }); return out;
        };
        let mejor = null, mejorDif = 1e9;
        const cuenta = (p) => comp.filter((q) => !casi(p[q.clave], tam[q.clave] === undefined ? p[q.clave] : tam[q.clave])).length;
        e15.opciones.filter((o) => o.componentes).forEach((o) => { const p = presetM2(o), dif = cuenta(p); if (dif < mejorDif || (dif === mejorDif && o.clave === e15.referencia.opcion)) { mejorDif = dif; mejor = { o, p }; } });   // en empate gana la referencia
        { const cb = entra['E-15'] && entra['E-15'].opcion_base ? e15.opciones.find((q) => q.clave === entra['E-15'].opcion_base && q.componentes) : null; if (cb) { const p = presetM2(cb); mejor = { o: cb, p }; mejorDif = cuenta(p); } }   // la columna dice sobre qué opción se personalizó
        const c = entra['E-15'] || {};
        /* ediciones de tamaño: las que difieren del preajuste y las que la persona dejó con estado (decidido o confirmado con fuente) aunque coincidan con él */
        const cpDe = {}; M.factores.forEach((f) => { const cp = componenteDe(f); if (cp && cp.nodo === 'E-15') cpDe[cp.clave] = entra[f.id]; });
        const edicionesTam = (base) => {
          const out = {};
          comp.forEach((q) => {
            const t = tam[q.clave]; if (t === undefined) return;
            const ce = cpDe[q.clave] || {}, difiere = !casi(t, base.p[q.clave]), conEstado = ce.estado === 'decidido' || ce.estado === 'confirmado';
            if (!difiere && !conEstado) return;
            /* repetición ola 6: con tamaño > 0 el área queda ACTIVA (antes, si el preajuste no la traía, la edición solo llevaba el tamaño y el área seguía apagada); con 0, apagada */
            const e = t === 0 ? { activo: false } : { activo: true, valor: t, unidad: 'm2' };
            e.estado = ce.estado === 'confirmado' && fuenteDe(ce) ? 'confirmado' : difiere && !conEstado ? 'editado' : 'decidido'; if (fuenteDe(ce)) e.fuente = fuenteDe(ce);
            out[q.clave] = e;
          });
          return out;
        };
        if (c.estado === 'no_se') plan.valores['E-15'] = { estado: 'no_se' };   // ola 6: «No sé todavía» no fija ninguna opción
        else if (mejor && (mejorDif > 0 || lleno(c))) {
          if (mejorDif === 0 && c.opcion !== 'personalizado') { plan.valores['E-15'] = { estado: estadoDe(c, 'decidido'), opcion: mejor.o.clave }; const ex = edicionesTam(mejor); if (Object.keys(ex).length) plan.componentes['E-15'] = ex; }
          else { plan.valores['E-15'] = { estado: estadoDe(c, 'decidido'), opcion: 'personalizado', base_opcion: mejor.o.clave }; plan.componentes['E-15'] = edicionesTam(mejor); }
          if (plan.valores['E-15'].estado === 'referencia') delete plan.valores['E-15'];
        }
      }
      /* ola 6 · áreas propias y nombres: la celda con código del factor E-19 (Motor.celdaAAreas). Lo que no se puede leer se avisa y no se inventa. */
      const celda = entra['E-19'];
      if (celda && lleno(celda) && Mo.celdaAAreas) {
        const claves = comp.map((q) => T(q.clave)), nombres = comp.map((q) => T(q.nombre));
        const primera = Mo.celdaAAreas(String(celda.valor), claves, []);
        const renombradas = Object.keys(primera.ediciones).filter((k) => !primera.ediciones[k].propia);
        const usados = comp.filter((q) => renombradas.indexOf(T(q.clave)) < 0).map((q) => T(q.nombre));
        const r = Mo.celdaAAreas(String(celda.valor), claves, usados);
        r.errores.forEach((e) => avisos.push({ id: 'E-19', codigo: 'celda_areas', mensaje: 'Áreas propias' + (e.entrada ? ' (entrada ' + e.entrada + ')' : '') + ': ' + e.mensaje + ' Se ignoró.' }));
        if (Object.keys(r.ediciones).length) { plan.componentes['E-15'] = plan.componentes['E-15'] || {}; Object.keys(r.ediciones).forEach((k) => { plan.componentes['E-15'][k] = Object.assign({}, plan.componentes['E-15'][k] || {}, r.ediciones[k]); }); }
      }
    }
    explicitos.forEach((id) => {
      const reg = plan.valores[id]; if (!reg) return;
      const prueba = Object.assign({}, plan, { valores: Object.assign({}, plan.valores) }); delete prueba.valores[id];
      const x = valoresDe(prueba)[id]; if (x && x.valor !== null && x.valor !== undefined && (typeof x.valor === 'number' ? casi(x.valor, valorDe(id)) : x.valor === valorDe(id))) delete plan.valores[id];
    });
    return { plan, avisos };
  }

  /* ───────────── escritura segura de una celda ───────────── */
  /* Una celda de texto que empieza con = + - @ ' (también si trae un espacio delante) se toma como fórmula o se come el apóstrofo (D-alta-maestro.md): se le antepone un apóstrofo. */
  function textoSeguro(x) { return typeof x === 'string' && /^\s*[=+\-@']/.test(x) ? "'" + x : x; }   // ola 6: también con espacio (o tabulador) delante
  function redondea(x) { return esNum(x) ? Math.round(x * 1e10) / 1e10 : x; }

  return { planAColumna, columnaAPlan, definicionDeTablas, textoSeguro, redondea, modelo, componenteDe, NOMBRES };
});
