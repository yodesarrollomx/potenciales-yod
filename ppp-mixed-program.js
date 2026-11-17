/* Native formula compiler. It returns formula TEXT and a dependency graph;
 * only Sheets evaluates quantities and money. No network, storage or defaults
 * for business assumptions. Not a replacement for the native monthly engine. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.PPPMixedProgram=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const VERSION='ppp-mixed-program-v1';
  const USES=['vivienda','comercio','oficina','hotel','estacionamiento','bodega','otro'];
  const STATES=['confirmado','supuesto','pendiente','en_conflicto','no_aplica'];
  const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
  function fail(code){throw Error(code);}
  function plain(v){return v&&Object.getPrototypeOf(v)===Object.prototype;}
  function text(v,max=240){if(typeof v!=='string'||v.length>max||/[\x00-\x1f]/.test(v))fail('invalid_text');return v;}
  function num(v,{integer=false,max=1e12}={}){if(v===null)return v;if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>max||integer&&!Number.isInteger(v))fail('invalid_quantity');return v;}
  function exact(o,keys){if(!plain(o)||Object.keys(o).some(k=>!keys.includes(k))||keys.some(k=>!own(o,k)))fail('invalid_schema');}
  function source(o){text(o.source,600);if(!STATES.includes(o.status))fail('invalid_status');if(o.status==='confirmado'&&!o.source.trim())fail('source_required');}
  function validate(input){
    exact(input,['schema','terrain','products','costs','budget']);
    if(input.schema!==VERSION)fail('invalid_schema');
    exact(input.terrain,['gross_m2','excluded_m2','normative_base_m2','cos_pct','cus','source','status']);source(input.terrain);
    for(const k of ['gross_m2','excluded_m2','normative_base_m2','cos_pct','cus'])num(input.terrain[k]);
    if(input.terrain.cos_pct>100)fail('invalid_cos');
    if(input.terrain.gross_m2!==null&&input.terrain.excluded_m2!==null&&input.terrain.excluded_m2>input.terrain.gross_m2)fail('invalid_land_area');
    if(!Array.isArray(input.products)||input.products.length>64||!Array.isArray(input.costs)||input.costs.length>256)fail('invalid_capacity');
    const ids=new Set();
    for(const p of input.products){
      exact(p,['id','use','label','active','built_m2','sellable_m2','units','price_basis','price','sale_enabled','source','status']);
      if(!/^[a-zA-Z][\w-]{0,63}$/.test(p.id)||ids.has(p.id))fail('invalid_product_id');ids.add(p.id);
      if(!USES.includes(p.use)||!['m2','unidad'].includes(p.price_basis)||typeof p.active!=='boolean'||![true,false,null].includes(p.sale_enabled))fail('invalid_product');
      text(p.label);source(p);num(p.built_m2);num(p.sellable_m2);num(p.units,{integer:true});num(p.price);
      if(p.built_m2!==null&&p.sellable_m2!==null&&p.sellable_m2>p.built_m2)fail('sellable_exceeds_built');
    }
    const costIds=new Set();
    for(const c of input.costs){
      exact(c,['id','label','active','product_id','quantity_basis','quantity','unit_cost','source','status']);
      if(!/^[a-zA-Z][\w-]{0,63}$/.test(c.id)||costIds.has(c.id))fail('invalid_cost_id');costIds.add(c.id);
      if(typeof c.active!=='boolean'||!['fija','construido','vendible','unidades'].includes(c.quantity_basis))fail('invalid_cost');
      if(c.quantity_basis!=='fija'&&!ids.has(c.product_id))fail('unknown_product');
      if(c.quantity_basis==='fija'&&c.product_id!==null&&!ids.has(c.product_id))fail('unknown_product');
      text(c.label);source(c);num(c.quantity);num(c.unit_cost);
      if(c.quantity_basis!=='fija'&&c.quantity!==null)fail('ambiguous_quantity');
    }
    exact(input.budget,['mode','consolidated','source','status']);source(input.budget);
    if(!['partidas','consolidado'].includes(input.budget.mode))fail('invalid_budget_mode');num(input.budget.consolidated);
    return input;
  }
  function build(input,context){
    validate(input);
    if(!context||!['case_id','scenario_id','revision'].every(k=>typeof context[k]==='string'&&context[k]))fail('context_required');
    const cells=[],nodes=[],rules=[],edges=[],byRef=new Map(),outputs={};
    const sheet='Programa_Mixto';
    function value(ref,id,label,unit,v,meta={}){
      cells.push({ref,value:v,editable:meta.editable!==false,source:meta.source||'',status:meta.status||'pendiente'});
      const node={id,label,unit,field_refs:[id],cell_ref:sheet+'!'+ref,status:meta.status||'pendiente'};
      nodes.push(node);byRef.set(ref,node);return ref;
    }
    function formula(ref,id,label,unit,expression,dependencies,operation){
      if(new Set(dependencies).size!==dependencies.length||dependencies.some(d=>!byRef.has(d)))fail('invalid_dependency');
      const ins=dependencies.map(d=>byRef.get(d).id),rule={id:'rule:'+id,version:VERSION,inputs:ins,outputs:[id],operation,formula:expression};
      cells.push({ref,formula:expression,editable:false});
      nodes.push({id,label,unit,field_refs:[id],cell_ref:sheet+'!'+ref,status:'pendiente'});byRef.set(ref,nodes.at(-1));rules.push(rule);
      ins.forEach((from,i)=>edges.push({id:id+':'+i,from,to:id,kind:'dependency',rule_id:rule.id,rule_version:VERSION}));return ref;
    }
    const t=input.terrain;
    [['B2','gross_m2','Terreno bruto','m²'],['B3','excluded_m2','Área excluida','m²'],['B4','normative_base_m2','Base normativa documentada','m²'],['B5','cos_pct','COS documentado','%'],['B6','cus','CUS documentado','veces']].forEach(([ref,id,label,unit])=>value(ref,'land:'+id,label,unit,t[id],t));
    formula('B7','land:net','Terreno neto','m²','=IF(COUNT(B2:B3)<2;"";B2-B3)',['B2','B3'],'resta');
    formula('B8','land:footprint_limit','Huella permitida','m²','=IF(COUNT(B4:B5)<2;"";B4*B5/100)',['B4','B5'],'multiplicación / 100');
    formula('B9','land:built_limit','Construcción permitida','m²','=IF(COUNT(B4;B6)<2;"";B4*B6)',['B4','B6'],'multiplicación');
    const productRefs=new Map(),allProducts=[];
    input.products.forEach((p,i)=>{
      const r=16+i,id='product:'+p.id,refs={};
      const fields=[['A','id','ID',''],['B','use','Uso',''],['C','label','Producto',''],['D','active','Activo','booleano'],['E','built_m2','Construido','m²'],['F','sellable_m2','Vendible','m²'],['G','units','Unidades','unidad'],['H','price_basis','Base de precio',''],['I','price','Precio','MXN/base'],['J','sale_enabled','Venta habilitada','booleano'],['K','source','Fuente',''],['L','status','Estado','']];
      fields.forEach(([col,key,label,unit])=>{refs[key]=value(col+r,id+':'+key,p.label+' · '+label,unit,p[key],{source:p.source,status:p.status,editable:key!=='id'});});
      const deps=['D','F','G','H','I','J','L'].map(c=>c+r);
      refs.revenue=formula('M'+r,id+':revenue',p.label+' · Venta proyectada','MXN',`=IF(D${r}=FALSE;0;IF(OR(L${r}="pendiente";L${r}="en_conflicto";L${r}="no_aplica";ISBLANK(J${r}));"";IF(J${r}=FALSE;0;IF(H${r}="m2";IF(COUNT(F${r};I${r})<2;"";F${r}*I${r});IF(COUNT(G${r};I${r})<2;"";G${r}*I${r})))))`,deps,'cantidad × precio; venta habilitada');
      refs.efficiency=formula('N'+r,id+':efficiency',p.label+' · Eficiencia','ratio',`=IF(COUNT(E${r}:F${r})<2;"";IF(E${r}>0;F${r}/E${r};""))`,['E'+r,'F'+r],'división');
      for(const [col,key,raw,label] of [['O','active_built',refs.built_m2,'Construido activo'],['P','active_sellable',refs.sellable_m2,'Vendible activo']])refs[key]=formula(col+r,id+':'+key,p.label+' · '+label,'m²',`=IF(D${r}=FALSE;0;IF(COUNT(${raw})<1;"";${raw}))`,['D'+r,raw],'cantidad activa; faltante no es cero');
      productRefs.set(p.id,refs);allProducts.push(refs);
    });
    const activeCosts=[];
    input.costs.forEach((c,i)=>{
      const r=84+i,id='cost:'+c.id;
      [['A','id'],['B','label'],['C','product_id'],['D','active'],['E','quantity_basis'],['F','quantity'],['G','unit_cost'],['H','source'],['I','status']].forEach(([col,key])=>value(col+r,id+':'+key,c.label+' · '+key,'',c[key],{source:c.source,status:c.status,editable:!['id','product_id','quantity_basis'].includes(key)}));
      const p=productRefs.get(c.product_id),mapped=c.quantity_basis==='fija'?'F'+r:p[{construido:'built_m2',vendible:'sellable_m2',unidades:'units'}[c.quantity_basis]];
      // Membership is not a multiplier: a fixed shared cost is represented once.
      const dependencies=['D'+r,'G'+r,'I'+r,mapped,...(p?[p.active]:[])];
      
      formula('J'+r,id+':total',c.label+' · Costo','MXN',`=IF(D${r}=FALSE;0;IF(OR(I${r}="pendiente";I${r}="en_conflicto";I${r}="no_aplica"${p?';'+p.active+'=FALSE':''});"";IF(COUNT(${mapped};G${r})<2;"";${mapped}*G${r})))`,dependencies,'cantidad × costo unitario');
      activeCosts.push('J'+r);
    });
    function total(ref,id,label,unit,refs){
      if(!refs.length){value(ref,id,label,unit,null,{editable:false});return ref;}
      return formula(ref,id,label,unit,`=IF(COUNT(${refs.join(';')})<${refs.length};"";SUM(${refs.join(';')}))`,refs,'suma completa; faltante no es cero');
    }
    outputs.built=total('E2','total:built','Construido activo','m²',allProducts.map(p=>p.active_built));
    outputs.sellable=total('E3','total:sellable','Vendible activo','m²',allProducts.map(p=>p.active_sellable));
    outputs.sales=total('E4','total:sales','Ventas activas','MXN',allProducts.map(p=>p.revenue));
    outputs.itemized_cost=total('E5','total:itemized_cost','Partidas activas','MXN',activeCosts);
    value('E6','budget:mode','Modo de presupuesto','',input.budget.mode,input.budget);
    value('E7','budget:consolidated','Presupuesto consolidado','MXN',input.budget.consolidated,input.budget);
    value('E8','budget:status','Estado del presupuesto','',input.budget.status,input.budget);
    outputs.direct_cost=formula('E9','total:direct_cost','Costo directo elegido','MXN','=IF(E6="partidas";IF(COUNT(E5)=1;E5;"");IF(OR(E8="pendiente";E8="en_conflicto";E8="no_aplica");"";IF(COUNT(E7)=1;E7;"")))',['E5','E6','E7','E8'],'selección exclusiva; no sumar consolidado y partidas');
    outputs.capacity_delta=formula('E10','check:capacity_delta','Capacidad menos programa','m²','=IF(COUNT(B9;E2)<2;"";B9-E2)',['B9','E2'],'control de capacidad; no asignación de área');
    return {schema:VERSION,sheet,cells,outputs,graph:{schema_version:1,...context,nodes,rules,edges},
      calculated:false,status:'migration_plan',required_readbacks:['native_formula_values','source_conflicts','normative_area_basis','monthly_cash','debt','waterfall'],
      pending_modules:['monthly_cash','restricted_deposits','operating_income','debt','waterfall','taxes']};
  }
  return {VERSION,USES,STATES,validate,build};
});
