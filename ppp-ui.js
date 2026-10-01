/* PPP · presentation only. The active engine/Sheets response owns every result.
   Existing controls are moved, never cloned. No network or financial engine here. */
(function (root) {
  'use strict';
  const ids = ['dArq', 'dVentas', 'dCostos', 'dMacro', 'dDota'];
  const titles = ['Terreno y arquitectura', 'Ventas e ingresos', 'Costos', 'Macro y crédito', 'Dotaciones'];
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
      {main:area(p.terrain)+' de terreno', sub:num(r.units)+' depas · '+num(r.totalFloors)+' pisos · '+area(r.vendTotal)+' vendibles',
        note: valid(delta)&&Math.abs(delta)>.5 ? area(Math.abs(delta))+' por conciliar con la mezcla' : '',
        graphic:{kind:'architecture',values:[ratio(r.floorPlate,p.terrain),ratio(r.height,p.altMax),ratio(r.vendTotal,sum(r.resGross,r.com))],labels:['Terreno','Volumen edificado'],floors:r.totalFloors,plate:r.floorPlate,terrain:p.terrain,height:r.height,efficiency:ratio(r.vendTotal,sum(r.resGross,r.com)),caption:'Volumen conceptual · huella / terreno '+percent(ratio(r.floorPlate,p.terrain))+' · altura / tope supuesto '+percent(ratio(r.height,p.altMax))+' · escala 0–100%. No representa la implantación por cuerpos.'},
        sections:[section('Terreno y capacidad',[metric('Terreno',area(p.terrain),'','lblTerreno'),metric('Huella máxima · COS '+percent(p.cos),area(r.footprint),'','lblHuella'),metric('Sobre rasante · CUS '+num(p.cus,2),area(r.gross),'','lblConstruible'),metric('Altura máxima supuesta',num(p.altMax,1)+' m')],'La envolvente indica capacidad; no acredita un permiso.'),
          section('Superficies',[metric('Vivienda vendible',area(r.resSell),'','lblVendViv'),metric('Locales vendibles',area(r.comSell),'','lblVendLoc'),metric('Vivienda bruta',area(r.resGross)),metric('Comercio bruto',area(r.com)),metric('Total vendible',area(r.vendTotal),'','lblVendTotal')]),
          section('Mezcla de departamentos',[metric('Tipología A',num(r.mixLoftUnits)+' × '+area(p.m2Loft)),metric('Tipología B',num(r.mix2Units)+' × '+area(p.m22Rec)),metric('Tipología C',num(r.mix3Units)+' × '+area(p.m23Rec))],valid(delta)?'Área de la mezcla '+area(mixedArea)+' · diferencia '+area(delta):'Inventario pendiente de conciliar.'),
          section('Programa y estacionamiento',[metric('Depas por piso',num(p.deptosPiso)),metric('Cajones totales',num(r.spaces),'','lblCajonesTot'),metric('Amenidades',area(r.amenidades),'','lblAmenidades'),metric('Sótanos construidos',area(r.basementArea)),metric('Locales',num(p.localesPB)),metric('Sótanos',num(r.basements))])]},
      {main:money(r.sales)+' proyectados',sub:'Vivienda '+money(sum(r.presaleRev,r.postRev))+' · locales '+money(r.comRev),note:'',
        graphic:{kind:'sales',values:[ratio(sum(r.presaleRev,r.postRev),r.sales),ratio(r.comRev,r.sales),ratio(r.parkingRev,r.sales)],labels:['Vivienda','Locales','Cajones'],sales:r.sales,flows:r.flows,months:r.totalMonths,caption:'Participación en las ventas · escala 0–100%'},
        sections:[section('De dónde sale el ingreso',[metric('Vivienda',money(sum(r.presaleRev,r.postRev))),metric('Locales',money(r.comRev)),metric('Cajones',money(r.parkingRev)),metric('Venta total',money(r.sales))],'Proyección del modelo; no son contratos firmados. Confirmar si los cajones se cobran por separado.'),
          section('Precio y ritmo comercial',[metric('Precio lista','$'+num(p.preViv)+'/m²'),metric('Descuento preventa',percent(p.desc)),metric('Preventa efectiva',percent(r.preventaEfectiva)),metric('Unidades equivalentes',num(r.presaleUnits,1)),metric('Ritmo de preventa',num(r.presaleUnitsPerMonth,2)+' / mes'),metric('Captación',num(p.preMonths)+' meses')]),
          section('Calendario de cobro',[metric('Preventa',money(r.presaleRev)),metric('Vivienda en entrega',money(r.postRev)),metric('A la firma',percent(p.eng)+' de preventa'),metric('Durante obra',percent(p.obra)+' de preventa'),metric('Ventana de entrega',num(p.delivery)+' meses')],'Los importes mensuales completos se conservan en Herramientas → flujo.') ]},
      {main:money(total)+' total',sub:'Utilidad '+money(r.profit)+' · margen '+percent(r.margin),note:valid(total)&&valid(r.profit)&&valid(r.sales)&&Math.abs(total+r.profit-r.sales)>1?'Costo + utilidad: diferencia de '+money(total+r.profit-r.sales)+' contra ventas':'',
        graphic:{kind:'costs',values:[ratio(r.hard,total),ratio(valid(r.projectCost)&&valid(r.hard)?r.projectCost-r.hard:null,total),ratio(finance,total)],labels:['Obra','Otros costos','Financiación','Utilidad'],sales:r.sales,total,profit:r.profit,revenueValues:[ratio(r.hard,r.sales),ratio(valid(r.projectCost)&&valid(r.hard)?r.projectCost-r.hard:null,r.sales),ratio(finance,r.sales),ratio(r.profit,r.sales)],caption:'Costo y utilidad antes de impuestos / ventas · escala 0–100%; el costo incluye financiamiento'},
        sections:[section('Costo completo',[metric('Obra directa',money(r.hard),'','lblObraTotal'),metric('Terreno',money(r.land)),metric('Indirectos',money(r.indirect)),metric('Contingencia',money(r.cont)),metric('Legal',money(r.legal)),metric('Comisión de ventas',money(r.commission)),metric('Escrituración',money(r.closing)),metric('Antes de financiar',money(r.projectCost),'','lblCostoDuro')]),
          section('Efectivo y financiamiento',[metric('Costo de caja sin financiar',money(r.cashCost)),metric('Tierra aportada',money(r.ownerCapital)),metric('Intereses',money(r.interest)),metric('Comisión del crédito',money(r.feeDebt)),metric('Costo con financiamiento',money(total))],'El terreno aportado tiene costo económico aunque no salga de caja. Revisar qué partidas incluye un presupuesto consolidado.'),
          section('Programa de obra',[metric('Inicio', 'Mes '+num(p.buildStartMonth)),metric('Construcción',num(p.monthsBuild)+' meses'),metric('Fin de obra','Mes '+num(r.buildFinish)),metric('Horizonte',num(r.totalMonths)+' meses')])]},
      {main:money(r.peak)+' pico de deuda',sub:'Límite '+money(r.debtCap)+' · uso '+percent(ratio(r.peak,r.debtCap))+' · mes '+num(r.peakMonth),
        note:valid(r.fundingGap)&&r.fundingGap>1?'Faltante reportado '+money(r.fundingGap):'Revisar cobertura de cada mes en el flujo',
        graphic:{kind:'credit',values:[ratio(r.peak,r.debtCap),ratio(r.peak,r.sales),ratio(r.profit,r.sales)],peak:r.peak,limit:r.debtCap,peakMonth:r.peakMonth,flows:r.flows,months:r.totalMonths,profit:r.profit,labels:['Deuda mensual','Límite modelado','Utilidad antes de impuestos'],caption:'Deuda mensual / límite · escala 0–100%. Pico y utilidad se comparan en MXN; no representan garantías ni crédito autorizado.'},
        sections:[section('Crédito y fondeo',[metric('Pico de deuda',money(r.peak)),metric('Límite modelado',money(r.debtCap)),metric('Holgura al pico',money(r.debtHeadroom)),metric('Mes del pico',num(r.peakMonth)),metric('Deuda / ventas',percent(ratio(r.peak,r.sales))),metric('Utilidad / ventas',percent(ratio(r.profit,r.sales))),metric('Pico / utilidad positiva',valid(r.profit)&&r.profit>0?num(ratio(r.peak,r.profit),2)+'×':'No comparable'),metric('Tasa anual PIK',percent(p.pik)),metric('Comisión por disposición',percent(p.feeDebt)),metric('Capital desarrollador',money(r.devCapital)),metric('Terreno aportado',money(r.ownerCapital))],'El límite modelado no significa crédito autorizado; revisar cobertura mensual.'),
          section('Dueño',[metric('Cobro total',money(r.ownerTotalProceeds)),metric('Capital recuperado',money(r.ownerCapitalReturn)),metric('Ganancia del socio',money(r.ownerGain)),metric('Cobro por venta de terreno',money(r.ownerSaleProceeds)),metric('TIR',percent(r.ownerIrr)),metric('MOIC',valid(r.ownerMoic)?num(r.ownerMoic,2)+'×':'—')]),
          section('Desarrollador',[metric('Cobro total',money(r.devDist)),metric('Capital recuperado',money(r.devCapitalReturn)),metric('Ganancia',money(r.devGain)),metric('TIR',percent(r.devIrr)),metric('MOIC',valid(r.devMoic)?num(r.devMoic,2)+'×':'—')],'Cobro y ganancia son distintos. El flujo conserva fechas, capital, preferente y residual.') ]},
      {main:num(r.aguaTotal,2)+' m³/día · '+num(r.demandaKva,2)+' kVA',sub:num(r.habitantes)+' habitantes · reserva '+num(p.diasReserva)+' días',note:'',
        graphic:{kind:'utilities',values:[ratio(r.cisternaM3,500),ratio(r.demandaKva,2000),r.permeablePct],labels:['Reserva de agua','Demanda eléctrica','Suelo permeable'],water:r.aguaTotal,cistern:r.cisternaM3,reserve:p.diasReserva,load:r.cargaTotalKw,demand:r.demandaKva,permeable:r.permeable,terrain:p.terrain,caption:'Cisterna 0–500 m³: fracción que consume un día · demanda 0–2,000 kVA · permeable / terreno 0–100%. No es monitoreo en vivo.'},
        sections:[section('Agua y reserva',[metric('Vivienda',num(r.aguaViv,3)+' m³/día'),metric('Comercio',num(r.aguaCom,3)+' m³/día'),metric('Total diario',num(r.aguaTotal,3)+' m³/día','', 'lblAgua'),metric('Drenaje',num(r.drenajeDia,2)+' m³/día','', 'lblDrenaje'),metric('Cisterna',volume(r.cisternaM3)),metric('Reserva',num(p.diasReserva)+' días')],'Capacidad calculada; no es un sensor de nivel. La reserva contra incendio no está incluida.'),
          section('Energía y servicios',[metric('Carga instalada',num(r.cargaTotalKw,2)+' kW'),metric('Demanda eléctrica',num(r.demandaKva,2)+' kVA'),metric('Elevadores',num(r.elevadores)),metric('Capacidad de gas',num(r.gasL)+' L'),metric('Cuarto de basura',area(r.basuraM2)),metric('Áreas comunes',area(r.comunM2))]),
          section('Suelo y operación',[metric('Área verde',area(r.greenArea)),metric('Permeable',area(r.permeable)),metric('Volumen pluvial de referencia',volume(r.pluvialM3)),metric('Densidad',num(r.densidadViv,1)+' viviendas/ha'),metric('Mantenimiento promedio','$'+num(r.cuotaProm)+' / mes')],'Dotaciones de anteproyecto; validar factibilidades y proyecto técnico.') ]}
    ];
  }
  function siteSummary(r,site,stages){
    if(!Array.isArray(site?.uso)||!site.uso.length||!site.uso.every(row=>Array.isArray(row)&&row.every(v=>Number.isInteger(v)&&v>=0&&v<=4)))return null;
    const rows=(Array.isArray(site.resumen)?site.resumen:[]).filter(row=>Array.isArray(row)&&row[0]);
    const terrain=rows.find(row=>/^total terreno$/i.test(String(row[0]).trim()))?.[1];
    const difference=valid(terrain)&&valid(r.p?.terrain)?terrain-r.p.terrain:null;
    const conditions=(Array.isArray(stages)?stages:[]).filter(row=>Array.isArray(row)&&/traslado.*confirm|continuidad|demol/i.test(String(row[0])));
    const pending=conditions.filter(row=>row[1]===0||row[1]===null||row[1]===undefined||row[1]===''||/pendiente/i.test(String(row[1]))).length;
    return {grid:site.uso,rows,terrain,difference,conditions,pending};
  }
  if(typeof module==='object'&&module.exports)module.exports={describe,siteSummary,num,money,valid};
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
    wrap.innerHTML='<svg viewBox="0 0 300 190" focusable="false"></svg>';return wrap;
  }
  const clamp=v=>valid(v)?Math.min(1,Math.max(0,v)):0;
  function paintGraphic(el,g){
    el.dataset.kind=g.kind;
    const svg=el.querySelector('svg'), ink='var(--ppp-edge)', muted='var(--muted)';
    svg.setAttribute('viewBox','0 0 300 190');
    const colors=['var(--ppp-side)','#7c9ca4','#bba780','#6c9276'];
    const label=(x,y,t,anchor='start',cls='')=>`<text class="ppp-chart-text ${cls}" x="${x}" y="${y}" text-anchor="${anchor}" fill="${muted}" font-size="11">${E(t)}</text>`;
    const rect=(x,y,w,h,c)=>`<rect x="${x}" y="${y}" width="${Math.max(0,w)}" height="${h}" rx="2" fill="${c}"/>`;
    const axis=(x,y)=>`<path d="M${x} ${y-86}V${y}H280" fill="none" stroke="var(--linea)"/>`;
    // Monthly paths break at absent values. No interpolation invents an unknown month.
    function monthly(field,denominator,y=137,height=70,cumulative=false){
      if(!valid(denominator)||denominator<=0||!valid(g.months)||g.months<=0||!Array.isArray(g.flows))return '';
      let d='',running=0,connected=false,known=true,previous=null;
      for(const f of g.flows){
        if(!valid(f.m)||f.m<1||!valid(f[field])||cumulative&&(!known||previous!==null&&f.m!==previous+1)){connected=false;known=false;continue;}
        if(cumulative&&previous===null&&f.m!==1){known=false;continue;}
        if(cumulative)running+=f[field];const value=cumulative?running:f[field];
        const x=28+(f.m-1)/Math.max(1,g.months-1)*252, yy=y-clamp(value/denominator)*height;
        d+=(connected?'L':'M')+x.toFixed(2)+' '+yy.toFixed(2);connected=true;previous=f.m;
      }return d;
    }
    let html='';
    if(g.kind==='architecture'){
      const ground=90,w=Math.sqrt(clamp(g.values[0]))*90,h=clamp(g.values[1])*125,x=136,y=136,z=w*.45;
      html=`<path d="M${x-ground} ${y}L${x} ${y-ground*.45}L${x+ground} ${y}L${x} ${y+ground*.45}Z" fill="var(--ppp-slab)" stroke="var(--linea)"/><path d="M${x-w} ${y}L${x} ${y+z}L${x} ${y+z-h}L${x-w} ${y-h}Z" fill="var(--ppp-face)" stroke="${ink}"/><path d="M${x} ${y+z}L${x+w} ${y}L${x+w} ${y-h}L${x} ${y+z-h}Z" fill="var(--ppp-side)" stroke="${ink}"/><path d="M${x-w} ${y-h}L${x} ${y-z-h}L${x+w} ${y-h}L${x} ${y+z-h}Z" fill="var(--ppp-top)" stroke="${ink}"/>`;
      const count=Math.min(100,Math.max(0,Math.round(g.floors||0)));let lines='';for(let i=1;i<count;i++){const t=h*i/count;lines+=`M${x-w} ${y-t}L${x} ${y+z-t}L${x+w} ${y-t}`;}
      html+=`<path d="${lines}" fill="none" stroke="${ink}" opacity=".55"/><path d="M240 18V138M236 18h8M236 138h8" stroke="${ink}"/>`+label(251,55,num(g.height,1)+' m')+label(251,73,num(g.floors)+' pisos')+label(26,175,num(g.terrain)+' m² terreno')+label(26,189,'Vendible / bruto: '+percent(g.efficiency));
    }else if(g.kind==='sales'){
      html+=label(28,20,'Ingreso proyectado · '+money(g.sales));let x=28;
      g.values.forEach((v,i)=>{const w=clamp(v)*252;html+=rect(x,36,w,31,colors[i])+`<path d="M${x} 36l10 -7h${w}l-10 7Z" fill="${colors[i]}" opacity=".5"/>`;x+=w;});
      html+=label(28,86,'Cobros acumulados / ventas');const d=monthly('rev',g.sales,150,52,true);
      html+=`<path d="M28 98H280M28 150H280" stroke="var(--linea)" stroke-dasharray="3 4"/><path class="ppp-live-line" d="${d}" stroke="#6c9276" stroke-width="3" fill="none"/>`+label(280,95,'100%','end')+label(28,166,'M1')+label(280,166,'M'+num(g.months),'end');
      html+=label(28,187,'Vivienda '+percent(g.values[0])+' · locales '+percent(g.values[1]));
    }else if(g.kind==='costs'){
      html+=label(28,20,'Ventas · '+money(g.sales));html+=rect(28,34,252,8,'var(--ppp-slab)');
      let x=28;g.revenueValues.forEach((v,i)=>{const w=Math.min(280-x,clamp(v)*252);html+=rect(x,53,w,42,colors[i])+`<path d="M${x} 53l9 -6h${w}l-9 6Z" fill="${colors[i]}" opacity=".5"/>`;x+=w;});
      html+=label(28,114,'Costo '+money(g.total))+label(28,134,'Utilidad '+money(g.profit))+label(28,153,'Utilidad / ventas '+percent(g.revenueValues[3]));
      if(valid(g.profit)&&g.profit<0)html+=`<path d="M266 109l-9 15h18Z" fill="var(--red)"/>`+label(28,184,'Pérdida · costo superior a ventas');
      else html+=label(28,184,'Obra · otros · financiación · utilidad');
    }else if(g.kind==='credit'){
      html+=label(28,18,'Deuda / límite modelado')+label(280,37,'100% = '+money(g.limit),'end');
      html+=axis(28,137)+`<path d="M28 67H280" stroke="var(--ppp-edge)" stroke-dasharray="4 4"/><path class="ppp-live-line" d="${monthly('debt',g.limit)}" fill="none" stroke="var(--purple)" stroke-width="3"/>`;
      const x=valid(g.peakMonth)&&valid(g.months)?28+(g.peakMonth-1)/Math.max(1,g.months-1)*252:28,y=137-clamp(g.values[0])*70;
      if(valid(g.values[0]))html+=`<circle class="ppp-pulse" cx="${x}" cy="${y}" r="4" fill="var(--purple)"/>`;
      html+=label(28,153,'M1')+label(280,153,'M'+num(g.months),'end')+label(28,171,'Pico '+money(g.peak)+' · '+percent(g.values[0]))+label(28,188,'Utilidad '+money(g.profit)+' · '+percent(g.values[2])+' / ventas');
    }else{
      const fill=ratio(g.water,g.cistern),tankHeight=clamp(g.values[0])*85,top=126-tankHeight,y=126-clamp(fill)*tankHeight;
      html+=`<path d="M34 ${top}V125a32 10 0 0 0 64 0V${top}" fill="var(--ppp-slab)" stroke="${ink}"/><path class="ppp-water" d="M35 ${y}V125a31 9 0 0 0 62 0V${y}Z" fill="#7cabb7"/><ellipse class="ppp-water" cx="66" cy="${y}" rx="31" ry="9" fill="#afcfd7"/><ellipse cx="66" cy="${top}" rx="32" ry="10" fill="var(--ppp-top)" stroke="${ink}"/>`;
      html+=label(12,19,'Reserva '+num(g.reserve)+' días')+label(12,153,num(g.cistern,1)+' m³ cisterna')+label(12,171,num(g.water,1)+' m³/día');
      html+=label(126,23,'Energía estimada')+label(126,43,num(g.load,1)+' kW instalados')+label(126,61,num(g.demand,1)+' kVA demanda');html+=rect(126,72,142,7,'var(--ppp-slab)')+rect(126,72,clamp(g.values[1])*142,7,'#7c9ca4');
      const v=clamp(g.values[2]);html+=`<path d="M126 113l66 -23 76 23 -66 27Z" fill="var(--ppp-slab)" stroke="var(--linea)"/><path d="M126 113l${66*v} ${-23*v} 76 23 ${-66*v} ${23*v}Z" fill="#86a579"/>`+label(126,156,percent(g.values[2])+' permeable')+label(126,174,num(g.permeable)+' / '+num(g.terrain)+' m²');
    }
    if(g.values.every(v=>!valid(v)))html=label(150,94,'Datos pendientes','middle');
    // Retain SVG nodes so changed geometry transitions in place rather than flashing.
    if(svg.dataset.markup!==html){
      const incoming=document.createElementNS('http://www.w3.org/2000/svg','svg');incoming.innerHTML=html;
      if(svg.children.length===incoming.children.length&&Array.from(svg.children).every((n,i)=>n.tagName===incoming.children[i].tagName)){
        Array.from(incoming.children).forEach((next,i)=>{const current=svg.children[i];Array.from(current.attributes).forEach(a=>{if(!next.hasAttribute(a.name))current.removeAttribute(a.name);});Array.from(next.attributes).forEach(a=>current.setAttribute(a.name,a.value));current.textContent=next.textContent;if(next.hasAttribute('d'))current.style.d='path("'+next.getAttribute('d')+'")';});
      }else svg.innerHTML=html;
      svg.dataset.markup=html;
    }
  }
  function paintSite(el,data,compact=false){
    const names=['Libre','Sur','Cuerpo L','Torre','Rentas vigentes'],colors=['var(--ppp-slab)','#bad8c7','#ddc8a4','#a7bed3','#d5aba2'];
    let h='';const maxCols=Math.max(...data.grid.map(row=>row.length)),rows=data.grid.length;
    if(compact){
      data.grid.forEach((row,y)=>row.forEach((v,x)=>{const a=150+(x-y)*12,b=22+(x+y)*6;h+=`<path d="M${a} ${b}l12 6 -12 6 -12 -6Z" fill="${colors[v]}" stroke="var(--ppp-edge)" stroke-width=".65"/>`;}));
      const svg=el.querySelector('svg');svg.setAttribute('viewBox',`${136-(rows-1)*12} 20 ${(maxCols+rows)*12+4} ${(maxCols+rows)*6+4}`);svg.innerHTML=h;svg.dataset.markup='';return;
    }
    data.grid.forEach((row,y)=>row.forEach((v,x)=>{h+=`<rect id="pppSiteCell${y}_${x}" x="${x*30}" y="${y*30+20}" width="29" height="29" fill="${colors[v]}" stroke="var(--ppp-edge)" stroke-width=".6"><title>${E(names[v])} · fila ${y+1}, columna ${x+1}</title></rect>`;}));
    h='<text x="0" y="12" font-size="10" fill="var(--muted)">N ↑</text>'+h;
    const areaRows=data.rows.map((row,i)=>`<div class="ppp-site-row" id="pppSiteArea${i}"><span>${E(row[0])}</span><strong>${num(row[1],2)} m²</strong></div>`).join('');
    const conditions=data.conditions.map((row,i)=>`<div class="ppp-site-row" id="pppSiteCondition${i}"><span>${E(row[0])}</span><strong>${E(row[1]===0?'Pendiente (0)':row[1]===null||row[1]===undefined||row[1]===''?'Pendiente':row[1])}</strong></div>`).join('');
    el.innerHTML=`<h3>Terreno e implantación por etapas</h3><div class="ppp-site-legend">${names.map((name,i)=>`<span><i style="background:${colors[i]}" aria-hidden="true"></i>${E(name)}</span>`).join('')}</div><div class="ppp-site-grid"><svg viewBox="0 0 ${maxCols*30} ${rows*30+20}" role="img" aria-label="Retícula conceptual del mismo libro, norte arriba">${h}</svg><div class="ppp-site-areas">${areaRows}</div></div><p class="ppp-caption">Celdas de 10 × 10 m. Áreas parciales de los bordes incluidas en la tabla. La retícula indica usos; no es levantamiento ni proyecto aprobado.</p>${valid(data.difference)&&Math.abs(data.difference)>.05?`<p class="ppp-site-warning">Retícula ${num(data.terrain,2)} m² · proforma ${num(data.terrain-data.difference,2)} m² · diferencia ${num(data.difference,2)} m² por conciliar.</p>`:''}${conditions?'<h3>Protección de rentas y traslado</h3>'+conditions:''}`;
  }
  function brand(){
    const icons={yodBurger:'<path d="M4 6h16M4 12h16M4 18h16"/>',yodBack:'<path d="m12 5-7 7 7 7M5 12h15"/>',yodSearch:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>'};
    Object.entries(icons).forEach(([id,paths])=>{const el=$(id);if(el&&!el.dataset.pppIcon){el.dataset.pppIcon='1';el.setAttribute('aria-label',({yodBurger:'Abrir tableros',yodBack:'Volver a la pantalla anterior',yodSearch:'Buscar un tablero'})[id]);el.innerHTML='<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths+'</svg>';}});
    document.querySelectorAll('.yod-topbrand,.yod-brand').forEach(a=>{
      if(a.dataset.pppBrand)return;a.dataset.pppBrand='1';a.setAttribute('aria-label','YoDesarrollo OS');
      a.innerHTML='<span class="ppp-logo-crop"><img src="img/yod-logo.png" alt="YoDesarrollo"></span><span class="ppp-os">OS</span>';
    });
  }
  function mount(){
    if(mounted)return;mounted=true;document.body.classList.add('ppp-ui');
    const main=document.querySelector('main.container'),deck=document.querySelector('.grid-2');deck.classList.add('ppp-deck');deck.id='pppDeck';
    const tools=element('nav','ppp-shortcuts');tools.setAttribute('aria-label','Información complementaria');
    const context=element('div','ppp-context');context.id='pppContext';context.append(element('span','','Modelo de referencia'));const book=element('a','','Abrir libro');book.id='pppBookLink';book.target='_blank';book.rel='noopener';book.hidden=true;context.append(book);
    const back=button('‹ Volver al resumen','ppp-back');back.id='pppBack';back.hidden=true;back.onclick=()=>active&&toggle(active,false);
    main.insertBefore(context,main.firstChild);deck.before(back);
    const status=element('div','ppp-case-status');status.id='pppCaseStatus';status.setAttribute('role','status');status.hidden=true;status.append(element('span'),button('Reintentar','small-btn secondary'));context.after(status);
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
      const detail=element('div','ppp-detail'),viz=graphic(id),caption=element('p','ppp-caption'),legend=element('div','ppp-legend'),content=element('div','ppp-sections'),sitePanel=element('section','ppp-site-panel');sitePanel.hidden=true;sitePanel.id='pppSite'+id;detail.append(viz,legend,caption,sitePanel,content);
      const all=disclosure('Todos los indicadores y sus fórmulas',[kpis]);all.classList.add('ppp-all');detail.append(all);
      if(id==='dArq'){const chapters=button('Cuerpos, etapas y rentas','small-btn secondary');chapters.onclick=()=>{const target=$('pppEtapas');target.open=true;target.scrollIntoView({block:'start',behavior:reduced()?'instant':'smooth'});};detail.append(chapters);}
      if(id==='dMacro'||id==='dVentas'){const flow=button('Ver flujo mensual','small-btn secondary');flow.onclick=()=>{const target=$('advBoard');if(target.tagName==='DETAILS')target.open=true;else target.querySelector('details')?.setAttribute('open','');target.scrollIntoView({block:'start',behavior:reduced()?'instant':'smooth'});};detail.append(flow);}
      const intro=element('div','ppp-adjust-intro');intro.append(element('h3','','Ajustar '+titles[index].toLowerCase()),element('p','','Los resultados se actualizan con los controles del escenario activo.'));
      drawer.prepend(intro);const done=button('Volver al detalle','small-btn secondary');drawer.append(done);
      inside.append(actionbar,detail,drawer);card.append(reveal);
      trigger.onclick=()=>toggle(id);adjustBtn.onclick=()=>adjust(id);done.onclick=()=>adjust(id);
      records.push({id,card,drawer,trigger,headline,sub,note,mini,reveal,detail,source,adjust:adjustBtn,viz,legend,caption,content,sitePanel});
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
  function setCaseState(selection,retry){
    const banner=$('pppCaseStatus');if(!banner)return;
    banner.hidden=!selection;document.body.classList.toggle('ppp-unconfirmed',!!selection&&!selection.hasCopy);
    document.body.classList.toggle('ppp-reading',selection?.status==='loading');
    if(selection){banner.firstChild.textContent=selection.message;banner.lastChild.hidden=selection.status==='loading';banner.lastChild.onclick=retry;}
    if(selection){$('pppContext').firstChild.textContent=selection.hasCopy?'Copia de Sheets · lectura pendiente de confirmar':'Lectura pendiente · resultados de Sheets sin confirmar';$('pppBookLink').hidden=true;}
    const blocked=!!selection;records.forEach(x=>{x.trigger.disabled=blocked;x.adjust.disabled=blocked;});
    $('btnGuardar').disabled=blocked;document.querySelectorAll('.ppp-footer button').forEach(b=>{if(b.textContent==='Guardar')b.disabled=blocked;});
    if(blocked&&active)toggle(active,false);
  }
  function update(r,context={}){
    if(!mounted)mount();
    const ctx=[context.caseId,context.scenario].join('|');
    if(lastContext&&ctx!==lastContext&&active)toggle(active,false);lastContext=ctx;
    $('pppContext').firstChild.textContent=context.native?'Resultados de Sheets · revisión '+String(context.revision||'—').slice(0,8):'Estimación del modelo · '+(context.caseId?'caso guardado':'sin guardar');
    const book=$('pppBookLink'),safeBook=/^https:\/\/docs\.google\.com\/spreadsheets\/d\//.test(context.bookUrl||'');book.hidden=!safeBook;if(safeBook)book.href=context.bookUrl;
    const descriptions=describe(r),land=context.native?siteSummary(r,context.site,context.stages):null;renderToken++;
    const confirmedDate=new Date(context.updated);if(context.native&&Number.isFinite(confirmedDate.getTime()))$('pppContext').firstChild.textContent+=' · '+confirmedDate.toLocaleString('es-MX',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
    descriptions.forEach((d,i)=>{
      const x=records[i];x.headline.textContent=d.main;x.sub.textContent=d.sub;x.note.textContent=d.note;x.note.hidden=!d.note;
      paintGraphic(x.mini,d.graphic);paintGraphic(x.viz,d.graphic);
      if(i===0){x.sitePanel.hidden=!land;if(land){paintSite(x.mini,land,true);const key=JSON.stringify(land);if(x.sitePanel.dataset.state!==key){paintSite(x.sitePanel,land);x.sitePanel.dataset.state=key;}const notes=[d.note];if(valid(land.difference)&&Math.abs(land.difference)>.05)notes.push('Retícula / proforma: '+num(land.difference,2)+' m² por conciliar');if(land.pending)notes.push('Etapas: '+land.pending+' condiciones pendientes');x.note.textContent=notes.filter(Boolean).join(' · ');x.note.hidden=!x.note.textContent;}}
      const overflow=[...d.graphic.values,...(d.graphic.revenueValues||[])].some(v=>valid(v)&&v>1);
      x.mini.dataset.revision=String(context.revision||renderToken);
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
    $('pppVersiones').firstChild.textContent='Versiones · '+(context.versionCount||1)+' · '+(context.scenarioName||'Base');
  }
  root.PPPView={mount,update,toggle,adjust,setCaseState};
})(typeof window==='undefined'?globalThis:window);
