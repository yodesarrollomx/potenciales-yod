/* Vista del libro operativo. El servidor autentica y Sheets calcula cada salida. */
(function (root) {
  'use strict';
  var grupos = [
    ['Terreno y objetivo', ['plan.nombre','plan.ubicacion','plan.objetivo','plan.tipo','terreno.m2','terreno.frente','tierra.valor']],
    ['Producto base', ['producto.nombre','producto.destino','producto.unidades','producto.area','producto.precio','producto.renta','producto.ritmo']],
    ['Alternativas y decisión', ['ruta.decision','opcion.nombre','opcion.tamano','opcion.precio','opcion.base_precio','opcion.ritmo','ruta.escenario']]
  ];
  var hojas = { inicio:310030, ruta:310033, predios:310054, programas:310032, escenarios:310031, decision:310051,
    candados:1258521830, movimientos:310034, rendimiento:310056, grafo:310035, fuentes:310037, datos:465683852 };
  var pasos = {
    5:['plan.nombre','datos','C6'], 6:['plan.objetivo','datos','C9'], 7:['terreno.m2','predios','A5'],
    8:['producto.nombre','programas','A5'],9:['producto.unidades','programas','E5'],
    10:['','candados','E11'],11:['','candados','E12'],12:['opcion.nombre','escenarios','A5'],
    13:['norma.zona','candados','E5'],14:['costo.m2_obra','datos','C41'],15:['fin.corte','candados','E13'],
    16:['','inicio','B15'],17:['','movimientos','A5'],18:['acuerdo.firmado','datos','C15'],19:['producto.precio','programas','G5']
  };
  function opciones(clave,r) {
    if(clave==='ruta.escenario') return String(r['ppp.escenarios'] || 'BASE').split('\n').filter(Boolean);
    return {'producto.destino':['Venta','Renta','Reserva','Uso propio'],'ruta.decision':['Explorar','Comparar','Estructurar','Ver frutos'],
      'opcion.base_precio':['Por m²','Por unidad']}[clave] || null;
  }
  function dibujar(plan, herramientas) {
    var r=plan.resumen, esc=herramientas.esc, editable=(plan.puede || {}).editar && herramientas.fresco;
    var datos=new Map((plan.datos || []).map(function(d){return [d.clave,d];}));
    function libro(etiqueta,tab,celda) {
      if(!plan.libro_url) return '';
      return '<a class="p2-btn suave" target="_blank" rel="noopener" href="'+esc(plan.libro_url)+'#gid='+hojas[tab]+'&amp;range='+celda+'">'+esc(etiqueta)+'</a>';
    }
    function editar(clave,label) {
      return editable && datos.has(clave) ? '<button type="button" class="p2-btn suave" data-accion="editar-dato" data-clave="'+esc(clave)+'">'+esc(label)+'</button>' : '';
    }
    function dato(clave) {
      var d=datos.get(clave);
      if(!d)return '';
      return '<div class="ppp-factor"><div><strong>'+esc(d.concepto)+'</strong><small>'+herramientas.valor(d)+
        (d.estado?' · '+esc(d.estado):'')+(d.fuente?' · '+esc(d.fuente):'')+'</small></div>'+editar(clave,'Editar')+'</div>';
    }
    function bloque(titulo,claves) {
      return '<details class="ppp-grupo"><summary>'+esc(titulo)+'</summary>'+claves.map(dato).join('')+'</details>';
    }
    function cifra(clave,unidad) {
      var valor=r['ppp.'+clave];
      if(typeof valor!=='number') return esc(valor || 'Pendiente');
      return esc(valor.toLocaleString('es-MX',{maximumFractionDigits:2})+(unidad?' '+unidad:''));
    }
    var paso=pasos[Number(r['ppp.paso_fila'])];
    var respuesta='';
    if(paso) {
      var clave=paso[0];
      if(Number(r['ppp.paso_fila'])===8 && datos.get('producto.nombre') && datos.get('producto.nombre').valor) clave='producto.destino';
      if(Number(r['ppp.paso_fila'])===19 && datos.get('producto.destino') && datos.get('producto.destino').valor==='Renta') clave='producto.renta';
      if(Number(r['ppp.paso_fila'])===9){
        var u=datos.get('producto.unidades');
        if(u && Number(u.valor)>0)clave='producto.area';
      }
      respuesta=editar(clave,'Capturar dato') + libro('Abrir este paso en Sheets',paso[1],paso[2]);
    }
    var incluidas=new Set(grupos.reduce(function(all,g){return all.concat(g[1]);},[]));
    var resto=Array.from(datos.keys()).filter(function(c){return !incluidas.has(c) && c!=='predio.alcance' && c!=='plan.caso_ppp';});
    return '<nav class="p2-migas"><a href="#/">Planes de potencial</a><span> / </span><span>'+esc(r['ppp.escenario'] || 'BASE')+'</span></nav>'+
      '<header class="p2-cabeza"><div><div class="p2-sobre">'+esc(r['ppp.etapa'] || 'Semilla')+'</div><h1>'+esc(r['plan.nombre'] || 'Plan de potencial')+'</h1>'+
      '<p class="p2-intro">'+esc(r['plan.ubicacion'] || '')+'</p></div>'+libro('Abrir mi libro de Sheets','inicio','A1')+'<button class="p2-btn suave" type="button" data-accion="refrescar">Actualizar desde Sheets</button></header>'+
      '<section class="ppp-paso"><div class="p2-sobre">'+esc(r['ppp.decision'] || 'Explorar')+'</div><h2>'+esc(r['ppp.pregunta'] || 'Revisa la ruta del plan')+'</h2><div class="p2-acciones">'+respuesta+'</div></section>'+
      '<section><h2>Escenario '+esc(r['ppp.escenario'] || 'BASE')+'</h2><div class="ppp-resultados">'+
      [['Unidades del grupo','unidades',''],['Ventas potenciales','ventas','MXN'],['Renta potencial mensual','renta','MXN/mes'],['Efectivo recibido por el dueño','efectivo','MXN']].map(function(m){return '<div><small>'+esc(m[0])+'</small><strong>'+cifra(m[1],m[2])+'</strong></div>';}).join('')+'</div></section>'+
      '<section><h2>Captura por factores</h2>'+grupos.map(function(g){return bloque(g[0],g[1]);}).join('')+bloque('Norma, costos, calendario y capital',resto)+'</section>'+
      (plan.libro_url?'<section><h2>Trabajar en Sheets</h2><div class="p2-acciones">'+
        [['Ruta','ruta'],['Predios','predios'],['Programas','programas'],['Escenarios','escenarios'],['Comparación','decision'],['Movimientos','movimientos'],['Rendimiento del dueño','rendimiento'],['Grafo','grafo'],['Fuentes','fuentes']].map(function(p){return libro(p[0],p[1],'A1');}).join('')+'</div></section>':'');
  }
  root.PPPUnico={dibujar:dibujar,opciones:opciones};
})(window);
