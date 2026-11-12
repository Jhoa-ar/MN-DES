// Módulo de pruebas de software (QA). Las mismas pruebas se ejecutan en el navegador (con la interfaz real)
// y en Node (tests/run.mjs) usando un "driver" distinto.
import { analyze } from './analysis.js';
import { luSolve, norm2, subV } from './linalg.js';
import { SCENARIO_DEFS, SCENARIO_ORDER, buildScenario } from './scenarios.js';

const sci = (v) => (v === null || v === undefined || Number.isNaN(v) ? '—' : v.toExponential(2));

/**
 * driver = {
 *   load(id)            -> resultado de analyze() tras cargar el escenario (en la web: pulsa el botón real),
 *   applyMatrix(A,b)    -> { result, notified }  (en la web: escribe en la tabla y lee el aviso de error),
 *   editCell(i,j,text)  -> { result, shown }     (en la web: edita el <input> y despacha el evento),
 *   restore()           -> vuelve al estado previo
 * }
 */
export function buildTests(driver) {
  const tests = [];
  const add = (t) => tests.push(t);

  add({
    id: 'QA-01', group: 'Carga de escenarios',
    name: 'Carga y ejecución de los tres escenarios',
    input: 'Cargar Ideal, Bajo estrés y Mal condicionado (tol = 1e-6).',
    expected: 'Cada escenario: A simétrica y DP, GCP y GC convergen, residuo relativo < 1e-6.',
    run() {
      const rows = SCENARIO_ORDER.map((id) => {
        const r = driver.load(id);
        const ok = r.ok && r.validation.ok && r.gcp.converged && r.gc.converged && r.errGCP.residual < 1e-5;
        return { id, ok, txt: r.ok ? `${SCENARIO_DEFS[id].name}: GC ${r.gc.iterations} it, GCP ${r.gcp.iterations} it, res ${sci(r.errGCP.residual)}` : `${id}: ${r.errors.join(' ')}` };
      });
      return { pass: rows.every((x) => x.ok), obtained: rows.map((x) => x.txt).join(' · ') };
    },
  });

  add({
    id: 'QA-02a', group: 'Validación de matriz no válida',
    name: 'Matriz NO simétrica',
    input: 'Escenario Ideal con a₁₂ = 0,009 y a₂₁ = 0,001 (sin espejo).',
    expected: 'El sistema detecta la asimetría, muestra el aviso y no colapsa (no calcula resultados).',
    run() {
      const { A, b } = buildScenario(SCENARIO_DEFS.ideal);
      A[0][1] = 0.009; A[1][0] = 0.001;
      const { result, notified } = driver.applyMatrix(A, b);
      const pass = !result.ok && result.errors.some((e) => e.includes('simétrica')) && notified !== false;
      return { pass, obtained: result.ok ? 'Calculó resultados (incorrecto)' : `Rechazada: ${result.errors[0]}` };
    },
  });

  add({
    id: 'QA-02b', group: 'Validación de matriz no válida',
    name: 'Matriz simétrica pero NO definida positiva',
    input: 'Escenario Ideal con a₁₂ = a₂₁ = 0,5 (covarianza imposible: |a₁₂| > √(a₁₁·a₂₂)).',
    expected: 'El sistema detecta que A no es definida positiva y notifica sin colapsar.',
    run() {
      const { A, b } = buildScenario(SCENARIO_DEFS.ideal);
      A[0][1] = 0.5; A[1][0] = 0.5;
      const { result, notified } = driver.applyMatrix(A, b);
      const pass = !result.ok && result.errors.some((e) => e.includes('definida positiva')) && notified !== false;
      return { pass, obtained: result.ok ? 'Calculó resultados (incorrecto)' : `Rechazada: ${result.errors[0]}` };
    },
  });

  add({
    id: 'QA-02c', group: 'Validación de matriz no válida',
    name: 'Entrada no numérica',
    input: 'Escenario Ideal con a₃₃ = "abc".',
    expected: 'Se informa que hay valores no numéricos; no hay excepciones no controladas.',
    run() {
      const { A, b } = buildScenario(SCENARIO_DEFS.ideal);
      A[2][2] = NaN;
      const { result, notified } = driver.applyMatrix(A, b);
      const pass = !result.ok && result.errors.length > 0 && notified !== false;
      return { pass, obtained: result.ok ? 'Calculó resultados (incorrecto)' : `Rechazada: ${result.errors[0]}` };
    },
  });

  add({
    id: 'QA-03', group: 'Edición dinámica',
    name: 'Edición de un coeficiente y recálculo instantáneo',
    input: 'Escenario Ideal: cambiar a₁₁ de 0,0064 a 0,0100 desde la interfaz.',
    expected: 'Se recalculan al instante la solución de referencia, GCP y errores; x_ref coincide con una solución LU independiente.',
    run() {
      const before = driver.load('ideal');
      const { result, shown } = driver.editCell(0, 0, '0.0100');
      driver.restore();
      if (!result.ok) return { pass: false, obtained: `Error: ${result.errors.join(' ')}` };
      const changed = norm2(subV(result.ref.x, before.ref.x));
      const indep = luSolve(result.input.A, result.input.b);
      const dLU = norm2(subV(result.ref.x, indep));
      const pass = changed > 1e-6 && dLU < 1e-10 && result.gcp.converged && result.errGCP.residual < 1e-5 && shown !== false;
      return { pass, obtained: `‖Δx_ref‖ = ${sci(changed)}; ‖x_ref − x_LU‖ = ${sci(dLU)}; res GCP = ${sci(result.errGCP.residual)}; interfaz actualizada: ${shown === undefined ? 'n/a (Node)' : shown ? 'sí' : 'no'}` };
    },
  });

  add({
    id: 'QA-04', group: 'Comparativa de precondicionamiento',
    name: 'GCP ≤ GC en el escenario mal condicionado',
    input: 'Escenario Mal condicionado, tol = 1e-6, precondicionador Jacobi.',
    expected: 'Iteraciones GCP ≤ iteraciones GC y κ(M⁻¹A) < κ(A).',
    run() {
      const r = driver.load('ill');
      const pass = r.ok && r.gcp.converged && r.gcp.iterations <= r.gc.iterations && r.kappaMA.kappa < r.kappaA.kappa;
      return { pass, obtained: r.ok ? `GC = ${r.gc.iterations} it, GCP = ${r.gcp.iterations} it; κ(A) = ${r.kappaA.kappa.toExponential(2)} → κ(M⁻¹A) = ${r.kappaMA.kappa.toExponential(2)}` : r.errors.join(' ') };
    },
  });

  add({
    id: 'QA-05', group: 'Exactitud',
    name: 'Cholesky y LU coinciden en los tres escenarios',
    input: 'Resolver Ax = b con ambos métodos directos.',
    expected: '‖x_Chol − x_LU‖₂ < 1e-9 en cada escenario.',
    run() {
      const ds = SCENARIO_ORDER.map((id) => driver.load(id).ref.diffLU);
      return { pass: ds.every((d) => d < 1e-9), obtained: ds.map(sci).join(' · ') };
    },
  });

  add({
    id: 'QA-06', group: 'Exactitud',
    name: 'Criterio de parada ‖r‖/‖b‖ < 1e-6',
    input: 'GCP en los tres escenarios.',
    expected: 'Residuo relativo verdadero ‖b − Ax‖/‖b‖ < 1e-5 y error porcentual máximo < 0,1 %.',
    run() {
      const rs = SCENARIO_ORDER.map((id) => driver.load(id));
      const maxEp = Math.max(...rs.flatMap((r) => r.errGCP.rows.map((x) => x.ep ?? 0)));
      const maxRes = Math.max(...rs.map((r) => r.errGCP.residual));
      return { pass: maxRes < 1e-5 && maxEp < 0.1, obtained: `residuo máx = ${sci(maxRes)}; Eₚ máx = ${sci(maxEp)} %` };
    },
  });

  add({
    id: 'QA-07', group: 'Casos límite',
    name: 'Vector inicial x₀ ≠ 0 y caso b = 0',
    input: 'x₀ = (0,5; −0,2; 0,3; 0; 0,1; 0,4) en el escenario Ideal; luego b = 0.',
    expected: 'Con x₀ ≠ 0 converge a la misma solución; con b = 0 devuelve x = 0 sin error y marca el error relativo como no definido.',
    run() {
      const { A, b } = buildScenario(SCENARIO_DEFS.ideal);
      const r1 = analyze({ A, b, x0: [0.5, -0.2, 0.3, 0, 0.1, 0.4], tol: 1e-6, maxIter: 200, precond: 'jacobi' });
      const r2 = analyze({ A, b: b.map(() => 0), tol: 1e-6, maxIter: 200, precond: 'jacobi' });
      const same = r1.ok && norm2(subV(r1.gcp.x, r1.ref.x)) < 1e-3;
      const zero = r2.ok && r2.gcp.x.every((v) => v === 0) && r2.errGCP.rows.every((x) => x.er === null) && r2.errGCP.residual === null;
      return { pass: same && zero, obtained: `x₀≠0: ${r1.ok ? r1.gcp.iterations + ' it, ‖x−x_ref‖ = ' + sci(norm2(subV(r1.gcp.x, r1.ref.x))) : 'error'}; b = 0: ${zero ? 'x = 0, Eᵣ no definido' : 'comportamiento incorrecto'}` };
    },
  });

  add({
    id: 'QA-08', group: 'Modelo financiero',
    name: 'El estrés desplaza el equilibrio',
    input: 'Comparar Ideal vs Bajo estrés.',
    expected: 'x_estrés ≠ x_ideal y κ(A) aumenta; el algoritmo sigue convergiendo.',
    run() {
      const a = driver.load('ideal'), s = driver.load('stress');
      const dx = norm2(subV(s.ref.x, a.ref.x));
      const pass = dx > 1e-3 && s.kappaA.kappa > a.kappaA.kappa && s.gcp.converged;
      return { pass, obtained: `‖Δx‖ = ${dx.toFixed(4)}; κ(A): ${a.kappaA.kappa.toFixed(2)} → ${s.kappaA.kappa.toFixed(2)}` };
    },
  });

  return tests;
}

