/* Controles del grafo del sistema en Accesos: versión aprobada, borrador en revisión, rehacer, vista previa,
   presentaciones que lo leen y registro.

   Aquí no hay claves ni se pide ninguna. «Rehacer grafo» abre un pedido en GitHub (como «Mandar a Claude» de la
   chinche); el flujo «Grafo · rehacer» del repositorio lo arma como BORRADOR en la rama grafo-borrador, con su PR.
   Al terminar, aquí se pregunta: ¿aprobar ya o dejarlo en borrador? Aprobar es fusionar ese PR; en borrador, las
   presentaciones y sus ligas siguen igual. Lo aprobado se lee de grafo/versiones.json (esta misma página); lo vivo
   (borrador, errores, registro) de la rama de datos `grafo-datos`, porque la rama principal está protegida y los
   flujos no escriben en ella. */
(function (root) {
  'use strict';
  const REPO = 'yodesarrollomx/potenciales-yod';
  const CRUDO = 'https://raw.githubusercontent.com/' + REPO + '/grafo-datos/';
  const PRESENTAR = 'https://yodesarrollomx.github.io/yodesarrollo-board/presentacion/grafo/';
  const PEDIDO = 'https://github.com/' + REPO + '/issues/new';
  const PEDIDOS = 'https://github.com/' + REPO + '/issues?q=' + encodeURIComponent('Rehacer grafo in:title');
  const ID = /^G-[0-9]{8}-[0-9]{4}$/;
  /* La liga del borrador sólo puede ser de este repositorio en GitHub; cualquier otra cosa se cambia por su lista de PR. */
  const ligaSegura = u => { const t = String(u || ''); return t.startsWith('https://github.com/' + REPO + '/pull/') || t.startsWith('https://github.com/' + REPO + '/compare/') ? t : 'https://github.com/' + REPO + '/pulls'; };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const QUE = { 'aparece': 'Apareció', 'se resuelve': 'Se resolvió', 'grafo rehecho (borrador)': 'Grafo rehecho, en borrador', 'grafo aprobado': 'Grafo aprobado', 'borrador descartado': 'Borrador descartado' };

  /* Qué decir con lo leído. Función pura: la usan la página y las pruebas. */
  function resumir({ versiones, borrador, estado }) {
    const V = versiones && Array.isArray(versiones.versiones) ? versiones : null;
    const aprobada = V ? V.versiones.find(v => v.id === V.aprobado) || null : null;
    const hayBorrador = !!(borrador && ID.test(String(borrador.id || '')) && (!V || borrador.id !== V.aprobado));
    const errores = estado && Array.isArray(estado.errores) ? estado.errores : [];
    const conError = errores.filter(x => x.tipo !== 'cambio').length, conCambio = errores.filter(x => x.tipo === 'cambio').length;
    return { aprobada, borrador: hayBorrador ? { ...borrador, liga: ligaSegura(borrador.liga), conPR: Number(borrador.pr) > 0, atrasado: borrador.atrasado === true } : null, conError, conCambio,
      revisado: estado && estado.generado ? String(estado.generado) : '',
      audiencias: (hayBorrador && borrador.audiencias && borrador.audiencias.length ? borrador.audiencias : null) || ['Cliente o inversionista', 'Dueño del terreno', 'Departamentos, lotes o casas'] };
  }
  function ligaPedido(motivo) {
    const cuerpo = 'Pedido desde Accesos para rehacer el grafo del sistema.\n\n' + (motivo ? 'Motivo: ' + motivo.slice(0, 280) + '\n\n' : '') +
      'Al enviar este pedido, el flujo «Grafo · rehacer» arma el grafo nuevo como borrador y contesta aquí con la liga para aprobarlo.';
    return PEDIDO + '?title=' + encodeURIComponent('🕸️ Rehacer grafo') + '&body=' + encodeURIComponent(cuerpo);
  }
  function hora(iso) {
    const d = new Date(iso); if (isNaN(d)) return '';
    return d.toLocaleString('es-MX', { timeZone: 'America/Hermosillo', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  function montar({ caja, marco, etiqueta, base = 'grafo/', fetchImpl = (...a) => root.fetch(...a), abrir = u => root.open(u, '_blank', 'noopener') }) {
    let vivo = true, viendoBorrador = false, plegado = '', enviado = false, datos = { versiones: null, borrador: null, estado: null, registro: [] }, reloj = null, vueltas = 0;
    const json = (u, opc) => fetchImpl(u, { cache: 'no-store', credentials: 'omit', ...(opc || {}) }).then(r => r.ok ? r.json() : null).catch(() => null);
    const texto = u => fetchImpl(u, { cache: 'no-store', credentials: 'omit' }).then(r => r.ok ? r.text() : '').catch(() => '');
    const fresco = () => '?t=' + Math.floor(Date.now() / 30000);      // el servidor de archivos crudos guarda copia unos minutos

    async function leer() {
      const [versiones, borrador, estado, reg] = await Promise.all([json(base + 'versiones.json'), json(CRUDO + 'borrador.json' + fresco()), json(CRUDO + 'estado.json' + fresco()), texto(CRUDO + 'registro.jsonl' + fresco())]);
      if (!vivo) return;
      const registro = String(reg || '').split('\n').filter(Boolean).slice(-14).map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean).reverse();
      datos = { versiones, borrador, estado, registro }; pintar();
    }
    function mostrar(borr) {
      viendoBorrador = !!borr; const src = base + 'index.html' + (borr ? '?rama=grafo-borrador' : '');
      if (marco && marco.getAttribute('src') !== src) marco.setAttribute('src', src);
      pintar();
    }
    function pintar() {
      if (!vivo || !caja) return;
      const R = resumir(datos), a = R.aprobada, b = R.borrador;
      if (!b && viendoBorrador) { viendoBorrador = false; if (marco) marco.setAttribute('src', base + 'index.html'); }
      if (etiqueta) etiqueta.textContent = !datos.estado ? '· aún sin revisar' :
        '· ' + (R.conError ? R.conError + ' con error' : 'sin errores') + (R.conCambio ? ' · ' + R.conCambio + ' con cambios sin reflejar' : '') + (R.revisado ? ' · revisado ' + hora(R.revisado) : '');
      const pres = R.audiencias.map(n => '<span class="gc-chip">' + esc(n) + '</span>').join('');
      caja.innerHTML =
        '<div class="gc-fila">' +
          '<span class="gc-ver" title="Es el grafo que leen las presentaciones">Aprobado <b>' + esc(a ? a.id : 'sin dato') + '</b>' + (a ? ' · ' + esc(a.fecha || hora(a.armado)) + ' · ' + Number(a.piezas || 0).toLocaleString('es-MX') + ' piezas' : '') + '</span>' +
          (b ? '<button type="button" class="gc-ver gc-borr" data-gc="desplegar" title="Ver el aviso del borrador">Borrador <b>' + esc(b.id) + '</b> en revisión</button>' : '') +
        '</div>' +
        (b && plegado !== b.id ? '<div class="gc-aviso"><b>' + esc(b.titulo || 'Hay un grafo nuevo en borrador') + '</b><p>' + esc(b.resumen || '') + '</p>' +
              (b.atrasado ? '<p class="gc-nota"><b>Este borrador quedó atrás de otros cambios.</b> Antes de aprobarlo, toca «Rehacer otra vez»: sale uno nuevo, al día.</p>' : '') +
              '<p class="gc-pregunta">¿Lo apruebas ya o lo dejas en borrador?</p>' +
              '<p class="gc-nota"><b>Aprobar ya:</b> las presentaciones se arman solas con el grafo nuevo. <b>Dejar en borrador:</b> siguen leyendo el aprobado' + (a ? ' ' + esc(a.id) : '') + ' y sus ligas no cambian.' +
              (b.sin_campo && b.sin_campo.length ? ' Ojo: ' + b.sin_campo.length + (b.sin_campo.length === 1 ? ' dato de las presentaciones ya no existe' : ' datos de las presentaciones ya no existen') + ' en el plan.' : '') + '</p>' +
              '<div class="gc-fila"><button type="button" class="btn mini" data-gc="ver">' + (viendoBorrador ? 'Ver el aprobado' : 'Ver el borrador') + '</button>' +
              '<a class="btn mini" data-gc="aprobar" href="' + esc(b.liga) + '" target="_blank" rel="noopener">Aprobar ya ↗</a>' +
              '<button type="button" class="btn mini" data-gc="plegar">Dejar en borrador</button></div>' +
              '<p class="gc-nota">' + (b.conPR ? 'Para aprobar, en esa página: si GitHub muestra «Approve workflows to run», tócalo primero (sólo deja correr las pruebas; con la App del grafo no sale); cuando queden en verde, toca «Merge pull request». Cerrar el PR sin fusionar lo descarta.'
                : 'Para aprobar, en esa página toca «Create pull request» y luego «Merge pull request».') + '</p></div>' : '') +
        '<div class="gc-fila"><button type="button" class="btn mini" data-gc="rehacer">' + (b ? 'Rehacer otra vez' : 'Rehacer grafo') + '</button>' +
          (R.conCambio && !b ? '<span class="gc-nota">' + R.conCambio + (R.conCambio === 1 ? ' repositorio cambió' : ' repositorios cambiaron') + ' desde que se armó.</span>' : '') + '</div>' +
        (enviado && !b ? '<p class="gc-nota" data-gc="enviado">Pedido enviado. En unos minutos aparece aquí el borrador. Si el grafo ya estaba al día, o algo falló, la respuesta queda en el pedido. ' +
          '<a href="' + PEDIDOS + '" target="_blank" rel="noopener">Ver pedidos ↗</a></p>' : '') +
        '<div class="gc-confirma" data-gc="confirma" hidden><p>Rehacer vuelve a leer los repositorios y el atlas y deja un <b>borrador</b>; nada cambia hasta que lo apruebes. ' +
          'Si el repositorio tiene clave de OpenAI o de Claude, pregunta a las dos y usa la primera que conteste: <b>gasta una consulta</b>.</p>' +
          '<input type="text" data-gc="motivo" maxlength="280" placeholder="Motivo (opcional; queda público en GitHub)" aria-label="Motivo del pedido. Queda público en GitHub.">' +
          '<div class="gc-fila"><button type="button" class="btn mini" data-gc="si">Sí, pedir que se rehaga ↗</button><button type="button" class="btn mini rojo" data-gc="no">Cancelar</button></div>' +
          '<p class="gc-nota">Se abre GitHub con el pedido listo: sólo toca «Create» o «Submit new issue». En unos minutos aparece aquí el borrador.</p></div>' +
        '<details class="gc-det"><summary>Presentaciones que leen este grafo</summary><div class="gc-fila">' + pres + '</div>' +
          '<p class="gc-nota">Se arman con el grafo aprobado y el plan guardado de cada caso. <a href="' + PRESENTAR + '" target="_blank" rel="noopener">Abrir presentación desde el grafo ↗</a></p></details>' +
        '<details class="gc-det"><summary>Registro</summary>' + (datos.registro.length ? '<ul class="gc-reg">' + datos.registro.map(l =>
          '<li><span>' + esc(hora(l.cuando)) + '</span> <b>' + esc(QUE[l.que] || l.que || '') + '</b> ' + esc(l.id || l.msg || '') + (l.por ? ' · ' + esc(l.por) : '') + (l.ia ? ' · IA ' + esc(l.ia) : '') + '</li>').join('') + '</ul>'
          : '<p class="gc-nota">Aún no hay movimientos. El primero aparece cuando corra la siguiente revisión.</p>') + '</details>';
    }
    function alClic(e) {
      const t = e.target && e.target.closest ? e.target.closest('[data-gc]') : null; if (!t) return;
      const que = t.getAttribute('data-gc'), conf = caja.querySelector('[data-gc="confirma"]');
      if (que === 'ver') mostrar(!viendoBorrador);
      else if (que === 'plegar') { const b = resumir(datos).borrador; plegado = b ? b.id : ''; if (viendoBorrador) mostrar(false); else pintar(); }
      else if (que === 'desplegar') { plegado = ''; pintar(); }
      else if (que === 'rehacer' && conf) { conf.hidden = false; const m = conf.querySelector('[data-gc="motivo"]'); if (m && m.focus) m.focus(); }
      else if (que === 'no' && conf) conf.hidden = true;
      else if (que === 'si') {
        const m = caja.querySelector('[data-gc="motivo"]'); abrir(ligaPedido(m ? String(m.value || '').trim() : ''));
        enviado = true; pintar();
        vueltas = 0; clearInterval(reloj); reloj = setInterval(() => { if (!vivo || ++vueltas > 24) { clearInterval(reloj); return; } leer(); }, 30000);   // doce minutos atento al borrador
      }
    }
    caja.addEventListener('click', alClic);
    pintar(); leer();
    return { leer, mostrar, detener() { vivo = false; clearInterval(reloj); caja.removeEventListener('click', alClic); caja.textContent = ''; } };
  }

  const api = { montar, resumir, ligaPedido, CRUDO, REPO };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.YodGrafo = api;
})(typeof window !== 'undefined' ? window : globalThis);
