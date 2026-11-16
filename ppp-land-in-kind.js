/* Payment editor. Financial values and balancing are supplied by native Sheets. */
(function(root){
  'use strict';
  const methods=['Utilidad compartida','Interés simple anual','Porcentaje de ventas'];
  const notes=[
    'Se devuelve el saldo del terreno en viviendas y se agrega su participación en la utilidad positiva. La utilidad descuenta costo completo, comisiones, intereses y comisión del crédito; el desarrollador recupera su capital de la caja final.',
    'El saldo del terreno gana interés simple anual. La primera entrega paga lo acumulado; después el interés baja conforme se devuelve el principal. No se capitalizan intereses.',
    'El porcentaje incluye terreno y rendimiento. Se aplica al valor de las ventas a terceros más las viviendas adjudicadas al precio base. Se descuenta el anticipo ya pagado.'
  ];
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number=x=>typeof x==='number'&&Number.isFinite(x);
  const money=x=>number(x)?new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:0}).format(x):'—';
  const qty=x=>number(x)?x.toLocaleString('es-MX',{maximumFractionDigits:2}):'—';
  function valid(r,c){return !!(r?.ok&&r.schema==='native-land-in-kind-v1'&&r.case_id===c.caseId&&typeof r.revision==='string'&&Array.isArray(r.versions)&&r.versions.some(v=>v.id===r.scenario_id));}
  function mount(options){
    const doc=options.document||document,host=doc.createElement('details');host.id='pppLand';host.className='ppp-land';
    host.innerHTML='<summary>Pago del terreno · comparar acuerdos</summary><div class="land-body"><p>Anticipo en efectivo y saldo en viviendas. Cada acuerdo conserva su propia versión.</p><button type="button" class="small-btn" data-load>Leer acuerdos guardados</button><p role="status" data-status></p><div data-editor></div><div data-comparison></div></div>';
    options.anchor.after(host);
    let data=null,identity='',busy=false,dirty=false,epoch=0;
    const status=t=>{host.querySelector('[data-status]').textContent=t;};
    const ctx=()=>options.context();
    const same=c=>{const n=ctx();return n.caseId===c.caseId&&n.scenarioId===c.scenarioId&&n.identity===c.identity;};
    function selected(){return data?.versions.find(v=>v.id===data.scenario_id);}
    function disable(){host.querySelectorAll('button,input,select').forEach(e=>{e.disabled=busy||!ctx().ready;});}
    function defaults(v){return v.terms||{method:1,upfront:0,profit_share:50,annual_rate:20,sales_share:20,delivery_start:(v.results.buildFinish||0)+1,delivery_months:6,reserved_area:0,commission_in_kind:0};}
    function comparison(){
      const rows=data.versions.filter(v=>v.terms),box=host.querySelector('[data-comparison]');
      if(!rows.length){box.textContent='Todavía no hay acuerdos de pago en viviendas guardados.';return;}
      const metrics=[['Anticipo en efectivo','kindUpfront',money],['Viviendas para la familia · m²','kindReservedArea',qty],['Viviendas equivalentes para la familia','kindEquivalentUnits',qty],['Valor entregado en viviendas','kindValue',money],['Ganancia del propietario','ownerGain',money],['Viviendas equivalentes que generan cobros','kindCashUnits',qty],['Cobros de terceros','sales',money],['Pico del crédito','peak',money],['Deuda al cierre','debt',money],['Faltante al cierre','fundingGap',money],['Ganancia del desarrollador','devGain',money],['TIR del desarrollador','devIrr',v=>number(v)?qty(v*100)+'%':'—'],['Utilidad total antes de impuestos','profit',money],['Diferencia por cubrir en viviendas','kindDifference',money]];
      box.innerHTML='<h3>Acuerdos guardados</h3><div class="land-table"><table><thead><tr><th>Resultado</th>'+rows.map(v=>'<th>'+esc(v.name)+'</th>').join('')+'</tr></thead><tbody>'+metrics.map(([label,key,format])=>'<tr><th>'+label+'</th>'+rows.map(v=>'<td>'+esc(format(v.results[key]))+'</td>').join('')+'</tr>').join('')+'<tr><th>Verificación</th>'+rows.map(v=>'<td>'+ (v.results.kindReady===true?'Equilibrado y sin deuda durante las entregas':v.results.kindBalanced!==true?'Recalcular viviendas para cerrar el acuerdo':'Revisar deuda, calendario o conciliación')+'</td>').join('')+'</tr></tbody></table></div><p class="note">Las viviendas equivalentes no son una selección de departamentos concretos. Su valor usa el precio base del PPP. Las rentas y los locales conservados no se convierten en cobros de venta.</p>';
    }
    function paint(){
      const v=selected();if(!v)return;const t=defaults(v),form=host.querySelector('[data-editor]');
      const input=(key,label,step=1)=>'<label>'+label+'<input name="'+key+'" type="number" min="0" step="'+step+'" value="'+t[key]+'" required></label>';
      form.innerHTML='<h3>'+esc(v.name)+'</h3><p class="note">'+(v.terms?'Acuerdo guardado; puedes editarlo o duplicarlo.':'Propuesta sin guardar. Se creará una versión conservando la original.')+'</p><form><label>Forma de pago<select name="method">'+methods.map((name,i)=>'<option value="'+(i+1)+'"'+(t.method===i+1?' selected':'')+'>'+name+'</option>').join('')+'</select></label><p data-rule class="note"></p><div class="land-inputs">'+input('upfront','Anticipo al inicio · MXN',1000)+input('profit_share','Utilidad para el propietario · %',0.1)+input('annual_rate','Interés simple anual · %',0.1)+input('sales_share','Pago total sobre ventas · %',0.1)+input('delivery_start','Primera entrega · mes')+input('delivery_months','Meses de entrega')+input('reserved_area','Vivienda reservada · m²',0.01)+'<label>Comisión sobre adjudicaciones<select name="commission_in_kind"><option value="0">No</option><option value="1">Sí</option></select></label></div><label>Nombre de la nueva versión<input name="version_name" maxlength="80" value="'+esc(v.terms?v.name+' · alternativa':'Acuerdo · '+methods[t.method-1])+'"></label><div class="land-actions"><button type="button" class="small-btn" data-action="duplicate">Guardar como nueva versión y calcular viviendas</button>'+(v.terms?'<button type="button" class="small-btn secondary" data-action="save">Guardar estos valores</button><button type="button" class="small-btn secondary" data-action="balance">Recalcular viviendas del acuerdo guardado</button>':'')+'</div></form>';
      form.querySelector('[name=commission_in_kind]').value=String(t.commission_in_kind);
      const rule=()=>{const m=Number(form.querySelector('[name=method]').value);form.querySelector('[data-rule]').textContent=notes[m-1];['profit_share','annual_rate','sales_share'].forEach((k,i)=>{form.querySelector('[name='+k+']').closest('label').hidden=m!==i+1;});};rule();
      form.querySelector('[name=method]').addEventListener('change',rule);
      form.querySelector('form').addEventListener('submit',e=>e.preventDefault());
      form.querySelector('form').addEventListener('input',()=>{dirty=true;status('Cambios sin guardar. Los resultados de la tabla siguen siendo los confirmados.');});
      form.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>write(b.dataset.action));
      comparison();disable();
    }
    async function read(){
      const c=ctx();if(busy||!c.ready)return;const turn=++epoch;busy=true;disable();status('Leyendo los acuerdos del libro…');
      try{const r=await options.read({recurso:'sheet-land',caso_id:c.caseId,escenario_id:c.scenarioId});if(turn!==epoch||!same(c))return;if(!valid(r,c))throw Error(r.error||'Respuesta incompleta');data=r;dirty=false;paint();status('Acuerdos confirmados en el libro.');}
      catch(e){if(same(c))status('No se confirmó la lectura: '+e.message);}
      finally{busy=false;disable();}
    }
    async function write(action){
      const c=ctx();if(busy||!c.ready||!data)return;
      if(action==='balance'&&dirty){status('Guarda primero los cambios; después recalcula las viviendas.');return;}
      const form=host.querySelector('form');if(!form.reportValidity())return;
      const terms={};for(const key of ['method','upfront','profit_share','annual_rate','sales_share','delivery_start','delivery_months','reserved_area','commission_in_kind'])terms[key]=Number(form.elements[key].value);
      const payload={tipo:'sheet-land',action,caso_id:c.caseId,escenario_id:data.scenario_id,revision_esperada:data.revision,request_id:crypto.randomUUID(),terms,name:form.elements.version_name.value};
      busy=true;disable();status('Guardando en el libro y recalculando el flujo. Espera la confirmación…');options.busy(true);
      try{const r=await options.write(payload);if(!same(c))return;if(!valid(r,c))throw Error(r.error||'Respuesta incompleta');data=r;dirty=false;paint();status('Guardado confirmado. Actualizando el resto del visor…');await options.refresh(r.scenario_id);identity=[ctx().identity,ctx().caseId,ctx().scenarioId].join('|');status('Acuerdo guardado y visor actualizado.');}
      catch(e){status('No se confirmó la operación: '+e.message+'. Lee los acuerdos antes de volver a guardar.');data=null;}
      finally{busy=false;options.busy(false);disable();}
    }
    host.querySelector('[data-load]').onclick=read;
    function update(){const c=ctx(),key=[c.identity,c.caseId,c.scenarioId].join('|');host.hidden=!c.native;if(key!==identity&&!busy){identity=key;data=null;dirty=false;epoch++;host.querySelector('[data-editor]').replaceChildren();host.querySelector('[data-comparison]').replaceChildren();status('Lee los acuerdos de esta versión para editarlos.');}disable();}
    update();return{update,read};
  }
  root.PPPLandUI={mount,valid};if(typeof module!=='undefined')module.exports=root.PPPLandUI;
})(typeof window==='undefined'?globalThis:window);
