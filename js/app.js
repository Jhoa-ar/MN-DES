import { CONFIG } from './config.js';
import { ASSETS, SCENARIO_DEFS, SCENARIO_ORDER, buildScenario } from './scenarios.js';
import { analyze } from './analysis.js';
import { drawConvergence } from './chart.js';
import { runTests } from './qa.js';

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const N = ASSETS.length;

/* ---------- formato ---------- */
const f6 = (v) => (v === null || v === undefined || Number.isNaN(v) ? '—' : v === 0 ? '0' : Math.abs(v) >= 1e-4 && Math.abs(v) < 1e5 ? v.toFixed(6) : v.toExponential(3));
const sci = (v) => (v === null || v === undefined || Number.isNaN(v) ? '—' : v === 0 ? '0' : v.toExponential(2));
const pct = (v) => (v === null || v === undefined ? 'no definido' : v === 0 ? '0 %' : (v >= 1e-3 ? v.toFixed(4) : v.toExponential(2)) + ' %');
const vec = (x) => '[' + x.map((v) => v.toFixed(5)).join(', ') + ']';
const pill = (ok, yes = 'Sí', no = 'No') => `<span class="pill ${ok ? 'ok' : 'bad'}">${ok ? yes : no}</span>`;
const sub = (i) => `x<sub>${i + 1}</sub>`;

/* ---------- estado ---------- */
const state = { scenario: 'ideal', A: [], b: [], x0: [], tol: '1e-6', maxIter: '200', precond: 'jacobi', omega: '1', mirror: true };
let last = null; // último resultado de analyze()

const parseNum = (t) => {
  const s = String(t).trim().replace(',', '.');
  return s === '' ? NaN : Number(s);
};

function readInputs() {
  return {
    A: state.A.map((r) => r.map(parseNum)),
    b: state.b.map(parseNum),
    x0: state.x0.map(parseNum),
    tol: parseNum(state.tol),
    maxIter: Math.floor(parseNum(state.maxIter)),
    precond: state.precond,
    omega: parseNum(state.omega),
  };
}