/** Ejecuta las pruebas; captura cualquier excepción como fallo (nunca colapsa). */
export function runTests(driver) {
  const out = [];
  for (const t of buildTests(driver)) {
    let r;
    try { r = t.run(); } catch (e) { r = { pass: false, obtained: `Excepción: ${e.message}` }; }
    out.push({ id: t.id, group: t.group, name: t.name, input: t.input, expected: t.expected, obtained: r.obtained, pass: r.pass, conclusion: r.pass ? 'APROBADA' : 'FALLÓ' });
  }
  try { driver.restore?.(); } catch { /* noop */ }
  return out;
}

/** Driver puro (sin interfaz) para Node. */
export function nodeDriver() {
  const cfg = { tol: 1e-6, maxIter: 200 };
  return {
    load(id) {
      const def = SCENARIO_DEFS[id];
      const { A, b } = buildScenario(def);
      return analyze({ A, b, ...cfg, precond: def.precond });
    },
    applyMatrix(A, b) { return { result: analyze({ A, b, ...cfg, precond: 'jacobi' }), notified: true }; },
    editCell(i, j, text) {
      const { A, b } = buildScenario(SCENARIO_DEFS.ideal);
      A[i][j] = Number(text);
      return { result: analyze({ A, b, ...cfg, precond: 'jacobi' }), shown: undefined };
    },
    restore() {},
  };
}
