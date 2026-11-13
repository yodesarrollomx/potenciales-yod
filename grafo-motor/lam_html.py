"""Arma cada lámina con el exportador de Graphify (graphify.exporters.html.to_html) y le monta encima la capa de cuadrante:
   posiciones fijas por celda, rejilla, flechas por familia, panel en español, «Entrar» y «También aparece en»."""
import json, re, math, collections, html as H_, importlib.metadata, io, contextlib
import networkx as nx
from graphify.exporters.html import to_html
from lam_base import *

VERSION = importlib.metadata.version('graphifyy')
NO_INDEXAR = '<meta name="robots" content="noindex,nofollow,noarchive">'
# El estado en vivo lo escribe el flujo «Grafo · estado» (por cambios y cuando GitHub arranca su horario) en la rama de datos (la principal está protegida).
ESTADO_URL = 'https://raw.githubusercontent.com/yodesarrollomx/potenciales-yod/grafo-datos/estado.json'
PADX, PADY = 28, 30
ICONO = {'hay': '●', 'parcial': '◐', 'falta': '○'}
BORDE_Z = {'hay': '#2E7D32', 'parcial': '#C99A12', 'falta': '#C8102E'}

def _corta(t, n): return t if len(t) <= n else t[:n - 1].rstrip() + '…'
def _caja(i, n, c, etq, corta=False):
    """Texto de las cajas (pantalla, zona y lo que sale). El visor lo parte solo al ancho de la caja."""
    e = H_.escape
    if c == 'zona':
        if corta: return e(f"{n.get('orden')} · {etq}")
        return f"<b>{n.get('orden')} · {e(etq)}</b>\n" + e(_corta(n.get('nota') or '', 170))
    if c == 'pantalla': return f"<b>{e(etq)}</b>" + ('' if corta else '\n' + e(_corta(n.get('nota') or '', 120)))
    return e(_corta(etq, 130))

