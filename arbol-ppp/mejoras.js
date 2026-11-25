/* Mejoras de pantalla del Árbol PPP (capa sobre pantalla.js; no toca el motor ni los datos).
   Pedidos de Alejandro, 24-nov-2026: grafo a toda la pantalla con tarjetas chicas y transparentes, panel con × y separadores,
   tarjetas que despliegan sus datos, ficha desglosada con botones al nodo, unidad % o m², fuentes reales,
   encabezado fijo, avisos «Enterado», nota «No cabe» en la opción descartada y acomodo para teléfono. */
function __mejorasArbol() {
  const W = window;
  if (W.__vp && W.__vp.t) clearInterval(W.__vp.t);
  document.querySelectorAll('[data-vp]').forEach((e) => e.remove());
  document.querySelectorAll('[data-hecho],[data-orden],[data-docs],[data-listo],[data-g]').forEach((e) => ['data-hecho', 'data-orden', 'data-docs', 'data-listo', 'data-g'].forEach((a) => e.removeAttribute(a)));
  document.querySelectorAll('.prev-ficha,.prev-uni,.prev-m2,.prev-eq,.vp-ok,.vp-vistos,.vp-b3').forEach((e) => e.remove());
  const est = W.__vp = { t: 0, tab: (W.__vp && W.__vp.tab) || 'cambiar', uni: (W.__vp && W.__vp.uni) || 'pct', visto: (W.__vp && W.__vp.visto) || {} };
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; };
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => [...(r || document).querySelectorAll(s)];

  /* ───── estilos ───── */
  const st = el('style'); st.setAttribute('data-vp', '');
  st.textContent = `
.ppp{max-width:none !important;position:relative;display:grid !important;grid-template-columns:auto minmax(0,1fr) auto;grid-template-rows:auto auto auto minmax(0,1fr);column-gap:10px;row-gap:6px !important}
.ppp-top{grid-column:1/-1;grid-row:1}.ppp-cards{grid-column:1/-1;grid-row:2}
.ppp-herr{grid-column:1;grid-row:3;align-self:center}
.ppp-franja{grid-column:2;grid-row:3;display:flex !important;align-items:center;gap:10px;padding:3px 10px !important;min-width:0;overflow:hidden}
.ppp-franja[data-vacia]{visibility:hidden}
.ppp-barra{grid-column:3;grid-row:3;align-self:center;flex-direction:column;align-items:flex-end !important;gap:2px !important}
.ppp-lienzo{grid-column:1/-1;grid-row:4;min-height:0 !important}.ppp-ley,.ppp-horizonte{grid-column:1/-1}
.ppp-ctrl{right:auto !important;left:10px;align-items:flex-start !important}
.ppp-cards .tarj{display:grid !important;grid-template-columns:minmax(0,1fr);gap:0 !important;padding:5px 30px 5px 12px !important;cursor:pointer;min-height:46px}
.ppp-cards .tarj span,.ppp-cards .tarj b i{display:none}
.ppp-cards .tarj b{font-size:.7rem !important;line-height:1.1}
.ppp-cards .tarj strong{font-size:1.08rem !important;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ppp-cards .tarj[data-abierta]{box-shadow:0 0 0 3px var(--c)}
.vp-menu{position:fixed;z-index:99997;background:#fffdf8;border:1px solid #cfc4ae;border-top:4px solid var(--c,#1f1b16);border-radius:0 0 12px 12px;box-shadow:0 12px 30px rgba(31,27,22,.22);padding:6px;max-height:62vh;overflow:auto;min-width:300px}
.vp-menu h3{margin:6px 10px 4px;font:700 11px system-ui;letter-spacing:.06em;text-transform:uppercase;color:#6b6257}
.vp-menu button{display:flex;align-items:center;gap:12px;width:100%;min-height:44px;padding:6px 10px;border:0;border-radius:8px;background:transparent;text-align:left;font:500 14px system-ui;color:#1f1b16;cursor:pointer}
.vp-menu button:hover{background:#f1eadc}.vp-menu button span{flex:1 1 auto}.vp-menu button b{font-weight:700;white-space:nowrap}
.vp-menu button i{font-style:normal;color:#a8322a;font-weight:700;font-size:11px}.vp-menu p{margin:6px 10px;font:400 12.5px system-ui;color:#6b6257}
/* panel: columna a la derecha, encabezado fijo, separadores abajo */
.ppp-panel{position:absolute !important;right:12px;top:var(--ltop,200px);bottom:auto !important;width:440px;max-height:calc(100% - var(--ltop,200px) - 62px) !important;overflow-y:auto;border-radius:12px 12px 0 12px !important;border-bottom:4px solid var(--tc,#2f5d8a) !important;box-shadow:0 10px 28px rgba(31,27,22,.22);z-index:6;padding:0 16px 16px !important;gap:9px !important;align-content:start}
.ppp[data-sin-panel] .ppp-panel{display:none !important}
.ppp-panel>*{order:6}
.ppp-panel>h2{order:0;position:sticky;top:0;z-index:4;background:var(--panel,#fffdf8);margin:0 -16px;padding:14px 60px 4px 16px !important;font-size:1.2rem !important}
.ppp-panel>.grande{order:1;position:sticky;top:var(--h2h,44px);z-index:4;background:var(--panel,#fffdf8);margin:-9px -16px 0;padding:0 16px 8px !important;font-size:1.65rem !important;line-height:1.1 !important;border-bottom:1px solid #e6ddcb}
.ppp-panel>[data-efecto]{order:2}
.ppp-panel>[data-g]{display:none !important}
.ppp-panel[data-tab=cambiar]>[data-g=cambiar],.ppp-panel[data-tab=conex]>[data-g=conex],.ppp-panel[data-tab=fuente]>[data-g=fuente],.ppp-panel[data-tab=comparar]>[data-g=comparar]{display:revert !important}
.ppp-panel[data-tab=cambiar]>.edit,.ppp-panel[data-tab=cambiar]>.ops{display:grid !important}
.ppp-panel[data-tab=cambiar]>.fila,.ppp-panel[data-tab=conex]>.entradas{display:flex !important}
.ppp-panel>.prev-ficha{display:none !important;order:4;gap:9px}
.ppp-panel[data-tab=conex]>.prev-ficha,.ppp-panel[data-tab=fuente]>.prev-ficha{display:grid !important}
.ppp-panel[data-tab=conex] .prev-ficha>.pq,.ppp-panel[data-tab=conex] .prev-ficha>details.mas,.ppp-panel[data-tab=conex] .prev-ficha>.prev-docs{display:none !important}
.ppp-panel[data-tab=fuente] .prev-ficha>section{display:none !important}
.ppp-panel[data-tab=fuente] .prev-ficha details.mas{border-top:0;padding-top:0}.ppp-panel[data-tab=fuente] .prev-ficha details.mas>summary{display:none}
.ppp-panel>p.nota[data-hecho]{display:none !important}
.ppp-panel .ops{grid-template-columns:1fr 1fr !important;gap:6px !important}
.ppp-panel .op{text-align:left !important;padding:8px 10px !important;min-height:0 !important;gap:3px !important}
.ppp-panel .op b{font-size:.98rem !important}.ppp-panel .op small{font-size:.78rem !important;line-height:1.3 !important;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.ppp-panel .op.on{border-width:3px}
.ppp-panel .edit{display:grid;gap:6px}.ppp-panel .edit .step{flex-wrap:nowrap !important;gap:8px}
.ppp-panel .edit .step input{min-height:48px !important;font-size:1.15rem !important;width:8ch !important;flex:1 1 auto;min-width:0}
.ppp-panel .step button,.ppp-panel .fila .ppp-btn{min-height:48px !important;min-width:48px;font-size:1.1rem}
.ppp-panel button{min-height:44px}.ppp-panel input[type=range]{width:100%}.ppp-panel>details>summary{font-weight:700}
.vp-x{position:fixed;z-index:99998;width:40px;height:40px;border-radius:10px;border:1px solid #cfc4ae;background:#fffdf8;font-size:22px;line-height:1;cursor:pointer;color:#1f1b16}
.vp-abrir{position:fixed;z-index:99998;right:24px;bottom:24px;height:44px;padding:0 16px;border-radius:22px;border:1px solid #1f1b16;background:#1f1b16;color:#fffdf8;font:600 14px system-ui;cursor:pointer;display:none}
.vp-tabs{position:fixed;z-index:99996;display:flex;gap:4px;justify-content:flex-start;align-items:flex-start;pointer-events:none;padding-left:10px;box-sizing:border-box}
.vp-tabs button{pointer-events:auto;height:40px;padding:0 14px;border:0;border-radius:0 0 12px 12px;background:var(--bc);color:#fffdf8;font:700 13px system-ui;cursor:pointer;opacity:.62;box-shadow:0 6px 14px rgba(31,27,22,.18);transform:translateY(-4px)}
.vp-tabs button:hover{opacity:.85}.vp-tabs button[aria-selected=true]{opacity:1;height:46px;transform:none}.vp-tabs button[hidden]{display:none}
/* ficha desglosada */
.prev-ficha{font-family:inherit}.prev-ficha section{display:grid;gap:5px}
.prev-ficha h4,.prev-docs h4{margin:0;font:700 11px system-ui;letter-spacing:.07em;text-transform:uppercase;color:#6b6257}
.prev-ficha ul{margin:0;padding:0;list-style:none;display:grid;gap:4px}
.prev-ficha li{position:relative;padding-left:16px;font-size:.92rem;line-height:1.35;color:#1f1b16}
.prev-ficha li::before{content:'';position:absolute;left:3px;top:.55em;width:6px;height:6px;border-radius:50%;background:var(--c,#9a6b1f)}
.prev-ficha .chips{display:flex;flex-wrap:wrap;gap:6px}
.prev-ficha button.ir{display:inline-flex;align-items:center;gap:8px;min-height:32px !important;padding:2px 10px;border:1.5px solid var(--cc,#9a6b1f);border-radius:999px;background:#fffdf8;font:600 12.5px system-ui;color:#1f1b16;cursor:pointer;width:auto}
.prev-ficha button.ir:hover{background:#f1eadc}.prev-ficha button.ir b{font-weight:500;color:#6b6257}
.prev-ficha button.ir.en{min-height:24px !important;padding:0 8px !important;font-size:.88rem;vertical-align:baseline}
.prev-ficha .vacio{font-size:.85rem;color:#6b6257}
.ppp-panel .prev-ficha p.pq{margin:0;font-size:.9rem;line-height:1.3;color:#3d362d;background:none !important;border:0 !important;padding:0 !important}
.prev-ficha details.mas .dentro{display:grid;gap:9px}
/* unidad % o m² */
.prev-uni{min-height:48px !important;padding:0 12px;border:1.5px solid #9a6b1f;border-radius:10px;background:#fffdf8;font:600 13.5px system-ui;color:#1f1b16;cursor:pointer;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;flex:none}
.prev-uni::after{content:'▾';font-size:11px;color:#6b6257}
.prev-eq{margin:0;font-size:.9rem;color:#3d362d}.prev-eq b{font-weight:700}
.edit[data-uni=m2] #ppp-otro{display:none !important}
.prev-m2{min-height:48px;font:600 1.15rem system-ui;width:8ch;flex:1 1 auto;min-width:0;padding:4px 8px;border:1px solid #cfc4ae;border-radius:8px;background:#f6f1e7;color:#1f1b16;text-align:center}
.edit:not([data-uni=m2]) .prev-m2{display:none}
/* fuentes */
.prev-docs{display:grid;gap:8px}
.prev-docs .est{display:inline-flex;font:700 12px system-ui;letter-spacing:.04em;text-transform:uppercase;padding:4px 10px;border-radius:999px;justify-self:start}
.prev-docs .est.v{background:#e7f1e8;color:#1f5330;border:1px solid #b5d0b8}.prev-docs .est.a{background:#fbf1d6;color:#664808;border:1px solid #e2cb8a}.prev-docs .est.r{background:#fbeae6;color:#8a2820;border:1px solid #e3b4ac}
.prev-docs a{display:grid;grid-template-columns:66px 1fr auto;align-items:center;gap:10px;min-height:44px;padding:6px 10px;border:1px solid #d9ceb9;border-radius:10px;background:#fffdf8;text-decoration:none;color:#1f1b16;font:500 13.5px system-ui;line-height:1.25}
.prev-docs a:hover{border-color:#1f1b16;background:#f6f1e7}
.prev-docs a .tp{font:700 10px system-ui;letter-spacing:.05em;text-align:center;padding:4px 0;border-radius:6px;background:#1f1b16;color:#fffdf8}
.prev-docs a .tp.pdf{background:#8e3a2c}.prev-docs a .tp.hoja{background:#2f6b3f}.prev-docs a .tp.doc{background:#2f5d8a}
.prev-docs a small{display:block;color:#6b6257;font-size:12px}.prev-docs a .fl{color:#6b6257;font-size:15px}
.prev-docs .falta{margin:0;padding:8px 10px;border-radius:10px;background:#fbeae6;border:1px solid #e3b4ac;color:#8a2820;font:500 13px system-ui;line-height:1.3}
/* avisos: «Enterado» */
.ppp-franja .vp-ok{margin-left:-6px;margin-right:4px;width:26px;height:26px;border-radius:13px;border:1px solid #cfc4ae;background:#fffdf8;color:#1f1b16;font:700 13px system-ui;cursor:pointer;flex:none}
.ppp-franja [data-vp-oculto]{display:none !important}
.vp-vistos{font:600 12px system-ui;color:#6b6257;background:none;border:0;cursor:pointer;text-decoration:underline;white-space:nowrap}
`;
  document.head.append(st);

  /* ───── utilidades del grafo ───── */
  const nodos = () => $$('.ppp-lienzo .nodo');
  const partes = (n) => (n.getAttribute('aria-label') || '').split('. ');
  const api = () => { const h = document.getElementById('arbol-ppp'); return (h && h.__ppp) || null; };
  /* modelo completo del plan (también lo plegado), tomado de la propia pantalla */
  const modelo = () => { const a = api(); if (!a) return null; try { const e = a.estado(), by = {}; const l = e.res.nodos.filter((n) => !n.oculto); l.forEach((n) => { by[n.id] = n; }); return { l, by, plegados: e.plegados || [] }; } catch (x) { return null; } };
  const esDom = (n) => !!(n && n.getAttribute);
  const nid = (n) => esDom(n) ? n.getAttribute('data-id') : n.id;
  const colDom = (e) => ((e.getAttribute('style') || '').match(/var\((--[a-z]+)\)/) || [])[1] || '--ink';
  const colTarj = (t) => { const c = $$('.ppp-cards .tarj').find((x) => (x.getAttribute('data-t') || '') === t || (($('b', x) || {}).textContent || '').trim().indexOf(t) === 0); return c ? colDom(c) : '--ink'; };
  const nombre = (n) => esDom(n) ? partes(n)[0] : (n.titulo || n.id);
  const valor = (n) => {
    if (esDom(n)) return (partes(n)[3] || '').replace(/\.$/, '');
    const d = $('.ppp-lienzo .nodo[data-id="' + n.id + '"]'); if (d) return (partes(d)[3] || '').replace(/\.$/, '');
    if (n.opcion && n.opciones) { const o = n.opciones.find((x) => x.clave === n.opcion); if (o) return o.nombre; }
    try { return n.valor_vista == null || n.valor_vista === '' ? '' : W.ArbolPantalla.fmt(n.valor_vista, n.unidad); } catch (x) { return String(n.valor_vista == null ? '' : n.valor_vista); }
  };
  const colv = (n) => { if (esDom(n)) return colDom(n); const d = $('.ppp-lienzo .nodo[data-id="' + n.id + '"]'); return d ? colDom(d) : colTarj((n.tarjetas || [])[0] || ''); };
  const ir = (id) => {
    const a = api(), mo = modelo(), P0 = $('.ppp');
    if (a && mo && mo.by[id]) {   /* abre las ramas plegadas que tapan el dato y lo centra */
      const cad = []; let x = mo.by[id]; while (x && x.de) { cad.unshift(x.de); x = mo.by[x.de]; }
      cad.forEach((c) => { try { if ((a.estado().plegados || []).indexOf(c) >= 0) a.alterna(c); } catch (e) { } });
      a.seleccionar(id); try { a.centrar(id); } catch (e) { }
      if (P0) P0.removeAttribute('data-sin-panel'); return true;
    }
    const n = $('.ppp-lienzo .nodo[data-id="' + id + '"]'); if (!n) return false;
    const r = n.getBoundingClientRect(), o = { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0 };
    n.dispatchEvent(new PointerEvent('pointerdown', o)); n.dispatchEvent(new PointerEvent('pointerup', o)); n.dispatchEvent(new MouseEvent('click', o));
    const P = $('.ppp'); if (P) P.removeAttribute('data-sin-panel'); return true;
  };
  W.__vpIr = ir;
  const idActual = (p) => {
    const ed = $('[data-edit]', p); if (ed) return ed.getAttribute('data-edit');
    const h2 = (($('h2', p) || {}).childNodes || [])[0]; const t = ((h2 && h2.textContent) || '').trim().toLowerCase();
    const n = nodos().find((x) => nombre(x).trim().toLowerCase() === t) || $('.ppp-lienzo .nodo.sel');
    return n ? n.getAttribute('data-id') : null;
  };
  const chip = (n, en) => {
    const b = el('button', 'ir' + (en ? ' en' : '')); b.type = 'button'; b.setAttribute('data-ir', nid(n)); b.style.setProperty('--cc', 'var(' + colv(n) + ')');
    b.append(nombre(n)); if (!en && valor(n)) b.append(el('b', '', valor(n))); return b;
  };

  /* ───── fuentes reales del caso Calzada de los Ángeles (ligas de la Biblioteca del tablero) ───── */
  const G = 'https://docs.google.com/', T18 = G + 'spreadsheets/d/10aGwpNiYLVr31M3qK184wE1Mlj-7u_dLAs3eifwS_jM/edit#gid=2180001&range=', BO = 'https://boletinoficial.sonora.gob.mx/images/boletines/';
  const S = {
    prog: ['doc', 'Programa de Eduardo del 22 de noviembre', 'Transcrito del WhatsApp de la alianza', G + 'document/d/1Yw2QM7QNe9-4GhotWv0cJQruzDldgcjbiGA4nCVsUDQ/edit'],
    exp: ['carpeta', 'Expediente Calzada de los Ángeles', 'Carpeta en Drive', 'https://drive.google.com/drive/folders/1Z_k4xghk7WePxlmOdLIE3ngOobJv6cPi'],
    qar: ['hoja', 'PPP 2 · Calzada · Grupo QAR', 'Libro interno de planeación, 14 nov 2026', G + 'spreadsheets/d/13lPXasBKwAzlo9lNaUCDm-A4bmFt3p9vziSgB2qCsLA/edit'],
    t17: ['hoja', 'Costo 100 % de Calzada, con fuentes', 'Hoja aprobada por la Reina', G + 'spreadsheets/d/1MtucymG9jI1XAMJ6ucTQQ0wI8hL9AvEidF_M4SdG_AM/edit'],
    dt17: ['doc', 'Dictamen de la Reina sobre costos y precios', 'Revisión independiente', G + 'document/d/19LA7Xr5iP0wHZslLpoMC2XG5azhGbS5AbBLKzHtkHqQ/edit'],
    cat: ['hoja', 'Catálogo de costos y fees', '116 conceptos con fuente de mercado', G + 'spreadsheets/d/1WWLFTEhXNchYpNm5hnh7X0q6g0YyGEIlZePer0d-B9o/edit'],
    rep: ['doc', 'Diseño del módulo de repartos', 'Aprobado por la Reina; nada firmado con los socios', G + 'document/d/1zvBqBS1TsSf8uoso1s5J0EWdSZF14Hlm3IEzJZQzkOQ/edit'],
    ficha: ['doc', 'Ficha del caso Calzada de los Ángeles', 'Corrida completa con reparto, simulación', G + 'document/d/1YNdRlXe-eQD30nfUzVEvkTQJGJEBzxwt2mmbBFkFZ6I/edit'],
    pmduh: ['pdf', 'Programa Municipal de Desarrollo Urbano de Hermosillo 2023', 'Boletín Oficial de Sonora · norma, no dato del predio', BO + '2023/09/2023CCXII21III.pdf'],
    rord: ['pdf', 'Reglamento de Ordenamiento de Hermosillo', 'Boletín Oficial, 21 mar 2025 · norma', BO + '2025/03/EE210320253.pdf'],
    rcon: ['pdf', 'Reglamento de Construcción · Tabla VIII', 'Cajones que pide la norma', 'https://pmt.hermosillo.gob.mx/uploads/REGLAMENTO%20CONSTRUCCION.pdf'],
    rmer: ['pdf', 'Reglamento de Establecimientos Mercantiles', 'Arts. 28 y 29 · convenio de estacionamiento', 'https://pruebastransparencia.hermosillo.gob.mx/uploads/REGLAMENTO%20PARA%20EL%20FUNCIONAMIENTO%20DE%20LOS%20ESTABLECIMIENTOS%20MERCANTILES.pdf'],
    liva: ['pdf', 'Ley del Impuesto al Valor Agregado', 'Cámara de Diputados', 'https://portalhcd.diputados.gob.mx/LeyesBiblio/PortalWeb/Leyes/Vigentes/PDF/77_230421.pdf']
  };
  const c = (r, t) => ['hoja', 'Supuesto rentable · celda ' + r, t || 'De aquí sale el número', T18 + r];
  const caj = { e: 'r', d: [c('C30:C38', 'Palancas de estacionamiento'), S.rcon, S.pmduh, S.rmer, S.dt17], f: 'Plano de cabida, convenio de estacionamiento externo y autorización.' };
  const M = {
    'T-01': { e: 'a', d: [S.prog, S.exp], f: 'Escritura o levantamiento que confirme los 2,164 m².' },
    'T-04': { e: 'a', d: [c('C73'), S.qar, S.t17], f: 'Avalúo del terreno.' },
    'N-02': { e: 'r', d: [S.pmduh, S.rord], f: 'El 36 % es una referencia del Árbol, no un dato de Calzada. Falta la licencia o constancia de uso de suelo del predio.' },
    'N-03': { e: 'a', d: [c('C39'), S.dt17, S.qar, S.pmduh], f: 'Uso de suelo del predio.' },
    'N-04': { e: 'a', d: [S.prog, S.pmduh], f: 'Uso de suelo que confirme los cuatro niveles.' },
    'E-01': { e: 'a', d: [S.prog, c('C44:C52', 'Superficies por nivel')], f: 'Uso de suelo que confirme los cuatro niveles.' },
    'E-04': { e: 'v', d: [c('C44:C51', 'Construcción por nivel'), S.prog] }, 'E-05': { e: 'v', d: [c('C44:C51', 'Construcción por nivel'), S.prog] },
    'E-15': { e: 'a', d: [c('C45:C52', 'Áreas vendibles por nivel'), S.prog], f: 'Plano con áreas privativas.' },
    'N-05': caj, 'N-06': caj, 'E-09': caj, 'E-12': caj, 'E-16': caj, 'E-10': caj, 'E-11': caj, 'E-13': caj,
    'P1-02': { e: 'a', d: [S.prog, S.pmduh], f: 'Uso de suelo del predio. El programa de Eduardo es comercial y de salud, no vivienda.' },
    'P1-06': { e: 'r', d: [c('C54:C58', 'Precios por producto'), S.dt17, S.t17], f: 'Lista de precios «más IVA» firmada. Hoy son precios de oferta, no de cierre.' },
    'P1-08': { e: 'a', d: [c('C81', 'Inventario contratado antes de entrega')], f: 'Estudio de absorción del mercado.' },
    'K-04': { e: 'a', d: [c('C81', 'Inventario contratado antes de entrega')], f: 'Estudio de absorción del mercado.' },
    'PT-01': { e: 'a', d: [c('C45:C52', 'Áreas vendibles por nivel')], f: 'Plano con unidades privativas.' },
    'C-01': { e: 'r', d: [c('C63:C67', 'Costo de obra por uso'), S.cat, S.dt17, S.t17], f: 'Cotización real de obra. Hoy está en la banda baja del catálogo.' },
    'C-10': { e: 'a', d: [c('C77', 'Comercialización master'), S.cat], f: 'Contrato o propuesta del comercializador.' },
    'K-13': { e: 'a', d: [c('C83', 'Preventa mínima para girar'), S.qar, S.t17] }, 'D-11': { e: 'a', d: [c('C83'), S.qar, S.t17] },
    'K-05': { e: 'a', d: [c('C85', 'Duración de la obra'), S.t17] }, 'K-06': { e: 'a', d: [c('C85'), S.t17], f: 'Programa de obra del contratista.' },
    'K-08': { e: 'a', d: [c('C82', 'Anticipo al firmar'), S.qar, S.t17] }, 'K-02': { e: 'a', d: [S.t17] },
    'D-03': { e: 'a', d: [c('C79', 'Tasa anual de la línea'), S.t17], f: 'Carta de términos del banco.' },
    'D-09': { e: 'r', d: [c('C84', 'Línea puente simulada'), S.dt17], f: 'Línea de crédito acreditada; hoy es una simulación.' }
  };
  const GRUPO = [
    [/^T-/, { e: 'a', d: [S.prog, S.exp], f: 'Documento propio de este dato (escritura, avalúo o levantamiento).' }],
    [/^N-/, { e: 'r', d: [S.pmduh, S.rord, S.rcon], f: 'Constancia o licencia de uso de suelo del predio; lo enlazado es la norma general.' }],
    [/^E-/, { e: 'a', d: [c('C44:C52', 'Superficies por nivel'), S.prog], f: 'Plano arquitectónico con áreas.' }],
    [/^P/, { e: 'a', d: [c('C54:C60', 'Ventas y precios'), S.dt17], f: 'Lista de precios firmada o estudio de mercado.' }],
    [/^C-/, { e: 'a', d: [c('C63:C77', 'Obra, contratista y honorarios'), S.cat, S.t17], f: 'Cotización o contrato de este costo.' }],
    [/^K-/, { e: 'a', d: [c('C79:C88', 'Calendario, preventas y capital'), S.t17], f: 'Programa de obra y de ventas.' }],
    [/^D-/, { e: 'a', d: [c('C79:C88', 'Calendario, preventas y capital'), S.t17, S.qar], f: 'Términos del banco o del inversionista.' }],
    [/^S-/, { e: 'r', d: [S.rep, S.prog], f: 'Acuerdo firmado con el dueño y entre los socios. Hoy nada está firmado.' }],
    [/^R/, { e: 'a', d: [S.ficha, S.t17], f: 'Es un resultado calculado: se sustenta cuando se sustenten sus datos de origen.' }]
  ];
  /* Los documentos enlazados son del caso Calzada de los Ángeles (predio de 2,164 m²). Con otro plan sólo se enlaza la norma general. */
  const esCalzada = () => { const n = document.querySelector('.ppp-lienzo .nodo[data-id="T-01"]'); return !!n && /2,?164/.test(n.getAttribute('aria-label') || ''); };
  const fuentesDe = (id) => !esCalzada() ? (/^N-/.test(id || '') ? { e: 'r', d: [S.pmduh, S.rord, S.rcon], f: 'Constancia o licencia de uso de suelo del predio; lo enlazado es la norma general de Hermosillo.' } : { e: 'r', d: [], f: 'Este plan todavía no tiene documentos enlazados. Hoy sólo el caso Calzada de los Ángeles los tiene.' }) : M[id] || ((GRUPO.find(([re]) => re.test(id || '')) || [])[1]) || { e: 'r', d: [], f: 'Este dato todavía no tiene una fuente registrada en la Biblioteca.' };
  const EST = { v: 'Sustentado', a: 'Sustento parcial', r: 'Sin documento que lo sustente' };
  const TP = { pdf: 'PDF', hoja: 'HOJA', doc: 'DOC', carpeta: 'CARPETA' };

  /* ───── ficha desglosada con botones al nodo y fuentes ───── */
  const letra = (ch) => /[a-záéíóúñ]/i.test(ch || '');
  function ficha(p) {
    const nota = $(':scope>p.nota', p); if (!nota || nota.hasAttribute('data-hecho')) return;
    $$('.prev-ficha', p).forEach((e) => e.remove());
    const ns = nodos(), id = idActual(p), yo = ns.find((n) => n.getAttribute('data-id') === id);
    const secs = [['Qué es', '']];
    nota.childNodes.forEach((ch) => { if (ch.nodeName === 'STRONG') secs.push([ch.textContent.replace(/:\s*$/, ''), '']); else secs[secs.length - 1][1] += ch.textContent; });
    const mo = modelo();
    const otros = mo ? mo.l.filter((n) => n.id !== id && nombre(n).length > 3) : ns.filter((n) => n !== yo && nombre(n).length > 3);
    const frase = (txt) => {
      const out = []; let resto = txt, usados = 0;
      while (resto) {
        let hit = null, pos = -1, len = 0; const low = resto.toLowerCase();
        for (const n of otros) { const nm = nombre(n).toLowerCase(); let i = -1, d = 0; while ((i = low.indexOf(nm, d)) >= 0) { if (!letra(low[i - 1]) && !letra(low[i + nm.length])) break; d = i + 1; } if (i >= 0 && (pos < 0 || i < pos || (i === pos && nm.length > len))) { pos = i; hit = n; len = nm.length; } }
        if (!hit || usados > 3) { out.push(resto); break; }
        out.push(resto.slice(0, pos), chip(hit, true)); resto = resto.slice(pos + len); usados++;
      }
      return out;
    };
    const f = el('div', 'prev-ficha'); let pq = null; const texto = [];
    secs.forEach(([t, x], k) => {
      const frases = x.trim().split(/(?<=[.;])\s+(?=[A-ZÁÉÍÓÚ¿])/).map((s) => s.replace(/[.;]\s*$/, '').trim()).filter(Boolean);
      if (!frases.length) return;
      if (k === 0) { pq = el('p', 'pq'); pq.append(...frase(frases.shift())); }
      if (!frases.length) return;
      const s = el('section'); s.append(el('h4', '', t)); const ul = el('ul'); frases.forEach((fr) => { const li = el('li'); li.append(...frase(fr)); ul.append(li); }); s.append(ul); texto.push(s);
    });
    if (pq) f.append(pq);
    /* fuentes reales */
    const m = fuentesDe(id), w = el('div', 'prev-docs'); w.append(el('span', 'est ' + m.e, EST[m.e]));
    if (m.d.length) w.append(el('h4', '', 'Documentos (' + m.d.length + ')'));
    m.d.forEach(([tp, t, sub, url]) => { const a = el('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener'; const b = el('span', '', t); b.append(el('small', '', sub)); a.append(el('span', 'tp ' + tp, TP[tp]), b, el('span', 'fl', '↗')); w.append(a); });
    if (m.f) { const q = el('p', 'falta'); q.append(el('b', '', 'Falta: '), m.f); w.append(q); }
    f.append(w);
    /* conexiones */
    if (mo && mo.by[id]) {
      const de = (n) => [...new Set([n.de].concat(n.usa || [], (n.de_que_sale && n.de_que_sale.ids) || []).filter((i) => i && i !== n.id && mo.by[i]))];
      const entra = de(mo.by[id]).map((i) => mo.by[i]), sale = mo.l.filter((n) => n.id !== id && de(n).indexOf(id) >= 0);
      [['Viene de', entra], ['Si lo cambias, afecta a', sale]].forEach(([t, l]) => {
        const s = el('section'); s.append(el('h4', '', t + (l.length ? ' (' + l.length + ')' : ''))); const d = el('div', 'chips'); l.slice(0, 12).forEach((n) => d.append(chip(n)));
        if (l.length > 12) d.append(el('span', 'vacio', 'y ' + (l.length - 12) + ' más'));
        if (!l.length) d.append(el('span', 'vacio', 'Nada conectado'));
        s.append(d); f.append(s);
      });
    } else if (yo) {
      const ar = $$('.ppp-lienzo .arista');
      const por = (k, o) => [...new Set(ar.filter((a) => a.getAttribute(k) === id).map((a) => a.getAttribute(o)))].map((i) => ns.find((n) => n.getAttribute('data-id') === i)).filter(Boolean);
      const plegado = /plegado/.test(yo.getAttribute('class') || '');
      [['Viene de', por('data-b', 'data-a')], ['Si lo cambias, afecta a', por('data-a', 'data-b')]].forEach(([t, l], k) => {
        const s = el('section'); s.append(el('h4', '', t + (l.length ? ' (' + l.length + ')' : ''))); const d = el('div', 'chips'); l.forEach((n) => d.append(chip(n)));
        if (!l.length) d.append(el('span', 'vacio', k === 1 && plegado ? 'Su rama está plegada en el grafo: ábrela con el + del nodo' : 'Nada conectado a la vista'));
        s.append(d); f.append(s);
      });
    }
    if (texto.length) { const d = el('details', 'mas'); d.open = true; const dn = el('div', 'dentro'); texto.forEach((s) => dn.append(s)); d.append(el('summary', '', 'Dónde se confirma y de dónde salió'), dn); f.append(d); }
    nota.setAttribute('data-hecho', ''); nota.after(f);
  }

  /* ───── unidad: % del terreno o m² ───── */
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  const predio = () => { const n = $('.ppp-lienzo .nodo[data-id="T-01"]'); const m = n && (n.getAttribute('aria-label') || '').match(/([\d,]+(?:\.\d+)?)\s*m²/); return m ? parseFloat(m[1].replace(/,/g, '')) : null; };
  const pon = (inp, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(inp, String(v)); inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true })); };
  function unidad(p) {
    const e = $('.edit', p); if (!e) return; const inp = $('#ppp-otro', e), P = predio(); if (!inp || !P) return;
    const u = $('.step .u', e);
    if (u && /% del terreno/.test(u.textContent) && !$('.prev-uni', e)) {
      const b = el('button', 'prev-uni'); b.type = 'button'; b.setAttribute('aria-label', 'Cambiar la unidad'); u.replaceWith(b);
      const m = el('input', 'prev-m2'); m.type = 'number'; m.setAttribute('aria-label', 'Valor en metros cuadrados'); inp.after(m);
      m.addEventListener('change', () => { const v = parseFloat(m.value); if (!isFinite(v)) return; pon(inp, Math.min(parseFloat(inp.max) || 100, Math.max(parseFloat(inp.min) || 0, Math.round(v / P * 10000) / 100))); });
      $('.step', e).after(el('p', 'prev-eq'));
      b.addEventListener('click', (ev) => { ev.stopPropagation(); est.uni = est.uni === 'm2' ? 'pct' : 'm2'; e.removeAttribute('data-listo'); });
    }
    const b = $('.prev-uni', e); if (!b) return;
    const m = $('.prev-m2', e), q = $('.prev-eq', e), pct = parseFloat(inp.value), mn = parseFloat(inp.min), mx = parseFloat(inp.max), clave = est.uni + '|' + pct + '|' + P;
    if (e.getAttribute('data-listo') === clave) return; e.setAttribute('data-listo', clave); e.setAttribute('data-uni', est.uni);
    const m2 = pct / 100 * P, lim = ' · límite de este rango: ' + fmt(mx / 100 * P) + ' m² (' + mx + ' %)';
    if (est.uni === 'm2') { b.textContent = 'm² de desplante'; if (document.activeElement !== m) m.value = Math.round(m2); q.textContent = 'Equivale a ' + pct + ' % de un predio de ' + fmt(P) + ' m²' + lim; }
    else { b.textContent = '% del terreno'; q.textContent = 'Equivale a ' + fmt(m2) + ' m² de desplante en un predio de ' + fmt(P) + ' m²' + lim; }
    const r = $$('.rango span', e); if (r.length === 3) { r[0].textContent = est.uni === 'm2' ? fmt(mn / 100 * P) + ' m²' : mn + '%'; r[2].textContent = est.uni === 'm2' ? fmt(mx / 100 * P) + ' m²' : mx + '%'; }
  }

  /* ───── separadores, × y encabezado fijo ───── */
  const TABS = [['cambiar', 'Cambiar', '#2f5d8a'], ['conex', 'Conexiones', '#2f6b3f'], ['fuente', 'Fuente', '#8a5a12'], ['comparar', 'Comparar', '#8e3a2c']];
  const bar = el('div', 'vp-tabs'); bar.setAttribute('data-vp', ''); bar.setAttribute('role', 'tablist');
  TABS.forEach(([k, t, col]) => { const b = el('button', '', t); b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('data-tab', k); b.style.setProperty('--bc', col); b.onclick = () => { est.tab = k; tick(); }; bar.append(b); });
  const x = el('button', 'vp-x', '×'); x.setAttribute('data-vp', ''); x.setAttribute('aria-label', 'Cerrar el panel');
  const abrir = el('button', 'vp-abrir', 'Abrir el dato'); abrir.setAttribute('data-vp', '');
  document.body.append(bar, x, abrir);
  x.onclick = () => { $('.ppp').setAttribute('data-sin-panel', ''); tick(); };
  abrir.onclick = () => { $('.ppp').removeAttribute('data-sin-panel'); tick(); };
  const grupo = (e) => {
    if (e.matches('h2,.grande,[data-efecto],.prev-ficha,p.nota[data-hecho]')) return null;
    if (e.matches('details.cmp-con')) return 'comparar'; if (e.matches('details')) return 'fuente';
    if (e.matches('.edit,.ops,.fila,.ppp-btn,button')) return 'cambiar'; if (e.matches('.entradas')) return 'conex';
    if (e.matches('p')) return /De qué sale|Nadie lo escribe|Se calcula/.test(e.textContent) ? 'conex' : 'fuente';
    return 'cambiar';
  };

  /* ───── avisos de la franja: botón «Enterado» ───── */
  /* Sólo se anuncian los que bloquean («No pasa»). Los que no bloquean quedan plegados en un contador,
     y lo que se quita con ✓ se queda quitado en este navegador (por plan) hasta que se pida verlo. */
  const planClave = () => { const mo = modelo(), n = mo && mo.l.find((x) => x.id === 'T-01'); return 'vp_quitados_v1:' + (n && n.valor != null ? n.valor : ''); };
  const leeQuit = () => { try { return JSON.parse(localStorage.getItem(planClave()) || '{}') || {}; } catch (e) { return {}; } };
  const guardaQuit = (q) => { try { localStorage.setItem(planClave(), JSON.stringify(q)); } catch (e) { /* sin memoria: vale sólo en esta visita */ } };
  function avisos() {
    const fr = $('.ppp-franja'); if (!fr) return;
    if (est.planQ !== planClave()) { est.planQ = planClave(); est.visto = leeQuit(); est.verMas = false; }
    const chips = $$('.fr-chips .fr-chip', fr);
    let quitados = 0, suaves = 0, vivos = 0;
    chips.forEach((b) => {
      const clave = b.textContent.trim(), bloquea = b.classList.contains('alto');
      if (!b.nextElementSibling || !b.nextElementSibling.classList.contains('vp-ok')) { const ok = el('button', 'vp-ok', '✓'); ok.type = 'button'; ok.title = 'Quitar este aviso'; ok.setAttribute('aria-label', 'Quitar el aviso de ' + clave); ok.onclick = (ev) => { ev.stopPropagation(); est.visto[clave] = true; guardaQuit(est.visto); avisos(); }; b.after(ok); }
      const q = !!est.visto[clave]; if (q) quitados++; else if (!bloquea) suaves++;
      const oc = !est.verMas && (q || !bloquea); if (!oc) vivos++;
      [b, b.nextElementSibling].forEach((e2) => oc ? e2.setAttribute('data-vp-oculto', '') : e2.removeAttribute('data-vp-oculto'));
    });
    const t = $('.fr-t', fr);
    if (t) { vivos ? t.removeAttribute('data-vp-oculto') : t.setAttribute('data-vp-oculto', ''); const txt = t.innerHTML.replace(/\s*·\s*(?:<b>)?\d+ avisos?(?: nuevos?)?(?:<\/b>)?(?: por este cambio<\/b>)? \(no bloquean\)/, ''); if (txt !== t.innerHTML) t.innerHTML = txt; }
    let v = $('.vp-vistos', fr);
    const resto = suaves + quitados;
    if (resto) {
      if (!v) { v = el('button', 'vp-vistos'); v.type = 'button'; v.onclick = () => { est.verMas = !est.verMas; avisos(); }; fr.append(v); }
      const partes = []; if (suaves) partes.push(suaves + (suaves > 1 ? ' avisos que no bloquean' : ' aviso que no bloquea')); if (quitados) partes.push(quitados + (quitados > 1 ? ' quitados' : ' quitado'));
      const txt = est.verMas ? 'Ocultar' : partes.join(' · ') + ' · ver'; if (v.textContent !== txt) v.textContent = txt;
      let r = $('.vp-regresa', fr);
      if (est.verMas && quitados) { if (!r) { r = el('button', 'vp-vistos vp-regresa', 'Regresar los quitados'); r.type = 'button'; r.onclick = () => { est.visto = {}; guardaQuit(est.visto); avisos(); }; fr.append(r); } } else if (r) r.remove();
    } else { if (v) v.remove(); const r = $('.vp-regresa', fr); if (r) r.remove(); }
  }

  /* ───── tarjetas de arriba: despliegan sus datos ───── */
  const cierraMenu = () => { $$('.vp-menu').forEach((m) => m.remove()); $$('.tarj[data-abierta]').forEach((t) => t.removeAttribute('data-abierta')); };
  if (!W.__vpClick) {
    W.__vpClick = true;
    document.addEventListener('click', (e) => {
      const t0 = e.target.closest ? e.target : null; if (!t0) return;
      const irB = t0.closest('button[data-ir]'); if (irB) { e.preventDefault(); e.stopPropagation(); W.__vpIr(irB.getAttribute('data-ir')); cierraMenu(); return; }
      const sb = t0.closest('.edit[data-uni=m2] .step .sb');
      if (sb) { e.preventDefault(); e.stopPropagation(); const ed = sb.closest('.edit'), inp = ed.querySelector('#ppp-otro'), P = W.__vpPredio(); const dir = /-1/.test(sb.getAttribute('data-a')) ? -1 : 1; const m2 = Math.round((parseFloat(inp.value) / 100 * P) / 10) * 10 + dir * 10; W.__vpPon(inp, Math.min(parseFloat(inp.max), Math.max(parseFloat(inp.min), Math.round(m2 / P * 10000) / 100))); return; }
      if (t0.closest('.vp-menu')) return;
      const t = t0.closest('.ppp-cards .tarj'); if (!t) { cierraMenu(); return; }
      const ya = t.hasAttribute('data-abierta'); cierraMenu(); if (ya) return;
      W.__vpMenu(t); e.stopPropagation();
    }, true);
    document.addEventListener('pointerup', (e) => { if (e.target.closest && e.target.closest('.ppp-lienzo .nodo')) { const P = document.querySelector('.ppp'); if (P) P.removeAttribute('data-sin-panel'); } }, true);
  }
  W.__vpPredio = predio; W.__vpPon = pon;
  W.__vpMenu = (t) => {
    const col = colv(t), mo = modelo(), tn = (t.getAttribute('data-t') || '').trim(), tb = (($('b', t) || {}).textContent || '').trim();
    let ns = mo ? mo.l.filter((n) => (n.tarjetas || []).some((x) => x === tn || (x && tb.indexOf(x) === 0))) : [];
    if (!ns.length) ns = nodos().filter((n) => colv(n) === col);
    const m = el('div', 'vp-menu'), r = t.getBoundingClientRect();
    m.style.left = Math.min(r.left, innerWidth - 330) + 'px'; m.style.top = (r.bottom + 2) + 'px'; m.style.width = Math.max(300, r.width) + 'px'; m.style.setProperty('--c', 'var(' + col + ')');
    m.append(el('h3', '', (t.getAttribute('data-t') || '') + ' · ' + ns.length + ' datos'));
    ns.forEach((n) => { const b = el('button'); b.type = 'button'; b.setAttribute('data-ir', nid(n)); b.append(el('span', '', nombre(n))); if (esDom(n) ? /por confirmar/i.test(partes(n)[2] || '') : /confirmar|estimad|referencia/i.test(n.estado || '')) b.append(el('i', '', 'por confirmar')); b.append(el('b', '', valor(n))); m.append(b); });
    if (!ns.length) m.append(el('p', '', 'Esta tarjeta es un resumen: no tiene datos propios en el árbol.'));
    t.setAttribute('data-abierta', ''); document.body.append(m);
  };

  /* ───── ciclo ───── */
  function tick() {
    const P = $('.ppp'), L = $('.ppp-lienzo'), p = $('.ppp-panel');
    if (!P || !L) { bar.style.display = x.style.display = abrir.style.display = 'none'; return; }
    P.style.setProperty('--ltop', (L.getBoundingClientRect().top - P.getBoundingClientRect().top + 12) + 'px');
    avisos();
    const oculto = P.hasAttribute('data-sin-panel');
    if (!p || oculto) { bar.style.display = x.style.display = 'none'; abrir.style.display = p && oculto ? 'block' : 'none'; return; }
    ficha(p); unidad(p);
    [...p.children].forEach((e) => { const g = grupo(e); if (g) e.setAttribute('data-g', g); else e.removeAttribute('data-g'); if (e.tagName === 'DETAILS' && !e.open) e.open = true; });
    const hay = { cambiar: !!$(':scope>[data-g=cambiar]', p), conex: !!$(':scope>[data-g=conex], :scope>.prev-ficha section', p), fuente: !!$(':scope>.prev-ficha .prev-docs', p), comparar: !!$(':scope>[data-g=comparar]', p) };
    let act = est.tab; if (!hay[act]) act = TABS.map((t) => t[0]).find((k) => hay[k]) || 'conex';
    p.setAttribute('data-tab', act); p.style.setProperty('--tc', TABS.find((t) => t[0] === act)[2]);
    const h2 = $(':scope>h2', p); if (h2) p.style.setProperty('--h2h', h2.offsetHeight + 'px');
    const r = p.getBoundingClientRect();
    abrir.style.display = 'none'; x.style.display = 'block'; x.style.left = (r.right - 52) + 'px'; x.style.top = (r.top + 8) + 'px';
    bar.style.display = 'flex'; bar.style.left = r.left + 'px'; bar.style.width = r.width + 'px'; bar.style.top = (r.bottom - 1) + 'px';
    $$('button', bar).forEach((b) => { const k = b.getAttribute('data-tab'); b.hidden = !hay[k]; b.setAttribute('aria-selected', String(k === act)); });
  }

  /* ───── opciones en renglones, valor elegido fijo, nota «No cabe», acomodo de pantalla ───── */
  const st2 = el('style'); st2.setAttribute('data-vp', '');
  st2.textContent = `
.ppp-panel .ops{grid-template-columns:1fr !important;gap:6px !important}
.ppp-panel .op{display:grid !important;grid-template-columns:minmax(0,1fr) auto;column-gap:12px;row-gap:1px !important;align-items:center;padding:9px 12px !important}
.ppp-panel .op b{grid-column:1;grid-row:1}.ppp-panel .op small{grid-column:1;grid-row:2;-webkit-line-clamp:2}
.ppp-panel .op i{grid-column:2;grid-row:1/span 2;font-size:.95rem !important;text-align:right;white-space:nowrap}
.ppp-panel .op .vp-nocabe{grid-column:1/-1;grid-row:3;margin-top:4px;font:600 12px system-ui;color:#8a2820;background:#fbeae6;border:1px solid #e3b4ac;border-radius:6px;padding:3px 8px;justify-self:start}
.ppp-panel:not([data-mas])>[data-extra]{display:none !important}
.ppp-panel .ops .op:not(.on):not([aria-pressed=true]) small{display:none !important}
.ppp-panel .ops .op{padding:7px 12px !important}
.ppp-panel>.vp-mas{order:6;justify-self:start;min-height:36px !important;padding:0 12px;border:1px dashed #9a8f7a;border-radius:18px;background:transparent;font:600 13px system-ui;color:#3d362d;cursor:pointer}
.ppp-panel>.vp-mas::before{content:'▸ '}.ppp-panel[data-mas]>.vp-mas::before{content:'▾ '}
.ppp-panel>.vp-val{position:sticky;z-index:4;background:var(--panel,#fffdf8);margin:-9px -16px 0;padding:0 16px 8px;border-bottom:1px solid #e6ddcb;font-family:var(--display,inherit);font-size:1.45rem;font-weight:700;line-height:1.15}
.ppp-panel>.vp-val small{font:500 .8rem system-ui;color:#6b6257;margin-left:8px}
.ppp-panel>section.alerta-caja[data-vp-movida]{display:none !important}
.ppp-panel>section.alerta-caja{order:2;padding:8px 10px !important}
.ppp-panel>section.alerta-caja .ppp-btn,.ppp-panel>section.alerta-caja button{min-height:32px !important;font-size:.8rem !important;padding:0 10px !important}
.ppp-panel>h2{order:-3 !important;top:calc(0px - var(--fix,0px)) !important}
.ppp-panel>.vp-val,.ppp-panel>.grande{order:-2 !important;top:calc(var(--h2h,44px) - var(--fix,0px)) !important}
.ppp-panel>[data-efecto]{order:-1 !important}
@media (min-width:761px){
.ppp>.ppp-lienzo{grid-row:1/-1!important;grid-column:1/-1!important;z-index:0!important;margin:-10px -16px 0!important;height:auto!important;min-height:0!important;align-self:stretch!important}
.ppp>.ppp-top,.ppp>.ppp-cards,.ppp>.ppp-barra,.ppp>.ppp-herr,.ppp>.ppp-franja{position:absolute!important;z-index:3!important;background:transparent!important;pointer-events:none!important;border:0!important;box-shadow:none!important;margin:0!important;transform:none!important;width:auto!important}
.ppp>.ppp-top *,.ppp>.ppp-cards .tarj,.ppp>.ppp-barra *,.ppp>.ppp-herr *,.ppp>.ppp-franja *{pointer-events:auto}
.ppp>.ppp-top{top:6px!important;left:14px!important;right:14px!important;display:flex!important;justify-content:space-between!important;align-items:center!important;min-height:0!important;height:30px!important}
.ppp>.ppp-top h1{font-size:17px!important;line-height:1!important;margin:0!important}
.ppp>.ppp-top p,.ppp>.ppp-top small{display:none!important}
.ppp>.ppp-top button{height:26px!important;min-height:0!important;padding:0 9px!important;font-size:12px!important;background-color:rgba(255,255,255,.55)!important}
.ppp>.ppp-cards{top:8px!important;left:112px!important;right:200px!important;display:flex!important;flex-wrap:nowrap!important;gap:4px!important;height:26px!important;min-height:0!important;justify-content:flex-start!important}
.ppp>.ppp-herr{top:40px!important;left:14px!important;display:flex!important;gap:5px!important}
.ppp>.ppp-herr button{height:28px!important;min-height:0!important;padding:0 9px!important;font-size:12px!important}
.ppp>.ppp-franja{top:40px!important;left:360px!important;max-width:calc(100% - 640px)!important;padding:0!important;min-height:0!important}
.ppp>.ppp-barra{top:38px!important;right:14px!important}
.ppp>.ppp-panel{top:78px!important;max-height:min(calc(100% - 150px),540px)!important}
.ppp .ppp-ctrl{top:auto!important;bottom:12px!important}
}
.ppp>.ppp-cards .tarj{display:flex!important;flex:0 0 auto!important;align-items:baseline!important;gap:6px!important;height:26px!important;min-height:0!important;padding:3px 8px!important;border-radius:13px!important;border:1px solid color-mix(in srgb,var(--c) 55%,transparent)!important;border-left:4px solid var(--c)!important;background:rgba(255,255,255,.5)!important;-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);box-shadow:none!important;white-space:nowrap!important;overflow:hidden!important}
.ppp>.ppp-cards .tarj b{font-size:10px!important;letter-spacing:.02em!important;opacity:.75;font-weight:600!important;margin:0!important}
.ppp>.ppp-cards .tarj strong{font-size:12.5px!important;line-height:1!important;margin:0!important}
.ppp>.ppp-cards .tarj span{display:none!important}
.ppp>.ppp-cards .tarj:hover,.ppp>.ppp-cards .tarj[data-abierta]{background:#fff!important}
.ppp>.ppp-herr button,.ppp>.ppp-barra>*{background-color:rgba(255,255,255,.55)!important;-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px)}
.ppp>.ppp-franja>*{background-color:rgba(253,240,238,.6)}
@media (max-width:760px){
html,body{overflow:hidden!important;height:100%!important}
.ppp{display:block!important}
.ppp>.ppp-lienzo{position:fixed!important;inset:var(--mtop,0px) 0 0 0!important;height:auto!important;width:auto!important;max-height:none!important;margin:0!important;border:0!important;border-radius:0!important;z-index:0!important}
.ppp>.ppp-lienzo svg{width:100%!important;height:100%!important}
.ppp>.ppp-top,.ppp>.ppp-cards,.ppp>.ppp-barra,.ppp>.ppp-herr,.ppp>.ppp-franja{position:fixed!important;z-index:3!important;background:transparent!important;border:0!important;box-shadow:none!important;margin:0!important;padding:0!important;pointer-events:none!important;width:auto!important}
.ppp>.ppp-top *,.ppp>.ppp-cards .tarj,.ppp>.ppp-herr *,.ppp>.ppp-franja *{pointer-events:auto}
.ppp>.ppp-top{top:calc(var(--mtop,0px) + 4px)!important;left:10px!important;right:10px!important;display:flex!important;justify-content:space-between!important;align-items:center!important;height:30px!important}
.ppp>.ppp-top h1{font-size:18px!important;margin:0!important;line-height:1!important}
.ppp>.ppp-top p,.ppp>.ppp-top small{display:none!important}
.ppp>.ppp-top button{height:30px!important;min-height:0!important;padding:0 10px!important;font-size:12px!important;background-color:rgba(255,255,255,.6)!important}
.ppp>.ppp-cards{top:calc(var(--mtop,0px) + 38px)!important;left:0!important;right:0!important;display:flex!important;flex-wrap:nowrap!important;gap:5px!important;overflow-x:auto!important;padding:0 10px!important;height:32px!important;pointer-events:auto!important;scrollbar-width:none}
.ppp>.ppp-cards .tarj{height:30px!important;padding:5px 10px!important;border-radius:15px!important}
.ppp>.ppp-cards .tarj b{font-size:10.5px!important}.ppp>.ppp-cards .tarj strong{font-size:13px!important}
.ppp>.ppp-herr{top:calc(var(--mtop,0px) + 74px)!important;left:0!important;right:0!important;display:flex!important;flex-wrap:nowrap!important;gap:5px!important;overflow-x:auto!important;padding:0 10px!important;pointer-events:auto!important;scrollbar-width:none}
.ppp>.ppp-herr button{flex:0 0 auto!important;height:30px!important;min-height:0!important;padding:0 10px!important;font-size:12px!important}
.ppp>.ppp-franja{top:calc(var(--mtop,0px) + 108px)!important;left:10px!important;right:10px!important;display:flex!important;align-items:center!important;gap:6px!important;font-size:12px!important;overflow-x:auto!important}
.ppp>.ppp-franja .fr-chips button{min-height:28px!important;font-size:12px!important}
.ppp>.ppp-barra{display:none!important}
.ppp .ppp-ctrl{position:absolute!important;top:auto!important;left:auto!important;right:10px!important;bottom:calc(var(--sheet,0px) + 60px)!important;display:flex!important;flex-direction:row!important;gap:6px!important}
.ppp .ppp-ctrl button{width:40px!important;height:40px!important}
.ppp>.ppp-panel{position:fixed!important;left:0!important;right:0!important;bottom:0!important;top:auto!important;width:auto!important;max-width:none!important;max-height:44%!important;overflow-y:auto!important;margin:0!important;border-radius:0!important;border-bottom:0!important;border-top:4px solid var(--tc,#2f5d8a)!important;z-index:5!important;box-shadow:0 -6px 24px rgba(0,0,0,.18)!important}
.vp-tabs{align-items:flex-end!important;padding-left:6px!important;gap:3px!important}
.vp-tabs button{border-radius:12px 12px 0 0!important;transform:translateY(4px)!important;height:38px!important;padding:0 11px!important;font-size:12.5px!important;box-shadow:none!important}
.vp-tabs button[aria-selected=true]{height:44px!important;transform:none!important}
.vp-abrir{right:12px!important;bottom:14px!important}
.ppp-panel .op i{font-size:.85rem !important}.ppp-panel .op{column-gap:8px !important}
.vp-menu{left:8px!important;right:8px!important;min-width:0!important;max-height:56vh!important}
}
`;
  document.head.append(st2);
  const limpia = (t) => t.replace(/por m²\s+por m²/g, 'por m²').replace(/\s+/g, ' ').trim();
  const movil = () => W.matchMedia('(max-width:760px)').matches;
  const auto = {}, masDe = { id: null, on: false }; let fix = 0, eraMovil = null;
  /* ───── tres botones del grafo: pantalla completa, abrir todo, cerrar todo ───── */
  const st3 = el('style'); st3.setAttribute('data-vp', '');
  st3.textContent = 'html[data-vp-max] .ppp{position:fixed!important;inset:0!important;z-index:9000!important;width:auto!important;height:auto!important;max-width:none!important;max-height:none!important;margin:0!important}html[data-vp-max],html[data-vp-max] body{overflow:hidden!important}.ppp-herr .vp-b3[aria-pressed=true]{background:#1f1b16!important;color:#fffdf8!important}';
  document.head.append(st3);
  const maxOn = () => document.documentElement.hasAttribute('data-vp-max');
  const ponMax = (on) => {
    const d = document.documentElement;
    on ? d.setAttribute('data-vp-max', '') : d.removeAttribute('data-vp-max');
    try { if (on && d.requestFullscreen && !document.fullscreenElement) d.requestFullscreen().catch(() => 0); else if (!on && document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => 0); } catch (e) { /* el teléfono no lo permite: queda el modo que tapa el menú */ }
    setTimeout(() => { W.dispatchEvent(new Event('resize')); const a = api(); if (a) a.verTodo(); }, 350);
  };
  if (!W.__vpFs) { W.__vpFs = true; document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && document.documentElement.hasAttribute('data-vp-max')) { document.documentElement.removeAttribute('data-vp-max'); W.dispatchEvent(new Event('resize')); } }); }
  const sinResumen = () => { const b = $('[data-act="resumen"]'); if (b && b.getAttribute('aria-pressed') === 'true') b.click(); };
  const abreTodo = () => { const a = api(); if (!a) return; sinResumen(); (a.estado().plegados || []).forEach((id) => a.alterna(id)); a.verTodo(); };
  /* Cerrar todo: queda a la vista sólo el camino que lleva al primer dato de cada color; lo demás se pliega. */
  const cierraTodo = () => {
    const a = api(); if (!a) return; sinResumen();
    const ns = a.estado().res.nodos.filter((n) => !n.oculto), by = {}, hijos = {};
    ns.forEach((n) => { by[n.id] = n; }); ns.forEach((n) => { if (n.de && by[n.de]) (hijos[n.de] = hijos[n.de] || []).push(n.id); });
    const color = (n) => (n.tarjetas || [])[0] || '';
    const guarda = new Set();
    const prof = (n) => { let d = 0; for (let x = n; x.de && by[x.de]; x = by[x.de]) d++; return d; }, prim = {};
    ns.forEach((n) => { const c = color(n); if (c && (!prim[c] || prof(n) < prof(prim[c]))) prim[c] = n; });      // el primer dato de cada color (el más cercano al predio)
    Object.keys(prim).forEach((c) => { for (let x = prim[c]; x && !guarda.has(x.id); x = x.de && by[x.de]) guarda.add(x.id); });
    const pl = new Set(a.estado().plegados || []);
    ns.forEach((n) => { const h = hijos[n.id]; if (!h) return; const quiere = !h.some((i) => guarda.has(i)); if (quiere !== pl.has(n.id)) a.alterna(n.id); });
    a.verTodo();
  };
  function botones3() {
    const h = $('.ppp-herr'); if (!h) return;
    if (!$('.vp-b3', h)) {
      [['max', 'Pantalla completa', 'Que el árbol ocupe toda la pantalla', () => ponMax(!maxOn())], ['abre', 'Abrir todo', 'Desplegar todas las ramas', abreTodo], ['cierra', 'Cerrar todo', 'Plegar todo y dejar sólo el inicio de cada color', cierraTodo]].forEach((d) => {
        const b = el('button', 'ppp-btn chico vp-b3', d[1]); b.type = 'button'; b.title = d[2]; b.setAttribute('data-b3', d[0]); b.onclick = (ev) => { ev.stopPropagation(); d[3](); }; h.append(b);
      });
    }
    const m = $('[data-b3="max"]', h), on = maxOn(), txt = on ? 'Salir de pantalla completa' : 'Pantalla completa';
    if (m && m.textContent !== txt) { m.textContent = txt; m.setAttribute('aria-pressed', String(on)); }
  }

  function extra() {
    const raiz = $('.ppp'); if (!raiz) return;
    const m = movil();
    if (m !== eraMovil) { eraMovil = m; fix = 0; W.dispatchEvent(new Event('resize')); }
    if (m) raiz.style.setProperty('--mtop', Math.round(raiz.getBoundingClientRect().top + W.scrollY) + 'px'); else raiz.style.removeProperty('--mtop');
    const p = $('.ppp-panel');
    const visible = p && !raiz.hasAttribute('data-sin-panel') && p.getClientRects().length > 0;
    raiz.style.setProperty('--sheet', m && visible ? p.getBoundingClientRect().height + 'px' : '0px');
    if (!p || !visible) return;
    if (m) { const r = p.getBoundingClientRect(), bar = $('.vp-tabs'); if (bar) { bar.style.top = (r.top - 44) + 'px'; bar.style.height = '44px'; } }
    else { const bar = $('.vp-tabs'); if (bar) bar.style.height = ''; }
    /* sencillo: el control principal a la vista; áreas, catálogos y demás ajustes quedan en «Más ajustes» */
    const idp = idActual(p); if (masDe.id !== idp) { masDe.id = idp; masDe.on = false; }
    if (masDe.on) p.setAttribute('data-mas', ''); else p.removeAttribute('data-mas');
    let visto1 = false, fin = false, nx = 0, ult = null;
    $$(':scope>[data-g=cambiar]:not(.vp-mas)', p).forEach((e) => {
      const ctl = e.matches('.ops,.edit');
      if (!fin && visto1 && !(ctl ? false : e.matches('.fila,p.rango,.ppp-btn'))) fin = true;
      if (!fin && ctl) { if (visto1) fin = true; else visto1 = true; }
      if (fin) { e.setAttribute('data-extra', ''); nx++; } else { e.removeAttribute('data-extra'); ult = e; }
    });
    let bm = $(':scope>.vp-mas', p);
    if (nx && ult) {
      if (!bm) { bm = el('button', 'vp-mas'); bm.type = 'button'; bm.setAttribute('data-g', 'cambiar'); bm.onclick = () => { masDe.on = !masDe.on; extra(); }; }
      if (ult.nextElementSibling !== bm) ult.after(bm);
      const tx = masDe.on ? 'Ocultar los demás ajustes' : 'Más ajustes'; if (bm.textContent !== tx) bm.textContent = tx;
    } else if (bm) bm.remove();
    $$('.ops .op', p).forEach((o) => { const sm = $('small', o); if (sm && !o.title) o.title = sm.textContent.trim(); });
    $$('.op i', p).forEach((i) => { const t = limpia(i.textContent); if (t !== i.textContent) i.textContent = t; });
    const on = $('.ops .op.on, .ops .op[aria-pressed=true]', p); let v = $(':scope>.vp-val', p);
    if (on && !$(':scope>.grande', p)) {
      const txt = ($('b', on) || {}).textContent || '', pr = limpia(($('i', on) || {}).textContent || ''), clave = txt + '|' + pr;
      if (!v) { v = el('div', 'vp-val'); const h = $(':scope>h2', p); if (h) h.after(v); }
      if (v.getAttribute('data-k') !== clave) { v.setAttribute('data-k', clave); v.textContent = txt; v.append(el('small', '', pr)); }
    } else if (v) v.remove();
    $$(':scope>section.alerta-caja', p).forEach((a) => {
      const mm = a.textContent.match(/Si eligieras «([^»]+)»,?\s*(.*?)(?:\.|$)/); if (!mm) return;
      const op = $$('.ops .op', p).find((o) => (($('b', o) || {}).textContent || '').trim().toLowerCase() === mm[1].trim().toLowerCase()); if (!op) return;
      if (!$('.vp-nocabe', op)) op.append(el('span', 'vp-nocabe', 'No cabe: ' + mm[2].replace(/no cabrían?/, 'no caben')));
      a.setAttribute('data-vp-movida', '');
      const sel = $('.ppp-lienzo .nodo.sel'), nom = sel ? (sel.getAttribute('aria-label') || '').split('. ')[0] : null;
      if (!nom || auto[nom]) return;
      const chip = $$('.ppp-franja .fr-chips button').find((b) => !b.classList.contains('vp-ok') && b.textContent.includes(nom));
      if (chip && chip.nextElementSibling && chip.nextElementSibling.classList.contains('vp-ok')) { auto[nom] = true; chip.nextElementSibling.click(); }
    });
    if (p.scrollTop === 0) { const h = $(':scope>h2', p); if (h) { const d = h.getBoundingClientRect().top - (p.getBoundingClientRect().top + p.clientTop); if (Math.abs(d) > 1) fix += d; p.style.setProperty('--fix', fix + 'px'); } }
  }
  est.t = setInterval(() => { tick(); extra(); botones3(); }, 300); tick(); extra(); botones3(); W.dispatchEvent(new Event('resize'));
}
(function espera(n) {
  if (document.querySelector('.ppp .ppp-lienzo .nodo')) return __mejorasArbol();
  if (n < 200) setTimeout(function () { espera(n + 1); }, 150);
})(0);
