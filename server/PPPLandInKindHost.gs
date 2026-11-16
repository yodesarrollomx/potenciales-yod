/* Existing Portero integration. No endpoint, permission or credential added.
 * Call only after the usual authentication. Payloads carry no sheet ranges. */
function pppLandContext_(d) {
  var ctx=pppVolumesContext_({caso_id:d.caso_id||d.id,escenario_id:d.escenario_id,tipo_desarrollo:'vertical',k:d.k},'write');
  if(!esAdmin_(d.k))throw Error('land_owner_required');
  var row=ctx.ss.getSheetByName('Versiones').getDataRange().getValues().filter(function(v){return v[0]===ctx.scenario_id;})[0];
  if(!row||row[5]==='ARCHIVADO')throw Error('land_version_missing');
  ctx.version=row;ctx.sheet=ctx.ss.getSheetByName(String(row[4]));
  ctx.volume=pppVolumesStore_(ctx.ss).info(ctx.scenario_id);
  if(!ctx.volume||ctx.volume.values[7]!=='ready')throw Error('land_native_program_required');
  return ctx;
}
function pppLandRevision_(ctx) {
  var sheets=[ctx.sheet,ctx.ss.getSheetByName(String(ctx.volume.values[1])),ctx.ss.getSheetByName('PA_'+ctx.scenario_id)];
  return pppVolumesHash_(PPPVolumes.stable([ctx.version,sheets.map(function(s){return [s.getName(),s.getDataRange().getValues(),s.getDataRange().getFormulas()];})]));
}
function pppLandTerms_(sheet) {
  if(sheet.getRange('B248').getValue()!==PPPLandInKind.version)return null;
  var rows=sheet.getRange(250,2,9,1).getValues(),out={};
  PPPLandInKind.fields.forEach(function(f,i){out[f[0]]=rows[i][0];});return out;
}
function pppLandSummary_(sheet) {
  var out={},rows=sheet.getRange(8,6,263,2).getValues();
  rows.forEach(function(r){if(r[0])out[String(r[0])]=r[1]===''?null:r[1];});
  return out;
}
function pppLandRead_(d) {
  try {
    var ctx=pppLandContext_(d),rows=ctx.ss.getSheetByName('Versiones').getDataRange().getValues().slice(1),versions=[];
    rows.filter(function(r){return r[0]&&r[5]!=='ARCHIVADO';}).forEach(function(v){
      var sheet=ctx.ss.getSheetByName(String(v[4])),terms=pppLandTerms_(sheet);
      if(terms||v[0]===ctx.scenario_id)versions.push({id:String(v[0]),name:String(v[1]),base:!!v[2],active:!!v[3],terms:terms,results:pppLandSummary_(sheet)});
    });
    return {ok:true,schema:PPPLandInKind.version,case_id:ctx.caso_id,scenario_id:ctx.scenario_id,revision:pppLandRevision_(ctx),fields:PPPLandInKind.fields,versions:versions};
  }catch(e){return {ok:false,error:e.message||'land_read_failed'};}
}
function pppLandCell_(sheet,row,col,value,formula) {
  var data={};data[formula?'formulaValue':typeof value==='number'?'numberValue':typeof value==='boolean'?'boolValue':'stringValue']=value;
  return {updateCells:{start:{sheetId:sheet.getSheetId(),rowIndex:row-1,columnIndex:col-1},rows:[{values:[{userEnteredValue:data}]}],fields:'userEnteredValue'}};
}
function pppLandSeal_(ctx) {
  var list=[String(ctx.volume.values[1]),ctx.sheet.getName(),'PA_'+ctx.scenario_id];
  var hash=pppVolumesHash_(PPPVolumes.stable(list.map(function(n){return [n,ctx.ss.getSheetByName(n).getDataRange().getFormulas()];})));
  ctx.ss.getSheetByName('Volumenes_Indice').getRange(ctx.volume.row,10).setValue(hash);
  var stages=pppStagesStore_(ctx.ss),entry=stages.info(ctx.scenario_id);
  if(entry)ctx.ss.getSheetByName('Etapas_Indice').getRange(entry.row,7).setValue(pppVolumesHash_(PPPStages.stable(stages.formulaMaterial(ctx.scenario_id))));
}
function pppLandInstall_(ctx,terms,requestId) {
  var h=ctx.sheet;if(pppLandTerms_(h))return;
  if(ctx.version[2])throw Error('land_base_immutable');
  var checks={88:'resSell',97:'units',164:'sales',165:'land',168:'hard',178:'totalMonths',198:'ownerCapital',223:'profit'};
  var keys=h.getRange(1,6,270,1).getValues();
  Object.keys(checks).forEach(function(r){if(keys[Number(r)-1][0]!==checks[r])throw Error('land_template_mismatch');});
  if(h.getRange('A248:B270').getValues().some(function(r){return r.some(function(x){return x!=='';});}))throw Error('land_reserved_range_used');
  if(h.getRange('F248:G270').getValues().some(function(r){return r.some(function(x){return x!=='';});}))throw Error('land_metric_range_used');
  var plan=PPPLandInKind.build({revenue:h.getRange(8,12,120,1).getFormulas().map(function(r){return r[0];})});
  // Private immutable backup before any formula change; not another version.
  var backup=h.copyTo(ctx.ss).setName('PTB_'+ctx.scenario_id);
  backup.getRange('A1').setValue('Respaldo previo a pago en especie · '+requestId);
  pppVolumesProtectClone_(backup,false,true,ctx.ss);
  var patches=plan.patches.map(function(p){var a=PPPVolumesFormulas.cellAddress(p.cell);return pppLandCell_(h,a.row,a.column,p.formula,true);});
  patches.push(pppLandCell_(h,248,1,'Pago del terreno en viviendas'));
  patches.push(pppLandCell_(h,248,2,PPPLandInKind.version));
  plan.fields.forEach(function(f){patches.push(pppLandCell_(h,f[2],1,f[1]));patches.push(pppLandCell_(h,f[2],2,terms[f[0]]));});
  plan.metrics.forEach(function(m){patches.push(pppLandCell_(h,m.row,6,m.key));});
  pppVolumesAudit_(ctx.ss,{action:'land-formulas-before',actor:ctx.actor,caso_id:ctx.caso_id,escenario_id:ctx.scenario_id,request_id:requestId,before:{backup:backup.getName()},after:{schema:plan.version},reason:'Owner-requested in-kind payment comparison; native formulas only'});
  pppVolumesAtomic_(ctx.ss.getId(),patches);
  h.getRange('B250:B258').setNumberFormat('#,##0.00');h.getRange('B250:B258').setBackground('#fff2cc');
  h.getRange('A249').setValue('Supuestos editables. Equivalentes en viviendas: falta elegir unidades concretas.');
  pppLandSeal_(ctx);
}
function pppLandRequest_(d) {
  return pppBloqueado_(function(){
    var ctx,ledger,row,before,applied=false;
    try {
      ctx=pppLandContext_(d);
      if(!ctx.can_write)throw Error('land_native_formulas_changed');
      if(!/^[A-Za-z0-9_-]{8,100}$/.test(String(d.request_id||'')))throw Error('land_request_id');
      if(['duplicate','save','balance'].indexOf(d.action)<0)throw Error('land_action');
      var signature=pppVolumesHash_(PPPVolumes.stable({actor:ctx.actor,case_id:ctx.caso_id,scenario_id:ctx.scenario_id,action:d.action,terms:d.terms,name:d.name,revision:d.revision_esperada}));
      ledger=ctx.ss.getSheetByName('PagoTierra_Operaciones');
      if(!ledger){ledger=ctx.ss.insertSheet('PagoTierra_Operaciones');ledger.appendRow(['request_id','actor','payload_hash','state','target','timestamp']);pppVolumesProtectClone_(ledger,false,true,ctx.ss);}
      var all=ledger.getDataRange().getValues(),matches=[];
      all.forEach(function(r,i){if(r[0]===d.request_id)matches.push({row:i+1,values:r});});
      if(matches.length){
        if(matches.length!==1||matches[0].values[1]!==ctx.actor||matches[0].values[2]!==signature)throw Error('land_request_mismatch');
        if(matches[0].values[3]!=='confirmed')throw Error('land_operation_pending');
        return pppLandRead_({caso_id:ctx.caso_id,escenario_id:matches[0].values[4],k:d.k});
      }
      if(!d.revision_esperada||pppLandRevision_(ctx)!==d.revision_esperada)throw Error('land_revision_conflict');
      var terms=d.action==='balance'?pppLandTerms_(ctx.sheet):PPPLandInKind.validate(d.terms);
      if(!terms)throw Error('land_terms_missing');
      var limits=pppLandSummary_(ctx.sheet);
      if(terms.upfront>limits.land||terms.reserved_area>limits.resSell||terms.delivery_start<=limits.buildFinish||terms.delivery_start+terms.delivery_months-1>limits.totalMonths)throw Error('land_program_invalid');
      if(d.action==='duplicate'&&(typeof d.name!=='string'||!d.name.trim()||d.name.length>80))throw Error('land_version_name');
      if(ctx.version[2]&&d.action!=='duplicate')throw Error('land_base_immutable');
      row=ledger.getLastRow()+1;ledger.appendRow([d.request_id,ctx.actor,signature,'pending',ctx.scenario_id,new Date()]);
      if(d.action==='duplicate'){
        if(typeof d.name!=='string'||!d.name.trim()||d.name.length>80)throw Error('land_version_name');
        var cloned=pppVolumesCloneScenario_(ctx,{request_id:d.request_id,revision_esperada:pppRevision_(ctx.ss),nombre:d.name});
        if(!cloned||!cloned.ok||!cloned.scenario_id)throw Error('land_clone_pending');
        ctx=pppLandContext_({caso_id:ctx.caso_id,escenario_id:cloned.scenario_id,k:d.k});
        ledger.getRange(row,5).setValue(ctx.scenario_id);
        pppLandInstall_(ctx,terms,d.request_id);
      }
      if(!pppLandTerms_(ctx.sheet))throw Error('land_terms_missing');
      before=pppLandTerms_(ctx.sheet);
      var changes=PPPLandInKind.fields.map(function(f){return pppLandCell_(ctx.sheet,f[2],2,terms[f[0]]);});
      pppVolumesAtomic_(ctx.ss.getId(),changes);applied=true;
      if(d.action==='balance'||d.action==='duplicate'){
        var maximum=ctx.sheet.getRange('G88').getValue();
        try{
          PPPLandInKind.solve(function(area){ctx.sheet.getRange('B257').setValue(area);SpreadsheetApp.flush();return ctx.sheet.getRange('G252').getValue();},maximum,1);
        }catch(e){ctx.sheet.getRange('B257').setValue(before.reserved_area);SpreadsheetApp.flush();throw e;}
      }
      SpreadsheetApp.flush();
      if(ctx.sheet.getRange('G259').getValue()!==true)throw Error('land_program_invalid');
      pppVolumesAudit_(ctx.ss,{action:'land-'+d.action,actor:ctx.actor,caso_id:ctx.caso_id,escenario_id:ctx.scenario_id,request_id:d.request_id,before:before,after:pppLandTerms_(ctx.sheet)});
      ledger.getRange(row,4).setValue('confirmed');SpreadsheetApp.flush();
      return pppLandRead_({caso_id:ctx.caso_id,escenario_id:ctx.scenario_id,k:d.k});
    }catch(e){
      if(applied&&before){try{pppVolumesAtomic_(ctx.ss.getId(),PPPLandInKind.fields.map(function(f){return pppLandCell_(ctx.sheet,f[2],2,before[f[0]]);}));SpreadsheetApp.flush();}catch(rollback){return {ok:false,error:'land_rollback_pending',request_id:d.request_id,scenario_id:ctx.scenario_id};}}
      if(ledger&&row)ledger.getRange(row,4).setValue('failed:'+String(e.message||'unknown').slice(0,100));
      return {ok:false,error:e.message||'land_write_failed',request_id:d.request_id,scenario_id:ctx&&ctx.scenario_id};
    }
  });
}