def armar(lam):
    cel = collections.defaultdict(list)
    for i, c, r, o in sorted(lam.items, key=lambda t: t[3]): cel[(c, r)].append(i)
    cols = [c for c in lam.cols if any((c[0], r[0]) in cel for r in lam.filas)]
    filas = [r for r in lam.filas if any((c[0], r[0]) in cel for c in lam.cols)]
    K, X, Yp, colsY, filasY, pos, celda = {}, {}, {}, [], [], {}, {}
    pady = getattr(lam, 'pady', PADY)
    x = 0
    for ck, cn in cols:
        m = max(len(cel.get((ck, rk), [])) for rk, _ in filas)
        K[ck] = lam.k.get(ck) or min(lam.kmax, max(1, math.ceil(m / lam.objetivo)))
        dx = lam.ancho.get(ck, lam.dx); w = K[ck] * dx + 2 * PADX
        colsY.append(dict(x=x, w=w, nombre=cn)); X[ck] = (x, dx); x += w
    y = 0
    for rk, rn in filas:
        nr = max(1, max(math.ceil(len(cel.get((ck, rk), [])) / K[ck]) for ck, _ in cols))
        h = nr * lam.dy + 2 * pady
        filasY.append(dict(y=y, h=h, nombre=rn)); Yp[rk] = y; y += h
    cn_ = dict(cols); rn_ = dict(filas)
    for (ck, rk), ids in cel.items():
        if ck not in X or rk not in Yp: continue
        x0, dx = X[ck]; k = K[ck]
        for j, i in enumerate(ids):
            pos[i] = (round(x0 + PADX + (j % k + 0.5) * dx), round(Yp[rk] + pady + (j // k + 0.5) * lam.dy)); celda[i] = (ck, rk)
    # flechas entre las piezas colocadas
    ar = {}
    def mete(a, b, rel, fam, ev, nota=''):
        if a == b or a not in pos or b not in pos: return
        e = ar.get((a, b)) or ar.get((b, a))
        if e:
            if rel not in e['r'] and len(e['r']) < 90: e['r'] += ' · ' + rel
            if fam in ('hueco', 'propuesta') and e['f'] in ('viva', 'inferida'): e['f'] = fam
            return
        ar[(a, b)] = dict(f=fam if fam in FAMILIAS else 'inferida', r=rel, ev=ev, nota=nota)
    for f in F:
        if f['s'] in pos and f['t'] in pos and f['r'] not in lam.sin and (lam.solo is None or f['r'] in lam.solo):
            mete(f['s'], f['t'], f['r'], f['c'], (f['sf'] + (' ' + f['loc'] if f['loc'] and f['loc'] != 'L1' else '')).strip(), f.get('nota') or '')
    for a, b, rel, fam, ev in lam.fx: mete(a, b, rel, fam, ev)
    if len(ar) > lam.tope:
        orden = sorted(ar.items(), key=lambda t: ({'hueco': 0, 'propuesta': 1, 'viva': 2, 'inferida': 3}[t[1]['f']], -(GRADO[t[0][0]] + GRADO[t[0][1]])))
        ar = dict(orden[:lam.tope])
    varios = len({N[i].get('hoja') for i in pos if i in N and capa(i) == 'pestana'}) > 1
    nodos = {}
    for i, (px, py) in pos.items():
        if i in N:
            n = N[i]; c = capa(i); nombre = n.get('label') or i; nota = nota_de(i); ev = evidencia(i); lt, lista = lista_de(i)
            url = n.get('url') if c not in ('endpoint',) else ''; est = ESTADO.get(n.get('estado'), n.get('estado') or '')
        else:
            n = lam.sint[i]; c = n['capa']; nombre = n['label']; nota = n.get('nota') or ''; ev = n.get('ev') or ''; lt, lista = (n.get('lt'), n.get('lista')) if n.get('lista') else (None, None)
            url = ''; est = n.get('estado') or ''
        nombre = visible(i, nombre, varios) if i in N else nombre
        forma, color, tam = ESTILO.get(c, ESTILO['otro']); etq = lam.etq.get(i) or nombre
        d = dict(x=px, y=py, nombre=nombre, forma=forma, tam=tam, color=color, tipo=TIPO.get(c, c), celda=f'{rn_[celda[i][1]]} · {cn_[celda[i][0]]}')
        if forma == 'box':
            d['lbl'] = _caja(i, n, c, etq, getattr(lam, 'corta', False)); d['caja'] = min(lam.ancho.get(celda[i][0], lam.dx) - 30, 330)
            if c == 'zona': d['bc'] = BORDE_Z.get(n.get('est'), '#C99A12')
        else: d['lbl'] = envolver(etq, 18, 3)
        if est: d['estado'] = est
        if nota: d['nota'] = nota
        if ev: d['ev'] = ev
        if url: d['url'] = url
        if lista: d['lt'] = lt; d['lista'] = lista
        if i in HAL and c != 'hallazgo': d['al'] = [[h, N[h]['label']] for h in HAL[i][:6]]
        nodos[i] = d
    return dict(nodos=nodos, ar=ar, rejilla=dict(cols=colsY, filas=filasY), celda=celda, cn=cn_, rn=rn_)

# ── la capa que se monta sobre el visor de Graphify ───────────────────────────────────────────────
CSS = """<style id="yod-capa">
  #graph { position: relative; }
  #yod-barra { position: fixed; top: 8px; left: 8px; right: 296px; z-index: 5; display: flex; flex-wrap: wrap; gap: 6px; pointer-events: none; }
  #yod-barra button, #yod-barra a, #yod-barra select { pointer-events: auto; display: inline-flex; align-items: center; gap: 6px; font: 500 12px system-ui, -apple-system, sans-serif; text-decoration: none;
    color: var(--text); background: var(--panel); border: 1px solid var(--input-border); border-radius: 999px; padding: 5px 10px; min-height: 30px; cursor: pointer; }
  #yod-barra button[aria-pressed="false"] { opacity: .45; text-decoration: line-through; }
  #yod-barra select { max-width: 150px; appearance: auto; }
  #yod-barra i { width: 14px; height: 3px; border-radius: 2px; display: inline-block; }
  #yod-barra .yod-fuerte { font-weight: 650; }
  #yod-barra .yod-c { display: none; }
  .neighbor-link { white-space: normal !important; overflow-wrap: anywhere; line-height: 1.35; padding: 5px 6px !important; }
  #neighbors-list { max-height: 260px !important; }
  #info-content .field { overflow-wrap: anywhere; }
  #info-content a { color: #4E79A7; }
  [data-theme="dark"] #info-content a { color: #8FB8E8; }
  .yod-tipo { color: var(--text-2); font-size: 12px; }
  .yod-ev { color: var(--text-2); font-size: 11.5px; }
  .yod-alerta { color: #C8102E; } [data-theme="dark"] .yod-alerta { color: #FF7B8A; }
  .yod-entrar { display: block; margin: 8px 0; padding: 9px 11px; border-radius: 8px; background: #4E79A7; color: #fff !important; font-weight: 600; text-decoration: none; font-size: 13px; }
  .yod-abrir { display: inline-block; margin: 2px 0 6px; font-size: 12px; }
  .yod-lista { margin: 6px 0; font-size: 12px; } .yod-lista summary { cursor: pointer; color: var(--text-2); padding: 3px 0; }
  .yod-lista div { display: flex; flex-wrap: wrap; gap: 4px; padding: 4px 0; } .yod-lista span { border: 1px solid var(--border); border-radius: 5px; padding: 1px 6px; font: 11.5px ui-monospace, Menlo, monospace; }
  .yod-tb { font-size: 12px; line-height: 1.7; }
  #yod-simbolos { padding: 8px 14px; border-top: 1px solid var(--border); font-size: 11px; color: var(--text-2); display: flex; flex-wrap: wrap; gap: 3px 10px; }
  #yod-simbolos b { font-weight: 400; }
  @media (max-width: 760px) {
    body { flex-direction: column; }
    #graph { flex: 1 1 auto; min-height: 54vh; }
    #sidebar { display: block; width: auto; max-height: 46vh; overflow-y: auto; border-left: 0; border-top: 1px solid var(--border); }
    #theme-wrap { display: none; }
    #info-panel { min-height: 0; }
    #legend-wrap { overflow: visible; }
    #yod-barra { right: 8px; gap: 4px; }
    #yod-barra button, #yod-barra a, #yod-barra select { font-size: 11px; padding: 4px 8px; min-height: 28px; }
    #yod-barra .yod-l { display: none; } #yod-barra .yod-c { display: inline; }
    #yod-barra select { max-width: 112px; }
    #yod-barra a.yod-fuerte { max-width: 150px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; display: inline-block; line-height: 20px; }
  }
</style>
"""
JS = r"""
// ── YOD: acomodo fijo en cuadrante sobre el visor de Graphify. Los nodos y las flechas son los que exportó Graphify. ──
(function () {
  const Y = window.YOD;
  // Cuando la portada enseña un borrador, trae la lámina como texto: los enlaces a otras láminas se le piden a ella.
  const SUELTA = location.protocol === 'about:';
  const yodIr = h => { const m = String(h).match(/^([A-Za-z0-9._-]+)\.html(?:#(.*))?$/);
    if (SUELTA && m) { try { parent.postMessage({ yod: 2, ir: m[1], nodo: m[2] ? decodeURIComponent(m[2]) : '' }, '*'); } catch (e) {} } else location.href = h; };
  if (SUELTA) document.addEventListener('click', e => { const a = e.target && e.target.closest ? e.target.closest('a[href]') : null; if (!a || a.target === '_blank') return;
    const h = a.getAttribute('href') || ''; if (/^[A-Za-z0-9._-]+\.html(#.*)?$/.test(h)) { e.preventDefault(); yodIr(h); } }, true);
  const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const esc2 = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const fuente = p => p.forma === 'box'
    ? { size: 13, color: '#1d1d1f', face: 'system-ui, -apple-system, sans-serif', multi: 'html', align: 'left', bold: { color: '#111111', size: 14, face: 'system-ui, -apple-system, sans-serif' } }
    : { size: 14, color: css('--node-label') || '#222', face: 'system-ui, -apple-system, sans-serif', strokeWidth: 3, strokeColor: css('--bg') || '#fff' };
  const estiloNodo = (n, apagado) => {
    const p = Y.nodos[n.id] || {};
    const o = { id: n.id, x: p.x, y: p.y, label: p.lbl, shape: p.forma, size: p.tam, opacity: apagado ? 0.14 : 1, title: undefined,
      color: { background: p.color, border: p.al ? '#C8102E' : (p.bc || p.color), highlight: { background: p.color, border: '#111' }, hover: { background: p.color, border: '#111' } },
      borderWidth: p.al ? 2.6 : (p.bc ? 2.4 : 1), borderWidthSelected: 3.5, font: fuente(p) };
    if (p.forma === 'box') { o.widthConstraint = { minimum: p.caja, maximum: p.caja }; o.margin = 9; o.shapeProperties = { borderRadius: 7 }; }
    return o;
  };
  const ocultas = new Set();
  let foco = null;
  const recto = RAW_EDGES.length > 380;
  const det = r => Y.flechas[r.from + '>' + r.to] || Y.flechas[r.to + '>' + r.from] || {};
  const estiloArista = e => {
    const r = RAW_EDGES[e.id], fl = det(r), f = Y.familias[fl.f] || Y.familias.inferida;
    const con = !foco || foco.aristas.has(e.id);
    return { id: e.id, hidden: ocultas.has(fl.f || 'inferida'), width: con && foco ? f.ancho + 1.3 : f.ancho, title: undefined,
             color: { color: f.color, opacity: con ? f.opacidad : 0.05, highlight: f.color, hover: f.color },
             dashes: f.punteada, arrows: { to: { enabled: true, scaleFactor: 0.55 } }, smooth: recto ? false : { type: 'curvedCW', roundness: 0.12 } };
  };
  const pintar = () => {
    nodesDS.update(nodesDS.get().map(n => estiloNodo(n, foco && !foco.nodos.has(n.id))));
    edgesDS.update(edgesDS.get().map(estiloArista));
  };
  pintar();
  network.setOptions({ physics: { enabled: false }, nodes: { labelHighlightBold: false, scaling: { label: { drawThreshold: 5, maxVisible: 44 } } },
                       interaction: { hover: true, tooltipDelay: 150, zoomSpeed: 0.8, hideEdgesOnDrag: RAW_EDGES.length > 250, hideEdgesOnZoom: RAW_EDGES.length > 600 } });
  new MutationObserver(() => setTimeout(pintar, 30)).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const enfocar = id => { foco = { nodos: new Set([id, ...network.getConnectedNodes(id)]), aristas: new Set(network.getConnectedEdges(id)) }; pintar(); };
  network.on('selectNode', p => enfocar(p.nodes[0]));
  network.on('deselectNode', () => { foco = null; pintar(); });

  // barra: subir, familias de flecha y «Ver todo»
  const barra = document.createElement('div');
  barra.id = 'yod-barra';
  barra.innerHTML = (Y.padre ? `<a class="yod-fuerte" href="${Y.padre[0]}">↑ ${esc2(Y.padre[1])}</a>` : '') +
    Object.entries(Y.familias).filter(([k]) => Y.usadas.includes(k)).map(([k, f]) =>
      `<button type="button" data-fam="${k}" aria-pressed="true" title="${f.nombre}"><i style="background:${f.color}"></i><span class="yod-l">${f.nombre}</span><span class="yod-c">${f.corto}</span></button>`).join('') +
    '<button type="button" id="yod-todo" class="yod-fuerte">Ver todo</button>';
  document.body.appendChild(barra);
  barra.addEventListener('click', ev => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.id === 'yod-todo') { foco = null; network.unselectAll(); pintar(); ajustar(true); inicio(); return; }
    const k = b.dataset.fam; if (ocultas.has(k)) ocultas.delete(k); else ocultas.add(k);
    b.setAttribute('aria-pressed', String(!ocultas.has(k))); pintar();
  });

  // rejilla del cuadrante: los títulos crecen al alejarse para que siempre se lean
  const g = Y.rejilla, W = g.cols.reduce((s, c) => s + c.w, 0), Ht = g.filas.reduce((s, f) => s + f.h, 0);
  const MS = Math.max(70, Math.min(150, Ht * 0.07));
  const letra = (ctx, t) => { ctx.font = '600 ' + t + 'px system-ui, -apple-system, sans-serif'; };
  network.on('beforeDrawing', ctx => {
    const sc = network.getScale() || 1;
    const linea = css('--border') || '#ccc', texto = css('--text-2') || '#666', fondo = css('--panel') || '#f6f6f6';
    ctx.save();
    g.filas.forEach((f, i) => { if (i % 2 === 0) { ctx.fillStyle = fondo; ctx.globalAlpha = 0.6; ctx.fillRect(0, f.y, W, f.h); } });
    ctx.globalAlpha = 1; ctx.strokeStyle = linea; ctx.lineWidth = 1.5 / Math.min(1, sc * 1.6);
    g.cols.forEach(c => { ctx.beginPath(); ctx.moveTo(c.x, -MS); ctx.lineTo(c.x, Ht); ctx.stroke(); });
    ctx.beginPath(); ctx.moveTo(W, -MS); ctx.lineTo(W, Ht); ctx.stroke();
    g.filas.forEach(f => { ctx.beginPath(); ctx.moveTo(0, f.y); ctx.lineTo(W, f.y); ctx.stroke(); });
    ctx.beginPath(); ctx.moveTo(0, Ht); ctx.lineTo(W, Ht); ctx.stroke();
    ctx.fillStyle = texto; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'center';
    g.cols.forEach(c => {
      let t = Math.max(20, Math.min(15 / sc, MS * 0.62)); letra(ctx, t);
      while (t > 11 && ctx.measureText(c.nombre).width > c.w - 14) { t -= 1; letra(ctx, t); }
      if (ctx.measureText(c.nombre).width > c.w - 14) { const p = c.nombre.split(' '), m = Math.ceil(p.length / 2); ctx.fillText(p.slice(0, m).join(' '), c.x + c.w / 2, -t - 14); ctx.fillText(p.slice(m).join(' '), c.x + c.w / 2, -10); }
      else ctx.fillText(c.nombre, c.x + c.w / 2, -12);
    });
    ctx.textAlign = 'left';
    g.filas.forEach(f => {
      let t = Math.max(17, Math.min(14 / sc, f.h * 0.4)); letra(ctx, t);
      while (t > 12 && ctx.measureText(f.nombre).width > W - 20) { t -= 2; letra(ctx, t); }
      ctx.globalAlpha = t > 30 ? 0.42 : 0.8; ctx.fillText(f.nombre, 9, f.y + t + 5);
    });
    ctx.globalAlpha = 1; ctx.restore();
  });
  const marco = (x0, y0, x1, y1, animar) => {
    const el = document.getElementById('graph'), w = el.clientWidth, h = el.clientHeight;
    const arriba = (document.getElementById('yod-barra') || { offsetHeight: 0 }).offsetHeight + 12;
    const s = Math.max(0.04, Math.min((w - 10) / (x1 - x0), (h - arriba - 8) / (y1 - y0), 1.5));
    network.moveTo({ position: { x: (x0 + x1) / 2, y: (y0 + y1) / 2 - arriba / 2 / s }, scale: s, animation: animar ? { duration: 350, easingFunction: 'easeInOutQuad' } : false });
  };
  const ajustar = animar => marco(-14, -MS - 6, W + 14, Ht + 12, animar);
  const aFila = f => { const el = document.getElementById('graph'), r = el.clientWidth / Math.max(200, el.clientHeight - 60); marco(-10, f.y - 10, Math.min(W + 10, Math.max(540, (f.h + 20) * r)) - 10, f.y + f.h + 10, true); };
  const aCol = c => { const el = document.getElementById('graph'), r = Math.max(200, el.clientHeight - 60) / el.clientWidth; marco(c.x - 12, -MS, c.x + c.w + 12, Math.min(Ht + 10, Math.max(420, (c.w + 24) * r) - MS), true); };
  let tocado = false;
  const cont = document.getElementById('graph');
  ['pointerdown', 'wheel', 'touchstart'].forEach(ev => cont.addEventListener(ev, () => { tocado = true; }, { passive: true }));
  network.once('afterDrawing', () => { if (!foco) ajustar(false); });
  [60, 250, 700, 1500].forEach(ms => setTimeout(() => { if (!foco && !tocado) ajustar(false); }, ms));
  window.addEventListener('resize', () => setTimeout(() => { if (!foco) ajustar(false); }, 80));
  const ir = document.createElement('select'); ir.id = 'yod-ir'; ir.setAttribute('aria-label', 'Acercar a una fila o columna');
  ir.innerHTML = '<option value="">Acercar a…</option><optgroup label="Filas">' + g.filas.map((f, i) => `<option value="f${i}">${esc2(f.nombre)}</option>`).join('') +
    '</optgroup><optgroup label="Columnas">' + g.cols.map((c, i) => `<option value="c${i}">${esc2(c.nombre)}</option>`).join('') + '</optgroup>';
  barra.insertBefore(ir, barra.querySelector('button'));
  ir.addEventListener('change', () => { const v = ir.value; if (!v) return; tocado = true; if (v[0] === 'f') aFila(g.filas[+v.slice(1)]); else aCol(g.cols[+v.slice(1)]); ir.value = ''; });

  // panel de detalle
  const enlace = (t, id) => t[0] ? `<a href="${t[0]}#${encodeURIComponent(id)}">${esc2(t[1])}</a>` : esc2(t[1]);
  window.showInfo = function (nodeId) {
    const p = Y.nodos[nodeId]; if (!p) return;
    const eds = network.getConnectedEdges(nodeId);
    const vecinos = eds.map(eid => {
      const r = RAW_EDGES[eid], otro = r.from === nodeId ? r.to : r.from, fl = det(r), q = Y.nodos[otro] || {};
      return `<span class="neighbor-link" style="border-left-color:${esc2((Y.familias[fl.f] || {}).color || '#888')}" data-nid="${esc2(otro)}">${r.from === nodeId ? '→' : '←'} ${esc2(q.nombre || otro)} <i style="opacity:.72">· ${esc2(fl.r || '')}</i></span>`;
    }).join('');
    let h = `<div class="field"><b>${esc2(p.nombre)}</b></div><div class="field yod-tipo">${esc2(p.tipo)}${p.estado ? ' · ' + esc2(p.estado) : ''}</div>`;
    if (p.dentro) h += `<a class="yod-entrar" href="${p.dentro[0]}">Entrar a ${esc2(p.dentro[1])} →</a>`;
    if (p.nota) h += `<div class="field">${esc2(p.nota)}</div>`;
    if (p.err) h += p.err.map(x => `<div class="field yod-alerta"><b>${x.tipo === 'cambio' ? 'Cambió' : 'Error'}</b> · ${esc2(x.msg)}${x.desde ? ' · desde ' + esc2(String(x.desde).slice(0, 10)) : ''}${x.url ? ` · <a href="${esc2(x.url)}" target="_blank" rel="noopener" style="color:inherit">ver</a>` : ''}</div>`).join('');
    if (p.al) h += p.al.map(a => `<div class="field yod-alerta"><b>Hallazgo</b> · <a href="hallazgos.html#${encodeURIComponent(a[0])}" style="color:inherit">${esc2(a[1])}</a></div>`).join('');
    if (p.lista) h += `<details class="yod-lista"${p.lista.length <= 24 ? ' open' : ''}><summary>${esc2(p.lt)}</summary><div>${p.lista.map(x => `<span>${esc2(x)}</span>`).join('')}</div></details>`;
    if (p.ev) h += `<div class="field yod-ev">Evidencia: ${esc2(p.ev)}</div>`;
    if (p.url) h += `<a class="yod-abrir" href="${esc2(p.url)}" target="_blank" rel="noopener">Abrir la fuente ↗</a>`;
    if (p.tb && p.tb.length) h += `<div class="field yod-tb">También aparece en: ${p.tb.map(t => enlace(t, nodeId)).join(' · ')}</div>`;
    h += `<div class="field yod-ev">Celda: ${esc2(p.celda)}</div>`;
    if (eds.length) h += `<div class="field" style="margin-top:8px;color:var(--text-2);font-size:11px">Conexiones (${eds.length})</div><div id="neighbors-list">${vecinos}</div>`;
    document.getElementById('info-content').innerHTML = h;
  };
  window.focusNode = function (id) {
    const p = Y.nodos[id] || {}, el = document.getElementById('graph');
    const s = p.forma === 'box' ? Math.min(1, (el.clientWidth - 24) / ((p.caja || 300) + 40)) : Math.min(0.9, Math.max(0.6, el.clientWidth / 520));
    network.focus(id, { scale: s, animation: true }); network.selectNodes([id]); showInfo(id); enfocar(id);
  };
  const inicio = () => { const c = document.getElementById('info-content');
    if (c) c.innerHTML = `<div class="field"><b>${esc2(Y.titulo)}</b></div><div class="field">${esc2(Y.sub)}</div><div class="field yod-ev">Toca un nodo para ver qué es, de dónde le llega y a dónde va. Con «Acercar a…» saltas a una fila o a una columna.</div>`; };
  inicio();
  network.on('click', p => {
    if (p.nodes.length) return;
    if (p.edges.length) {
      const r = RAW_EDGES[p.edges[0]], fl = det(r), a = Y.nodos[r.from] || {}, b = Y.nodos[r.to] || {};
      document.getElementById('info-content').innerHTML = `<div class="field"><b>${esc2(a.nombre)} → ${esc2(b.nombre)}</b></div><div class="field">${esc2(fl.r || '')}</div>` +
        `<div class="field yod-tipo">${esc2((Y.familias[fl.f] || {}).nombre || '')}</div>` + (fl.nota ? `<div class="field">${esc2(fl.nota)}</div>` : '') +
        (fl.ev ? `<div class="field yod-ev">Evidencia: ${esc2(fl.ev)}</div>` : '') +
        `<span class="neighbor-link" data-nid="${esc2(r.from)}">← ${esc2(a.nombre)}</span><span class="neighbor-link" data-nid="${esc2(r.to)}">→ ${esc2(b.nombre)}</span>`;
      return;
    }
    const c = p.pointer.canvas;
    if (c.y < 0 && c.y > -MS - 30) { const col = g.cols.find(k => c.x >= k.x && c.x <= k.x + k.w); if (col) { aCol(col); return; } }
    inicio();
  });
  network.on('doubleClick', p => { const d = p.nodes.length && Y.nodos[p.nodes[0]] && Y.nodos[p.nodes[0]].dentro; if (d) yodIr(d[0]); });

  // textos del visor en español
  const tx = (sel, t) => { const el = document.querySelector(sel); if (el) el.textContent = t; };
  tx('#info-panel h3', 'Detalle'); tx('#legend-wrap h3', 'Celdas de esta lámina');
  const inp = document.getElementById('search'); if (inp) inp.placeholder = 'Buscar en esta lámina…';
  const lbl = document.querySelector('#legend-controls label'); if (lbl) lbl.lastChild.textContent = 'Todas';
  document.querySelectorAll('[data-theme-choice]').forEach(b => { b.textContent = { light: 'Claro', dark: 'Oscuro', system: 'Sistema' }[b.dataset.themeChoice] || b.textContent; });
  const st = document.getElementById('stats'); if (st) st.textContent = Y.pie;
  const sim = document.createElement('div'); sim.id = 'yod-simbolos';
  sim.innerHTML = Y.simbolos.map(s => `<b><span style="color:${s[1]}">${s[0]}</span> ${esc2(s[2])}</b>`).join('');
  if (st && st.parentNode) st.parentNode.insertBefore(sim, st);

  // errores en vivo: estado.json lo escribe el flujo «Grafo · estado» del repositorio
  fetch(Y.estado || 'estado.json', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(E => {
    if (!E || !E.errores) return; let n = 0;
    E.errores.forEach(x => (x.nodos || []).forEach(id => { const p = Y.nodos[id]; if (!p) return; (p.err = p.err || []).push(x); if (x.tipo !== 'cambio') { p.al = p.al || []; p.bc = '#C8102E'; } else if (!p.bc) p.bc = '#C99A12'; n++; }));
    if (n) { pintar(); const st2 = document.getElementById('stats'); if (st2) st2.textContent = Y.pie + ' · estado del ' + (E.generado || '').slice(0, 16).replace('T', ' ') + ' UTC'; }
  }).catch(() => {});
  // llegar con un nodo señalado en la liga, y avisar a la portada qué lámina es
  const abrir = () => { let id = ''; try { id = window.YOD_FOCO || decodeURIComponent(location.hash.slice(1)); } catch (e) {} if (Y.nodos[id]) focusNode(id); };
  if (window.YOD_FOCO || location.hash.length > 1) setTimeout(abrir, 280);
  window.addEventListener('hashchange', abrir);
  try { if (window.parent && window.parent !== window) window.parent.postMessage({ yod: 1, id: Y.id }, '*'); } catch (e) {}
})();
"""
FORMA_TXT = {'square': '■', 'box': '▭', 'diamond': '◆', 'hexagon': '⬢', 'triangle': '▲', 'triangleDown': '▼', 'dot': '●', 'star': '★'}
TRAD = [('placeholder="Search nodes..."', 'placeholder="Buscar…"'), ('<h3>Node Info</h3>', '<h3>Detalle</h3>'), ('Click a node to inspect it', 'Toca un nodo para ver su detalle'),
        ('<h3>Communities</h3>', '<h3>Grupos</h3>'), ('Select All</label>', 'Todos</label>'), ('>Light</button>', '>Claro</button>'), ('>Dark</button>', '>Oscuro</button>'),
        ('>System</button>', '>Sistema</button>'), ("'node' : 'nodes'", "'nodo' : 'nodos'"), ('<html lang="en">', '<html lang="es">')]

def tema_sistema(html):
    """Sin elección guardada, el visor sigue el tema del teléfono (Graphify trae oscuro por omisión)."""
    a = "    : 'dark';\n  document.documentElement.setAttribute('data-theme', t);"
    if a in html:
        html = html.replace(a, "    : window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';\n  document.documentElement.setAttribute('data-theme', t);", 1)
    html = html.replace('applyTheme(themePref());', "applyTheme(themePref() || 'system');", 1)
    html = html.replace("String(b.dataset.themeChoice === (pref || 'dark'))", "String(b.dataset.themeChoice === (pref || 'system'))", 1)
    return html

def js_seguro(o): return json.dumps(o, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/').replace('\u2028', '\\u2028').replace('\u2029', '\\u2029')

def html_lamina(lam, A, titulos, salida):
    """A = resultado de armar(lam) ya con 'dentro' y 'tb'. Escribe salida/<id>.html y regresa (nodos, flechas)."""
    G = nx.Graph(); com = collections.defaultdict(list); cid = {}
    for i, d in A['nodos'].items():
        ce = A['celda'][i]; k = cid.setdefault(ce, len(cid)); com[k].append(i)
        G.add_node(i, label=d['nombre'], file_type=(N[i].get('ft') if i in N else 'concept') or 'concept', source_file=d.get('ev') or '', community=k)
    for (a, b), e in A['ar'].items():
        G.add_edge(a, b, relation=e['r'], confidence='EXTRACTED' if e['f'] == 'viva' else 'INFERRED', source_file=e.get('ev') or '', _src=a, _tgt=b)
    etiquetas = {k: f"{A['rn'][ce[1]]} · {A['cn'][ce[0]]}" for ce, k in cid.items()}
    destino = f'{salida}/{lam.id}.html'
    with contextlib.redirect_stdout(io.StringIO()):
        ok = to_html(G, dict(com), destino, community_labels=etiquetas, node_limit=20000)
    assert ok, lam.id
    html = open(destino, encoding='utf-8').read()
    usadas = sorted({e['f'] for e in A['ar'].values()}, key=list(FAMILIAS).index)
    Y = dict(id=lam.id, titulo=lam.titulo, sub=lam.sub, padre=[lam.padre + '.html', titulos[lam.padre]] if lam.padre else None, nodos=A['nodos'],
             flechas={f'{a}>{b}': {k: v for k, v in e.items() if v} for (a, b), e in A['ar'].items()}, familias=FAMILIAS, usadas=usadas, rejilla=A['rejilla'],
             eje_x=lam.eje_x, eje_y=lam.eje_y, estado=ESTADO_URL, simbolos=[[FORMA_TXT[f], c, t] for f, c, t in SIMBOLOS],
             pie=f"{len(A['nodos'])} nodos · {len(A['ar'])} flechas · {lam.titulo} · Graphify {VERSION}")
    ancla = "physics: {\n    enabled: true,"
    assert ancla in html, 'cambió la plantilla de Graphify (physics)'
    html = html.replace(ancla, "physics: {\n    enabled: false,", 1)
    html = tema_sistema(html)
    for a, b in TRAD: html = html.replace(a, b)
    html = html.replace('</head>', CSS + '<script id="yod-datos">window.YOD = ' + js_seguro(Y) + ';</script>\n</head>', 1)
    ancla = "network.once('stabilizationIterationsDone', () => {"
    assert ancla in html, 'cambió la plantilla de Graphify (stabilization)'
    html = html.replace(ancla, JS + '\n' + ancla, 1)
    html = re.sub(r'<title>[^<]*</title>', '<title>%s · YOD OS en Graphify</title>' % H_.escape(lam.titulo), html, 1)
    html = html.replace('<meta charset="UTF-8">', '<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">', 1) if 'name="viewport"' not in html else html
    assert '<meta charset="UTF-8">' in html, 'cambió la plantilla de Graphify (charset)'
    html = html.replace('<meta charset="UTF-8">', '<meta charset="UTF-8">\n' + NO_INDEXAR, 1)    # el repositorio es público: que los buscadores no lo guarden
    open(destino, 'w', encoding='utf-8').write(html)
    return len(A['nodos']), len(A['ar']), len(html)