/* ---------- Inicio / cabecera ---------- */
function renderHeader() {
  $('#h-meta').innerHTML = [
    ['Estudiante', CONFIG.estudiante], ['Registro', CONFIG.carnet], ['Mención', CONFIG.mencion],
    ['Carrera', CONFIG.carrera], ['Asignatura', `${CONFIG.materia} · ${CONFIG.gestion}`], ['Caso financiero', 'Cartera de 6 activos y análisis de riesgo'],
  ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  $('#foot').textContent = `${CONFIG.estudiante} · ${CONFIG.materia} ${CONFIG.gestion} · Código fuente: ${CONFIG.repo}`;
}

/* ---------- Formulación estática ---------- */
function renderVars() {
  $('#t-vars').innerHTML =
    '<tr><th>Variable</th><th class="l">Activo</th><th class="l">Significado financiero</th><th class="l">Nota</th></tr>' +
    ASSETS.map((a, i) => `<tr><td>${sub(i)}</td><td class="l">${a.name}</td><td class="l">Fracción del capital invertida en ${a.short.toLowerCase()} (negativa = venta en corto)</td><td class="l">${a.note}</td></tr>`).join('');
}

function renderScenarioCards() {
  $('#scn-cards').innerHTML = SCENARIO_ORDER.map((id) => {
    const d = SCENARIO_DEFS[id];
    return `<div class="card" data-card="${id}"><span class="badge">${d.badge}</span><h4>${d.name}</h4><p>${d.justification}</p><button class="btn" type="button" data-load="${id}">Cargar y ejecutar</button></div>`;
  }).join('');
  $$('[data-load]').forEach((b) => b.addEventListener('click', () => loadScenario(b.dataset.load)));

  const defs = SCENARIO_ORDER.map((id) => SCENARIO_DEFS[id]);
  const head = `<tr><th rowspan="2" class="l">Activo</th><th colspan="3">σ (volatilidad)</th><th colspan="3">β (sensibilidad al índice)</th><th colspan="3">μ (rend. en exceso)</th></tr><tr>${'<th>Ideal</th><th>Estrés</th><th>Mal cond.</th>'.repeat(3)}</tr>`;
  const rows = ASSETS.map((a, i) => `<tr><td class="l">${sub(i)} ${a.short}</td>${['sigma', 'beta', 'mu'].map((k) => defs.map((d) => `<td class="mono">${d[k][i]}</td>`).join('')).join('')}</tr>`).join('');
  const g = `<tr><td class="l"><b>γ (aversión)</b></td><td colspan="9" class="l mono">Ideal: ${defs[0].gamma} · Estrés: ${defs[1].gamma} · Mal condicionado: ${defs[2].gamma}</td></tr>`;
  $('#scn-params').innerHTML = `<table>${head}${rows}${g}</table>`;
}

/* ---------- Entrada de datos ---------- */
function renderInputs() {
  const head = '<tr><th></th>' + ASSETS.map((_, j) => `<th>${sub(j)}</th>`).join('') + '</tr>';
  $('#in-A').innerHTML = head + state.A.map((r, i) =>
    `<tr><th>${sub(i)}</th>${r.map((v, j) => `<td><input class="cell" data-i="${i}" data-j="${j}" value="${v}" inputmode="decimal" aria-label="a${i + 1}${j + 1}" /></td>`).join('')}</tr>`).join('');
  $('#in-b').innerHTML = '<tr><th></th><th>b</th></tr>' + state.b.map((v, i) => `<tr><th>b<sub>${i + 1}</sub></th><td><input class="cell" data-b="${i}" value="${v}" inputmode="decimal" aria-label="b${i + 1}" /></td></tr>`).join('');
  $('#in-x0').innerHTML = '<tr><th></th><th>x₀</th></tr>' + state.x0.map((v, i) => `<tr><th>${sub(i)}⁰</th><td><input class="cell" data-x0="${i}" value="${v}" inputmode="decimal" aria-label="x0 ${i + 1}" /></td></tr>`).join('');
  $('#in-tol').value = state.tol; $('#in-max').value = state.maxIter; $('#in-pre').value = state.precond; $('#in-omega').value = state.omega; $('#mirror').checked = state.mirror;
  $('#lbl-omega').style.display = state.precond === 'ssor' ? '' : 'none';
  $$('[data-card]').forEach((c) => c.classList.toggle('active', c.dataset.card === state.scenario));
}

function wireInputs() {
  $('#in-A').addEventListener('input', (e) => {
    const t = e.target; if (t.dataset.i === undefined) return;
    const i = +t.dataset.i, j = +t.dataset.j;
    state.A[i][j] = t.value;
    if (state.mirror && i !== j) { state.A[j][i] = t.value; const m = $(`#in-A input[data-i="${j}"][data-j="${i}"]`); if (m) m.value = t.value; }
    compute();
  });
  $('#in-b').addEventListener('input', (e) => { if (e.target.dataset.b === undefined) return; state.b[+e.target.dataset.b] = e.target.value; compute(); });
  $('#in-x0').addEventListener('input', (e) => { if (e.target.dataset.x0 === undefined) return; state.x0[+e.target.dataset.x0] = e.target.value; compute(); });
  $('#in-tol').addEventListener('input', (e) => { state.tol = e.target.value; compute(); });
  $('#in-max').addEventListener('input', (e) => { state.maxIter = e.target.value; compute(); });
  $('#in-omega').addEventListener('input', (e) => { state.omega = e.target.value; compute(); });
  $('#in-pre').addEventListener('change', (e) => { state.precond = e.target.value; $('#lbl-omega').style.display = state.precond === 'ssor' ? '' : 'none'; compute(); });
  $('#mirror').addEventListener('change', (e) => { state.mirror = e.target.checked; });
  $('#btn-run').addEventListener('click', compute);
  $('#btn-reset').addEventListener('click', () => loadScenario(state.scenario));
}

function loadScenario(id) {
  const def = SCENARIO_DEFS[id];
  const { A, b } = buildScenario(def);
  Object.assign(state, {
    scenario: id, A: A.map((r) => r.map(String)), b: b.map(String), x0: new Array(N).fill('0'),
    tol: '1e-6', maxIter: '200', precond: def.precond, omega: '1',
  });
  renderInputs();
  compute();
  return last;
}

/* ---------- cálculo + render ---------- */
function compute() {
  const inp = readInputs();
  last = analyze(inp);
  const st = $('#status');
  if (!last.ok) {
    st.className = 'status error';
    st.innerHTML = '<b>No se puede resolver el sistema.</b> ' + last.errors.map((e) => `<div>• ${e}</div>`).join('');
    renderValidity(last);
    renderSystem(inp);
    ['#r-body', '#g-body', '#e-body'].forEach((s) => { $(s).innerHTML = '<div class="placeholder">Sin resultados: corrige la entrada (Sección 4) para recalcular.</div>'; });
  } else {
    st.className = 'status ok';
    st.textContent = `Sistema válido (A simétrica y definida positiva). Recalculado: GC ${last.gc.iterations} it · GCP ${last.gcp.iterations} it.`;
    renderValidity(last);
    renderSystem(inp);
    renderReference(last);
    renderGCP(last);
    renderErrors(last);
  }
  $$('input.cell[data-i]').forEach((el) => {
    const v = parseNum(el.value); el.classList.toggle('bad', !Number.isFinite(v));
  });
  return last;
}

function renderSystem(inp) {
  $('#f-scn').textContent = `· datos cargados: ${SCENARIO_DEFS[state.scenario].name}`;
  const head = '<tr><th></th>' + ASSETS.map((_, j) => `<th>${sub(j)}</th>`).join('') + '<th>·</th><th>x</th><th>=</th><th>b</th></tr>';
  const body = inp.A.map((r, i) => `<tr><th>${i + 1}</th>${r.map((v) => `<td class="mono">${f6(v)}</td>`).join('')}<td>·</td><td>${sub(i)}</td><td>=</td><td class="mono">${f6(inp.b[i])}</td></tr>`).join('');
  $('#f-system').innerHTML = `<table>${head}${body}</table>`;
}

function renderValidity(res) {
  const v = res.validation;
  if (!v) { $('#f-valid').innerHTML = `<div class="status error" style="display:block">${res.errors.map((e) => `<div>• ${e}</div>`).join('')}</div>`; return; }
  const sylv = v.minors.length
    ? `<tr><th class="l">Menor principal</th>${v.minors.map((_, k) => `<th>Δ<sub>${k + 1}</sub></th>`).join('')}</tr><tr><td class="l">Valor</td>${v.minors.map((m) => `<td class="mono ${m > 0 ? '' : 'bad'}">${sci(m)}</td>`).join('')}</tr><tr><td class="l">¿&gt; 0?</td>${v.minors.map((m) => `<td>${pill(m > 0, '✓', '✗')}</td>`).join('')}</tr>`
    : '';
  const eig = v.eigenvalues.length ? `<tr><td class="l">Autovalores λ</td>${v.eigenvalues.map((l) => `<td class="mono">${sci(l)}</td>`).join('')}</tr>` : '';
  $('#f-valid').innerHTML = `
    <p>${pill(v.symmetric, 'A = Aᵀ ✓', 'A ≠ Aᵀ ✗')} máx. asimetría relativa = ${sci(v.symError)} &nbsp; ${pill(v.posdef, 'Definida positiva ✓', 'No definida positiva ✗')}</p>
    <div class="tablewrap"><table>${sylv}${eig}</table></div>
    <p class="muted small">Criterio de Sylvester: A es definida positiva ⇔ todos los menores principales líderes Δ<sub>k</sub> son positivos. Equivalente: todos los autovalores son positivos.</p>`;
}

function renderReference(res) {
  const x = res.ref.x, s = x.reduce((a, c) => a + c, 0);
  const rows = x.map((v, i) => `<tr><td>${sub(i)}</td><td class="l">${ASSETS[i].short}</td><td class="mono" data-xref="${i}">${v.toFixed(8)}</td><td class="mono">${res.ref.xLU[i].toFixed(8)}</td><td class="mono">${sci(Math.abs(v - res.ref.xLU[i]))}</td><td class="mono">${s !== 0 ? (100 * v / s).toFixed(2) + ' %' : '—'}</td></tr>`).join('');
  const Lrows = res.ref.L.map((r) => `<tr>${r.map((v) => `<td class="mono">${v === 0 ? '·' : v.toFixed(5)}</td>`).join('')}</tr>`).join('');
  $('#r-body').innerHTML = `
    <div class="tablewrap"><table><tr><th>Var.</th><th class="l">Activo</th><th>x_ref (Cholesky)</th><th>x (LU/Gauss)</th><th>|diferencia|</th><th>Peso normalizado x<sub>i</sub>/Σx</th></tr>${rows}
    <tr><td colspan="2" class="l"><b>Σ x</b></td><td class="mono">${s.toFixed(8)}</td><td colspan="3" class="l">Fracción total del capital invertida (&gt; 1 implica apalancamiento; &lt; 1 deja parte en efectivo).</td></tr></table></div>
    <p>‖x_Chol − x_LU‖₂ = <b class="mono">${sci(res.ref.diffLU)}</b> — ambos métodos directos coinciden hasta el redondeo.</p>
    <details><summary>Ver factor de Cholesky L (A = L·Lᵀ)</summary><div class="tablewrap"><table>${Lrows}</table></div></details>`;
}

function renderGCP(res) {
  const { gcp, gc, kappaA, kappaMA } = res;
  const P = res.precond;
  const rows = res.ref.x.map((v, i) => `<tr><td>${sub(i)}</td><td class="mono">${v.toFixed(8)}</td><td class="mono">${gcp.x[i].toFixed(8)}</td><td class="mono">${gc.x[i].toFixed(8)}</td></tr>`).join('');
  const cmp = res.compare.map((c) => c.error
    ? `<tr><td class="l">${c.name}</td><td colspan="4" class="l">${c.error}</td></tr>`
    : `<tr${c.type === state.precond ? ' style="background:#eff6ff"' : ''}><td class="l">${c.name}</td><td>${c.iterations}</td><td class="mono">${sci(c.kappa)}</td><td class="mono">${sci(c.residual)}</td><td>${pill(c.converged)}</td></tr>`).join('');
  const stepRows = (r) => r.steps.map((s) => `<tr><td>${s.k}</td><td class="mono">${s.alpha.toExponential(4)}</td><td class="mono">${s.beta === null ? '—' : s.beta.toExponential(4)}</td><td class="mono">${s.res.toExponential(3)}</td></tr>`).join('');
  $('#g-body').innerHTML = `
    <p><b>Precondicionador en uso:</b> ${P.name}. ${res.input.precond === 'ic0' ? '<span class="muted">Nota: en una matriz densa IC(0) no descarta ningún elemento y coincide con la factorización de Cholesky completa; por eso M = A y converge en 1 iteración (equivale a un método directo).</span>' : ''}</p>
    <div class="stats">
      <div class="stat"><div class="k">Iteraciones GC</div><div class="v" style="color:var(--gc)">${gc.iterations}</div><div class="s">${gc.converged ? 'convergió' : 'no convergió'}</div></div>
      <div class="stat"><div class="k">Iteraciones GCP</div><div class="v" style="color:var(--brand)">${gcp.iterations}</div><div class="s">${gcp.converged ? 'convergió' : 'no convergió'}</div></div>
      <div class="stat"><div class="k">κ(A)</div><div class="v">${sci(kappaA.kappa)}</div><div class="s">λmáx/λmín</div></div>
      <div class="stat"><div class="k">κ(M⁻¹A)</div><div class="v">${sci(kappaMA.kappa)}</div><div class="s">reducción ×${(kappaA.kappa / kappaMA.kappa).toFixed(1)}</div></div>
      <div class="stat"><div class="k">Residuo rel. GCP</div><div class="v">${sci(res.errGCP.residual)}</div><div class="s">‖b−Ax‖/‖b‖</div></div>
      <div class="stat"><div class="k">Residuo rel. GC</div><div class="v">${sci(res.errGC.residual)}</div><div class="s">‖b−Ax‖/‖b‖</div></div>
    </div>
    <p>${pill(gcp.converged, 'GCP convergió', 'GCP no convergió')} ${gcp.reason ? `<span class="muted small">${gcp.reason}</span>` : ''}</p>
    <div class="grid2" style="grid-template-columns:1fr">
      <div class="tablewrap"><table><tr><th>Var.</th><th>x_ref (directo)</th><th>x GCP</th><th>x GC</th></tr>${rows}</table></div>
    </div>
    <h3>Convergencia</h3>
    <canvas id="chart" class="chart" aria-label="Convergencia del residuo relativo"></canvas>
    <h3>Comparación de precondicionadores</h3>
    <div class="tablewrap"><table><tr><th class="l">Precondicionador</th><th>Iteraciones</th><th>κ(M⁻¹A)</th><th>Residuo final</th><th>¿Convergió?</th></tr>${cmp}</table></div>
    <details><summary>Detalle de iteraciones GCP (α_k, β_k, residuo)</summary><div class="tablewrap"><table><tr><th>k</th><th>α_k</th><th>β_k</th><th>‖r_k‖/‖b‖</th></tr>${stepRows(gcp)}</table></div></details>
    <details><summary>Detalle de iteraciones GC simple</summary><div class="tablewrap"><table><tr><th>k</th><th>α_k</th><th>β_k</th><th>‖r_k‖/‖b‖</th></tr>${stepRows(gc)}</table></div></details>`;
  drawConvergence($('#chart'), [
    { label: 'GC simple', color: '#c2410c', data: gc.history },
    { label: `GCP (${P.name.split(' ')[0]})`, color: '#1d4ed8', data: gcp.history },
  ], res.input.tol);
}

function renderErrors(res) {
  const e = res.errGCP, g = res.errGC;
  const rows = e.rows.map((r, i) => `<tr><td>${sub(i)}</td><td class="l">${ASSETS[i].short}</td><td class="mono">${r.xref.toFixed(8)}</td><td class="mono">${r.x.toFixed(8)}</td><td class="mono">${sci(r.ea)}</td><td class="mono">${r.er === null ? 'no definido' : sci(r.er)}</td><td class="mono">${r.ep === null ? 'no definido' : pct(r.ep)}</td><td class="mono">${sci(g.rows[i].ea)}</td><td class="mono">${g.rows[i].ep === null ? '—' : pct(g.rows[i].ep)}</td></tr>`).join('');
  $('#e-body').innerHTML = `
    <div class="tablewrap"><table>
      <tr><th rowspan="2">Var.</th><th rowspan="2" class="l">Activo</th><th rowspan="2">x_ref</th><th rowspan="2">x GCP</th><th colspan="3">GCP</th><th colspan="2">GC simple</th></tr>
      <tr><th>E<sub>a</sub> = |x_ref − x|</th><th>E<sub>r</sub> = E<sub>a</sub>/|x_ref|</th><th>E<sub>p</sub> = E<sub>r</sub>·100 %</th><th>E<sub>a</sub></th><th>E<sub>p</sub></th></tr>
      ${rows}</table></div>
    <div class="stats">
      <div class="stat"><div class="k">Residuo relativo global GCP</div><div class="v">${sci(e.residual)}</div><div class="s">‖b − A·x_GCP‖₂ / ‖b‖₂</div></div>
      <div class="stat"><div class="k">Residuo relativo global GC</div><div class="v">${sci(g.residual)}</div><div class="s">‖b − A·x_GC‖₂ / ‖b‖₂</div></div>
      <div class="stat"><div class="k">κ(A)</div><div class="v">${sci(res.kappaA.kappa)}</div><div class="s">λmín = ${sci(res.kappaA.lmin)} · λmáx = ${sci(res.kappaA.lmax)}</div></div>
      <div class="stat"><div class="k">κ(M⁻¹A)</div><div class="v">${sci(res.kappaMA.kappa)}</div><div class="s">${res.precond.name}</div></div>
    </div>
    <p class="muted small">Si x_ref,i = 0 el error relativo no está definido para esa componente. Como el criterio de parada actúa sobre el residuo, el error en x puede ser algo mayor que la tolerancia cuando κ(A) es grande (‖e‖/‖x‖ ≤ κ(A)·‖r‖/‖b‖).</p>`;
}

/* ---------- Tabla comparativa de los 3 escenarios (datos originales) ---------- */
let cmpResults = null;
function renderComparative() {
  cmpResults = SCENARIO_ORDER.map((id) => {
    const d = SCENARIO_DEFS[id];
    const { A, b } = buildScenario(d);
    return { id, def: d, res: analyze({ A, b, tol: 1e-6, maxIter: 200, precond: 'jacobi' }) };
  });
  const interp = (c) => {
    const r = c.res, x = r.ref.x, s = x.reduce((a, v) => a + v, 0);
    const shorts = x.map((v, i) => (v < 0 ? ASSETS[i].short : null)).filter(Boolean);
    const top = x.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0])[0][1];
    if (c.id === 'ideal') return `Cartera diversificada y bien escalada (κ(A) = ${r.kappaA.kappa.toFixed(2)}). Se invierte ${(100 * s).toFixed(1)} % del capital, con mayor peso en ${ASSETS[top].short.toLowerCase()}; todas las posiciones son largas. GCP converge en ${r.gcp.iterations} iteraciones (GC: ${r.gc.iterations}); al estar ya bien condicionado, la ganancia del precondicionamiento es modesta.`;
    if (c.id === 'stress') { const a = cmpResults[0].res; return `El shock desplaza el equilibrio más de lo que empeora el condicionamiento: κ(A) pasa de ${a.kappaA.kappa.toFixed(1)} a ${r.kappaA.kappa.toFixed(1)}, pero la exposición total cae de ${(100 * a.ref.x.reduce((p, v) => p + v, 0)).toFixed(1)} % a ${(100 * s).toFixed(1)} % y ${shorts.length ? 'aparecen posiciones cortas en ' + shorts.join(', ').toLowerCase() : 'no hay posiciones cortas'}. Menor rendimiento y mayor riesgo/correlación reducen la exposición. GCP: ${r.gcp.iterations} it (GC: ${r.gc.iterations}).`; }
    return `Escalas de riesgo muy dispares y fuerte contagio elevan κ(A) a ${r.kappaA.kappa.toExponential(2)}; la solución es extrema (x₁ = ${x[0].toFixed(2)}, x₂ = ${x[1].toFixed(2)}): pequeñas variaciones en μ o en las covarianzas producen cambios enormes en la cartera. Jacobi reduce κ a ${r.kappaMA.kappa.toFixed(1)}; GCP converge en ${r.gcp.iterations} it frente a ${r.gc.iterations} del GC.`;
  };
  const vecCell = (x) => `<ul>${x.map((v, i) => `<li>x${i + 1} = ${v.toFixed(6)}</li>`).join('')}</ul>`;
  const errCell = (rows, key, fmtf) => `<ul>${rows.map((r, i) => `<li>x${i + 1}: ${r[key] === null ? 'n.d.' : fmtf(r[key])}</li>`).join('')}</ul>`;
  const row = (label, fn) => `<tr><td class="k">${label}</td>${cmpResults.map((c) => `<td>${c.res.ok ? fn(c.res, c) : 'Error'}</td>`).join('')}</tr>`;
  $('#c-body').innerHTML = `<table class="cmp"><tr><th class="l">Indicador</th>${cmpResults.map((c) => `<th>${c.def.name}</th>`).join('')}</tr>
    ${row('Solución numérica de referencia', (r) => vecCell(r.ref.x))}
    ${row('Solución GCP', (r) => vecCell(r.gcp.x))}
    ${row('Error absoluto (Eₐ)', (r) => errCell(r.errGCP.rows, 'ea', sci))}
    ${row('Error porcentual (Eₚ)', (r) => errCell(r.errGCP.rows, 'ep', (v) => pct(v)))}
    ${row('Iteraciones GC (sin precondicionar)', (r) => `<b>${r.gc.iterations}</b>`)}
    ${row('Iteraciones GCP (precondicionado)', (r) => `<b>${r.gcp.iterations}</b>`)}
    ${row('Número de condición κ(A)', (r) => sci(r.kappaA.kappa))}
    ${row('Número de condición κ(M⁻¹A)', (r) => sci(r.kappaMA.kappa))}
    ${row('Residuo relativo final GCP', (r) => sci(r.errGCP.residual))}
    ${row('¿Convergió el algoritmo?', (r) => pill(r.gcp.converged))}
    ${row('Interpretación financiera', (r, c) => interp(c))}</table>`;
}

