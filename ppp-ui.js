/* PPP · presentation only. The active engine/Sheets response owns every result.
   Existing controls are moved, never cloned. No network or financial engine here. */
(function (root) {
  'use strict';
  const ids = ['dArq', 'dVentas', 'dCostos', 'dMacro', 'dDota'];
  const titles = ['Arquitectura', 'Ventas e ingresos', 'Costos', 'Macro y crédito', 'Dotaciones'];
  const valid = v => typeof v === 'number' && Number.isFinite(v);
  const num = (v, d = 0) => valid(v) ? v.toLocaleString('es-MX', {maximumFractionDigits:d}) : '—';
  const money = v => valid(v) ? '$' + num(v / 1e6, 2) + ' M' : '—';
  const percent = v => valid(v) ? num(v * 100, 1) + '%' : '—';
  const sum = (...a) => a.every(valid) ? a.reduce((x,y)=>x+y,0) : null;
  const ratio = (a,b) => valid(a) && valid(b) && b > 0 ? a/b : null;
  const E = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const metric = (label,value,unit='',help='') => ({label,value,unit,help});
  const section = (title, items, note='') => ({title,items,note});
  // Sums/ratios below describe composition or reconciliation, never recalculate returns.
  function describe(r) {
    const p=r.p||{}, finance=sum(r.interest,r.feeDebt), total=sum(r.projectCost,finance);
    const mixedArea = [r.mixLoftUnits,p.m2Loft,r.mix2Units,p.m22Rec,r.mix3Units,p.m23Rec].every(valid)
      ? r.mixLoftUnits*p.m2Loft+r.mix2Units*p.m22Rec+r.mix3Units*p.m23Rec : null;
    const delta=valid(mixedArea)&&valid(r.resSell)?r.resSell-mixedArea:null;
    const area = n => num(n,1)+' m²', volume=n=>num(n,2)+' m³';
    return [
      {main:num(r.units)+' departamentos', sub:num(r.totalFloors)+' pisos · '+num(r.height,1)+' m · '+area(r.vendTotal)+' vendibles',
        note: valid(delta)&&Math.abs(delta)>.5 ? area(Math.abs(delta))+' por conciliar con la mezcla' : '',
        graphic:{kind:'architecture',values:[ratio(p.terrain,10000),ratio(r.height,120),ratio(r.floorPlate,p.terrain)],labels:['Terreno','Volumen edificado'],floors:r.totalFloors,plate:r.floorPlate,terrain:p.terrain,caption:'Volumen conceptual · altura 0–120 m · terreno 0–10,000 m²'},
        sections:[section('Terreno y capacidad',[metric('Terreno',area(p.terrain),'','lblTerreno'),metric('Huella máxima · COS '+percent(p.cos),area(r.footprint),'','lblHuella'),metric('Sobre rasante · CUS '+num(p.cus,2),area(r.gross),'','lblConstruible'),metric('Altura máxima supuesta',num(p.altMax,1)+' m')],'La envolvente indica capacidad; no acredita un permiso.'),
          section('Superficies',[metric('Vivienda vendible',area(r.resSell),'','lblVendViv'),metric('Locales vendibles',area(r.comSell),'','lblVendLoc'),metric('Vivienda bruta',area(r.resGross)),metric('Comercio bruto',area(r.com)),metric('Total vendible',area(r.vendTotal),'','lblVendTotal')]),
          section('Mezcla de departamentos',[metric('Tipología A',num(r.mixLoftUnits)+' × '+area(p.m2Loft)),metric('Tipología B',num(r.mix2Units)+' × '+area(p.m22Rec)),metric('Tipología C',num(r.mix3Units)+' × '+area(p.m23Rec))],valid(delta)?'Área de la mezcla '+area(mixedArea)+' · diferencia '+area(delta):'Inventario pendiente de conciliar.'),
          section('Programa y estacionamiento',[metric('Depas por piso',num(p.deptosPiso)),metric('Cajones totales',num(r.spaces),'','lblCajonesTot'),metric('Amenidades',area(r.amenidades),'','lblAmenidades'),metric('Sótanos construidos',area(r.basementArea)),metric('Locales',num(p.localesPB)),metric('Sótanos',num(r.basements))])]},
      {main:money(r.sales)+' proyectados',sub:'Lista $'+num(p.preViv)+'/m² · preventa modelada '+percent(r.preventaEfectiva),note:'',
        graphic:{kind:'sales',values:[ratio(sum(r.presaleRev,r.postRev),r.sales),ratio(r.comRev,r.sales),ratio(r.parkingRev,r.sales)],labels:['Vivienda','Locales','Cajones'],caption:'Participación en las ventas · escala 0–100%'},
        sections:[section('De dónde sale el ingreso',[metric('Vivienda',money(sum(r.presaleRev,r.postRev))),metric('Locales',money(r.comRev)),metric('Cajones',money(r.parkingRev)),metric('Venta total',money(r.sales))],'Proyección del modelo; no son contratos firmados. Confirmar si los cajones se cobran por separado.'),
          section('Precio y ritmo comercial',[metric('Precio lista','$'+num(p.preViv)+'/m²'),metric('Descuento preventa',percent(p.desc)),metric('Preventa efectiva',percent(r.preventaEfectiva)),metric('Unidades equivalentes',num(r.presaleUnits,1)),metric('Ritmo de preventa',num(r.presaleUnitsPerMonth,2)+' / mes'),metric('Captación',num(p.preMonths)+' meses')]),
          section('Calendario de cobro',[metric('Preventa',money(r.presaleRev)),metric('Vivienda en entrega',money(r.postRev)),metric('A la firma',percent(p.eng)+' de preventa'),metric('Durante obra',percent(p.obra)+' de preventa'),metric('Ventana de entrega',num(p.delivery)+' meses')],'Los importes mensuales completos se conservan en Herramientas → flujo.') ]},
      {main:money(total)+' total',sub:'Obra '+money(r.hard)+' · financiamiento '+money(finance),note:'',
        graphic:{kind:'costs',values:[ratio(r.hard,total),ratio(valid(r.projectCost)&&valid(r.hard)?r.projectCost-r.hard:null,total),ratio(finance,total)],labels:['Obra','Otros costos','Financiación'],caption:'Composición del costo · escala 0–100%'},
        sections:[section('Costo completo',[metric('Obra directa',money(r.hard),'','lblObraTotal'),metric('Terreno',money(r.land)),metric('Indirectos',money(r.indirect)),metric('Contingencia',money(r.cont)),metric('Legal',money(r.legal)),metric('Comisión de ventas',money(r.commission)),metric('Escrituración',money(r.closing)),metric('Antes de financiar',money(r.projectCost),'','lblCostoDuro')]),
          section('Efectivo y financiamiento',[metric('Costo de caja sin financiar',money(r.cashCost)),metric('Tierra aportada',money(r.ownerCapital)),metric('Intereses',money(r.interest)),metric('Comisión del crédito',money(r.feeDebt)),metric('Costo con financiamiento',money(total))],'El terreno aportado tiene costo económico aunque no salga de caja. Revisar qué partidas incluye un presupuesto consolidado.'),
          section('Programa de obra',[metric('Inicio', 'Mes '+num(p.buildStartMonth)),metric('Construcción',num(p.monthsBuild)+' meses'),metric('Fin de obra','Mes '+num(r.buildFinish)),metric('Horizonte',num(r.totalMonths)+' meses')])]},
      {main:money(r.peak)+' pico de deuda',sub:'Límite '+money(r.debtCap)+' · holgura '+money(r.debtHeadroom),
        note:valid(r.fundingGap)&&r.fundingGap>1?'Faltante reportado '+money(r.fundingGap):'Revisar cobertura de cada mes en el flujo',
        graphic:{kind:'credit',values:[ratio(r.peak,r.debtCap),ratio(r.ownerCapital,sum(r.ownerCapital,r.devCapital)),ratio(r.devCapital,sum(r.ownerCapital,r.devCapital))],labels:['Uso del límite','Capital dueño','Capital dev.'],caption:'Deuda / límite · capital / aportaciones · escala 0–100%'},
        sections:[section('Crédito y fondeo',[metric('Pico de deuda',money(r.peak)),metric('Límite modelado',money(r.debtCap)),metric('Holgura al pico',money(r.debtHeadroom)),metric('Mes del pico',num(r.peakMonth)),metric('Tasa anual PIK',percent(p.pik)),metric('Comisión por disposición',percent(p.feeDebt)),metric('Capital desarrollador',money(r.devCapital)),metric('Terreno aportado',money(r.ownerCapital))],'El límite modelado no significa crédito autorizado; revisar cobertura mensual.'),
          section('Dueño',[metric('Cobro total',money(r.ownerTotalProceeds)),metric('Capital recuperado',money(r.ownerCapitalReturn)),metric('Ganancia del socio',money(r.ownerGain)),metric('Cobro por venta de terreno',money(r.ownerSaleProceeds)),metric('TIR',percent(r.ownerIrr)),metric('MOIC',valid(r.ownerMoic)?num(r.ownerMoic,2)+'×':'—')]),
          section('Desarrollador',[metric('Cobro total',money(r.devDist)),metric('Capital recuperado',money(r.devCapitalReturn)),metric('Ganancia',money(r.devGain)),metric('TIR',percent(r.devIrr)),metric('MOIC',valid(r.devMoic)?num(r.devMoic,2)+'×':'—')],'Cobro y ganancia son distintos. El flujo conserva fechas, capital, preferente y residual.') ]},
      {main:num(r.aguaTotal,2)+' m³/día · '+num(r.demandaKva,2)+' kVA',sub:num(r.habitantes)+' habitantes · reserva '+num(p.diasReserva)+' días',note:'',
        graphic:{kind:'utilities',values:[ratio(r.aguaTotal,500),ratio(r.demandaKva,2000),r.permeablePct],labels:['Agua','Energía','Permeable'],caption:'Agua 0–500 m³/día · energía 0–2,000 kVA · permeable 0–100%'},
        sections:[section('Agua y reserva',[metric('Vivienda',num(r.aguaViv,3)+' m³/día'),metric('Comercio',num(r.aguaCom,3)+' m³/día'),metric('Total diario',num(r.aguaTotal,3)+' m³/día','', 'lblAgua'),metric('Drenaje',num(r.drenajeDia,2)+' m³/día','', 'lblDrenaje'),metric('Cisterna',volume(r.cisternaM3)),metric('Reserva',num(p.diasReserva)+' días')],'Capacidad calculada; no es un sensor de nivel. La reserva contra incendio no está incluida.'),
          section('Energía y servicios',[metric('Carga instalada',num(r.cargaTotalKw,2)+' kW'),metric('Demanda eléctrica',num(r.demandaKva,2)+' kVA'),metric('Elevadores',num(r.elevadores)),metric('Capacidad de gas',num(r.gasL)+' L'),metric('Cuarto de basura',area(r.basuraM2)),metric('Áreas comunes',area(r.comunM2))]),
          section('Suelo y operación',[metric('Área verde',area(r.greenArea)),metric('Permeable',area(r.permeable)),metric('Volumen pluvial de referencia',volume(r.pluvialM3)),metric('Densidad',num(r.densidadViv,1)+' viviendas/ha'),metric('Mantenimiento promedio','$'+num(r.cuotaProm)+' / mes')],'Dotaciones de anteproyecto; validar factibilidades y proyecto técnico.') ]}
    ];
  }
  if(typeof module==='object'&&module.exports)module.exports={describe,num,money,valid};
  if(!root.document)return;
  const $=id=>document.getElementById(id), reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  let mounted=false, active=null, originalY=0, records=[], lastContext='', renderToken=0, focusRequest=0;
  function element(tag,cls,text){const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;}
  function button(text,cls){const b=element('button',cls,text);b.type='button';return b;}
  function disclosure(label,nodes,id){const d=element('details','ppp-aux');if(id)d.id=id;d.append(element('summary','',label));const box=element('div','ppp-aux-content');nodes.filter(Boolean).forEach(n=>box.append(n));d.append(box);return d;}
  function getHeaderOffset(){const h=document.querySelector('.yod-topbar');return (h?h.getBoundingClientRect().height:60)+64;}
  function toggle(id,force) {
    const item=records.find(x=>x.id===id);if(!item)return;focusRequest++;
    const open=force===undefined?active!==id:force;
    scrollTo({top:scrollY,behavior:'instant'});
    if(open&&!active)originalY=scrollY;
    records.forEach(x=>{
      const on=open&&x.id===id;
      x.card.classList.toggle('ppp-open',on);
      x.card.classList.toggle('ppp-muted',open&&!on);
      x.trigger.setAttribute('aria-expanded',String(on));
      x.reveal.inert=!on;x.reveal.setAttribute('aria-hidden',String(!on));
      if(!on){x.card.classList.remove('ppp-adjusting');x.drawer.classList.remove('active');x.adjust.setAttribute('aria-expanded','false');x.adjust.textContent='Ajustar';}
    });
    active=open?id:null;document.body.classList.toggle('ppp-focused',!!active);
    $('pppBack').hidden=!active;
    if(open){
      item.card.style.scrollMarginTop=getHeaderOffset()+'px';
      // Wait for actual CSS completion, including a closing card above this one.
      // A wall-clock delay is unreliable on a busy mobile renderer.
      const request=focusRequest;
      const align=()=>{if(active!==id||focusRequest!==request)return;scrollTo({top:Math.max(0,item.card.getBoundingClientRect().top+scrollY-getHeaderOffset()),behavior:reduced()?'instant':'smooth'});};
      if(reduced())align();else requestAnimationFrame(()=>{const motions=records.flatMap(x=>x.reveal.getAnimations());Promise.all(motions.map(a=>a.finished.catch(()=>{}))).then(align);});
    }else {scrollTo({top:originalY,behavior:reduced()?'instant':'smooth'});item.trigger.focus({preventScroll:true});}
  }
  function adjust(id,focusId){
    const x=records.find(x=>x.id===id);if(!x)return;
    if(active!==id)toggle(id,true);focusRequest++;
    const on=!!focusId||!x.card.classList.contains('ppp-adjusting');
    x.card.classList.toggle('ppp-adjusting',on);x.drawer.classList.toggle('active',on);
    x.adjust.setAttribute('aria-expanded',String(on));x.adjust.textContent=on?'Ver detalle':'Ajustar';
    const destination=on?x.drawer:x.detail;if(!on)x.adjust.focus({preventScroll:true});
    if(focusId){const input=$(focusId);if(input){let p=input.parentElement;while(p&&p!==x.drawer){if(p.tagName==='DETAILS')p.open=true;p=p.parentElement;}input.focus({preventScroll:true});}}
    requestAnimationFrame(()=>destination.scrollIntoView({block:'start',behavior:reduced()?'instant':'smooth'}));
  }
  function graphic(kind,compact=false){
    const wrap=element('div','ppp-graphic'+(compact?' ppp-mini':''));wrap.setAttribute('aria-hidden','true');
    // Prisms share fixed projection. Height/footprint interpolation is presentation only.
    wrap.innerHTML='<svg viewBox="0 0 300 190" focusable="false"><defs><linearGradient id="'+kind+(compact?'m':'d')+'gold" x2="1" y2="1"><stop stop-color="#e7d8b8"/><stop offset="1" stop-color="#a98a50"/></linearGradient></defs><ellipse cx="150" cy="154" rx="113" ry="22" fill="currentColor" opacity=".07"/><path d="M28 133L152 90 277 133 153 181Z" fill="var(--ppp-slab)" stroke="var(--linea)"/>'+[0,1,2].map((i)=>'<g class="ppp-prism ppp-prism-'+i+'" style="--x:'+(59+i*70)+'px;--h:0"><path d="M-23 0L0 11 0 -79 -23 -90Z" fill="var(--ppp-face)" stroke="var(--ppp-edge)"/><path d="M0 11L23 0 23 -90 0 -79Z" fill="var(--ppp-side)" stroke="var(--ppp-edge)"/><path d="M-23 -90L0 -101 23 -90 0 -79Z" fill="var(--ppp-top)" stroke="var(--ppp-edge)"/><path d="M-23 -58L0 -47 23 -58M-23 -26L0 -15 23 -26" fill="none" stroke="var(--ppp-edge)" opacity=".45"/></g>').join('')+'</svg>';
    return wrap;
  }
  function paintGraphic(el,g){
    el.dataset.kind=g.kind;
    if(g.kind==='architecture'){
      const svg=el.querySelector('svg');
      if(!svg.classList.contains('ppp-building')){svg.classList.add('ppp-building');svg.innerHTML='<path class="site" fill="var(--ppp-slab)" stroke="var(--linea)"/><path class="front" fill="var(--ppp-face)" stroke="var(--ppp-edge)"/><path class="side" fill="var(--ppp-side)" stroke="var(--ppp-edge)"/><path class="roof" fill="var(--ppp-top)" stroke="var(--ppp-edge)"/><path class="floors" fill="none" stroke="var(--ppp-edge)" opacity=".55"/>';}
      const ground=Math.sqrt(Math.min(1,Math.max(0,g.values[0]||0)))*100;
      const width=valid(g.plate)?Math.sqrt(Math.min(1,Math.max(0,g.plate/10000)))*100:0;
      const height=Math.min(1,Math.max(0,g.values[1]||0))*140, x=150,y=150,w=width,z=width*.45;
      const paths={site:`M${x-ground} ${y}L${x} ${y-ground*.45}L${x+ground} ${y}L${x} ${y+ground*.45}Z`,front:`M${x-w} ${y}L${x} ${y+z}L${x} ${y+z-height}L${x-w} ${y-height}Z`,side:`M${x} ${y+z}L${x+w} ${y}L${x+w} ${y-height}L${x} ${y+z-height}Z`,roof:`M${x-w} ${y-height}L${x} ${y-z-height}L${x+w} ${y-height}L${x} ${y+z-height}Z`};
      Object.entries(paths).forEach(([key,d])=>{const p=svg.querySelector('.'+key);p.setAttribute('d',d);p.style.d='path("'+d+'")';});
      const count=Math.min(100,Math.max(0,Math.round(g.floors||0)));let lines='';for(let i=1;i<count;i++){const h=height*i/count;lines+=`M${x-w} ${y-h}L${x} ${y+z-h}L${x+w} ${y-h}`;}svg.querySelector('.floors').setAttribute('d',lines);
      return;
    }
    el.querySelectorAll('.ppp-prism').forEach((p,i)=>{
      const v=g.values[i];p.style.setProperty('--h',valid(v)?Math.min(1,Math.max(0,v)):0);
      p.classList.toggle('ppp-no-value',!valid(v));
    });
  }
  function brand(){
    const icons={yodBurger:'<path d="M4 6h16M4 12h16M4 18h16"/>',yodBack:'<path d="m12 5-7 7 7 7M5 12h15"/>',yodSearch:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>'};
    Object.entries(icons).forEach(([id,paths])=>{const el=$(id);if(el&&!el.dataset.pppIcon){el.dataset.pppIcon='1';el.innerHTML='<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths+'</svg>';}});
    document.querySelectorAll('.yod-topbrand,.yod-brand').forEach(a=>{
      if(a.dataset.pppBrand)return;a.dataset.pppBrand='1';a.setAttribute('aria-label','YoDesarrollo OS');
      a.innerHTML='<span class="ppp-logo-crop"><img src="img/yod-logo.png" alt="YoDesarrollo"></span><span class="ppp-os">OS</span>';
    });
  }
  function mount(){
    if(mounted)return;mounted=true;document.body.classList.add('ppp-ui');
    const main=document.querySelector('main.container'),deck=document.querySelector('.grid-2');deck.classList.add('ppp-deck');deck.id='pppDeck';
    const tools=element('nav','ppp-shortcuts');tools.setAttribute('aria-label','Información complementaria');
    const context=element('div','ppp-context');context.id='pppContext';context.textContent='Modelo de referencia';
    const back=button('‹ Volver al resumen','ppp-back');back.id='pppBack';back.hidden=true;back.onclick=()=>active&&toggle(active,false);
    main.insertBefore(context,main.firstChild);deck.before(back);
    // Move existing nodes so their listeners, IDs and server bindings survive unchanged.
    const docs=$('inInventarioExplicito').closest('section');docs.id='pppDocumentos';docs.classList.add('ppp-aux');
    const hero=document.querySelector('.hero'),ref=document.querySelector('.reference-strip'),market=$('mercadoDocumento');
    const full=disclosure('Lectura completa y referencias',[hero,ref], 'pppLectura');
    const stages=disclosure('Libro, etapas y mercado',[market], 'pppEtapas');
    const sheet=$('sheetPanel');if(sheet)stages.lastChild.prepend(sheet);
    const versions=disclosure('Versiones y comparación',[$('escBar'),$('compSection')],'pppVersiones');
    const actions=document.querySelector('.caso-actions');const management=disclosure('Gestión del caso',[actions,$('segPanel'),$('reuPanel')],'pppGestion');
    const originalHeader=document.querySelector('.sticky-header');originalHeader.classList.add('ppp-hud');
    const inner=originalHeader.querySelector('.header-inner');
    const hudRows=Array.from(inner.children);hudRows.filter(n=>n.classList.contains('brandrow')).forEach(n=>n.remove());
    const overview=hudRows.find(n=>n.querySelector('#hudUtilidad'));
    hudRows.filter(n=>n!==overview&&n.parentNode).forEach(n=>full.lastChild.append(n));
    originalHeader.classList.remove('sticky-header');
    const bar=document.querySelector('.caso-bar');bar.after(originalHeader);originalHeader.after(versions);versions.after(deck);deck.before(back);deck.after(tools);
    tools.after(docs,stages,full,management);
    const advanced=$('advBoard');if(advanced)management.after(advanced);
    [['Documentos',docs],['Etapas',stages],['Herramientas',advanced],['Gestión',management]].forEach(([name,node])=>{
      if(!node)return;const b=button(name,'small-btn secondary');b.onclick=()=>{if(active)toggle(active,false);if(node.tagName==='DETAILS')node.open=true;else node.querySelector('details')?.setAttribute('open','');node.scrollIntoView({behavior:reduced()?'instant':'smooth',block:'start'});};tools.append(b);
    });
    ['btnSeguimiento','btnReuniones'].forEach(id=>$(id)?.addEventListener('click',()=>{management.open=true;}));
    ids.forEach((id,index)=>{
      const card=document.querySelector('[data-card="'+id+'"]'),drawer=$(id),oldHeader=card.querySelector('.card-header'),kpis=card.querySelector('.kpi-grid');
      card.onclick=null;card.classList.add('ppp-card');card.setAttribute('aria-label',titles[index]);
      const trigger=button('','ppp-trigger');trigger.id='pppToggle'+id;trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-controls','pppDetail'+id);
      const mini=graphic(id,true),copy=element('span','ppp-summary-copy'),title=element('span','ppp-title',titles[index]),headline=element('strong','ppp-main','—'),sub=element('span','ppp-sub'),note=element('span','ppp-alert');note.hidden=true;
      copy.append(title,headline,sub,note);const chevron=element('span','ppp-chevron','⌄');chevron.setAttribute('aria-hidden','true');trigger.append(mini,copy,chevron);oldHeader.replaceWith(trigger);
      const reveal=element('div','ppp-reveal');reveal.id='pppDetail'+id;reveal.inert=true;reveal.setAttribute('aria-hidden','true');
      const inside=element('div','ppp-reveal-inner');reveal.append(inside);
      const actionbar=element('div','ppp-detail-actions'),source=element('span','ppp-source'),adjustBtn=button('Ajustar','small-btn ppp-adjust');adjustBtn.setAttribute('aria-controls',id);adjustBtn.setAttribute('aria-expanded','false');actionbar.append(source,adjustBtn);
      const detail=element('div','ppp-detail'),viz=graphic(id),caption=element('p','ppp-caption'),legend=element('div','ppp-legend'),content=element('div','ppp-sections');detail.append(viz,legend,caption,content);
      const all=disclosure('Todos los indicadores y sus fórmulas',[kpis]);all.classList.add('ppp-all');detail.append(all);
      const intro=element('div','ppp-adjust-intro');intro.append(element('h3','','Ajustar '+titles[index].toLowerCase()),element('p','','Los resultados se actualizan con los controles del escenario activo.'));
      drawer.prepend(intro);const done=button('Volver al detalle','small-btn secondary');drawer.append(done);
      inside.append(actionbar,detail,drawer);card.append(reveal);
      trigger.onclick=()=>toggle(id);adjustBtn.onclick=()=>adjust(id);done.onclick=()=>adjust(id);
      records.push({id,card,drawer,trigger,headline,sub,note,mini,reveal,detail,source,adjust:adjustBtn,viz,legend,caption,content});
      card.addEventListener('keydown',e=>{if(e.key==='Escape'&&!e.target.closest('.overlay')){e.preventDefault();if(card.classList.contains('ppp-adjusting'))adjust(id);else toggle(id,false);}});
      drawer.querySelectorAll('input[type=range]').forEach(input=>{const label=input.closest('.input-group')?.querySelector('label');if(label){label.htmlFor=input.id;input.setAttribute('aria-label',label.textContent);}});
    });
    // A native focus jump from a formula must reveal both levels.
    document.addEventListener('focusin',e=>{const input=e.target;if(input.matches?.('input[type=range]')){const card=input.closest('.ppp-card');if(card&&!card.classList.contains('ppp-adjusting'))adjust(card.dataset.card,input.id);}});
    $('toast')?.setAttribute('role','status');
    const sync=$('syncDot');sync?.setAttribute('role','status');if(sync)new MutationObserver(()=>{const value=sync.textContent;records.forEach(x=>x.source.textContent=value);}).observe(sync,{childList:true,subtree:true,characterData:true});
    brand();const watcher=new MutationObserver(brand);watcher.observe(document.body,{childList:true});
    // Shell builds its topbar synchronously when inserted; no session or gate modification.
    setTimeout(brand,0);
    const footer=element('div','ppp-footer');[['Mis casos','btnMisCasos'],['Guardar','btnGuardar']].forEach(([label,id])=>{const b=button(label,'small-btn'+(id==='btnGuardar'?'':' secondary'));b.onclick=()=>$(id).click();footer.append(b);});footer.append(element('span','','PPP · Mixto / Depas'));tools.after(footer);
  }
  function update(r,context={}){
    if(!mounted)mount();
    const ctx=[context.caseId,context.scenario].join('|');
    if(lastContext&&ctx!==lastContext&&active)toggle(active,false);lastContext=ctx;
    $('pppContext').textContent=context.native?'Resultados de Sheets · revisión '+String(context.revision||'—').slice(0,8):'Estimación del modelo · '+(context.caseId?'caso guardado':'sin guardar');
    const descriptions=describe(r);renderToken++;
    descriptions.forEach((d,i)=>{
      const x=records[i];x.headline.textContent=d.main;x.sub.textContent=d.sub;x.note.textContent=d.note;x.note.hidden=!d.note;
      paintGraphic(x.mini,d.graphic);paintGraphic(x.viz,d.graphic);
      const overflow=d.graphic.values.some(v=>valid(v)&&v>1);
      x.legend.replaceChildren(...d.graphic.labels.map((label,i)=>{const el=element('span','ppp-legend-'+i,label);return el;}));
      x.caption.textContent=d.graphic.caption+(overflow?' · escala visual excedida; consultar cifras':'');
      x.viz.setAttribute('data-revision',String(context.revision||renderToken));
      // Keyed nodes retain focus and selection while quantities recalculate.
      d.sections.forEach((s,j)=>{
        let block=x.content.children[j];if(!block){block=element('section','ppp-metric-section');block.id='pppSection'+x.id+j;block.append(element('h3'),element('div','ppp-metrics'),element('p','ppp-caption'));x.content.append(block);}
        block.firstChild.textContent=s.title;block.setAttribute('aria-label',s.title);
        const grid=block.children[1];s.items.forEach((m,k)=>{let el=grid.children[k];if(!el){el=element('div','ppp-metric');el.append(element('span'),element('strong'));grid.append(el);}el.id='pppMetric'+x.id+j+'_'+k;el.children[0].textContent=m.label;el.children[1].textContent=m.value;el.setAttribute('aria-label',m.label+': '+m.value);
          if(m.help){el.tabIndex=0;el.setAttribute('role','button');el.title='Ver explicación de '+m.label;el.onclick=()=>root.PPPHelp?root.PPPHelp(m.help,el):$(m.help)?.click();el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();el.click();}};}});
        block.lastChild.textContent=s.note;block.lastChild.hidden=!s.note;
      });
    });
    const sheet=$('sheetPanel'),stages=$('pppEtapas');if(sheet&&sheet.parentElement!==stages.lastChild)stages.lastChild.prepend(sheet);
    $('pppVersiones').firstChild.textContent='Versiones · '+(context.scenarioName||'Base');
  }
  root.PPPView={mount,update,toggle,adjust};
})(typeof window==='undefined'?globalThis:window);
