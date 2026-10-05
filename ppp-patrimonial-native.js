/* Patrimonial nativo: transporte, cantidades y presentación. Las fórmulas viven en Sheets. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PPPPatrimonialNative=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const clone=x=>JSON.parse(JSON.stringify(x));
  const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
  function validate(m,id){
    if(!m||m.ok!==true||m.modelo_tipo!=='patrimonial'||m.modelo_revision!=='patrimonial-sheet-v1'||m.caso_id!==id||typeof m.revision!=='string'||!m.revision||!Array.isArray(m.campos)||!Array.isArray(m.escenarios)||!m.escenarios.length)throw Error('modelo_invalido');
    const fields=new Set();m.campos.forEach(c=>{if(!c||typeof c.id!=='string'||!(/^(in[A-Z]\w*|unidad\d{2}_(tipo|nivel|m2|renta))$/).test(c.id)||fields.has(c.id)||!Number.isFinite(c.min)||!Number.isFinite(c.max)||c.min>c.max||typeof c.editable!=='boolean'||typeof c.nullable!=='boolean'||!['number','integer'].includes(c.kind))throw Error('campos_invalidos');fields.add(c.id);});
    const ids=new Set();let active=0,base=0;
    m.escenarios.forEach(e=>{
      if(!e||typeof e.id!=='string'||!e.id||ids.has(e.id)||typeof e.nombre!=='string'||!e.inputs)throw Error('version_invalida');ids.add(e.id);active+=e.activo===true?1:0;base+=e.esBase===true?1:0;
      for(const c of m.campos){const v=e.inputs[c.id];if(v!==null&&(typeof v!=='number'||!Number.isFinite(v)))throw Error('cantidad_invalida');}
      const s=m.estados&&m.estados[e.id];if(!s||!s.p||typeof s.modeloValido!=='boolean'||!['CONFIRMADA','PENDIENTE','EXCEDE_CUS'].includes(s.geometriaEstado)||!Array.isArray(s.rows)||!Array.isArray(s.unidades))throw Error('estado_invalido');
      if(s.modeloValido){if(s.geometriaEstado!=='CONFIRMADA'||!Number.isInteger(s.p.horizonte)||s.p.horizonte<1||s.p.horizonte>25||s.rows.length!==s.p.horizonte)throw Error('horizonte_invalido');
        for(const k of ['noi','rentaMes','valorCap','equity','patrimH','mensCredito'])if(!Number.isFinite(s[k]))throw Error('resultado_invalido');
        s.rows.forEach((r,i)=>{if(r.a!==i+1||!['valor','noiA','flujo','acum','saldo','patrim','crec'].every(k=>Number.isFinite(r[k])))throw Error('flujo_invalido');});
      }
    });
    if(active!==1||base!==1||!ids.has(m.activo)||!m.escenarios.find(e=>e.id===m.activo&&e.activo))throw Error('version_activa_invalida');
    const result=clone(m);result.state=result.estados[result.activo];result.inputs=result.escenarios.find(e=>e.id===result.activo).inputs;return result;
  }
  class Store{
    constructor({id,get,post,changed=()=>{},requestId=()=>globalThis.crypto.randomUUID()}){Object.assign(this,{id,get,post,changed,requestId});this.model=null;this.pending={};this.job=null;this.busy=false;this.verified=false;this.error='';this.generation=0;}
    notify(){this.changed(this);}
    load(model){this.model=validate(model,this.id);this.pending={};this.job=null;this.verified=true;this.error='';this.notify();}
    restore(cache){this.model=validate(cache.model,this.id);this.pending=clone(cache.pending||{});this.job=cache.job?clone(cache.job):null;this.verified=false;this.error='copia_local';this.notify();}
    snapshot(){return {model:this.model,pending:this.pending,job:this.job};}
    active(){return this.model.escenarios.find(e=>e.id===this.model.activo);}
    dirty(){return !!this.job||Object.keys(this.pending).length>0;}
    acceptRead(model,discard=false){const m=validate(model,this.id);if(this.dirty()&&!discard&&m.revision!==this.model.revision){this.verified=false;this.error='conflicto_revision';this.notify();return false;}this.model=m;this.verified=true;this.error='';if(discard){this.pending={};this.job=null;}this.notify();return true;}
    values(){return Object.assign({},this.active().inputs,this.job?this.job.inputs:{},this.pending);}
    change(id,value){
      if(this.versionBusy)throw Error('pendientes');
      const c=this.model.campos.find(c=>c.id===id);
      if(!c||!c.editable||(value===null?!c.nullable:typeof value!=='number'||!Number.isFinite(value)||value<c.min||value>c.max||(c.kind==='integer'&&!Number.isInteger(value))))throw Error('campo_invalido');
      this.pending[id]=value;this.notify();
    }
    async flush(){
      if(this.busy||!this.verified||this.error==='conflicto_revision'||!this.dirty())return false;
      if(!this.job){this.job={tipo:'sheet-cantidades',caso_id:this.id,escenario_id:this.model.activo,revision_esperada:this.model.revision,inputs:clone(this.pending),request_id:this.requestId()};this.pending={};}
      this.busy=true;this.error='';this.notify();const gen=this.generation;
      try{const r=await this.post(clone(this.job));if(gen!==this.generation)return false;if(!r.ok)throw Error(r.error||'no_confirmado');const m=validate(r,this.id);if(m.activo!==this.job.escenario_id)throw Error('version_invalida');this.model=m;this.job=null;this.error='';return true;}
      catch(e){if(gen===this.generation)this.error=e.message==='conflicto_revision'?'conflicto_revision':'sin_confirmacion';return false;}
      finally{if(gen===this.generation){this.busy=false;this.notify();}}
    }
    async refresh(discard=false){
      if(this.busy)return false;this.busy=true;this.notify();const gen=this.generation;
      try{const r=await this.get({recurso:'sheet-model',id:this.id});if(gen!==this.generation)return false;if(!r.ok)throw Error(r.error||'sin_confirmacion');const m=validate(r,this.id);
        return this.acceptRead(m,discard);
      }catch(e){if(gen===this.generation){this.verified=false;this.error='sin_confirmacion';}return false;}
      finally{if(gen===this.generation){this.busy=false;this.notify();}}
    }
    async version(action,id,name){
      if(this.busy||this.dirty()||!this.verified||this.error)throw Error('pendientes');this.busy=true;this.versionBusy=true;this.notify();const gen=this.generation;
      try{const r=await this.post({tipo:'sheet-version',caso_id:this.id,escenario_id:id,accion:action,nombre:name,revision_esperada:this.model.revision,request_id:this.requestId()});if(gen!==this.generation)return false;if(!r.ok)throw Error(r.error||'sin_confirmacion');this.model=validate(r,this.id);return true;}
      catch(e){if(gen===this.generation){this.error=e.message;this.verified=false;}throw e;}
      finally{if(gen===this.generation){this.busy=false;this.versionBusy=false;this.notify();}}
    }
    destroy(){this.generation++;this.busy=false;this.changed=()=>{};}
  }
  const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number=(v,percent=false)=>v===null||v===undefined||!Number.isFinite(v)?'—':new Intl.NumberFormat('es-MX',{maximumFractionDigits:percent?2:2,style:percent?'percent':'decimal'}).format(v);
  const CACHE='pyod_patrimonial_native_v1';
  function bar(label,value,total){const known=Number.isFinite(value)&&Number.isFinite(total)&&total>0;const ratio=known?value/total:null;return `<div class="pn-bar"><span>${escape(label)}: ${known?number(ratio,true):'—'}</span><div class="pn-track"><i style="width:${known?Math.min(100,Math.max(0,ratio*100)):0}%"></i></div></div>`;}
  function mount({model,metadata,get,post,labelFor=id=>id,onNew,onCases,cache=null}){
    const root=document.createElement('main');root.id='patrimonialNative';root.className='container';document.querySelector('main.container').before(root);
    const legacy=[...document.querySelectorAll('main.container, header.sticky-header')].filter(e=>e!==root);legacy.forEach(e=>e.hidden=true);document.body.classList.add('patrimonial-native');
    let timer=null,destroyed=false,agentBridge=null;const meta=clone(metadata);
    const store=new Store({id:meta.caso_id,get,post,changed:()=>{paint();agentBridge?.publish();}});
    agentBridge=globalThis.PPPAgentBridge?.mount(store,{labelFor});
    function paint(){
      if(destroyed||!store.model)return;
      const m=store.model,v=store.values(),st=m.estados[m.activo],blocked=store.busy||store.dirty()||!store.verified||!!store.error;
      const status=store.busy?'Sincronizando cantidades…':store.error==='conflicto_revision'?'Otra edición cambió el libro. Tus cantidades pendientes siguen conservadas.':!store.verified?'Copia local: requiere verificar el libro.':store.error?'Sin confirmación: se conservan los resultados y cambios.':store.dirty()?'Cambios pendientes. Resultados de la última lectura confirmada.':'Lectura confirmada de Sheets';
      const fields=m.campos.filter(c=>c.id.startsWith('in'));
      const editor=c=>`<label class="pn-field"><span>${escape(c.id==='inProf'?'Profundizar (0 no / 1 sí)':labelFor(c.id))}</span><input type="number" data-native-field="${c.id}" value="${v[c.id]===null?'':escape(v[c.id])}" min="${c.min}" max="${c.max}" step="${c.kind==='integer'?1:c.step||'any'}" ${!c.editable?'disabled':''} ${!c.nullable?'required':''} placeholder="Pendiente"><small>${c.editable?(c.nullable?'Puede quedar pendiente':'Cantidad capturada'):'Calculado en Sheets'}</small></label>`;
      const resultNames={capacidadConstruida:'Construcción máxima por CUS (m²)',capacidadRentable:'Capacidad rentable (m²)',promedioCapacidad:'Promedio rentable por puerta (m²)',rentableSeleccionado:'Rentable seleccionado (m²)',rentaMes:'Renta mensual',noi:'NOI anual',valorCap:'Valor del activo',yieldOnCost:'Rendimiento sobre inversión',equity:'Equity',mensCredito:'Pago mensual del crédito',coc:'Cash-on-Cash',dscr:'DSCR',patrimH:'Patrimonio al horizonte'};
      const confirmed=st.modeloValido;const pct=new Set(['yieldOnCost','coc']);
      const book=/^https:\/\/docs\.google\.com\/spreadsheets\/d\/[\w-]+(?:\/.*)?$/.test(m.libro_url||'')?m.libro_url:'';
      const summaries=[['Terreno y arquitectura',bar('Rentable / construido',st.capacidadRentable,st.capacidadConstruida)+bar('Mezcla / capacidad rentable',st.rentableSeleccionado,st.capacidadRentable)],['Renta e ingresos',bar('Renta efectiva / renta bruta',st.rentaEfectiva,st.rentaBrutaAnual)+bar('NOI / renta bruta',st.noi,st.rentaBrutaAnual)],['Inversión y costos',bar('Inversión / valor del activo',st.p.inversion,confirmed?st.valorCap:null)+bar('Seguro / inversión',st.seguroMonto,confirmed?st.p.inversion:null)],['Crédito',bar('Crédito / inversión',st.montoCredito,confirmed?st.p.inversion:null)+bar('Servicio anual / NOI',st.servicioAnual,st.noi)],['Horizonte patrimonial',bar('Valor activo / patrimonio final',st.valorH,st.patrimH)+bar('Flujo acumulado / patrimonio final',st.acumH,st.patrimH)]];
      root.innerHTML=`<div class="breadcrumb"><a href="index.html">Potenciales</a> / Patrimonial</div><h1>${escape(meta.nombre_caso||meta.palabra||'Patrimonial')}</h1><p class="pn-status" role="status">${escape(status)}</p><div class="pn-actions"><button data-action="refresh">Releer libro</button><button data-action="retry" ${store.busy||!store.verified||!store.dirty()||store.error==='conflicto_revision'?'disabled':''}>Reintentar pendientes</button>${store.dirty()?'<button data-action="discard">Cargar libro y descartar cambios pendientes</button>':''}${book?`<a href="${escape(book)}" target="_blank" rel="noopener">Abrir libro canónico</a>`:''}<button data-action="cases">Mis casos</button><button data-action="new">Caso nuevo</button></div><div class="pn-summary">${summaries.map(([title,graphic])=>`<section class="pn-card"><h2>${title}</h2>${graphic}</section>`).join('')}</div>
        <section class="pn-card"><h2>Versiones del mismo proyecto</h2><div class="pn-versions">${m.escenarios.map((e,i)=>`<div><b>${i+1}. ${escape(e.nombre)}</b><span>${e.esBase?'Base · ':''}${e.activo?'Activa':''}</span><div class="pn-actions">${['activar','duplicar','renombrar','base','archivar'].map(a=>`<button data-version="${escape(e.id)}" data-operation="${a}" ${blocked||(a==='archivar'&&(e.esBase||e.activo))?'disabled':''}>${({activar:'Usar',duplicar:'Duplicar',renombrar:'Renombrar',base:'Marcar base',archivar:'Archivar'})[a]}</button>`).join('')}</div></div>`).join('')}</div><label>Nombre para duplicar o renombrar <input id="pnVersionName" maxlength="80"></label></section>
        <section class="pn-card"><h2>Capacidad y resultados</h2><p>${st.geometriaEstado==='EXCEDE_CUS'?'La mezcla excede la capacidad rentable por CUS. Se conservan tus cantidades; ajusta la mezcla o el supuesto con su fuente.':st.geometriaEstado==='PENDIENTE'?'Falta capturar terreno, CUS o porcentaje de pasillos. Los resultados financieros permanecen pendientes.':'El CUS capturado determina la capacidad. Verifica su fuente; este supuesto no acredita autorización urbanística.'}</p><div class="pn-grid">${Object.entries(resultNames).map(([k,title])=>`<div class="pn-result"><span>${title}</span><b data-native-result="${k}">${!confirmed&&!k.startsWith('capacidad')&&!['promedioCapacidad','rentableSeleccionado'].includes(k)?'—':number(st[k],pct.has(k))}</b></div>`).join('')}</div></section>
        <section class="pn-card"><h2>Cantidades y supuestos</h2><div class="pn-grid">${fields.map(editor).join('')}</div></section>
        <section class="pn-card"><h2>Mezcla por puerta</h2><p>Activa «Profundizar» para usar esta mezcla. Un espacio vacío conserva el supuesto global o promedio CUS; una renta de cero es una captura válida.</p><div class="pn-table"><table><thead><tr><th>Puerta</th><th>Tipo</th><th>Nivel</th><th>m² capturados</th><th>Renta capturada</th><th>m² usados</th><th>Renta usada</th><th>Fuente</th></tr></thead><tbody>${st.unidades.map((u,i)=>{const prefix='unidad'+String(i+1).padStart(2,'0')+'_';const select=(key,labels)=>`<select data-native-field="${prefix+key}"><option value="" ${v[prefix+key]===null?'selected':''}>Sin capturar</option>${labels.map((s,j)=>`<option value="${j}" ${v[prefix+key]===j?'selected':''}>${s}</option>`).join('')}</select>`;return `<tr><td>${i+1}</td><td>${select('tipo',['Depa','Local'])}</td><td>${select('nivel',['PB','PA','RT'])}</td><td><input type="number" min="0" max="20000" step="any" data-native-field="${prefix}m2" value="${v[prefix+'m2']===null?'':escape(v[prefix+'m2'])}" placeholder="Promedio CUS"></td><td><input type="number" min="0" max="1000000" step="any" data-native-field="${prefix}renta" value="${v[prefix+'renta']===null?'':escape(v[prefix+'renta'])}" placeholder="Renta global"></td><td>${number(u.m2)}</td><td>${number(u.renta)}</td><td>${escape(u.fuente_m2)} / ${escape(u.fuente_renta)}</td></tr>`;}).join('')}</tbody></table></div></section>
        <section class="pn-card"><h2>Comparación confirmada</h2><div class="pn-table"><table><thead><tr><th>Versión</th><th>Capacidad</th><th>NOI anual</th><th>Valor activo</th></tr></thead><tbody>${m.escenarios.map(e=>{const s=m.estados[e.id];return `<tr><td>${escape(e.nombre)}</td><td>${escape(s.geometriaEstado)}</td><td>${s.modeloValido?number(s.noi):'—'}</td><td>${s.modeloValido?number(s.valorCap):'—'}</td></tr>`;}).join('')}</tbody></table></div></section>
        <section class="pn-card"><h2>Horizonte patrimonial</h2><div class="pn-table"><table><thead><tr><th>Año</th><th>Valor</th><th>NOI</th><th>Flujo</th><th>Acumulado</th><th>Saldo deuda</th><th>Patrimonio</th><th>Crecimiento</th></tr></thead><tbody>${st.rows.map(r=>`<tr>${['a','valor','noiA','flujo','acum','saldo','patrim','crec'].map(k=>`<td>${number(r[k],k==='crec')}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section><section class="pn-card"><h2>Datos del caso</h2><label>Nombre <input id="pnCaseName" value="${escape(meta.nombre_caso)}"></label><label>Palabra <input id="pnCaseWord" value="${escape(meta.palabra)}"></label><label>Notas <textarea id="pnCaseNotes">${escape(meta.notas_caso)}</textarea></label><div class="pn-actions"><button data-action="metadata" ${blocked?'disabled':''}>Guardar datos del caso</button><button data-action="export">Exportar lectura confirmada</button></div><p class="pn-message" role="status"></p></section>`;
      root.querySelectorAll('[data-native-field]').forEach(el=>el.addEventListener('change',()=>{try{store.change(el.dataset.nativeField,el.value===''?null:Number(el.value));clearTimeout(timer);timer=setTimeout(async()=>{await store.flush();if(store.dirty()&&!store.error&&store.verified)timer=setTimeout(()=>store.flush(),450);},450);}catch(e){el.setCustomValidity('Revisa el rango y el tipo de esta cantidad');el.reportValidity();}}));
      root.querySelector('[data-action="refresh"]').onclick=()=>store.refresh();root.querySelector('[data-action="retry"]').onclick=()=>store.flush();
      const discard=root.querySelector('[data-action="discard"]');if(discard)discard.onclick=()=>store.refresh(true);
      root.querySelector('[data-action="new"]').onclick=()=>onNew();root.querySelector('[data-action="cases"]').onclick=()=>onCases();
      root.querySelector('[data-action="export"]').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify({metadata:meta,...store.snapshot()},null,2)],{type:'application/json'}));a.download='patrimonial-lectura.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
      root.querySelector('[data-action="metadata"]').onclick=async()=>{if(blocked)return;const patch={nombre_caso:root.querySelector('#pnCaseName').value,palabra:root.querySelector('#pnCaseWord').value,notas_caso:root.querySelector('#pnCaseNotes').value};store.busy=true;paint();try{const r=await post({tipo:'guardar',caso_id:meta.caso_id,...patch,correo:meta.correo,revision_esperada:store.model.revision,version_esperada:meta.version,sendEmail:false,request_id:store.requestId()});if(!r.ok)throw Error(r.error||'sin_confirmacion');if(destroyed)return;Object.assign(meta,patch,{version:r.version});store.acceptRead(r.calculo_sheet);}catch(e){if(!destroyed)store.error='sin_confirmacion';}finally{if(!destroyed){store.busy=false;paint();}}};
      root.querySelectorAll('[data-operation]').forEach(el=>el.onclick=()=>store.version(el.dataset.operation,el.dataset.version,root.querySelector('#pnVersionName').value).catch(()=>{}));
      try{localStorage.setItem(CACHE,JSON.stringify({metadata:meta,...store.snapshot()}));}catch(e){}
    }
    if(cache)store.restore(cache);else store.load(model);
    return {store,destroy(){destroyed=true;agentBridge?.dispose();clearTimeout(timer);store.destroy();root.remove();legacy.forEach(e=>e.hidden=false);document.body.classList.remove('patrimonial-native');},clearCache(){localStorage.removeItem(CACHE);}};
  }
  function cached(){try{return JSON.parse(localStorage.getItem(CACHE)||'null');}catch(e){return null;}}
  return {Store,validate,mount,cached};
});