/* ---------- Conclusiones ---------- */
function renderConclusions() {
  const [a, s, m] = cmpResults.map((c) => c.res);
  $('#k-body').innerHTML = `
    <ul>
      <li><b>Corrección numérica.</b> En los tres escenarios el GCP alcanza ‖r‖/‖b‖ &lt; 10⁻⁶ y coincide con la solución de referencia (Cholesky/LU) con errores porcentuales máximos de ${pct(Math.max(...cmpResults.flatMap((c) => c.res.errGCP.rows.map((r) => r.ep ?? 0))))}.</li>
      <li><b>Ganancia del precondicionamiento.</b> κ(A) vale ${a.kappaA.kappa.toFixed(1)} / ${s.kappaA.kappa.toFixed(1)} / ${m.kappaA.kappa.toExponential(2)} (ideal / estrés / mal condicionado). Con Jacobi pasa a ${a.kappaMA.kappa.toFixed(1)} / ${s.kappaMA.kappa.toFixed(1)} / ${m.kappaMA.kappa.toFixed(1)}: en el escenario mal condicionado la reducción es de ×${(m.kappaA.kappa / m.kappaMA.kappa).toFixed(0)}, que es el efecto esperado cuando el problema es el mal escalamiento diagonal.</li>
      <li><b>Iteraciones.</b> GC vs GCP: ${a.gc.iterations} vs ${a.gcp.iterations} (ideal), ${s.gc.iterations} vs ${s.gcp.iterations} (estrés), ${m.gc.iterations} vs ${m.gcp.iterations} (mal condicionado). Con n = 6 el GC termina en pocos pasos por su propiedad de terminación finita, así que la mejora en iteraciones es moderada; la mejora en κ es mucho mayor y es la que importa al crecer n. En el escenario mal condicionado la reducción de κ es grande, pero parte de ella no se refleja en las iteraciones porque la tolerancia de 10⁻⁶ ya se alcanza cerca del límite de n pasos.</li>
      <li><b>Precondicionadores.</b> Los resultados de la Sección 7 muestran que SSOR reduce κ más que Jacobi cuando hay fuerte correlación; IC(0) en una matriz densa coincide con Cholesky completo (κ = 1, 1 iteración) y por eso no es un precondicionador "barato": solo tiene sentido en matrices dispersas.</li>
      <li><b>Lectura financiera.</b> El estrés (mayor volatilidad y correlación, menor rendimiento, mayor aversión) apenas empeora el condicionamiento pero reduce la exposición total de ${(100 * a.ref.x.reduce((p, v) => p + v, 0)).toFixed(0)} % a ${(100 * s.ref.x.reduce((p, v) => p + v, 0)).toFixed(0)} % del capital. El escenario mal condicionado muestra el riesgo de optimizar con covarianzas casi colineales: la solución es hipersensible a los datos de entrada, de ahí la importancia de regularizar o precondicionar.</li>
      <li><b>Limitaciones.</b> Los datos son ilustrativos; el modelo es sin restricciones (permite ventas en corto y apalancamiento). Las pruebas del módulo QA verifican el comportamiento ante entradas inválidas, edición dinámica y comparación GCP/GC.</li>
    </ul>`;
}

