/* PPP 4.0: pure navigation/dependency and question selection helpers.
 * This module never calculates, persists, authorizes, or confirms a change. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PPP40Graph = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const kinds = new Set(['membership', 'dependency', 'alternative', 'evidence', 'task']);
  const statuses = new Set(['confirmado', 'supuesto', 'pendiente', 'en_conflicto', 'no_aplica']);
  const string = x => typeof x === 'string' && x.trim().length > 0;
  const strings = x => Array.isArray(x) && x.every(string) && new Set(x).size === x.length;
  const fail = (code, id) => id ? { code, id } : { code };
  const key = (id, version) => JSON.stringify([id, version]);

  function validateGraph(graph) {
    const errors = [];
    if (!graph || typeof graph !== 'object' || graph.schema_version !== 1 ||
        !string(graph.case_id) || !string(graph.scenario_id) || !string(graph.revision) ||
        !Array.isArray(graph.nodes) || !Array.isArray(graph.edges) || !Array.isArray(graph.rules)) {
      return { ok: false, errors: [fail('invalid_graph')] };
    }
    const nodes = new Map(), rules = new Map(), edgeIds = new Set();
    for (const node of graph.nodes) {
      if (!node || !string(node.id) || !strings(node.field_refs)) { errors.push(fail('invalid_node')); continue; }
      if (nodes.has(node.id)) errors.push(fail('duplicate_node', node.id));
      else nodes.set(node.id, node);
    }
    for (const rule of graph.rules) {
      if (!rule || !string(rule.id) || !string(rule.version) || !strings(rule.inputs) || !rule.inputs.length || !strings(rule.outputs) || !rule.outputs.length) { errors.push(fail('invalid_rule')); continue; }
      const k = key(rule.id, rule.version);
      if (rules.has(k)) errors.push(fail('duplicate_rule', rule.id)); else rules.set(k, rule);
    }
    const knownFields = new Set([...nodes.values()].flatMap(n => n.field_refs));
    for (const rule of rules.values()) {
      if ([...rule.inputs, ...rule.outputs].some(id => !knownFields.has(id))) errors.push(fail('broken_rule_field', rule.id));
    }
    const adjacency = new Map();
    for (const edge of graph.edges) {
      if (!edge || !string(edge.id) || !string(edge.from) || !string(edge.to) || !kinds.has(edge.kind)) { errors.push(fail('invalid_edge')); continue; }
      if (edgeIds.has(edge.id)) { errors.push(fail('duplicate_edge', edge.id)); continue; }
      edgeIds.add(edge.id);
      if (!nodes.has(edge.from) || !nodes.has(edge.to)) { errors.push(fail('broken_reference', edge.id)); continue; }
      if (edge.kind !== 'dependency') continue;
      const rule = rules.get(key(edge.rule_id, edge.rule_version));
      if (!rule) { errors.push(fail('missing_rule', edge.id)); continue; }
      const from = nodes.get(edge.from).field_refs.filter(f => rule.inputs.includes(f));
      const to = nodes.get(edge.to).field_refs.filter(f => rule.outputs.includes(f));
      if (!from.length || !to.length) { errors.push(fail('rule_binding', edge.id)); continue; }
      for (const a of from) for (const b of to) {
        if (!adjacency.has(a)) adjacency.set(a, new Set());
        adjacency.get(a).add(b);
      }
    }
    const marks = new Map();
    function visit(id) {
      if (marks.get(id) === 1) return false;
      if (marks.get(id) === 2) return true;
      marks.set(id, 1);
      for (const next of adjacency.get(id) || []) if (!visit(next)) return false;
      marks.set(id, 2); return true;
    }
    for (const id of adjacency.keys()) if (!visit(id)) { errors.push(fail('dependency_cycle')); break; }
    return { ok: errors.length === 0, errors };
  }
  function sameContext(graph, context) {
    return context && graph.case_id === context.case_id && graph.scenario_id === context.scenario_id && graph.revision === context.revision;
  }
  function affected(graph, changedFieldIds, context) {
    const valid = validateGraph(graph);
    if (!valid.ok) return { ok: false, errors: valid.errors, fields: [] };
    if (!sameContext(graph, context)) return { ok: false, errors: [fail('context_mismatch')], fields: [] };
    if (!strings(changedFieldIds)) return { ok: false, errors: [fail('invalid_fields')], fields: [] };
    const known = new Set(graph.nodes.flatMap(n => n.field_refs));
    if (changedFieldIds.some(id => !known.has(id))) return { ok: false, errors: [fail('unknown_field')], fields: [] };
    const nodes = new Map(graph.nodes.map(n => [n.id, n]));
    const rules = new Map(graph.rules.map(r => [key(r.id, r.version), r]));
    const adjacency = new Map();
    for (const edge of graph.edges) if (edge.kind === 'dependency') {
      const rule = rules.get(key(edge.rule_id, edge.rule_version));
      for (const a of nodes.get(edge.from).field_refs.filter(f => rule.inputs.includes(f))) {
        if (!adjacency.has(a)) adjacency.set(a, new Set());
        for (const b of nodes.get(edge.to).field_refs.filter(f => rule.outputs.includes(f))) adjacency.get(a).add(b);
      }
    }
    const causes = new Map(), queue = [];
    for (const id of [...changedFieldIds].sort()) queue.push([id, id]);
    const visited = new Set();
    while (queue.length) {
      const [id, cause] = queue.shift(), k = key(id, cause);
      if (visited.has(k)) continue;
      visited.add(k);
      for (const next of [...(adjacency.get(id) || [])].sort()) {
        if (!causes.has(next)) causes.set(next, new Set());
        causes.get(next).add(cause); queue.push([next, cause]);
      }
    }
    return { ok: true, errors: [], fields: [...causes].map(([field_id, c]) => ({field_id, causes: [...c].sort()})) };
  }
  function nextQuestions({ catalog, mapping, fields, action, family, context, graph } = {}) {
    const valid = validateGraph(graph);
    if (!valid.ok) return { ok: false, errors: valid.errors, questions: [], primary: null };
    if (!sameContext(graph, context)) return { ok: false, errors: [fail('context_mismatch')], questions: [], primary: null };
    if (!catalog || !Array.isArray(catalog.modules) || !Array.isArray(mapping) || !fields || typeof fields !== 'object' || Array.isArray(fields) || !string(action) || !string(family)) return { ok: false, errors: [fail('invalid_questions_input')], questions: [], primary: null };
    const questions = new Map();
    for (const mod of catalog.modules) {
      if (!mod || !Array.isArray(mod.questions)) return {ok:false, errors:[fail('invalid_catalog')], questions:[], primary:null};
      for (const q of mod.questions) {
        if (!q || !string(q.id) || !string(q.text) || questions.has(q.id)) return {ok:false, errors:[fail('invalid_catalog')], questions:[], primary:null};
        questions.set(q.id, q);
      }
    }
    const mappingIds = new Set(), selected = [];
    for (const m of mapping) {
      if (!m || !string(m.question_id) || mappingIds.has(m.question_id) || !questions.has(m.question_id) || !strings(m.actions) || !m.actions.length || !strings(m.families) || !m.families.length || !strings(m.field_ids) || !m.field_ids.length || !Number.isFinite(m.priority)) return {ok:false,errors:[fail('invalid_mapping')],questions:[],primary:null};
      mappingIds.add(m.question_id);
      if (!m.actions.includes(action) || !m.families.includes(family)) continue;
      const missing = [];
      for (const id of m.field_ids) {
        const f = Object.prototype.hasOwnProperty.call(fields, id) ? fields[id] : undefined;
        if (f !== undefined && (!f || typeof f !== 'object' || !statuses.has(f.status) || !Object.prototype.hasOwnProperty.call(f, 'value'))) return {ok:false,errors:[fail('invalid_field',id)],questions:[],primary:null};
        if (!f || f.status === 'pendiente' || f.status === 'en_conflicto' || (f.status !== 'no_aplica' && f.value == null)) missing.push(id);
      }
      if (missing.length) selected.push({ id: m.question_id, question: questions.get(m.question_id).text, missing, priority: m.priority });
    }
    selected.sort((a,b) => a.priority - b.priority || a.id.localeCompare(b.id));
    const result = selected.map(({priority, ...q}) => q);
    return {ok:true, errors:[], questions:result, primary:result[0] || null};
  }
  return Object.freeze({validateGraph, affected, nextQuestions});
});