/* ---------- QA ---------- */
function snapshot() { return JSON.parse(JSON.stringify(state)); }
function restoreState(snap) { Object.assign(state, snap); renderInputs(); compute(); }

function uiDriver() {
  const saved = snapshot();
  return {
    load: (id) => loadScenario(id),
    applyMatrix(A, b) {
      state.A = A.map((r) => r.map((v) => (Number.isNaN(v) ? 'abc' : String(v))));
      state.b = b.map(String);
      renderInputs();
      compute();
      return { result: last, notified: $('#status').classList.contains('error') };
    },
    editCell(i, j, text) {
      const el = $(`#in-A input[data-i="${i}"][data-j="${j}"]`);
      el.value = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      const shown = last.ok && Math.abs(parseFloat($('#r-body [data-xref="0"]').textContent) - last.ref.x[0]) < 1e-7;
      return { result: last, shown };
    },
    restore: () => restoreState(saved),
  };
}

function renderQA(results) {
  const passed = results.filter((r) => r.pass).length;
  $('#qa-sum').innerHTML = `${passed}/${results.length} pruebas aprobadas ${pill(passed === results.length, 'TODAS OK', 'HAY FALLOS')}`;
  $('#qa-table').innerHTML = '<tr><th>ID</th><th class="l">Prueba</th><th class="l">Entrada</th><th class="l">Resultado esperado</th><th class="l">Resultado obtenido</th><th>Conclusión</th></tr>' +
    results.map((r) => `<tr class="${r.pass ? 'pass' : 'fail'}"><td class="id">${r.id}</td><td><b>${r.name}</b><br><span class="muted">${r.group}</span></td><td>${r.input}</td><td>${r.expected}</td><td class="mono">${r.obtained}</td><td class="res">${r.conclusion}</td></tr>`).join('');
}

function execQA() {
  renderQA(runTests(uiDriver()));
}

/* ---------- navegación activa ---------- */
function wireNav() {
  const links = $$('#nav a');
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) links.forEach((l) => l.classList.toggle('active', l.getAttribute('href') === '#' + en.target.id)); });
  }, { rootMargin: '-40% 0px -55% 0px' });
  $$('main > section').forEach((s) => io.observe(s));
}

/* ---------- arranque ---------- */
function init() {
  renderHeader();
  renderVars();
  renderScenarioCards();
  wireInputs();
  renderComparative();
  renderConclusions();
  loadScenario('ideal');
  $('#btn-qa').addEventListener('click', execQA);
  execQA();
  wireNav();
  window.addEventListener('resize', () => { if (last?.ok) renderGCP(last); });
}
init();
